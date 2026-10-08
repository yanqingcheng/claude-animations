/* ===== the film cut =====
   The page waits for you for as long as it takes; a video can't. This lays the same score and the same
   drawing code on a fixed timeline: title card, the song, one round of waiting, a cursor that answers,
   the finale, and an ending the loop never has. record.js steps it frame by frame. */
const FILM = (() => {
  const FPS = 30, VW = 1200, VH = 900, SX = 50, SY = 50, SC = 2, TS = 1.3;
  const T0 = 1.2;                      // seconds of title card before the modem dials
  const VB = 128, FB = 144, EB = 216;  // beats from the modem to: the wait, the finale, the ending
  const SEND = 14.4;                   // beats into the wait when the cursor clicks Send
  const END = 8, CARD = 2.4;           // the ending runs 8 beats, then the card holds
  const DUR = T0 + (EB + END) * BEAT + CARD;
  const WALL0 = 3.3, IRIS = [291, 205];
  const GAIN = .84;                    // 1.5 dB of headroom so AAC peaks stay under full scale
  const sent = { wall: T0 + (VB + SEND) * BEAT + WALL0, text: 'rawr' };
  let score, T, pcm, cv, ctx;

  function init(canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    score = mkScore();
    // one last chord with everyone on the tonic, then the sign-out chime as the iris shuts
    const TR = 2, C = CH.C, P = o => score.fin.ev.push(o);
    P({ k: 'kick', b: 72, v: 1 }); P({ k: 'crash', b: 72, v: 1.2 });
    P({ k: 'bass', b: 72, d: 3.5, m: C.root + TR, v: 1 });
    P({ k: 'pad', b: 72, d: 4, m: [...C.tri, C.tri[0] + 12, C.tri[1] + 12].map(x => x + TR), v: 1 });
    P({ k: 'stab', b: 72, d: .5, m: C.tri.map(x => x + TR), v: 1 });
    P({ k: 'lead', b: 72, d: 3.4, m: 84 + TR, v: 1 });
    P({ k: 'vox', who: 'dino', w: 'rawr', b: 72, d: 3.4, m: 72 + TR, hm: 67 + TR, layers: 4, v: 1.1, bub: ['RAWR!', 'i love you'] });
    P({ k: 'vox', who: 'cow', w: 'moo', b: 72, d: 3, m: 48 + TR, v: 1, bub: ['MOO', 'brb'] });
    P({ k: 'vox', who: 'duck', w: 'quack', b: 72, d: 1, m: 64 + TR, v: 1, bub: ['QUACK', 'lol'] });
    P({ k: 'vox', who: 'owl1', w: 'hoo', b: 72, d: 2, m: 76 + TR, v: 1, bub: ['HOO!!', 'NO WAI!!'] });
    P({ k: 'vox', who: 'owl2', w: 'hoo', b: 72, d: 2, m: 72 + TR, v: 1, bub: ['HOO!!', 'NO WAI!!'] });
    P({ k: 'sparkle', b: 72.5, v: 1 });
    P({ k: 'chimeOut', b: 78.45, m: [79 + TR, 72 + TR], v: 1 });
    const sh = sharedBufs();
    const sung = prepareVox(score, window.SamJs, f => { const b = sh.tmp.createBuffer(1, f.length, 22050); b.getChannelData(0).set(f); return b; });
    T = makeTracks(score);
    return { sung, frames: Math.round(DUR * FPS), fps: FPS, width: VW, height: VH, seconds: DUR };
  }

  /* ---- sound: the three sections end to end, rendered as one piece so every tail rings through ---- */
  async function audio() {
    const ev = [];
    for (const e of score.main.ev) ev.push(e);
    for (const e of score.vamp.ev) if (e.b < 16) ev.push(Object.assign({}, e, { b: e.b + VB }));
    for (const e of score.fin.ev) if (!e.ghost) ev.push(Object.assign({}, e, { b: e.b + FB }));
    ev.push({ k: 'blip', b: VB + SEND, v: 1 });
    const sec = { name: 'film', beats: EB + END, ev };
    const N = Math.ceil((PRE + sec.beats * BEAT + SEC_TAIL) * SR);
    const S = { k: 'film', sec, N, ch: [0, 1, 2, 3].map(() => new Float32Array(N)), kicks: ev.filter(e => e.k === 'kick' && e.duck) };
    const queue = planPatterns([S]);
    const K = clamp(navigator.hardwareConcurrency || 2, 2, 4);
    await Promise.all(Array.from({ length: K }, async () => { while (queue.length) await renderPattern(queue.pop()); }));
    const [L, R, rv, dl] = S.ch;
    effects(L, R, rv, dl, N);
    softClip(L); softClip(R);
    // onto the video clock: beat 0 lands at T0, and the last moment fades
    const total = Math.round(DUR * SR), off = Math.round((T0 - PRE) * SR);
    pcm = new Int16Array(total * 2);
    for (let i = 0; i < total; i++) {
      const j = i - off; if (j < 0 || j >= N) continue;
      const f = Math.min(1, (total - i) / (.4 * SR));
      pcm[i * 2] = Math.round(L[j] * f * GAIN * 32767); pcm[i * 2 + 1] = Math.round(R[j] * f * GAIN * 32767);
    }
    return Math.ceil(pcm.byteLength / CHUNK);
  }
  const CHUNK = 3 << 20;
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function wavHeader() {
    const n = pcm.byteLength, h = new DataView(new ArrayBuffer(44)), W4 = (o, s) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, s.charCodeAt(i)); };
    W4(0, 'RIFF'); h.setUint32(4, 36 + n, true); W4(8, 'WAVE'); W4(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 2, true);
    h.setUint32(24, SR, true); h.setUint32(28, SR * 4, true); h.setUint16(32, 4, true); h.setUint16(34, 16, true); W4(36, 'data'); h.setUint32(40, n, true);
    return b64(new Uint8Array(h.buffer));
  }
  const wavChunk = i => b64(new Uint8Array(pcm.buffer, i * CHUNK, Math.min(CHUNK, pcm.byteLength - i * CHUNK)));

  /* ---- picture ---- */
  function at(t) { // video time -> where the song is
    const wall = t + WALL0;
    if (t < T0) return { mode: 'title', b: 0, t, wall, ready: true };
    const gb = (t - T0) / BEAT;
    if (gb < VB) return { mode: 'main', b: gb, t: t - T0, wall };
    if (gb < FB) { const raw = gb - VB; return { mode: 'vamp', b: raw, raw, cycle: 0, t: raw * BEAT, wall, sent: raw >= SEND ? sent : null }; }
    const fb = gb - FB, st = { mode: 'fin', b: fb, t: fb * BEAT, wall, sent };
    if (fb >= 72) st.fx = { still: true, jump: (fb - 72) / 1.3, wink: fb > 77.5 && fb < 78.7 };
    return st;
  }
  function backdrop(c) {
    c.fillStyle = '#0b0b10'; c.fillRect(0, 0, VW, VH);
    c.fillStyle = 'rgba(255,255,255,.34)';
    for (let y = 30; y < VH; y += 140) for (let x = 20; x < VW; x += 140) c.fillRect(x, y, 2.5, 2.5);
    c.fillStyle = '#b6ff3b'; c.fillRect(SX + 12, SY + 12, W * SC, H * SC);
    c.fillStyle = '#ff2e93'; c.fillRect(SX - 6, SY - 6, W * SC + 12, H * SC + 12);
    txt(c, '★·.·´¯`·.·★  THE RAWR SONG  ★·.·´¯`·.·★', VW / 2, 23, '24px ' + F_PIX, '#b6ff3b');
    txt(c, 'A FLASH CARTOON, MINUS THE FLASH  ★  SOUND ON', VW / 2, VH - 17, '18px ' + F_PIX, '#3df0ff');
  }
  function chatBar(c, raw, wall) {
    const inn = back((raw - 3) / 1), out = ss(SEND + .2, SEND + .75, raw);
    if (raw < 3 || out >= 1) return null;
    const h = 40 * TS, x = 10, w = W - 20, y = H - 9 - h + (1 - Math.min(inn, 1.02)) * 90 + out * 90, pressed = raw >= SEND && raw < SEND + .35;
    c.save(); c.translate(x, y); c.lineJoin = 'round';
    c.fillStyle = 'rgba(10,10,40,.35)'; rr(c, 3, 3, w, h, 6); c.fill();
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f4f9ff'); g.addColorStop(1, '#bfd6f6');
    rr(c, 0, 0, w, h, 6); fs(c, g, '#1f4f9c', 2);
    const fl = 'bold ' + Math.round(11 * TS) + 'px ' + F_UI;
    txt(c, 'to ' + NAMES.dino + ':', 10, h / 2 + .5, fl, '#14244a', null, 0, 'left');
    c.font = fl; const lw = c.measureText('to ' + NAMES.dino + ':').width, bw = 62 * TS, ix = 18 + lw, iw = w - ix - bw - 18;
    rr(c, ix, 7, iw, h - 14, 3); fs(c, '#ffffff', '#7f9db9', 1.5);
    const fi = Math.round(15 * TS) + 'px ' + F_UI;
    txt(c, 'rawr', ix + 9, h / 2 + 1, fi, '#111', null, 0, 'left');
    if (fract(wall * 1.6) < .55 && raw < SEND) { c.font = fi; const tw = c.measureText('rawr').width; c.fillStyle = '#111'; c.fillRect(ix + 10 + tw, 12, 1.6, h - 24); }
    const bx = w - bw - 9, g2 = c.createLinearGradient(0, 7, 0, h - 7);
    g2.addColorStop(0, pressed ? '#2f6fe0' : '#5aa0ff'); g2.addColorStop(1, pressed ? '#174fb5' : '#1f5fd0');
    rr(c, bx, 7 + (pressed ? 1 : 0), bw, h - 14, 4); fs(c, g2, '#0a3fae', 1.5);
    txt(c, 'Send', bx + bw / 2, h / 2 + 1 + (pressed ? 1 : 0), 'bold ' + Math.round(13 * TS) + 'px ' + F_UI, '#fff');
    c.restore();
    return [x + bx + bw / 2, y + h / 2 + 4];
  }
  function cursor(c, x, y, down) {
    c.save(); c.translate(x, y + (down ? 1.5 : 0)); c.scale(1.5, 1.5); c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 16); c.lineTo(4, 12.4); c.lineTo(6.6, 18.2); c.lineTo(9, 17.2); c.lineTo(6.5, 11.4); c.lineTo(11.6, 11.4); c.closePath();
    c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.3; c.stroke();
    c.restore();
  }
  function overlays(c, st) {
    if (st.mode === 'vamp') {
      const tgt = chatBar(c, st.raw, st.wall), raw = st.raw;
      if (raw > 9.6) { // the mouse wanders in, hovers, clicks, leaves
        const btn = tgt || [503, 372], u = ss(9.6, 13.2, raw), away = ss(SEND + .5, 16, raw);
        const x = lerp(590, btn[0], u) + Math.sin(raw * 2.2) * 3 * (1 - u) + away * 30, y = lerp(250, btn[1], u * u) + away * 90;
        cursor(c, x, y, raw >= SEND && raw < SEND + .35);
      }
    }
    if (st.mode !== 'fin' || st.b < 72) return;
    const fb = st.b;
    if (fb < 73) { c.fillStyle = 'rgba(255,255,255,' + (1 - (fb - 72)) * .6 + ')'; c.fillRect(0, 0, W, H); }
    if (fb >= 73.6) { // iris out on the dinosaur: close, hold for the wink, shut
      const r = fb < 77 ? lerp(520, 60, ss(73.6, 77, fb)) : fb < 78.5 ? 60 : lerp(60, 0, ss(78.5, 79.1, fb));
      c.fillStyle = '#0b0b10'; c.beginPath(); c.rect(-2, -2, W + 4, H + 4); if (r > .5) c.arc(IRIS[0], IRIS[1], r, 0, TAU, true); c.fill();
      if (r > .5) { c.beginPath(); c.arc(IRIS[0], IRIS[1], r, 0, TAU); c.strokeStyle = '#ff2e93'; c.lineWidth = 3; c.stroke(); }
    }
    if (fb >= 79.6) { // the card
      const a = sat((fb - 79.6) / .6), t = st.wall, k = 1 + .08 * Math.sin(t * 7);
      c.globalAlpha = a;
      heart(c, W / 2, 112, 20 * k, '#ff2e93', '#ffffff');
      txt(c, 'RAWR.', W / 2 + 4, 196, '84px ' + F_DISP, '#b6ff3b');
      txt(c, 'RAWR.', W / 2, 192, '84px ' + F_DISP, '#ff2e93');
      txt(c, '(i love you)', W / 2, 252, 'bold 27px ' + F_COMIC, '#ffffff');
      txt(c, '★ the end ★  jk, it loops 4eva', W / 2, 344, '12px ' + F_PIX, '#3df0ff');
      c.globalAlpha = 1;
    }
  }
  function frame(i) {
    const st = at(i / FPS);
    st.T = T; st.ts = TS; st.rm = false; st.ptr = null; st.pokes = [];
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    backdrop(c);
    c.save(); c.translate(SX, SY); c.scale(SC, SC); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    drawFrame(c, st);
    overlays(c, st);
    c.restore();
    return cv.toDataURL('image/png').slice(22);
  }
  return { init, audio, wavHeader, wavChunk, frame, at, FPS, VW, VH, DUR, T0, VB, FB, EB };
})();
