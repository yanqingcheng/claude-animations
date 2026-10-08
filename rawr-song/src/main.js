/* ===== the player: preloader, clock, buttons ===== */
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
const ui = { load: $('load'), bar: $('bar'), fill: $('barfill'), msg: $('loadmsg'), play: $('play'), chat: $('chat'), text: $('msg'), send: $('send'), pause: $('pause'), replay: $('replay'), mute: $('mute'), qual: $('quality'), count: $('count'), note: $('note') };
const SAM_URLS = ['https://cdn.jsdelivr.net/npm/sam-js@0.3.1/dist/samjs.min.js', 'https://unpkg.com/sam-js@0.3.1/dist/samjs.min.js'];
const LOAD_LINES = ['dialling up', 'teaching a robot 2 sing', 'tuning the dinosaurs', 'defragging the hill', 'inflating the cow', 'polishing the moon', 'nearly there (2006 nearly)'];
const rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const wallNow = () => performance.now() / 1000;

let S = 1, ts = 1, quality = 'high', lastDraw = 0;
let state = 'loading', song = null, T = null;
let ac = null, master = null, live = null, vampGain = null, hush = null, srcs = [];
const t0 = { main: 0, vamp: 0, fin: Infinity };
let sent = null, ptr = null, pokes = [], muted = false, paused = false, chatOn = false, count = 0;

function resize() {
  const w = stage.clientWidth || W, low = quality === 'low';
  const k = low ? Math.max(.75, .6 * w / W) : Math.min(4, w / W * Math.min(window.devicePixelRatio || 1, 2.5));
  const cw = Math.round(W * k), ch = Math.round(H * k);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  S = cw / W; ts = w < 470 ? 1.3 : 1;
  cv.classList.toggle('low', low);
}
const lat = () => { const l = ac.outputLatency || ac.baseLatency || 0; return l > 0 && l < .5 ? l : 0; };
function songState() {
  if (state === 'loading' || state === 'ready') return { mode: 'title', b: 0, t: 0, ready: state === 'ready' };
  const now = ac.currentTime - lat();
  if (state === 'main' && now >= t0.vamp) state = 'vamp';
  if (state === 'vamp' && now >= t0.fin) state = 'fin';
  if (state === 'main') return { mode: 'main', b: Math.max(0, (now - t0.main) / BEAT), t: Math.max(0, now - t0.main) };
  if (state === 'vamp') {
    const raw = Math.max(0, (now - t0.vamp) / BEAT);
    if (!chatOn && !sent && raw > 3) showChat(true);
    return { mode: 'vamp', b: raw % 16, raw, cycle: Math.floor(raw / 16), t: now - t0.vamp, sent };
  }
  const raw = Math.max(0, (now - t0.fin) / BEAT);
  return { mode: 'fin', b: raw < 72 ? raw : 40 + (raw - 40) % 32, t: now - t0.fin, sent };
}
function frame() {
  requestAnimationFrame(frame);
  const wall = wallNow();
  if (quality === 'low' && wall - lastDraw < .08) return;
  lastDraw = wall;
  const st = songState();
  st.wall = wall; st.T = T; st.ts = ts; st.rm = rmq.matches; st.ptr = ptr; st.pokes = pokes;
  while (pokes.length && wall - pokes[0].wall > 1.5) pokes.shift();
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  try { drawFrame(ctx, st); } catch (e) { for (let i = 0; i < 12; i++) ctx.restore(); if (!frame.err) { frame.err = true; console.error(e); } }
  ctx.restore();
}

