'use strict';
/* ==========================================================================
   SOUND: everything synthesised live with Web Audio.
   Lyre = Karplus-Strong plucked string, pre-rendered per pitch.
   Voice = three detuned sawtooth "singers" through vowel formant filters.
   Beds = drone, wind, cicadas, fire, room tone; levels follow the timeline.
   ========================================================================== */

// chisel taps shared by sound and picture
const TINKS = (() => {
  const out = [];
  let r = 7;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  [1.5, 2.4, 3.3, 4.6, 5.9, 7.1, 8.6, 9.9, 11.2, 12.4].forEach((t) => out.push({ t, v: 0.1, kind: 'stone' }));
  [18.6, 19.3, 20.0, 20.8, 21.5, 22.1].forEach((t) => out.push({ t, v: 0.12, kind: 'stone' }));
  for (let t = 25.6; t < 44.8; t += 1.05 + rnd() * 0.5) out.push({ t, v: 0.07, kind: 'carve' });
  return out;
})();

const SND = (() => {
  let ctx = null, comp, master, revIn;
  let lyreBus, voiceBus, fxBus, ambBus, droneBus;
  let noiseBuf, brownBuf, crackleBuf;
  const beds = {};
  const live = new Set();
  const ksCache = new Map();
  let muted = false;
  const BED_SCALE = { drone: 0.5, wind: 0.5, cicadas: 0.11, fire: 0.55, room: 0.5, rumble: 0.7 };

  const track = (n) => { live.add(n); n.onended = () => live.delete(n); };
  const bq = (type, f, q = 0.707, gain = 0) => {
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
    if (gain) b.gain.value = gain;
    return b;
  };
  const gainNode = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };

  function makeNoise(sec, brown) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec);
    const b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      if (brown) { // crossfade the loop seam
        const X = Math.floor(sr * 0.25);
        for (let i = 0; i < X; i++) { const k = i / X; d[len - X + i] = d[len - X + i] * (1 - k) + d[i] * k; }
      }
    }
    return b;
  }
  function makeCrackle(sec) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec), b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let br = 0;
      for (let i = 0; i < len; i++) { br = (br + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = br * 1.4; }
      const pops = Math.floor(sec * 34);
      for (let p = 0; p < pops; p++) {
        const at = Math.floor(Math.random() * len);
        const L = Math.floor(sr * (0.002 + Math.random() * 0.012));
        const amp = Math.pow(Math.random(), 2.4) * 0.9;
        for (let j = 0; j < L && at + j < len; j++) d[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (L * 0.3));
      }
    }
    return b;
  }
  function makeIR(sec, decay) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec), ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len, n = Math.random() * 2 - 1;
        lp += (0.18 + 0.5 * (1 - t)) * (n - lp);
        d[i] = lp * Math.pow(1 - t, decay) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
      }
      // a few early reflections
      [0.017, 0.029, 0.041, 0.058, 0.073].forEach((s, k) => { const i = Math.floor(s * sr) + c * 37; if (i < len) d[i] += (k % 2 ? -1 : 1) * 0.5 * (1 - k * 0.15); });
    }
    return ir;
  }

  /* ---------- Karplus-Strong lyre ---------- */
  function ksBuf(hz, bright = 0.58, t60 = 2.4) {
    // a few shared variants keep memory down on phones
    bright = bright < 0.5 ? 0.45 : bright < 0.68 ? 0.58 : 0.75;
    t60 = t60 >= 3 ? 3.4 : t60 < 2.1 ? 2.0 : 2.4;
    const key = hz.toFixed(2) + '|' + bright + '|' + t60;
    if (ksCache.has(key)) return ksCache.get(key);
    const sr = ctx.sampleRate;
    const N = Math.max(2, Math.floor(sr / hz - 0.5));
    const fAct = sr / (N + 0.5);
    const len = Math.floor(sr * (t60 + 0.4));
    const buf = ctx.createBuffer(1, len, sr);
    const y = buf.getChannelData(0);
    const exc = new Float32Array(N + 1);
    let lp = 0;
    for (let i = 0; i <= N; i++) { lp += bright * ((Math.random() * 2 - 1) - lp); exc[i] = lp; }
    const p = Math.max(1, Math.floor(N * 0.13)); // pluck position
    for (let i = N; i >= p; i--) exc[i] -= exc[i - p];
    let mx = 0; for (let i = 0; i <= N; i++) mx = Math.max(mx, Math.abs(exc[i]));
    for (let i = 0; i <= N; i++) y[i] = exc[i] / (mx || 1);
    const rho = Math.pow(0.001, 1 / (fAct * t60));
    for (let n = N + 1; n < len; n++) y[n] = rho * 0.5 * (y[n - N] + y[n - N - 1]);
    const A = Math.floor(sr * 0.0015), R = Math.floor(sr * 0.25);
    for (let i = 0; i < A; i++) y[i] *= i / A;
    for (let i = 0; i < R; i++) y[len - 1 - i] *= i / R;
    const res = { buf, rate: hz / fAct };
    ksCache.set(key, res);
    return res;
  }
  function pluck(when, hz, vel = 0.6, opts = {}) {
    if (!ctx) return;
    const { buf, rate } = ksBuf(hz, opts.bright ?? 0.58, opts.t60 ?? 2.4);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = gainNode(vel);
    let node = src.connect(g);
    if (ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = opts.pan ?? Math.max(-0.5, Math.min(0.5, (Math.log2(hz / 330)) * 0.35));
      node = node.connect(pn);
    }
    node.connect(opts.dest || lyreBus);
    src.start(Math.max(when, ctx.currentTime));
    track(src);
  }

  /* ---------- formant voice ---------- */
  const VOW = {
    a: { f: [760, 1180, 2750], bw: [130, 170, 260], a: [1.0, 0.6, 0.22] },
    e: { f: [470, 1750, 2600], bw: [110, 180, 260], a: [1.0, 0.5, 0.25] },
    i: { f: [330, 2150, 2900], bw: [100, 190, 280], a: [1.0, 0.36, 0.28] },
    o: { f: [480, 820, 2650], bw: [110, 150, 250], a: [1.0, 0.6, 0.14] },
    u: { f: [350, 740, 2450], bw: [100, 140, 240], a: [1.0, 0.4, 0.1] },
    y: { f: [330, 1750, 2350], bw: [100, 180, 250], a: [1.0, 0.42, 0.18] },
  };
  const CONS = {
    s: ['highpass', 5200, 0.7, 0.11, 0.2, 0.75], z: ['highpass', 4300, 0.7, 0.08, 0.11, 0.7],
    f: ['bandpass', 1700, 0.8, 0.09, 0.15, 0.7], h: ['bandpass', 1400, 0.6, 0.07, 0.06, 0.7],
    kh: ['bandpass', 2300, 1.2, 0.08, 0.13, 0.7], t: ['highpass', 3600, 0.7, 0.03, 0.15, 0.25],
    p: ['lowpass', 1500, 0.7, 0.02, 0.12, 0.2], d: ['lowpass', 900, 0.7, 0.02, 0.09, 0.2], g: ['lowpass', 1100, 0.7, 0.022, 0.09, 0.2],
  };
  function consonant(when, c, vel) {
    const spec = CONS[c];
    if (!spec) return;
    const [type, f, q, dur, amp, lead] = spec;
    const t0 = Math.max(ctx.currentTime, when - dur * lead);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const g = gainNode(0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp * vel, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(bq(type, f, q)).connect(g).connect(voiceBus);
    src.start(t0, Math.random() * 2, dur + 0.05);
    track(src);
  }
  function sing(when, notes, vowel, cons, vel = 0.5) {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (when < now - 0.02) return;
    const D = notes.reduce((s, n) => s + n.dur, 0);
    const end = when + D;
    const V = VOW[vowel] || VOW.a;
    const f0 = notes[0].hz;
    const out = gainNode(0);
    const filters = V.f.map((fr, i) => {
      const freq = i === 0 ? Math.max(fr, f0 * 1.06) : fr; // let the first formant track the pitch
      const b = bq('bandpass', freq, freq / V.bw[i]);
      b.connect(gainNode(V.a[i] * (i === 0 ? 1.0 : 1.6))).connect(out);
      return b;
    });
    const body = bq('lowpass', 700, 0.5);
    body.connect(gainNode(0.08)).connect(out);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.0 + Math.random() * 0.7;
    const lfoG = gainNode(0);
    lfoG.gain.setValueAtTime(0, when);
    lfoG.gain.linearRampToValueAtTime(20, when + Math.min(0.5, D * 0.7));
    lfo.connect(lfoG);
    [-8, 0, 7].forEach((dc) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = dc + (Math.random() - 0.5) * 3;
      lfoG.connect(o.detune);
      o.frequency.setValueAtTime(f0 * 0.986, when);
      o.frequency.exponentialRampToValueAtTime(f0, when + 0.07);
      let tt = when;
      for (let i = 1; i < notes.length; i++) {
        tt += notes[i - 1].dur;
        o.frequency.setTargetAtTime(notes[i].hz, tt - 0.02, 0.028);
      }
      filters.forEach((b) => o.connect(b));
      o.connect(body);
      o.start(when); o.stop(end + 0.35); track(o);
    });
    lfo.start(when); lfo.stop(end + 0.35); track(lfo);
    const att = 0.055;
    out.gain.setValueAtTime(0, when);
    out.gain.linearRampToValueAtTime(vel, when + att);
    out.gain.setValueAtTime(vel, Math.max(when + att + 0.01, end - 0.06));
    out.gain.linearRampToValueAtTime(0, end + 0.14);
    out.connect(voiceBus);
    if (cons) consonant(when, cons, vel * 1.6);
  }

  /* ---------- small sound effects ---------- */
  function env(g, t0, peak, a, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function noiseHit(when, type, f, q, peak, a, d, dest = fxBus, offset) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const g = gainNode(0); env(g, when, peak, a, d);
    src.connect(bq(type, f, q)).connect(g).connect(dest);
    src.start(when, offset ?? Math.random() * 3, a + d + 0.05); track(src);
    return src;
  }
  function tone(when, type, f0, f1, peak, a, d, dest = fxBus) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, when);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, when + a + d);
    const g = gainNode(0); env(g, when, peak, a, d);
    o.connect(g).connect(dest); o.start(when); o.stop(when + a + d + 0.05); track(o);
    return o;
  }
  const FX = {
    tink(w, v = 0.1) {
      const f = 2400 + Math.random() * 1500;
      tone(w, 'sine', f, f * 0.995, v, 0.002, 0.14);
      tone(w, 'sine', f * 2.76, f * 2.75, v * 0.3, 0.002, 0.06);
      noiseHit(w, 'highpass', 3000, 0.7, v * 0.6, 0.001, 0.02);
    },
    whoosh(w, dur = 2.6, v = 0.22) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const b = bq('bandpass', 300, 1.4);
      b.frequency.setValueAtTime(260, w);
      b.frequency.exponentialRampToValueAtTime(2400, w + dur * 0.55);
      b.frequency.exponentialRampToValueAtTime(380, w + dur);
      const g = gainNode(0);
      g.gain.setValueAtTime(0.0001, w); g.gain.linearRampToValueAtTime(v, w + dur * 0.5); g.gain.linearRampToValueAtTime(0.0001, w + dur);
      src.connect(b).connect(g).connect(fxBus); src.start(w, 0, dur + 0.1); track(src);
    },
    tick(w, v = 0.06) { tone(w, 'triangle', 1800, 1700, v, 0.001, 0.05); },
    chuff(w, v) { noiseHit(w, 'bandpass', 520 + Math.random() * 160, 0.9, v, 0.006, 0.22); noiseHit(w, 'lowpass', 220, 0.8, v * 0.9, 0.01, 0.18); },
    clack(w, v) { noiseHit(w, 'bandpass', 2400, 1.4, v, 0.001, 0.025); noiseHit(w + 0.09, 'bandpass', 2000, 1.4, v * 0.8, 0.001, 0.025); },
    whistle(w, dur = 1.5, v = 0.07) {
      [588, 740, 880].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const vib = ctx.createOscillator(); vib.frequency.value = 6.2; const vg = gainNode(f * 0.004); vib.connect(vg).connect(o.frequency);
        const g = gainNode(0);
        g.gain.setValueAtTime(0.0001, w); g.gain.linearRampToValueAtTime(v * (1 - i * 0.2), w + 0.12);
        g.gain.setValueAtTime(v * (1 - i * 0.2), w + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, w + dur);
        o.connect(g).connect(fxBus); o.start(w); o.stop(w + dur + 0.05); vib.start(w); vib.stop(w + dur + 0.05); track(o); track(vib);
      });
      noiseHit(w, 'bandpass', 1200, 0.8, v * 0.5, 0.08, dur);
    },
    chirp(w, v = 0.035) {
      const n = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1600;
      for (let i = 0; i < n; i++) tone(w + i * 0.085, 'sine', base, base * (1.25 + Math.random() * 0.3), v, 0.004, 0.06);
    },
    thunk(w, v = 0.4) { tone(w, 'sine', 170, 62, v, 0.003, 0.22); noiseHit(w, 'lowpass', 700, 0.7, v * 0.5, 0.002, 0.08); },
    saw(w, dur, dir, v = 0.13) {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const b = bq('bandpass', dir > 0 ? 2300 : 3100, 2.2);
      b.frequency.linearRampToValueAtTime(dir > 0 ? 3200 : 2200, w + dur);
      const am = gainNode(0.55);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 38 + Math.random() * 8; const lg = gainNode(0.45); lfo.connect(lg).connect(am.gain);
      const g = gainNode(0);
      g.gain.setValueAtTime(0.0001, w); g.gain.linearRampToValueAtTime(v, w + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, w + dur);
      src.connect(b).connect(am).connect(g).connect(fxBus);
      src.start(w, Math.random() * 3, dur + 0.05); lfo.start(w); lfo.stop(w + dur + 0.05); track(src); track(lfo);
    },
    crack(w, v = 0.5) { noiseHit(w, 'highpass', 1400, 0.7, v * 0.7, 0.001, 0.12); tone(w + 0.01, 'sine', 95, 45, v, 0.003, 0.35); },
    swish(w, v = 0.08) { noiseHit(w, 'bandpass', 2600, 0.6, v, 0.12, 0.45); },
    step(w, v = 0.05) { noiseHit(w, 'lowpass', 420, 0.8, v, 0.004, 0.09); tone(w, 'sine', 90, 70, v * 0.6, 0.003, 0.08); },
    drum(w, strong, v = 0.34) {
      if (strong) { tone(w, 'sine', 118, 58, v, 0.003, 0.42); noiseHit(w, 'bandpass', 900, 1.0, v * 0.22, 0.001, 0.07); }
      else { tone(w, 'sine', 210, 160, v * 0.42, 0.002, 0.16); noiseHit(w, 'bandpass', 2200, 1.3, v * 0.18, 0.001, 0.04); }
    },
  };

  /* ---------- graph ---------- */
  function build(c) {
    ctx = c;
    ksCache.clear();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.3;
    master = gainNode(muted ? 0 : 0.92);
    comp.connect(master).connect(ctx.destination);
    const reverb = ctx.createConvolver(); reverb.buffer = makeIR(3.6, 2.4);
    revIn = gainNode(1);
    revIn.connect(bq('highpass', 170)).connect(reverb).connect(gainNode(0.6)).connect(comp);
    const bus = (dry, send) => { const g = gainNode(1), d = gainNode(dry), s = gainNode(send); g.connect(d).connect(comp); g.connect(s).connect(revIn); return g; };
    // lyre: a tortoiseshell body is mostly a low resonance and a soft top
    const lyreIn = gainNode(1);
    lyreIn.connect(bq('peaking', 240, 1.3, 5)).connect(bq('peaking', 1150, 1.0, 2)).connect(bq('highshelf', 4800, 0.7, -7)).connect(bus(1.3, 0.48));
    lyreBus = lyreIn;
    const voiceIn = gainNode(1);
    voiceIn.connect(bq('highpass', 150)).connect(bq('lowpass', 5200, 0.6)).connect(bus(0.3, 0.24));
    voiceBus = voiceIn;
    fxBus = bus(0.9, 0.2);
    ambBus = bus(1.0, 0.1);
    droneBus = bus(0.9, 0.35);

    noiseBuf = makeNoise(4, false);
    brownBuf = makeNoise(5, true);
    crackleBuf = makeCrackle(5);

    const t0 = ctx.currentTime + 0.02;
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t0, Math.random() * 2); return s; };
    const lfoTo = (param, hz, depth, type = 'sine') => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; const g = gainNode(depth); o.connect(g).connect(param); o.start(t0); return o; };

    // drone: open fifth E2 + B2 (pure 3:2), softly filtered
    beds.drone = gainNode(0);
    const dlp = bq('lowpass', 520, 0.9); lfoTo(dlp.frequency, 0.05, 170);
    dlp.connect(beds.drone).connect(droneBus);
    [[BASE_HZ / 4, -4], [BASE_HZ / 4, 4], [BASE_HZ * 3 / 8, -3], [BASE_HZ * 3 / 8, 5]].forEach(([f, dt]) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt;
      o.connect(gainNode(0.22)).connect(dlp); o.start(t0);
    });
    const tri = ctx.createOscillator(); tri.type = 'triangle'; tri.frequency.value = BASE_HZ / 2; tri.connect(gainNode(0.18)).connect(dlp); tri.start(t0);

    // wind
    beds.wind = gainNode(0);
    const wbp = bq('bandpass', 420, 0.8); lfoTo(wbp.frequency, 0.07, 230); lfoTo(wbp.Q, 0.11, 0.3);
    loop(noiseBuf).connect(bq('lowpass', 1400)).connect(wbp).connect(beds.wind).connect(ambBus);
    // cicadas
    beds.cicadas = gainNode(0);
    const am = gainNode(0.5); lfoTo(am.gain, 36, 0.5, 'square');
    const swell = gainNode(0.6); lfoTo(swell.gain, 0.23, 0.4);
    loop(noiseBuf).connect(bq('bandpass', 5300, 7)).connect(am).connect(swell).connect(beds.cicadas).connect(ambBus);
    // fire
    beds.fire = gainNode(0);
    loop(crackleBuf).connect(bq('highpass', 240)).connect(beds.fire).connect(ambBus);
    loop(brownBuf).connect(bq('lowpass', 140)).connect(gainNode(0.8)).connect(beds.fire);
    // a train going by
    beds.rumble = gainNode(0);
    loop(brownBuf).connect(bq('lowpass', 120, 0.9)).connect(beds.rumble).connect(ambBus);
    // museum room tone
    beds.room = gainNode(0);
    loop(brownBuf).connect(bq('lowpass', 260)).connect(beds.room).connect(ambBus);

    // warm the lyre cache: the eight signs, an octave up for the map, two bass notes
    SIGN_ORDER.forEach((s) => {
      const f = signHz(s);
      ksBuf(f, 0.45); ksBuf(f, 0.58); ksBuf(f, 0.75); ksBuf(f * 2, 0.58, 2.0);
    });
    ksBuf(BASE_HZ / 2, 0.45, 3.4); ksBuf(BASE_HZ * 3 / 8, 0.45, 3.4);
  }

  function setBeds(t, now) {
    if (!ctx) return;
    const at = now ?? ctx.currentTime;
    for (const k in beds) beds[k].gain.setTargetAtTime(bedLevel(k, t) * BED_SCALE[k], at, 0.2);
  }
  function bedTo(name, level) {
    if (!ctx || !beds[name]) return;
    beds[name].gain.setTargetAtTime(level * BED_SCALE[name], ctx.currentTime, 0.35);
  }
  function stopAll() {
    for (const n of live) { try { n.stop(); } catch (e) { /* already stopped */ } }
    live.clear();
  }
  function setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.92, ctx.currentTime, 0.05);
  }

  /* ---------- the score of events, in timeline seconds ---------- */
  function buildEvents() {
    const E = [];
    const add = (t, fn, kind = 'fx') => E.push({ t, fn, kind });
    const playPass = (notes, lyreVel, voiceVel, opts = {}) => {
      notes.forEach((n) => add(n.t, (w) => pluck(w, n.hz, lyreVel * (n.first ? 1 : 0.8), { bright: opts.bright ?? 0.55 }), 'lyre'));
      // one sung syllable per group of notes
      const bySyl = new Map();
      notes.forEach((n) => { if (!bySyl.has(n.syl)) bySyl.set(n.syl, []); bySyl.get(n.syl).push(n); });
      for (const [si, ns] of bySyl) {
        const syl = SONG[si];
        add(ns[0].t, (w) => sing(w, ns.map((n) => ({ hz: n.hz, dur: n.dur })), syl.v, syl.c, voiceVel), 'voice');
      }
    };
    TINKS.forEach((k) => add(k.t, (w) => FX.tink(w, k.v)));
    // Seikilos tries out his tune while he carves
    [[29.2, 'C', 0.5], [29.7, 'Ζ', 1.0], [30.7, 'Ζ', 1.5], [35.6, 'Κ', 0.5], [36.1, 'Ι', 0.5], [36.6, 'Ζ', 0.5], [37.1, 'Ι', 1.5], [42.4, 'C', 0.5], [42.9, 'Χ', 0.5], [43.4, '⅂', 1.5]].forEach(([t, s, d]) => add(t, (w) => pluck(w, signHz(s), 0.22, { bright: 0.45 })));
    // the ladder: a scale, low to high
    SIGN_ORDER.forEach((s, i) => add(TL.scaleRun + i * TL.scaleStep, (w) => pluck(w, signHz(s), 0.5, { bright: 0.75, t60: 2.2 })));
    playPass(PASS_A, 0.5, 0.42);
    ACCENT_WORDS.forEach((wd) => playPass(wd.notes, 0.52, 0.46));
    // time passing
    add(107.3, (w) => FX.whoosh(w, 3.0, 0.2));
    for (let c = 0; c < 18; c++) add(108.6 + c * 0.64, (w) => FX.tick(w, 0.05));
    // railway
    const near = (t) => Math.exp(-Math.pow((t - 127.2) / 2.8, 2));
    for (let t = 122.6; t < 132.4; t += 0.36) { const v = 0.1 + 0.55 * near(t); add(t, (w) => FX.chuff(w, v)); }
    for (let t = 123.0; t < 132.0; t += 0.72) { const v = 0.04 + 0.16 * near(t); add(t, (w) => FX.clack(w, v)); }
    add(124.7, (w) => FX.whistle(w, 1.5, 0.08));
    for (let t = 134.2; t < 157.5; t += 1.1 + ((t * 7.31) % 0.9)) add(t, (w) => FX.chirp(w, 0.075));
    add(136.25, (w) => FX.thunk(w, 0.42));
    // the pot lands on the opening two notes of the song
    add(136.5, (w) => pluck(w, signHz('C'), 0.26, { bright: 0.6 }));
    add(136.78, (w) => pluck(w, signHz('Ζ'), 0.26, { bright: 0.6 }));
    // "is alive": the song's own last three notes
    add(149.7, (w) => pluck(w, signHz('C'), 0.3, { bright: 0.45 }));
    add(150.25, (w) => pluck(w, signHz('Χ'), 0.3, { bright: 0.45 }));
    add(150.8, (w) => pluck(w, signHz('⅂'), 0.36, { bright: 0.45 }));
    for (let i = 0, t = 140.0; t < 145.4; i++, t += 0.54) add(t, (w) => FX.saw(w, 0.5, i % 2 ? -1 : 1, 0.34));
    add(145.55, (w) => FX.crack(w, 0.5));
    [145.9, 146.15, 146.5, 146.9].forEach((t) => add(t, (w) => FX.tink(w, 0.05)));
    add(154.1, (w) => FX.swish(w, 0.09));
    // map hops: a pluck as each city is reached
    add(170.3, (w) => pluck(w, signHz('C') * 2, 0.32, { bright: 0.6, t60: 2.0 }));
    ROUTE.forEach((r, i) => add(r.t + 1.3, (w) => pluck(w, signHz(['Ο', 'Κ', 'Ι', 'Ζ'][i]) * 2, 0.32, { bright: 0.6, t60: 2.0 })));
    // museum footsteps
    [[193.4, 7, 0.52], [197.8, 6, 0.6], [201.2, 5, 0.5]].forEach(([t0, n, gap]) => { for (let i = 0; i < n; i++) add(t0 + i * gap, (w) => FX.step(w, 0.045 * (1 - Math.abs(i - n / 2) / n))); });
    // finale
    playPass(PASS_F, 0.6, 0.5, { bright: 0.6 });
    const ET = [TL.finale];
    for (let e = 0; e < 48; e++) ET.push(ET[e] + FINALE_DUR(e));
    for (let bar = 0; bar < 8; bar++) {
      const e = bar * 6;
      const hz = (bar === 3 || bar === 5) ? BASE_HZ * 3 / 8 : BASE_HZ / 2;
      add(ET[e], (w) => pluck(w, hz, 0.32, { bright: 0.45, t60: 3.4, pan: -0.15 }));
      if (bar >= 2 && bar <= 6) { add(ET[e], (w) => FX.drum(w, true, 0.3)); add(ET[e + 3], (w) => FX.drum(w, false, 0.3)); }
      if (bar === 7) add(ET[e], (w) => FX.drum(w, true, 0.2));
    }
    add(ET[47], (w) => pluck(w, BASE_HZ * 3 / 8, 0.28, { bright: 0.4, t60: 3.4, pan: -0.15 }));
    E.sort((a, b) => a.t - b.t);
    return E;
  }

  return {
    build, pluck, sing, FX, setBeds, bedTo, stopAll, setMuted, buildEvents,
    get ctx() { return ctx; },
    get muted() { return muted; },
  };
})();
