'use strict';
/* ==========================================================================
   DIRECTOR: clock, controls, captions, and the playable lyre.
   The audio clock is the master clock whenever sound is available.
   ========================================================================== */
(() => {
  const $ = (s) => document.querySelector(s);
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
    };
  }
  V.cv = $('#stage');
  V.reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const el = {
    intro: $('#intro'), begin: $('#beginBtn'), skip: $('#skipLyre'),
    controls: $('#controls'), play: $('#playBtn'), icoPlay: $('#icoPlay'), icoPause: $('#icoPause'),
    scrub: $('#scrub'), clock: $('#clock'), mute: $('#muteBtn'), icoSound: $('#icoSound'), icoMute: $('#icoMute'),
    capA: $('#capA'), capB: $('#capB'), chapter: $('#chapter'), chT: $('#chapter .ch-title'), chS: $('#chapter .ch-sub'),
    end: $('#endcard'), toLyre: $('#toLyre'), replay: $('#replay'), toNotes: $('#toNotes'),
    lyre: $('#lyre'), lyreClose: $('#lyreClose'), score: $('#lyreScore'), eng: $('#lyreEnglish'), strings: $('#strings'),
    done: $('#doneMsg'), hear: $('#hearLine'), restart: $('#restartSong'), drone: $('#droneToggle'),
    notes: $('#notes'), notesClose: $('#notesClose'), scrim: $('#scrim'), key: $('#signsKey'),
  };
  el.scrub.max = String(TL.total);

  const S = {
    mode: 'intro', playing: false, pos: 0, startCtx: 0, startPos: 0, clock0: 0,
    evIdx: 0, audioOK: false, scrubbing: false, wasPlaying: false, lastBeds: 0,
    endShown: false, sheetFrom: null, idle0: performance.now(),
  };
  let EVENTS = [];
  let actx = null;

  /* ---------- clock ---------- */
  function now() {
    if (!S.playing) return S.pos;
    if (S.audioOK) return S.startPos + (actx.currentTime - S.startCtx);
    return S.startPos + (performance.now() / 1000 - S.clock0);
  }
  function lowerBound(t) {
    let lo = 0, hi = EVENTS.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (EVENTS[m].t < t) lo = m + 1; else hi = m; }
    return lo;
  }

  /* ---------- audio ---------- */
  function silentWav() {
    const sr = 8000, n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    let bin = ''; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function ensureAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return S.audioOK; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      actx = new AC({ latencyHint: 'playback' });
      SND.build(actx);
      EVENTS = SND.buildEvents();
      S.audioOK = true;
      if (actx.state === 'suspended') actx.resume();
      try { // keeps iPhones from muting Web Audio when the ringer switch is off
        const a = new Audio(silentWav()); a.loop = true; a.volume = 0.01; a.play().catch(() => {});
      } catch (e) { /* not needed elsewhere */ }
    } catch (e) {
      console.warn('Audio unavailable', e);
      actx = null; S.audioOK = false;
    }
    return S.audioOK;
  }

  /* ---------- transport ---------- */
  function play(from) {
    if (from != null) S.pos = clamp(from, 0, TL.total);
    if (S.pos >= TL.total - 0.05) S.pos = 0;
    S.playing = true;
    if (S.audioOK) {
      if (actx.state === 'suspended') actx.resume();
      SND.stopAll();
      S.startCtx = actx.currentTime + 0.06;
      S.startPos = S.pos;
      S.evIdx = lowerBound(S.pos);
      SND.setBeds(S.pos);
    } else {
      S.clock0 = performance.now() / 1000;
      S.startPos = S.pos;
    }
    syncIcons();
    pokeControls();
  }
  function pause() {
    S.pos = now();
    S.playing = false;
    if (S.audioOK) { SND.stopAll(); actx.suspend(); }
    syncIcons();
    pokeControls(true);
  }
  function syncIcons() {
    el.icoPlay.hidden = S.playing; el.icoPause.hidden = !S.playing;
    el.play.setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
    const m = SND.muted;
    el.icoSound.hidden = m; el.icoMute.hidden = !m;
    el.mute.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
  }
  function pump(t) {
    if (!S.playing || !S.audioOK) return;
    const horizon = t + 0.4;
    while (S.evIdx < EVENTS.length && EVENTS[S.evIdx].t < horizon) {
      const e = EVENTS[S.evIdx++];
      if (e.t < t - 0.08) continue;
      try { e.fn(S.startCtx + (e.t - S.startPos)); } catch (err) { console.warn(err); }
    }
  }

  /* ---------- captions and chapter labels ---------- */
  let capKey = null, capFlip = false, chKey = null;
  function updateText(t) {
    const cap = CAPTIONS.find((c) => t >= c[0] && t < c[1]);
    const key = cap ? cap[0] + '|' + cap[2] : '';
    if (key !== capKey) {
      capKey = key;
      const show = capFlip ? el.capA : el.capB, hide = capFlip ? el.capB : el.capA;
      capFlip = !capFlip;
      hide.classList.remove('on');
      if (cap) {
        show.textContent = cap[2];
        show.classList.toggle('song', cap[3] === 'song');
        void show.offsetWidth;
        show.classList.add('on');
      }
    }
    const ch = CHAPTERS.find((c) => t >= c[0] && t < c[1]);
    const ck = ch ? ch[2] : '';
    if (ck !== chKey) {
      chKey = ck;
      if (ch) { el.chT.textContent = ch[2]; el.chS.textContent = ch[3]; el.chapter.classList.add('on'); }
      else el.chapter.classList.remove('on');
    }
    const p = (t / TL.total) * 100;
    if (!S.scrubbing) el.scrub.value = String(t);
    el.scrub.style.setProperty('--p', p.toFixed(2) + '%');
    const s = Math.max(0, Math.floor(t));
    el.clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  function clearText() {
    el.capA.classList.remove('on'); el.capB.classList.remove('on'); el.chapter.classList.remove('on');
    capKey = null; chKey = null;
  }

  /* ---------- controls visibility ---------- */
  let hideTimer = 0;
  function pokeControls(stay) {
    if (S.mode !== 'film' || !el.lyre.hidden || !el.notes.hidden) return;
    el.controls.classList.remove('hide');
    clearTimeout(hideTimer);
    if (S.playing && !stay) hideTimer = setTimeout(() => { if (S.playing && !S.scrubbing) el.controls.classList.add('hide'); }, 3200);
  }
  ['pointermove', 'pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => pokeControls(), { passive: true }));

  /* ---------- the film loop ---------- */
  function showEnd(on) {
    if (on === S.endShown) return;
    S.endShown = on;
    el.end.hidden = !on;
  }
  // if frames run slow, render at a lower pixel density
  let lastF = 0, ema = 16, slowCount = 0;
  V.dprCap = 2;
  function watchSpeed() {
    const n = performance.now();
    if (lastF) { const d = n - lastF; if (d < 250) ema = ema * 0.94 + d * 0.06; }
    lastF = n;
    if (S.mode === 'film' && S.playing && !document.hidden) {
      slowCount = ema > 30 ? slowCount + 1 : 0;
      if (slowCount > 90 && V.dprCap > 1 && (window.devicePixelRatio || 1) > 1) {
        V.dprCap = Math.max(1, Math.min(V.dprCap, window.devicePixelRatio || 1) - 0.5);
        resize(); slowCount = 0; ema = 16;
      }
    }
  }
  function frame() {
    watchSpeed();
    if (V.ready) {
      if (S.mode === 'film') {
        let t = now();
        if (t >= TL.total && S.playing) {
          S.playing = false; S.pos = TL.total; t = TL.total;
          syncIcons(); pokeControls(true);
        }
        pump(t);
        if (S.audioOK && (S.playing || t >= TL.total) && performance.now() - S.lastBeds > 120) { SND.setBeds(t); S.lastBeds = performance.now(); }
        renderFrame(Math.min(t, TL.total));
        updateText(t);
        showEnd(t >= TL.end);
      } else if (S.mode === 'intro') {
        V.idle = (performance.now() - S.idle0) / 1000;
        renderFrame(0);
        V.idle = null;
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- buttons ---------- */
  el.begin.addEventListener('click', () => {
    ensureAudio();
    el.intro.hidden = true;
    S.mode = 'film';
    play(0);
  });
  el.play.addEventListener('click', () => { if (S.playing) pause(); else { ensureAudio(); play(); } });
  el.mute.addEventListener('click', () => { SND.setMuted(!SND.muted); syncIcons(); });
  el.scrub.addEventListener('input', () => {
    if (!S.scrubbing) { S.scrubbing = true; S.wasPlaying = S.playing; if (S.playing) pause(); }
    S.pos = +el.scrub.value;
    if (S.audioOK) SND.setBeds(S.pos);
  });
  el.scrub.addEventListener('change', () => {
    S.scrubbing = false;
    S.pos = +el.scrub.value;
    if (S.wasPlaying) play(S.pos);
  });
  el.replay.addEventListener('click', () => { showEnd(false); play(0); });
  window.addEventListener('keydown', (e) => {
    if (S.mode !== 'film' || !el.lyre.hidden || !el.notes.hidden) return;
    if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); if (S.playing) pause(); else play(); }
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      const was = S.playing; const t = clamp(now() + (e.code === 'ArrowRight' ? 5 : -5), 0, TL.total);
      if (was) play(t); else S.pos = t;
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.playing) pause(); });
  V.cv.addEventListener('click', () => { if (S.mode === 'film' && !S.playing && S.pos < TL.total - 0.1 && el.end.hidden) { ensureAudio(); play(); } });

  /* ---------- sheets ---------- */
  function openSheet(sheet) {
    S.sheetFrom = S.mode;
    if (S.playing) pause();
    el.end.hidden = true;
    sheet.hidden = false;
    el.controls.classList.add('hide');
    sheet.querySelector('.close').focus({ preventScroll: true });
  }
  function closeSheet(sheet) {
    sheet.hidden = true;
    if (sheet === el.lyre) { SND.ctx && setDrone(false); if (S.audioOK && !S.playing && S.mode !== 'intro') actx.suspend(); }
    if (S.sheetFrom === 'intro' && S.mode === 'intro') { el.intro.hidden = false; return; }
    if (S.mode === 'film') { el.end.hidden = !S.endShown; pokeControls(true); }
  }
  el.toNotes.addEventListener('click', () => openSheet(el.notes));
  el.notesClose.addEventListener('click', () => closeSheet(el.notes));
  el.toLyre.addEventListener('click', () => { openSheet(el.lyre); startLyre(); });
  el.skip.addEventListener('click', () => { el.intro.hidden = true; openSheet(el.lyre); startLyre(); });
  el.lyreClose.addEventListener('click', () => closeSheet(el.lyre));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!el.lyre.hidden) closeSheet(el.lyre); else if (!el.notes.hidden) closeSheet(el.notes); }
  });

  // key of signs in the notes panel
  const signHTML = (s) => (s === '⅂' ? '<svg class="lam" viewBox="0 0 10 14" aria-label="turned gamma"><path d="M1 1.6H8.4V13.4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>' : s);
  el.key.innerHTML = SIGN_ORDER.slice().reverse().map((s) => `<span><b>${signHTML(s)}</b>${SIGN_MODERN[s]}</span>`).join('');

  /* ---------- the playable lyre ---------- */
  const FLAT = [];
  SONG.forEach((syl, si) => syl.s.forEach((sign, k) => FLAT.push({ si, k, sign })));
  const L = { idx: 0, droneOn: false };
  function setDrone(on) {
    L.droneOn = on;
    if (!S.audioOK) return;
    SND.bedTo('drone', on ? 0.32 : 0);
  }
  function buildStrings() {
    el.strings.innerHTML = '';
    SIGN_ORDER.forEach((s, r) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'string'; b.dataset.sign = s;
      b.style.setProperty('--w', (3.4 - r * 0.28).toFixed(2) + 'px');
      b.setAttribute('aria-label', `String ${r + 1}, sign ${s === '⅂' ? 'turned gamma' : s}`);
      b.innerHTML = `<span class="str-line"></span><span class="str-sign">${signHTML(s)}</span><span class="str-note">${r + 1}</span>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); hit(s, b); });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit(s, b); } });
      el.strings.appendChild(b);
    });
  }
  function renderScore() {
    const cur = FLAT[Math.min(L.idx, FLAT.length - 1)];
    const line = SONG[cur.si].line;
    el.score.innerHTML = SONG.map((syl, si) => ({ syl, si })).filter((q) => q.syl.line === line).map(({ syl, si }) => {
      const signs = syl.s.map((s, k) => {
        const fi = FLAT.findIndex((f) => f.si === si && f.k === k);
        const cls = fi < L.idx ? 'done' : fi === L.idx ? 'next' : '';
        return `<span class="s ${cls}">${signHTML(s)}</span>`;
      }).join('');
      return `<span class="syl"><span class="sg">${signs}</span><span class="gk" lang="grc">${syl.g}</span><span class="tr">${syl.tr}</span></span>`;
    }).join('');
    el.eng.textContent = ENGLISH[line];
    el.strings.querySelectorAll('.string').forEach((b) => b.classList.toggle('target', L.idx < FLAT.length && b.dataset.sign === FLAT[L.idx].sign));
  }
  function startLyre() {
    if (!el.strings.children.length) buildStrings();
    L.idx = 0; el.done.textContent = '';
    renderScore();
  }
  function hit(sign, btn) {
    ensureAudio();
    const tNow = S.audioOK ? actx.currentTime + 0.01 : 0;
    if (S.audioOK) SND.pluck(tNow, signHz(sign), 0.72, { bright: 0.62 });
    btn.classList.remove('ring'); void btn.offsetWidth; btn.classList.add('ring');
    const want = FLAT[L.idx];
    if (want && want.sign === sign) {
      const syl = SONG[want.si];
      if (S.audioOK) SND.sing(tNow, [{ hz: signHz(sign), dur: 0.5 + syl.d[want.k] * 0.2 }], syl.v, want.k === 0 ? syl.c : '', 0.3);
      L.idx++;
      if (L.idx >= FLAT.length) {
        el.done.textContent = 'That’s the whole song. You just read music written down nineteen centuries ago.';
        el.strings.querySelectorAll('.string').forEach((b) => b.classList.remove('target'));
        const last = el.score.querySelectorAll('.s'); last.forEach((s) => s.classList.add('done'));
        return;
      }
      renderScore();
    } else if (want) {
      const target = el.strings.querySelector(`.string[data-sign="${want.sign}"]`);
      if (target) { target.classList.remove('nudge'); void target.offsetWidth; target.classList.add('nudge'); }
    }
  }
  el.restart.addEventListener('click', startLyre);
  el.drone.addEventListener('change', () => { ensureAudio(); setDrone(el.drone.checked); });
  el.hear.addEventListener('click', () => {
    if (!ensureAudio()) return;
    const cur = FLAT[Math.min(L.idx, FLAT.length - 1)];
    const line = SONG[cur.si].line;
    const notes = PASS_A.filter((n) => n.line === line);
    const t0 = actx.currentTime + 0.1, off = notes[0].t;
    const bySyl = new Map();
    notes.forEach((n) => { SND.pluck(t0 + n.t - off, n.hz, 0.5); if (!bySyl.has(n.syl)) bySyl.set(n.syl, []); bySyl.get(n.syl).push(n); });
    for (const [si, ns] of bySyl) SND.sing(t0 + ns[0].t - off, ns.map((n) => ({ hz: n.hz, dur: Math.min(n.dur, 1.4) })), SONG[si].v, SONG[si].c, 0.4);
  });

  /* ---------- boot ---------- */
  async function boot() {
    resize();
    window.addEventListener('resize', () => { resize(); });
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('400 40px "Gentium Book Plus"', 'ΕΙΚΩΝ CΖΚΙΟΦΧ ὅσον ζῇς φαίνου hóson'),
          document.fonts.load('italic 400 20px "Gentium Book Plus"', 'ὅσον ζῇς While'),
          document.fonts.load('400 40px "Marcellus"', 'While you live, shine. 1883 AD'),
        ]),
        new Promise((r) => setTimeout(r, 4000)),
      ]);
    } catch (e) { /* fall back to system serif */ }
    buildTextures();
    V.ready = true;
    el.begin.disabled = false;
    requestAnimationFrame(frame);
  }
  boot();

  // hooks for testing in a headless browser
  window.__seikilos = {
    render(t) { S.mode = 'film'; el.intro.hidden = true; S.playing = false; S.pos = t; renderFrame(t); updateText(t); showEnd(t >= TL.end); },
    state: S,
  };
})();