/* ----- sound ----- */
function fakeAC() { // no audio available: keep time anyway so the cartoon still runs
  let base = wallNow(), held = null;
  return { fake: true, get currentTime() { return held != null ? held : wallNow() - base; }, suspend() { held = this.currentTime; return Promise.resolve(); }, resume() { if (held != null) { base = wallNow() - held; held = null; } return Promise.resolve(); } };
}
function hushIOS() { // a silent looping clip keeps iPhones playing web audio with the ringer switch off
  const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!iOS) return;
  try {
    const n = 2000, b = new Uint8Array(44 + n), dv = new DataView(b.buffer), put = (o, s) => { for (let i = 0; i < 4; i++) b[o + i] = s.charCodeAt(i); };
    put(0, 'RIFF'); dv.setUint32(4, 36 + n, true); put(8, 'WAVE'); put(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); put(36, 'data'); dv.setUint32(40, n, true); b.fill(128, 44);
    let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    hush = new Audio('data:audio/wav;base64,' + btoa(s)); hush.loop = true; hush.setAttribute('playsinline', '');
    const p = hush.play(); if (p && p.catch) p.catch(() => { hush = null; });
  } catch (e) { hush = null; }
}
function stopAll() { for (const s of srcs) { try { s.stop(); } catch (e) {} try { s.disconnect(); } catch (e) {} } srcs = []; }
function startSong(off) {
  stopAll();
  const tS = ac.currentTime + .15;
  t0.main = tS + PRE - off * BEAT; t0.vamp = t0.main + 128 * BEAT; t0.fin = Infinity;
  if (song.bufs && !ac.fake) {
    if (off < 128) { const m = ac.createBufferSource(); m.buffer = song.bufs.main; m.connect(master); m.start(tS, off * BEAT); srcs.push(m); }
    const v = ac.createBufferSource(); v.buffer = song.bufs.vamp; v.loop = true; v.loopStart = PRE + 16 * BEAT; v.loopEnd = PRE + 32 * BEAT;
    vampGain = ac.createGain(); v.connect(vampGain); vampGain.connect(master);
    if (t0.vamp >= tS) v.start(t0.vamp, PRE); else v.start(tS, PRE + (tS - t0.vamp) % (16 * BEAT));
    srcs.push(v);
  }
  sent = null; pokes = []; state = 'main'; showChat(false);
  ui.load.hidden = true; ui.play.hidden = true; ui.pause.disabled = false; ui.replay.disabled = false;
  setPaused(false);
}
async function begin(off) {
  if (state === 'loading') return;
  if (!ac) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ac.destination);
      live = mkRig(ac, { live: true, out: master }); hushIOS();
    } catch (e) { ac = fakeAC(); }
  }
  try { await ac.resume(); } catch (e) {}
  startSong(off || 0);
}
function setPaused(p) {
  paused = p;
  if (ac) { try { (p ? ac.suspend() : ac.resume()).catch(() => {}); } catch (e) {} }
  if (hush) { try { if (p) hush.pause(); else hush.play().catch(() => {}); } catch (e) {} }
  ui.pause.textContent = p ? 'play' : 'pause';
}
function liveRawr() {
  if (!live || !song.bufs) return;
  const fin = state === 'fin', e = song.score[fin ? 'fin' : 'main'].ev.find(x => x.k === 'vox' && x.who === 'dino' && x.d === .5 && x.m === (fin ? 69 : 67) && x.plays);
  if (e) I.vox(live, ac.currentTime + .07, { who: 'dino', plays: e.plays.slice(0, 1), v: .9 });
  else I.pop(live, ac.currentTime + .02, { v: 1 });
}
function sendRawr(text) {
  if (state !== 'vamp' || sent) return;
  const now = ac.currentTime, tb = t0.vamp + Math.ceil((now + .14 - t0.vamp) / BAR) * BAR;
  t0.fin = tb;
  if (song.bufs && !ac.fake) {
    vampGain.gain.setValueAtTime(1, tb - .03); vampGain.gain.linearRampToValueAtTime(0, tb + .3);
    for (const s of srcs) if (s.loop) { try { s.stop(tb + .35); } catch (e) {} }
    const f = ac.createBufferSource(); f.buffer = song.bufs.fin; f.loop = true; f.loopStart = PRE + 40 * BEAT; f.loopEnd = PRE + 72 * BEAT;
    f.connect(master); f.start(tb, PRE); srcs.push(f);
    I.blip(live, now + .02, { v: 1 });
  }
  sent = { wall: wallNow(), text: String(text || '').trim().slice(0, 24) || 'rawr' };
  showChat(false);
  count++; try { localStorage.setItem('rawrs', String(count)); } catch (e) {}
  showCount();
  if (paused) setPaused(false);
}

/* ----- controls ----- */
function showChat(on) {
  chatOn = on;
  const c = ui.chat;
  if (on) {
    c.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('on')));
    const a = document.activeElement;
    if (!a || a === document.body || stage.contains(a)) { try { ui.send.focus({ preventScroll: true }); } catch (e) {} }
  } else { c.classList.remove('on'); setTimeout(() => { if (!chatOn) c.hidden = true; }, 520); }
}
function showCount() { ui.count.textContent = String(Math.min(count, 999999)).padStart(6, '0'); }
function setProgress(p) {
  const pc = Math.round(sat(p) * 100);
  ui.fill.style.width = pc + '%'; ui.bar.setAttribute('aria-valuenow', pc);
  ui.msg.textContent = LOAD_LINES[Math.min(LOAD_LINES.length - 1, Math.floor(p * LOAD_LINES.length))] + '… ' + pc + '%';
}
const stagePt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
cv.addEventListener('pointermove', e => { ptr = stagePt(e); });
cv.addEventListener('pointerleave', () => { ptr = null; });
cv.addEventListener('pointerdown', e => {
  if (e.button) return;
  const p = stagePt(e);
  if (state === 'ready') { begin(); return; }
  if (state === 'loading' || Math.abs(p.x - 283) > 72 || p.y < 150 || p.y > 325) return;
  pokes.push({ wall: wallNow(), x: p.x, y: p.y });
  if (state === 'vamp' && !sent) sendRawr('*poke*'); else liveRawr();
});
ui.play.addEventListener('click', () => begin());
ui.chat.addEventListener('submit', e => { e.preventDefault(); sendRawr(ui.text.value); });
ui.pause.addEventListener('click', () => { if (ac && state !== 'ready') setPaused(!paused); });
ui.replay.addEventListener('click', () => { if (state !== 'loading') begin(); });
ui.mute.addEventListener('click', () => {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, .02);
  ui.mute.textContent = 'sound: ' + (muted ? 'off' : 'on'); ui.mute.setAttribute('aria-pressed', String(muted));
});
ui.qual.addEventListener('click', () => {
  quality = quality === 'high' ? 'low' : 'high';
  ui.qual.textContent = 'quality: ' + quality; ui.qual.setAttribute('aria-pressed', String(quality === 'low'));
  resize();
});
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat || !ac || state === 'ready' || state === 'loading') return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;
  e.preventDefault(); setPaused(!paused);
});
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);

