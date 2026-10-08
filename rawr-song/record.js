#!/usr/bin/env node
/* Renders the film cut to rawr-song.mp4.
   Headless Chromium draws each frame from the song position (src/film.js) and renders the soundtrack
   with the page's own synth; ffmpeg encodes. Nothing is captured in real time, so every run is identical.

   node record.js [--out file.mp4] [--from seconds] [--to seconds] [--crf 24] [--workers 2]            */
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const HERE = __dirname;
const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : dflt; };
const tryRequire = id => { try { return require(id); } catch (e) { return null; } };
const tryResolve = id => { try { return require.resolve(id, { paths: [HERE] }); } catch (e) { return null; } };
const pw = tryRequire('playwright') || tryRequire('playwright-core');
if (!pw) { console.error('Needs Playwright: npm install'); process.exit(1); }
const src = f => fs.readFileSync(path.join(HERE, 'src', f), 'utf8');

function fontCss() { // local copies if installed, so a render never waits on the network
  const faces = [['Luckiest Guy', 400, '@fontsource/luckiest-guy/files/luckiest-guy-latin-400-normal.woff2'], ['Comic Neue', 700, '@fontsource/comic-neue/files/comic-neue-latin-700-normal.woff2'],
    ['Silkscreen', 400, '@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2'], ['Silkscreen', 700, '@fontsource/silkscreen/files/silkscreen-latin-700-normal.woff2']];
  const paths = faces.map(f => tryResolve(f[2]));
  if (paths.some(p => !p)) return '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&family=Luckiest+Guy&family=Silkscreen:wght@400;700&display=swap">';
  return '<style>' + faces.map((f, i) => `@font-face{font-family:"${f[0]}";font-weight:${f[1]};src:url(data:font/woff2;base64,${fs.readFileSync(paths[i]).toString('base64')})}`).join('') + '</style>';
}
function pageHtml() {
  const sam = tryResolve('sam-js/dist/samjs.min.js');
  const samTag = sam ? `<script>${fs.readFileSync(sam, 'utf8')}</script>` : '<script src="https://cdn.jsdelivr.net/npm/sam-js@0.3.1/dist/samjs.min.js"></script>';
  return `<!doctype html><meta charset="utf-8">${fontCss()}<body style="margin:0;background:#000"><canvas id="cv" width="1200" height="900"></canvas>
${samTag}<script>(() => {
${src('engine.js')}
${src('draw.js')}
${src('film.js')}
window.FILM = FILM;
})();</script>`;
}
async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', e => { console.error('[page]', e.message); process.exitCode = 1; });
  await page.setContent(pageHtml(), { waitUntil: 'load' });
  await page.evaluate(() => Promise.all(['104px "Luckiest Guy"', 'bold 19px "Comic Neue"', '10px Silkscreen', 'bold 10px Silkscreen'].map(f => document.fonts.load(f))));
  const info = await page.evaluate(() => { if (!window.SamJs) throw new Error('the speech synth did not load'); return FILM.init(document.getElementById('cv')); });
  if (!info.sung) throw new Error('the speech synth could not render the vocals');
  return { page, info };
}

(async () => {
  const out = path.resolve(arg('out', path.join(HERE, 'rawr-song.mp4')));
  const workers = Math.max(1, parseInt(arg('workers', Math.min(2, os.cpus().length)), 10));
  const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const pages = [];
  for (let i = 0; i < workers; i++) pages.push(await openPage(browser));
  const { info } = pages[0], fps = info.fps;
  const f0 = Math.max(0, Math.round(parseFloat(arg('from', 0)) * fps)), f1 = Math.min(info.frames, Math.round(parseFloat(arg('to', info.seconds)) * fps));
  console.log(`film: ${info.seconds.toFixed(2)}s, ${info.width}x${info.height} @ ${fps}fps; rendering frames ${f0}-${f1}`);

  // soundtrack
  const wav = path.join(os.tmpdir(), `rawr-song-${process.pid}.wav`);
  let t = Date.now();
  const chunks = await pages[0].page.evaluate(() => FILM.audio());
  const fd = fs.openSync(wav, 'w');
  fs.writeSync(fd, Buffer.from(await pages[0].page.evaluate(() => FILM.wavHeader()), 'base64'));
  for (let i = 0; i < chunks; i++) fs.writeSync(fd, Buffer.from(await pages[0].page.evaluate(k => FILM.wavChunk(k), i), 'base64'));
  fs.closeSync(fd);
  console.log(`soundtrack rendered in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  if (process.argv.includes('--keep-wav')) fs.copyFileSync(wav, out.replace(/\.mp4$/, '.wav'));

  // picture
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-ss', String(f0 / fps), '-t', String((f1 - f0) / fps), '-i', wav,
    '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', String(arg('crf', 24)), '-profile:v', 'high', '-level:v', '4.1', '-refs', '4', '-g', String(fps * 2),
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('close', c => c ? rej(new Error('ffmpeg exited ' + c)) : res()); ff.on('error', rej); });
  t = Date.now();
  let next = f0, write = f0; const ready = new Map();
  const flush = async () => {
    while (ready.has(write)) {
      const buf = ready.get(write); ready.delete(write); write++;
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if ((write - f0) % 300 === 0) console.log(`  ${write - f0}/${f1 - f0} frames, ${((Date.now() - t) / 1000).toFixed(0)}s`);
    }
  };
  let flushing = Promise.resolve();
  await Promise.all(pages.map(async ({ page }) => {
    for (;;) {
      const i = next++; if (i >= f1) return;
      while (i - write > 40) await new Promise(r => setTimeout(r, 5)); // don't run far ahead of the encoder
      ready.set(i, Buffer.from(await page.evaluate(k => FILM.frame(k), i), 'base64'));
      flushing = flushing.then(flush); await flushing;
    }
  }));
  await flushing; ff.stdin.end(); await done;
  await browser.close(); fs.unlinkSync(wav);
  console.log(`wrote ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB) in ${((Date.now() - t) / 1000).toFixed(0)}s`);
})().catch(e => { console.error(e); process.exit(1); });