/* right-click the movie, like you always did */
const menu = $('menu');
const closeMenu = () => { menu.hidden = true; };
stage.addEventListener('contextmenu', e => {
  e.preventDefault();
  $('m-qual').textContent = 'Quality: ' + (quality === 'high' ? 'High' : 'Low');
  $('m-play').setAttribute('aria-checked', String(!paused && state !== 'ready' && state !== 'loading'));
  menu.hidden = false;
  const r = stage.getBoundingClientRect();
  menu.style.left = Math.max(0, Math.min(e.clientX - r.left, r.width - menu.offsetWidth - 2)) + 'px';
  menu.style.top = Math.max(0, Math.min(e.clientY - r.top, r.height - menu.offsetHeight - 2)) + 'px';
});
menu.addEventListener('click', e => {
  const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
  if (!act) return;
  closeMenu();
  if (act === 'quality') ui.qual.click();
  else if (act === 'play') { if (state === 'ready') begin(); else ui.pause.click(); }
  else if (act === 'rewind') ui.replay.click();
  else if (act === 'about') ui.note.textContent = 'Definitely Not Flash Player 9. Plugins installed: 0. Dinosaurs: 1 (multiplying). Badgers: none, we checked.';
});
menu.addEventListener('pointerdown', e => e.stopPropagation());
document.addEventListener('pointerdown', closeMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

/* cursor sparkles, as was the custom */
if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !rmq.matches) {
  let lastSpark = 0;
  const glyphs = ['\u2726', '\u2605', '\u2727', '\u2665'], tints = ['#ff2e93', '#b6ff3b', '#3df0ff', '#ffe14a', '#ffffff'];
  document.addEventListener('pointermove', e => {
    const now = performance.now();
    if (now - lastSpark < 55 || e.pointerType !== 'mouse') return;
    lastSpark = now;
    const s = document.createElement('span');
    s.className = 'spark'; s.setAttribute('aria-hidden', 'true'); s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    s.style.left = e.clientX + 6 + Math.random() * 8 + 'px'; s.style.top = e.clientY + 8 + Math.random() * 8 + 'px'; s.style.color = tints[Math.floor(Math.random() * tints.length)];
    document.body.appendChild(s); setTimeout(() => s.remove(), 720);
  });
}

/* ----- boot ----- */
function loadScript(src, ms) {
  return new Promise(res => {
    const s = document.createElement('script');
    let done = false; const fin = ok => { if (!done) { done = true; res(ok); } };
    s.src = src; s.async = true; s.onload = () => fin(true); s.onerror = () => fin(false);
    document.head.appendChild(s); setTimeout(() => fin(false), ms);
  });
}
async function boot() {
  try { count = parseInt(localStorage.getItem('rawrs') || '0', 10) || 0; } catch (e) { count = 0; }
  showCount(); resize(); requestAnimationFrame(frame);
  const fonts = document.fonts && document.fonts.load
    ? Promise.race([Promise.all(['104px "Luckiest Guy"', 'bold 19px "Comic Neue"', '10px Silkscreen'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]).catch(() => {})
    : Promise.resolve();
  fonts.then(() => _wrap.clear());
  setProgress(.02);
  for (const u of SAM_URLS) { if (window.SamJs) break; await loadScript(u, 7000); }
  const Sam = window.SamJs || null;
  setProgress(.06);
  try { song = await renderAll(Sam, p => setProgress(.06 + .94 * p)); }
  catch (e) { song = { score: mkScore(), bufs: null, sung: false }; ui.note.textContent = 'This browser couldn’t make the sound, so this showing is a silent film.'; }
  if (song.bufs && !song.sung) ui.note.textContent = 'The singing robot didn’t load, so a stand-in is covering the vocals. Reload to try for the real one.';
  for (const e of song.score.main.ev) if (e.who === 'narr' && !e.wordT) e.wordT = [0, .33, .7, .9, 1.15, 1.65, 1.85, 2.9];
  T = makeTracks(song.score);
  await fonts;
  setProgress(1);
  state = 'ready'; ui.load.hidden = true; ui.play.hidden = false;
}
window.__rawr = { jump: b => begin(b), state: () => state, send: t => sendRawr(t) };
boot();
