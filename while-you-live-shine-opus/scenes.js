'use strict';
/* ==========================================================================
   PICTURE: one canvas, every frame drawn from the timeline time t.
   Nothing here keeps state between frames, so seeking just works.
   ========================================================================== */

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const win = (t, a, b, fi = 0.6, fo = 0.6) => Math.min(smooth(a, a + fi, t), 1 - smooth(b - fo, b, t));
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise2D(seed) {
  const r = rng(seed), P = new Uint8Array(512), V = new Float32Array(256);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  for (let i = 0; i < 256; i++) V[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const X = xi & 255, Y = yi & 255;
    const a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]], c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}
const N2 = makeNoise2D(11);

const FONT_G = '"Gentium Book Plus", "Gentium Plus", "Noto Serif", Georgia, serif';
const FONT_M = '"Marcellus", "Gentium Book Plus", Georgia, serif';
const COL = {
  ink: '#0b101b', cream: '#efe6d6', gold: '#e9b660', goldHi: '#f6dca2', marble: '#ddd4c3',
  ember: '#e2733a', terracotta: '#b75c39', olive: '#6d7748', sea: '#46717a',
};

const V = { cv: null, g: null, W: 0, H: 0, dpr: 1, vmin: 1, portrait: true, reduced: false, ready: false };
const TEX = {};
let SW = 1100, SH = 1040; // column "skin": the unrolled cylinder surface

/* ---------------- textures, built once ---------------- */
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function glowSprite(r, g, b, size = 128, core = 0.22) {
  const c = canvasOf(size, size), x = c.getContext('2d');
  const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(core, `rgba(${r},${g},${b},0.45)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  return c;
}
function makeMarble(w, h, seed) {
  const c = canvasOf(w, h), x = c.getContext('2d');
  const img = x.createImageData(w, h), d = img.data;
  const nz = makeNoise2D(seed);
  const fb = (X, Y) => { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < 5; i++) { s += a * nz(X * f, Y * f); n += a; a *= 0.5; f *= 2.01; } return s / n; };
  const val = (u, v) => {
    const base = fb(u, v);
    const vein = Math.abs(Math.sin(u * 0.8 + v * 1.7 + fb(u * 1.3 + 3.1, v * 1.3 + 7.7) * 6.0));
    const vv = Math.pow(1 - vein, 22) * 0.6 + Math.pow(1 - vein, 5) * 0.07;
    return [base, vv];
  };
  const S = 7;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const u = (i / w) * S, v = (j / h) * S;
      let [b1, v1] = val(u, v);
      const blend = smooth(0.82, 1.0, i / w);
      if (blend > 0) { const [b2, v2] = val(u - S, v); b1 = lerp(b1, b2, blend); v1 = lerp(v1, v2, blend); }
      const k = (j * w + i) * 4;
      d[k] = 226 - b1 * 30 - v1 * 80;
      d[k + 1] = 218 - b1 * 30 - v1 * 76;
      d[k + 2] = 203 - b1 * 28 - v1 * 58;
      d[k + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

/* inscription layout on the skin; returns glyph runs for carving and glowing */
function layoutSkin(x) {
  const runs = { distich: [], songText: [], signs: [], signature: [], lost: [] };
  const unit = SH * 0.86 / 16.6;
  const fs = unit * 0.7, fsSign = unit * 0.42;
  let y = SH * 0.07 + unit * 0.8;
  const left = SW * 0.5 - SW * 0.22;
  x.font = `400 ${fs}px ${FONT_G}`;
  INSCRIPTION.distich.forEach((row) => { runs.distich.push({ text: row, x: left, y, fs }); y += unit; });
  y += unit * 0.35;
  INSCRIPTION.song.forEach((row) => {
    y += unit * 0.55;
    let cx = left;
    row.forEach(([letters, signs]) => {
      x.font = `400 ${fs}px ${FONT_G}`;
      const lw = x.measureText(letters).width;
      const core = x.measureText(letters.trim()).width;
      runs.songText.push({ text: letters, x: cx, y, fs });
      const n = signs.length;
      for (let i = 0; i < n; i++) {
        const sx = cx + (core * (i + 0.5)) / n;
        runs.signs.push({ sign: signs[i], x: sx, y: y - fs * 0.92, fs: fsSign });
      }
      cx += lw;
    });
    y += unit;
  });
  runs.signature.push({ text: INSCRIPTION.signature, x: left + unit * 0.3, y: y + unit * 0.05, fs });
  runs.lost.push({ text: INSCRIPTION.lost, x: left + unit * 2.2, y: y + unit * 1.05, fs });
  runs.bottomY = y + unit * 0.4; // where the sawn base sits on the skin
  return runs;
}
function carve(x, text, px, py, fs, align = 'left') {
  x.textAlign = align;
  x.font = `400 ${fs}px ${FONT_G}`;
  x.fillStyle = 'rgba(48,36,26,0.55)'; x.fillText(text, px - fs * 0.035, py - fs * 0.035);
  x.fillStyle = 'rgba(255,250,238,0.6)'; x.fillText(text, px + fs * 0.035, py + fs * 0.035);
  x.fillStyle = 'rgba(112,98,84,0.92)'; x.fillText(text, px, py);
}
function drawSign(x, s, px, py, fs, color) {
  if (s === '⅂') {
    const h = fs * 0.66, w = fs * 0.5;
    x.save();
    x.strokeStyle = color; x.lineWidth = Math.max(1, fs * 0.085); x.lineCap = 'square';
    x.beginPath(); x.moveTo(px - w / 2, py - h); x.lineTo(px + w / 2, py - h); x.lineTo(px + w / 2, py); x.stroke();
    x.restore();
  } else {
    x.fillStyle = color; x.textAlign = 'center'; x.fillText(s, px, py);
  }
}
function carveSign(x, s, px, py, fs) {
  x.font = `400 ${fs}px ${FONT_G}`;
  const o = fs * 0.04;
  drawSign(x, s, px - o, py - o, fs, 'rgba(48,36,26,0.55)');
  drawSign(x, s, px + o, py + o, fs, 'rgba(255,250,238,0.55)');
  drawSign(x, s, px, py, fs, 'rgba(104,90,76,0.95)');
}

function buildTextures() {
  TEX.gold = glowSprite(246, 200, 118);
  TEX.white = glowSprite(255, 248, 236);
  TEX.ember = glowSprite(255, 142, 64);
  TEX.smoke = glowSprite(34, 28, 26, 128, 0.45);
  TEX.dust = glowSprite(255, 240, 220, 64, 0.3);
  TEX.fly = glowSprite(214, 236, 150, 64, 0.25);
  TEX.blue = glowSprite(170, 196, 255, 96, 0.25);
  TEX.marble = makeMarble(420, 400, 5);

  // the skin
  const skin = canvasOf(SW, SH), x = skin.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(TEX.marble, 0, 0, SW, SH);
  // weathering: pits and stains
  const r = rng(99);
  for (let i = 0; i < 900; i++) {
    const px = r() * SW, py = r() * SH, s = Math.pow(r(), 3) * 7 + 0.6;
    x.fillStyle = `rgba(${60 + r() * 40},${50 + r() * 30},${40 + r() * 20},${0.05 + r() * 0.12})`;
    x.beginPath(); x.ellipse(px, py, s, s * (0.5 + r() * 0.6), r() * 3, 0, TAU); x.fill();
  }
  const runs = layoutSkin(x);
  TEX.runs = runs;
  runs.distich.forEach((q) => carve(x, q.text, q.x, q.y, q.fs));
  runs.songText.forEach((q) => carve(x, q.text, q.x, q.y, q.fs));
  runs.signs.forEach((q) => carveSign(x, q.sign, q.x, q.y, q.fs));
  runs.signature.forEach((q) => carve(x, q.text, q.x, q.y, q.fs));
  TEX.skin = skin;

  // glow layers at half resolution
  const glowLayer = (list, isSign) => {
    const c = canvasOf(SW / 2, SH / 2), gx = c.getContext('2d');
    gx.scale(0.5, 0.5);
    gx.shadowColor = 'rgba(255,196,110,0.95)'; gx.shadowBlur = 16;
    list.forEach((q) => {
      gx.font = `400 ${q.fs}px ${FONT_G}`;
      if (isSign) drawSign(gx, q.sign, q.x, q.y, q.fs, 'rgba(255,214,140,0.95)');
      else { gx.fillStyle = 'rgba(255,214,140,0.9)'; gx.textAlign = 'left'; gx.fillText(q.text, q.x, q.y); }
    });
    return c;
  };
  TEX.glow = {
    distich: glowLayer(runs.distich),
    songText: glowLayer(runs.songText),
    signs: glowLayer(runs.signs, true),
    signature: glowLayer(runs.signature),
  };
  // the song rows and their notes, lit together in one pass
  const both = canvasOf(SW / 2, SH / 2), bx = both.getContext('2d');
  bx.globalAlpha = 0.6; bx.drawImage(TEX.glow.songText, 0, 0);
  bx.globalAlpha = 1; bx.globalCompositeOperation = 'lighter'; bx.drawImage(TEX.glow.signs, 0, 0);
  TEX.glow.song = both;

  // the paper rubbing
  const pw = 900, ph = 420, pr = canvasOf(pw, ph), px = pr.getContext('2d');
  px.fillStyle = '#e8dfca'; px.fillRect(0, 0, pw, ph);
  for (let i = 0; i < 2600; i++) { px.strokeStyle = `rgba(120,100,70,${0.03 + r() * 0.05})`; px.lineWidth = 0.6; const a = r() * TAU, l = 4 + r() * 16, cx = r() * pw, cy = r() * ph; px.beginPath(); px.moveTo(cx, cy); px.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); px.stroke(); }
  const rub = canvasOf(pw, ph), rx = rub.getContext('2d');
  for (let i = 0; i < 9000; i++) { rx.fillStyle = `rgba(30,28,30,${0.05 + r() * 0.09})`; const cx = 60 + r() * (pw - 120), cy = 70 + r() * (ph - 140); rx.fillRect(cx, cy, 6 + r() * 26, 2 + r() * 5); }
  rx.globalCompositeOperation = 'destination-out';
  rx.fillStyle = '#000';
  rx.font = `400 92px ${FONT_G}`; rx.textAlign = 'center';
  rx.fillText(INSCRIPTION.signature, pw / 2, 190);
  rx.fillText(INSCRIPTION.lost, pw / 2, 318);
  px.drawImage(rub, 0, 0);
  TEX.rubbing = pr;

  // skyline for 1922
  const sr = rng(1922), sk = [];
  let sx = 0;
  while (sx < 1) {
    const w = 0.02 + sr() * 0.05, h = 0.03 + Math.pow(sr(), 2) * 0.09;
    const kind = sr() < 0.12 ? 'dome' : sr() < 0.06 ? 'tower' : 'block';
    sk.push({ x: sx, w, h, kind, mast: sx > 0.72 && sr() < 0.5 });
    sx += w * (0.7 + sr() * 0.4);
  }
  TEX.skyline = sk;
  // stars
  const st = rng(7), stars = [];
  for (let i = 0; i < 260; i++) stars.push({ x: st(), y: Math.pow(st(), 1.3), r: 0.4 + Math.pow(st(), 4) * 1.6, p: st() * TAU, s: 0.5 + st() * 2 });
  TEX.stars = stars;
}

/* ---------------- canvas sizing ---------------- */
function resize() {
  const c = V.cv;
  const rect = c.getBoundingClientRect();
  V.W = Math.max(1, rect.width); V.H = Math.max(1, rect.height);
  V.dpr = Math.min(window.devicePixelRatio || 1, V.dprCap || 2);
  c.width = Math.round(V.W * V.dpr); c.height = Math.round(V.H * V.dpr);
  V.g = c.getContext('2d');
  V.g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  V.vmin = Math.min(V.W, V.H);
  V.portrait = V.H > V.W * 1.1;
  layoutSong.cache = null;
}

/* ---------------- drawing helpers ---------------- */
function vgrad(stops, y0 = 0, y1 = V.H) {
  const g = V.g, gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((s, i) => gr.addColorStop(Array.isArray(s) ? s[0] : i / (stops.length - 1), Array.isArray(s) ? s[1] : s));
  return gr;
}
function fillBg(stops) { const g = V.g; g.fillStyle = vgrad(stops); g.fillRect(0, 0, V.W, V.H); }
function sprite(img, x, y, r, a) { if (a <= 0.003 || r <= 0) return; const g = V.g; g.globalAlpha = Math.min(1, a); g.drawImage(img, x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; }
function radial(x, y, r, inner, outer = 'rgba(0,0,0,0)') {
  const g = V.g, gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}
function vignette(a = 0.55) {
  const g = V.g, gr = g.createRadialGradient(V.W / 2, V.H * 0.45, V.vmin * 0.25, V.W / 2, V.H * 0.5, Math.hypot(V.W, V.H) * 0.62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, V.W, V.H);
}
function text(str, x, y, size, font, color, align = 'center', alpha = 1, weight = 400, style = '') {
  if (alpha <= 0.003) return;
  const g = V.g;
  g.globalAlpha = alpha; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic';
  g.font = `${style} ${weight} ${size}px ${font}`;
  g.fillText(str, x, y);
  g.globalAlpha = 1;
}
function hills(seed, y0, amp, color, freq = 2.2, drift = 0) {
  const g = V.g;
  g.fillStyle = color;
  g.beginPath(); g.moveTo(0, V.H);
  for (let i = 0; i <= 64; i++) {
    const x = (i / 64) * V.W;
    const n = N2(i / 64 * freq + drift, seed) * 0.75 + N2(i / 64 * freq * 3 + drift, seed + 9) * 0.25;
    g.lineTo(x, y0 - n * amp);
  }
  g.lineTo(V.W, V.H); g.closePath(); g.fill();
}
function cypress(x, y, h, color) {
  const g = V.g, w = h * 0.16;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - h);
  g.bezierCurveTo(x + w * 0.9, y - h * 0.62, x + w * 0.75, y - h * 0.15, x + w * 0.2, y);
  g.lineTo(x - w * 0.2, y);
  g.bezierCurveTo(x - w * 0.75, y - h * 0.15, x - w * 0.9, y - h * 0.62, x, y - h);
  g.fill();
}
function olive(x, y, s, color) {
  const g = V.g;
  g.fillStyle = color;
  g.fillRect(x - s * 0.04, y - s * 0.4, s * 0.08, s * 0.4);
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.ellipse(x + (hash(i + x) - 0.5) * s * 0.7, y - s * (0.45 + hash(i * 3 + x) * 0.3), s * 0.28, s * 0.18, 0, 0, TAU);
    g.fill();
  }
}

/* ---------------- the column ---------------- */
function columnBody(cx, top, base, R, ry) {
  const g = V.g;
  g.beginPath();
  for (let i = 0; i <= 24; i++) { const th = -Math.PI / 2 + Math.PI * i / 24; const px = cx + R * Math.sin(th), py = top + ry * Math.cos(th); i ? g.lineTo(px, py) : g.moveTo(px, py); }
  for (let i = 24; i >= 0; i--) { const th = -Math.PI / 2 + Math.PI * i / 24; g.lineTo(cx + R * Math.sin(th), base + ry * Math.cos(th)); }
  g.closePath();
}
function drawSkinSlices(img, cx, top, h, R, ry, rot, NS, vFrom = 0, vTo = 1) {
  const g = V.g, IW = img.width, IH = img.height;
  const sy = vFrom * IH, sh = (vTo - vFrom) * IH;
  const du = (IW * (Math.PI / NS)) / TAU;
  for (let i = 0; i < NS; i++) {
    const th0 = -Math.PI / 2 + (Math.PI * i) / NS, th1 = th0 + Math.PI / NS;
    const x0 = cx + R * Math.sin(th0), x1 = cx + R * Math.sin(th1);
    const dw = x1 - x0 + 0.7;
    const yo = ry * Math.cos((th0 + th1) / 2);
    let u = (((th0 + rot) / TAU) % 1 + 1) % 1 * IW;
    if (u + du <= IW) g.drawImage(img, u, sy, du, sh, x0, top + yo, dw, h);
    else {
      const a = IW - u, f = a / du;
      if (a > 0.01) g.drawImage(img, u, sy, a, sh, x0, top + yo, dw * f, h);
      g.drawImage(img, 0, sy, du - a, sh, x0 + dw * f, top + yo, dw * (1 - f) + 0.5, h);
    }
  }
}
/* o: {cx, base, w, h, rot, light, warm, cool, glow:{...}, alpha, skinTo} */
function drawColumn(o) {
  const g = V.g;
  const R = o.w / 2, ry = R * 0.17, top = o.base - o.h;
  const NS = o.w < 60 ? 24 : 64;
  const light = o.light ?? 1;
  g.save();
  g.globalAlpha = o.alpha ?? 1;
  // ground shadow
  if (o.shadow !== false) {
    g.save(); g.globalAlpha = (o.alpha ?? 1) * 0.5;
    const sg = g.createRadialGradient(o.cx + R * 0.4, o.base + ry * 0.5, 0, o.cx + R * 0.4, o.base + ry * 0.5, R * 1.8);
    sg.addColorStop(0, 'rgba(0,0,0,0.75)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.beginPath(); g.ellipse(o.cx + R * 0.4, o.base + ry * 0.4, R * 1.8, ry * 2.2, 0, 0, TAU); g.fill();
    g.restore();
  }
  const vTo = o.skinTo ?? (TEX.runs.bottomY / SH);
  const rot = (o.rot || 0) + Math.PI - 0.2;
  drawSkinSlices(TEX.skin, o.cx, top, o.h, R, ry, rot, NS, 0, vTo);
  // shading across the cylinder
  columnBody(o.cx, top, o.base, R, ry);
  const sg = g.createLinearGradient(o.cx - R, 0, o.cx + R, 0);
  sg.addColorStop(0, 'rgba(8,7,12,0.82)'); sg.addColorStop(0.16, 'rgba(8,7,12,0.32)');
  sg.addColorStop(0.34, 'rgba(255,238,205,0.04)'); sg.addColorStop(0.58, 'rgba(8,7,12,0.14)');
  sg.addColorStop(0.86, 'rgba(8,7,12,0.6)'); sg.addColorStop(1, 'rgba(8,7,12,0.9)');
  g.fillStyle = sg; g.fill();
  if (light < 1) { g.fillStyle = `rgba(6,8,14,${(1 - light) * 0.92})`; g.fill(); }
  if (o.warm) { g.globalCompositeOperation = 'soft-light'; g.fillStyle = `rgba(255,170,80,${o.warm})`; g.fill(); g.globalCompositeOperation = 'source-over'; }
  if (o.cool) { g.globalCompositeOperation = 'soft-light'; g.fillStyle = `rgba(120,160,255,${o.cool})`; g.fill(); g.globalCompositeOperation = 'source-over'; }
  // top cap
  const cap = g.createLinearGradient(o.cx - R, top - ry, o.cx + R, top + ry);
  cap.addColorStop(0, '#efe7d6'); cap.addColorStop(1, '#a89d8b');
  g.fillStyle = cap; g.beginPath(); g.ellipse(o.cx, top, R, ry, 0, 0, TAU); g.fill();
  if (light < 1) { g.fillStyle = `rgba(6,8,14,${(1 - light) * 0.92})`; g.fill(); }
  // glowing letters
  if (o.glow) {
    g.globalCompositeOperation = 'lighter';
    for (const k in o.glow) {
      const a = o.glow[k];
      if (a > 0.02 && TEX.glow[k]) { g.globalAlpha = a * (o.alpha ?? 1); drawSkinSlices(TEX.glow[k], o.cx, top, o.h, R, ry, rot, Math.min(NS, 28), 0, vTo); }
    }
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
  return { top, R, ry };
}
/* where a skin point (u in 0..SW, v in 0..SH) lands on screen, if facing us */
function skinToScreen(o, u, v) {
  const R = o.w / 2, ry = R * 0.17, top = o.base - o.h;
  const vTo = o.skinTo ?? (TEX.runs.bottomY / SH);
  const th = ((u / SW) * TAU - ((o.rot || 0) + Math.PI - 0.2)) % TAU;
  const a = ((th + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (Math.abs(a) > Math.PI / 2 * 0.92) return null;
  return { x: o.cx + R * Math.sin(a), y: top + ry * Math.cos(a) + (v / (SH * vTo)) * o.h, f: Math.cos(a) };
}

/* ---------------- dust & sparks ---------------- */
function dust(t, n, x0, y0, w, h, a = 0.5) {
  const g = V.g;
  g.globalCompositeOperation = 'lighter';
  const count = V.reduced ? Math.floor(n / 3) : n;
  for (let i = 0; i < count; i++) {
    const sp = 0.004 + hash(i * 7) * 0.012;
    const px = x0 + ((hash(i) + Math.sin(t * sp * 9 + i) * 0.04 + t * sp * 0.6) % 1) * w;
    const py = y0 + ((hash(i * 3) + t * sp * 0.35) % 1) * h;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + hash(i * 5)) + i);
    sprite(TEX.dust, px, py, 1.5 + hash(i * 9) * 3, a * tw * (0.3 + hash(i * 11) * 0.7));
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}
function sparkAt(x, y, age, size = 1) {
  if (age < 0 || age > 0.5) return;
  const g = V.g, k = 1 - age / 0.5;
  g.globalCompositeOperation = 'lighter';
  sprite(TEX.gold, x, y, (6 + age * 40) * size, 0.8 * k * k);
  for (let i = 0; i < 5; i++) {
    const a = hash(i + x) * TAU, d = age * (30 + hash(i * 3 + y) * 40) * size;
    sprite(TEX.white, x + Math.cos(a) * d, y + Math.sin(a) * d - age * 10, 1.6 * size, 0.9 * k);
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

/* ========================= SCENES ========================= */

/* ---- 1. The stone speaks ---- */
function mainColumnLayout() {
  if (V.portrait) {
    const h = Math.min(V.H * 0.56, V.W * 1.32);
    return { cx: V.W / 2, base: V.H * 0.12 + h + V.H * 0.03, w: h / 2.98, h };
  }
  const h = V.H * 0.64;
  return { cx: V.W / 2, base: V.H * 0.1 + h, w: h / 2.98, h };
}
function drawStone(t) {
  const g = V.g;
  plate('stone', () => {
    fillBg(['#070a13', '#0d1322', '#121828']);
    radial(V.W * 0.5, V.H * 0.5, V.vmin * 0.6, 'rgba(60,70,110,0.12)');
  });
  const flick = 0.85 + 0.15 * N2(t * 1.9, 3.3);
  radial(V.W * 0.2, V.H * 0.14, V.vmin * 1.05, `rgba(233,178,96,${0.2 * flick})`);
  const L = mainColumnLayout();
  const idle = V.idle;
  const fade = idle != null ? 0.72 : smooth(0, 3.6, t);
  const push = V.reduced || idle != null ? 1 : lerp(0.93, 1.0, easeInOut(t / 23));
  const o = {
    cx: L.cx, base: L.base, w: L.w * push, h: L.h * push,
    rot: idle != null ? -0.45 + Math.sin(idle * 0.05) * 0.5 : -0.55 + t * 0.03,
    light: fade, warm: 0.16,
    glow: idle != null ? { signs: 0.18 + 0.1 * Math.sin(idle * 0.8) } : {
      distich: win(t, 1.0, 13.8, 1.4, 1.6) * 0.85,
      song: win(t, 18.3, 23.7, 0.9, 1.4),
    },
  };
  drawColumn(o);
  if (idle != null) t = idle;
  // chisel glints where a letter is "re-cut"
  if (idle == null) TINKS.forEach((k, i) => {
    if (k.kind !== 'stone') return;
    const age = t - k.t;
    if (age < 0 || age > 0.5) return;
    const list = k.t < 15 ? TEX.runs.distich : TEX.runs.signs;
    const q = list[i % list.length];
    const p = skinToScreen(o, q.x + (hash(i) * 0.6) * 200, q.y - q.fs * 0.3);
    if (p) sparkAt(p.x, p.y, age, 0.6 + p.f * 0.5);
  });
  dust(t, 32, 0, 0, V.W, V.H, 0.4 * fade);
  vignette(0.6);
}

/* ---- 2. Tralles ---- */
function drawTralles(t) {
  const g = V.g, lt = t - 23;
  const dusk = smooth(0, 24, lt);
  const hor = V.H * (V.portrait ? 0.6 : 0.64);
  g.fillStyle = vgrad([[0, `rgb(${lerp(36, 14, dusk)},${lerp(44, 20, dusk)},${lerp(82, 46, dusk)})`], [0.55, `rgb(${lerp(150, 70, dusk)},${lerp(110, 60, dusk)},${lerp(120, 90, dusk)})`], [1, `rgb(${lerp(236, 170, dusk)},${lerp(162, 96, dusk)},${lerp(104, 74, dusk)})`]], 0, hor);
  g.fillRect(0, 0, V.W, hor + 2);
  // stars come out
  g.globalCompositeOperation = 'lighter';
  TEX.stars.forEach((s, i) => { if (s.y < 0.62) sprite(TEX.white, s.x * V.W, s.y * hor, s.r * 1.6, smooth(6, 20, lt) * (0.4 + 0.6 * Math.sin(t * s.s + s.p) ** 2) * 0.55); });
  g.globalCompositeOperation = 'source-over';
  // sun
  const sunY = hor - V.vmin * 0.02 + easeInOut(lt / 24) * V.vmin * 0.09;
  radial(V.W * 0.72, sunY, V.vmin * 0.42, `rgba(255,190,120,${0.32 * (1 - dusk * 0.6)})`);
  g.fillStyle = `rgba(255,${lerp(222, 170, dusk)},${lerp(168, 120, dusk)},0.95)`;
  g.beginPath(); g.arc(V.W * 0.72, sunY, V.vmin * 0.045, 0, TAU); g.fill();
  // hills, far to near
  const drift = V.reduced ? 0 : lt * 0.004;
  hills(3, hor - V.vmin * 0.05, V.vmin * 0.12, `rgba(${lerp(108, 60, dusk)},${lerp(92, 58, dusk)},${lerp(120, 82, dusk)},1)`, 1.6, drift * 0.5);
  hills(5, hor + V.vmin * 0.02, V.vmin * 0.1, `rgb(${lerp(126, 62, dusk)},${lerp(88, 48, dusk)},${lerp(70, 52, dusk)})`, 2.4, drift);
  for (let i = 0; i < 9; i++) cypress(V.W * (0.05 + i * 0.11 + hash(i) * 0.04), hor + V.vmin * (0.03 + hash(i * 2) * 0.03), V.vmin * (0.1 + hash(i * 5) * 0.08), `rgb(${lerp(44, 22, dusk)},${lerp(52, 28, dusk)},${lerp(40, 28, dusk)})`);
  hills(8, hor + V.vmin * 0.12, V.vmin * 0.08, `rgb(${lerp(88, 40, dusk)},${lerp(70, 34, dusk)},${lerp(52, 32, dusk)})`, 1.8, drift * 1.4);
  for (let i = 0; i < 4; i++) olive(V.W * (0.58 + i * 0.12), hor + V.vmin * 0.13, V.vmin * 0.11, `rgb(${lerp(84, 38, dusk)},${lerp(94, 44, dusk)},${lerp(62, 36, dusk)})`);
  // foreground slope with the column and Seikilos
  const fy = hor + V.vmin * 0.2;
  g.fillStyle = `rgb(${lerp(58, 22, dusk)},${lerp(46, 20, dusk)},${lerp(38, 22, dusk)})`;
  g.beginPath(); g.moveTo(0, V.H); g.lineTo(0, fy + V.vmin * 0.04); g.quadraticCurveTo(V.W * 0.4, fy - V.vmin * 0.03, V.W, fy + V.vmin * 0.02); g.lineTo(V.W, V.H); g.fill();
  const ch = V.vmin * 0.3, cw = ch / 2.98, ccx = V.W * (V.portrait ? 0.38 : 0.42), cbase = fy + V.vmin * 0.015;
  const o = { cx: ccx, base: cbase, w: cw, h: ch, rot: 0.2, light: lerp(0.9, 0.55, dusk), warm: 0.35, shadow: true };
  drawColumn(o);
  // Seikilos, carving
  const fx = ccx + cw * 1.45, fyb = cbase + V.vmin * 0.005;
  let strike = 0;
  TINKS.forEach((k) => { if (k.kind === 'carve') { const a = t - k.t; if (a > -0.25 && a < 0.12) strike = Math.max(strike, a < 0 ? 1 + a / 0.25 : 1 - a / 0.12); } });
  const s = V.vmin * 0.105;
  g.fillStyle = `rgb(${lerp(30, 12, dusk)},${lerp(24, 10, dusk)},${lerp(22, 12, dusk)})`;
  g.beginPath(); g.ellipse(fx, fyb - s * 0.18, s * 0.45, s * 0.2, 0, 0, TAU); g.fill(); // folded legs
  g.beginPath(); g.moveTo(fx - s * 0.18, fyb - s * 0.2); g.quadraticCurveTo(fx - s * 0.05, fyb - s * 0.95, fx + s * 0.12, fyb - s * 0.9); g.lineTo(fx + s * 0.25, fyb - s * 0.2); g.fill(); // torso
  g.beginPath(); g.arc(fx + s * 0.02, fyb - s * 1.05, s * 0.15, 0, TAU); g.fill(); // head
  const ang = lerp(-0.1, -0.75, strike);
  g.save(); g.translate(fx - s * 0.02, fyb - s * 0.75); g.rotate(Math.PI + ang);
  g.fillRect(0, -s * 0.05, s * 0.5, s * 0.1); g.fillRect(s * 0.44, -s * 0.07, s * 0.18, s * 0.14); // arm + mallet
  g.restore();
  TINKS.forEach((k, i) => { if (k.kind === 'carve') sparkAt(ccx + cw * 0.38, cbase - ch * (0.45 + hash(i) * 0.35), t - k.t, 0.45); });
  // fireflies
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < (V.reduced ? 5 : 14); i++) {
    const px = V.W * ((hash(i * 4) + Math.sin(t * 0.21 + i) * 0.06) % 1), py = fy - V.vmin * 0.02 + Math.sin(t * 0.33 + i * 2) * V.vmin * 0.05 + hash(i) * V.vmin * 0.12;
    sprite(TEX.fly, px, py, 5, smooth(8, 16, lt) * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 3)) * 0.8);
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // the signature, typed out and left unfinished
  const sa = win(t, 36.8, 46.4, 0.4, 0.8);
  if (sa > 0) {
    const full = INSCRIPTION.signature;
    const n = Math.min(full.length, Math.floor((t - 37.0) / 0.12));
    const shown = full.slice(0, Math.max(0, n));
    const fs = Math.min(V.W * 0.085, V.vmin * 0.075);
    const y = V.H * (V.portrait ? 0.24 : 0.25);
    g.save(); g.shadowColor = 'rgba(255,200,120,0.9)'; g.shadowBlur = 18;
    text(shown, V.W / 2, y, fs, FONT_G, COL.goldHi, 'center', sa);
    g.restore();
    if (n >= full.length) {
      g.font = `400 ${fs}px ${FONT_G}`;
      const wFull = g.measureText(full).width;
      const blink = (Math.sin(t * 7) > 0 ? 1 : 0.2) * smooth(38.8, 39.2, t);
      text('…', V.W / 2 + wFull / 2 + fs * 0.35, y, fs, FONT_G, COL.goldHi, 'center', sa * blink);
      text('and there the name stops', V.W / 2, y + fs * 0.9, fs * 0.36, FONT_G, COL.cream, 'center', sa * 0.7 * smooth(39.4, 40.2, t), 400, 'italic');
    }
  }
  vignette(0.45);
}

/* ---- 3. The song, with its notation ---- */
function layoutSong() {
  if (layoutSong.cache) return layoutSong.cache;
  const g = V.g, W = V.W, H = V.H;
  const P = V.portrait;
  const lad = P ? { x0: W * 0.17, x1: W - Math.max(18, W * 0.06), y0: H * 0.1, y1: H * 0.34 }
    : { x0: W * 0.24, x1: W * 0.76, y0: H * 0.1, y1: H * 0.4 };
  // on a phone each line is set as its two bars, one above the other
  const lines = [0, 1, 2, 3].map((li) => SONG.map((s, i) => ({ s, i })).filter((q) => q.s.line === li));
  let fs = P ? Math.min(W * 0.1, 44) : Math.min(H * 0.07, 46);
  const gap = () => fs * 0.4;
  const measure = () => lines.map((ln) => {
    const rows = P ? [ln.filter((q) => q.s.e0 % 12 < 6), ln.filter((q) => q.s.e0 % 12 >= 6)] : [ln];
    const rl = rows.map((row) => {
      let x = 0;
      const items = row.map(({ s, i }) => {
        g.font = `400 ${fs}px ${FONT_G}`;
        const tw = g.measureText(s.g).width;
        g.font = `400 ${fs * 0.78}px ${FONT_G}`;
        const sw = s.s.reduce((a, sg) => a + (sg === '⅂' ? fs * 0.5 : g.measureText(sg).width), 0) + (s.s.length - 1) * fs * 0.16;
        const w = Math.max(tw, sw);
        const it = { i, s, x, w };
        x += w + gap();
        return it;
      });
      return { items, width: x - gap() };
    });
    return { rows: rl, width: Math.max(...rl.map((r) => r.width)) };
  });
  let m = measure();
  const maxW = P ? W - 40 : Math.min(W * 0.8, 900);
  const widest = Math.max(...m.map((l) => l.width));
  if (widest > maxW) { fs *= maxW / widest; m = measure(); }
  const textY = P ? H * 0.565 : H * 0.62;
  layoutSong.cache = { lad, lines: m, fs, textY, rowGap: fs * 2.9 };
  return layoutSong.cache;
}
function activeNote(pass, t) {
  for (let i = pass.length - 1; i >= 0; i--) if (t >= pass[i].t) return { n: pass[i], i, age: t - pass[i].t };
  return null;
}
function drawLadder(L, t, alpha, pass, lineIdx, run) {
  const g = V.g, { x0, x1, y0, y1 } = L.lad;
  const rungY = (r) => y1 - (r / 7) * (y1 - y0);
  const fsL = Math.min(V.vmin * 0.05, 26);
  g.font = `400 ${fsL}px ${FONT_G}`;
  const actN = pass && lineIdx >= 0 ? activeNote(pass, t) : null;
  const hotR = actN && t < actN.n.t + actN.n.dur ? rungOf(actN.n.sign) : -1;
  SIGN_ORDER.forEach((s, r) => {
    const y = rungY(r);
    const appear = run ? smooth(run[r] - 0.2, run[r] + 0.25, t) : 1;
    const hot = Math.max(run ? Math.max(0, 1 - Math.abs(t - run[r] - 0.1) / 0.5) : 0, r === hotR ? 0.75 : 0);
    g.globalAlpha = alpha * appear * (0.16 + hot * 0.5);
    g.strokeStyle = '#e8d3a8'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(lerp(x0, x1, appear), y); g.stroke();
    g.globalAlpha = 1;
    g.save(); if (hot > 0.05) { g.shadowColor = 'rgba(255,200,110,0.9)'; g.shadowBlur = 16 * hot; }
    g.globalAlpha = alpha * appear * (0.7 + hot * 0.3);
    g.font = `400 ${fsL}px ${FONT_G}`;
    drawSign(g, s, x0 - fsL * 0.9, y + fsL * 0.32, fsL, hot > 0.05 ? COL.goldHi : COL.gold);
    g.restore();
  });
  g.globalAlpha = 1;
  if (!pass || lineIdx < 0) return;
  // contour of the current line
  const xs = (e) => lerp(x0 + 6, x1 - 6, (e - lineIdx * 12) / 12);
  const notes = pass.filter((n) => n.line === lineIdx);
  const pts = [];
  notes.forEach((n) => {
    if (t < n.t) return;
    const prog = clamp((t - n.t) / n.dur);
    const d = SONG[n.syl].d[n.k];
    const xa = xs(n.e), xb = xs(n.e + d * prog), y = rungY(rungOf(n.sign));
    pts.push([xa, y], [xb, y]);
  });
  if (pts.length) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
    g.globalAlpha = alpha * 0.25; g.strokeStyle = COL.gold; g.lineWidth = 9; path(); g.stroke();
    g.globalAlpha = alpha * 0.95; g.strokeStyle = COL.goldHi; g.lineWidth = 2.2; path(); g.stroke();
    g.globalAlpha = 1;
    const head = pts[pts.length - 1];
    g.globalCompositeOperation = 'lighter';
    sprite(TEX.gold, head[0], head[1], 16, alpha * 0.9);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
}
function drawSongLine(L, li, t, alpha, yOff, pass, opts = {}) {
  if (alpha <= 0.003) return;
  const g = V.g, ln = L.lines[li], fs = L.fs, nr = ln.rows.length;
  const act = pass ? activeNote(pass, t) : null;
  ln.rows.forEach((row, r) => {
    const y = L.textY + yOff + (r - (nr - 1) / 2) * L.rowGap;
    const x0 = V.W / 2 - row.width / 2;
    row.items.forEach((it) => {
      const s = it.s, cx = x0 + it.x + it.w / 2;
      let state = 0; // 0 still to come, 1 sung, 2 sounding now
      let hotSign = -1;
      if (act) {
        const n = act.n;
        if (n.syl === it.i && t < n.t + n.dur + 0.05) { state = 2; hotSign = n.k; }
        else if (n.syl >= it.i) state = 1;
      }
      if (opts.allLit) state = 1;
      const base = state === 2 ? 1 : state === 1 ? 0.82 : 0.38;
      const sfs = fs * 0.78;
      g.font = `400 ${sfs}px ${FONT_G}`;
      const widths = s.s.map((sg) => (sg === '⅂' ? fs * 0.5 : g.measureText(sg).width));
      const total = widths.reduce((a, b) => a + b, 0) + (s.s.length - 1) * fs * 0.16;
      let sx = cx - total / 2;
      const sy = y - fs * 1.12;
      const signPos = [];
      s.s.forEach((sg, k) => {
        const px = sx + widths[k] / 2;
        signPos.push(px);
        const hot = state === 2 && k === hotSign;
        const pastInSyl = state === 2 && k < hotSign;
        if (hot) { g.globalCompositeOperation = 'lighter'; sprite(TEX.gold, px, sy - sfs * 0.33, sfs * 1.3, alpha * 0.55); g.globalCompositeOperation = 'source-over'; }
        g.save();
        g.globalAlpha = alpha * (hot ? 1 : pastInSyl ? 0.9 : base);
        const sc = hot ? 1 + 0.18 * Math.max(0, 1 - act.age / 0.3) : 1;
        g.translate(px, sy); g.scale(sc, sc);
        g.font = `400 ${sfs}px ${FONT_G}`;
        drawSign(g, sg, 0, 0, sfs, hot ? '#fff1cf' : COL.gold);
        g.restore();
        sx += widths[k] + fs * 0.16;
      });
      // duration strokes, stigmai, slurs
      g.globalAlpha = alpha * base * 0.9;
      g.strokeStyle = COL.gold; g.fillStyle = COL.gold; g.lineWidth = Math.max(1, fs * 0.05);
      const lx0 = cx - total / 2 - fs * 0.04, lx1 = cx + total / 2 + fs * 0.04, ly = sy - sfs * 0.82;
      if (s.mark) { g.beginPath(); g.moveTo(lx0, ly); g.lineTo(lx1, ly); if (s.mark === 'tri') g.lineTo(lx1, ly + sfs * 0.22); g.stroke(); }
      if (s.dot) { g.beginPath(); g.arc(cx, ly - fs * 0.16, Math.max(1.2, fs * 0.055), 0, TAU); g.fill(); }
      if (s.s.length > 1) { g.beginPath(); g.moveTo(signPos[0] - fs * 0.1, sy + fs * 0.1); g.quadraticCurveTo(cx, sy + fs * 0.34, signPos[signPos.length - 1] + fs * 0.1, sy + fs * 0.1); g.stroke(); }
      g.globalAlpha = 1;
      text(s.g, cx, y, fs, FONT_G, state === 2 ? '#fff6e4' : COL.cream, 'center', alpha * base);
      text(s.tr, cx, y + fs * 0.66, Math.max(10, fs * 0.42), FONT_G, '#d2c4aa', 'center', alpha * Math.max(base, 0.5) * 0.9, 400, 'italic');
      // the note lifts off toward its rung
      if (state === 2 && act.age < 0.7 && pass === PASS_A) {
        const k = act.age / 0.7;
        const ly2 = L.lad.y1 - (rungOf(act.n.sign) / 7) * (L.lad.y1 - L.lad.y0);
        const px = signPos[hotSign] ?? cx;
        const lx2 = lerp(L.lad.x0 + 6, L.lad.x1 - 6, (act.n.e - li * 12) / 12);
        g.globalCompositeOperation = 'lighter';
        sprite(TEX.gold, lerp(px, lx2, easeOut(k)), lerp(sy - fs * 0.3, ly2, easeOut(k)), 9 * (1 - k * 0.5), alpha * (1 - k) * 0.9);
        g.globalCompositeOperation = 'source-over';
      }
    });
  });
}
function songBackdrop(t) {
  plate('song', () => {
    const g = V.g;
    fillBg(['#080b14', '#0e1322', '#0b0f1a']);
    g.globalAlpha = 0.05; g.drawImage(TEX.marble, 0, 0, V.W, V.H); g.globalAlpha = 1;
    radial(V.W / 2, V.H * 0.42, V.vmin * 0.8, 'rgba(233,182,96,0.08)');
  });
}
function drawSong(t) {
  const g = V.g;
  songBackdrop(t);
  const L = layoutSong();
  const a = smooth(46.2, 48, t);
  const run = SIGN_ORDER.map((_, i) => TL.scaleRun + i * TL.scaleStep);
  // which line is up
  let li = -1;
  for (let i = 0; i < 4; i++) if (t >= LINES_A[i] - 0.45) li = i;
  const lineA = t < LINES_A[0] - 0.45 ? smooth(52.2, 52.9, t) : 1;
  drawLadder(L, t, a, PASS_A, t >= LINES_A[0] ? li : -1, run);
  if (li < 0) { drawSongLine(L, 0, t, lineA * 0.85, 0, null); }
  else {
    const start = LINES_A[li];
    const k = smooth(start - 0.45, start, t);
    if (li > 0) drawSongLine(L, li - 1, t, (1 - k), -k * L.fs * 1.4, PASS_A, { allLit: true });
    drawSongLine(L, li, t, k, (1 - k) * L.fs * 1.4, PASS_A);
  }
  vignette(0.5);
}

/* ---- 3b. Pitch accents ---- */
function drawAccent(t) {
  const g = V.g;
  songBackdrop(t);
  const P = V.portrait;
  ACCENT_WORDS.forEach((w, wi) => {
    const a = win(t, w.show[0], w.show[1], 0.6, 0.6);
    if (a <= 0.003) return;
    const fs = Math.min(V.W * (P ? 0.17 : 0.1), V.H * 0.11, 120);
    const y = V.H * (P ? 0.55 : 0.6);
    g.font = `400 ${fs}px ${FONT_G}`;
    const dot = ' · ';
    const w0 = g.measureText(w.word[0]).width, wd = g.measureText(dot).width, w1 = g.measureText(w.word[1]).width;
    const total = w0 + wd + w1;
    const xs = [V.W / 2 - total / 2 + w0 / 2, V.W / 2 + total / 2 - w1 / 2];
    const widths = [w0, w1];
    text(w.word[0] + dot + w.word[1], V.W / 2, y, fs, FONT_G, COL.cream, 'center', a);
    text(w.tr, V.W / 2, y + fs * 0.6, Math.max(14, fs * 0.32), FONT_G, '#d6c8ad', 'center', a * 0.95, 400, 'italic');
    text(w.gloss.toUpperCase(), V.W / 2, y + fs * 0.98, Math.max(11, fs * 0.19), FONT_M, COL.gold, 'center', a * 0.85);
    // accent arrow over the accented syllable
    const ax = xs[w.accent], aw = widths[w.accent];
    const ay = y - fs * 1.02;
    const appear = smooth(w.show[0] + 0.8, w.show[0] + 1.6, t);
    g.save();
    g.globalAlpha = a * appear;
    g.strokeStyle = w.kind === 'rebel' ? 'rgba(239,230,214,0.55)' : COL.gold;
    g.lineWidth = Math.max(1.5, fs * 0.03);
    g.lineCap = 'round';
    if (w.kind === 'rebel') g.setLineDash([fs * 0.06, fs * 0.08]);
    g.beginPath();
    if (w.kind === 'risefall') {
      g.moveTo(ax - aw * 0.45, ay + fs * 0.08); g.quadraticCurveTo(ax, ay - fs * 0.38, ax + aw * 0.45, ay + fs * 0.08);
    } else {
      g.moveTo(ax - aw * 0.4, ay + fs * 0.06); g.lineTo(ax + aw * 0.4, ay - fs * 0.24);
      g.moveTo(ax + aw * 0.4, ay - fs * 0.24); g.lineTo(ax + aw * 0.4 - fs * 0.13, ay - fs * 0.22);
      g.moveTo(ax + aw * 0.4, ay - fs * 0.24); g.lineTo(ax + aw * 0.33, ay - fs * 0.12);
    }
    g.stroke();
    g.restore();
    // the tune for this word, on a short ladder
    const ly0 = V.H * (P ? 0.17 : 0.13), ly1 = V.H * (P ? 0.33 : 0.33);
    const rungY = (r) => ly1 - (r / 7) * (ly1 - ly0);
    g.globalAlpha = a * 0.13; g.strokeStyle = '#e8d3a8'; g.lineWidth = 1;
    for (let r = 0; r < 8; r++) { g.beginPath(); g.moveTo(V.W / 2 - total * 0.7, rungY(r)); g.lineTo(V.W / 2 + total * 0.7, rungY(r)); g.stroke(); }
    g.globalAlpha = 1;
    const pts = [];
    w.notes.forEach((n) => {
      const slot = w.syl.indexOf(n.syl);
      const nk = SONG[n.syl].s.length;
      const px = xs[slot] + (nk > 1 ? (n.k / (nk - 1) - 0.5) * widths[slot] * 0.7 : 0);
      const py = rungY(rungOf(n.sign));
      if (t >= n.t) pts.push({ x: px, y: py, age: t - n.t, sign: n.sign });
    });
    if (pts.length > 1) {
      g.globalAlpha = a * 0.7; g.strokeStyle = COL.gold; g.lineWidth = 2;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); g.globalAlpha = 1;
    }
    pts.forEach((p) => {
      g.globalCompositeOperation = 'lighter';
      sprite(TEX.gold, p.x, p.y, 14 + Math.max(0, 1 - p.age / 0.4) * 12, a);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.font = `400 ${fs * 0.24}px ${FONT_G}`;
      g.globalAlpha = a;
      drawSign(g, p.sign, p.x, p.y - fs * 0.16, fs * 0.24, COL.goldHi);
      g.globalAlpha = 1;
    });
  });
  vignette(0.5);
}

/* ---- 4. Seventeen centuries ---- */
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function drawTime(t) {
  const g = V.g, lt = t - 107;
  const cycles = (V.reduced ? 1.5 : 5) * easeInOut(lt / 14.5);
  const day = 0.5 - 0.5 * Math.cos(TAU * cycles);
  const hor = V.H * 0.66;
  const top = [lerp(10, 66, day), lerp(14, 92, day), lerp(30, 118, day)];
  const low = [lerp(26, 200, day), lerp(30, 176, day), lerp(52, 150, day)];
  g.fillStyle = vgrad([[0, `rgb(${top})`], [1, `rgb(${low})`]], 0, hor); g.fillRect(0, 0, V.W, hor + 1);
  g.globalCompositeOperation = 'lighter';
  TEX.stars.forEach((s) => { if (s.y < 0.7) sprite(TEX.white, s.x * V.W, s.y * hor, s.r * 1.4, (1 - day) * 0.5); });
  g.globalCompositeOperation = 'source-over';
  // sun and moon on their arcs
  const ang = TAU * cycles;
  const arc = (phase, r) => ({ x: V.W / 2 + Math.cos(ang + phase) * V.W * 0.55, y: hor - Math.sin(ang + phase) * V.H * 0.48 });
  const sun = arc(Math.PI, 1), moon = arc(0, 1);
  if (sun.y < hor) { radial(sun.x, sun.y, V.vmin * 0.2, 'rgba(255,220,150,0.35)'); g.fillStyle = '#ffe2a8'; g.beginPath(); g.arc(sun.x, sun.y, V.vmin * 0.035, 0, TAU); g.fill(); }
  if (moon.y < hor) { g.fillStyle = 'rgba(230,232,240,0.9)'; g.beginPath(); g.arc(moon.x, moon.y, V.vmin * 0.025, 0, TAU); g.fill(); }
  hills(14, hor - V.vmin * 0.02, V.vmin * 0.08, `rgb(${lerp(28, 104, day)},${lerp(30, 100, day)},${lerp(44, 106, day)})`, 1.5);
  g.fillStyle = `rgb(${lerp(20, 86, day)},${lerp(20, 78, day)},${lerp(22, 58, day)})`; g.fillRect(0, hor, V.W, V.H - hor);
  // the column, leaning a little more each century
  const ch = V.vmin * (V.portrait ? 0.4 : 0.46), cw = ch / 2.98;
  const cx = V.W * 0.5, base = hor + V.vmin * 0.07;
  const tilt = easeInOut(lt / 15) * 0.05;
  g.save(); g.translate(cx, base); g.rotate(tilt); g.translate(-cx, -base);
  drawColumn({ cx, base, w: cw, h: ch, rot: 0.35, light: lerp(0.45, 1, day), warm: 0.1 + day * 0.1 });
  g.restore();
  // grass and weeds creeping up
  const grow = easeInOut(lt / 14);
  g.strokeStyle = `rgb(${lerp(30, 96, day)},${lerp(40, 112, day)},${lerp(26, 60, day)})`;
  g.lineWidth = 1.4;
  for (let i = 0; i < 70; i++) {
    const gx = cx + (hash(i) - 0.5) * cw * 4, gh = (V.vmin * 0.02 + hash(i * 3) * V.vmin * 0.06) * grow * (1.2 - Math.abs(gx - cx) / (cw * 2.5));
    if (gh <= 0) continue;
    const sw = Math.sin(t * 1.3 + i) * gh * 0.15;
    g.beginPath(); g.moveTo(gx, base + ry0(cw)); g.quadraticCurveTo(gx + sw * 0.5, base - gh * 0.5, gx + sw, base - gh); g.stroke();
  }
  // century counter
  const c = Math.min(19, Math.floor(lerp(2, 20, easeInOut(clamp((lt - 1.2) / 12.2)))));
  const fs = Math.min(V.W * 0.11, V.H * 0.075);
  const ca = win(t, 108, 121.8, 0.6, 0.8);
  text(`${ordinal(c)} century`, V.W / 2, V.H * 0.17, fs, FONT_M, day > 0.5 ? '#1c2030' : COL.cream, 'center', ca);
  text('AD', V.W / 2, V.H * 0.17 - fs * 1.05, fs * 0.32, FONT_M, day > 0.5 ? '#1c2030' : COL.gold, 'center', ca * 0.8);
  vignette(0.45);
}
const ry0 = (cw) => (cw / 2) * 0.17;

/* ---- 5a. The railway, 1883 ---- */
function trainX(t) { return lerp(-0.5, 1.5, clamp((t - 122.6) / 10.2)); }
function drawTrain(t) {
  const g = V.g, lt = t - 122;
  const hor = V.H * 0.55;
  fillBg(['#d9c7a6', '#e7cfa5', '#efd8b2']);
  radial(V.W * 0.8, V.H * 0.18, V.vmin * 0.5, 'rgba(255,240,210,0.5)');
  hills(21, hor, V.vmin * 0.1, '#b7a07b', 1.4);
  for (let i = 0; i < 6; i++) cypress(V.W * (0.1 + i * 0.17), hor + V.vmin * 0.02, V.vmin * (0.08 + hash(i * 9) * 0.05), '#6b6a4a');
  hills(22, hor + V.vmin * 0.08, V.vmin * 0.07, '#a08460', 2.0);
  const ty = hor + V.vmin * 0.2;
  g.fillStyle = '#8a7356'; g.fillRect(0, ty, V.W, V.H - ty);
  g.fillStyle = '#7b6549'; g.beginPath(); g.moveTo(0, ty); g.lineTo(V.W, ty); g.lineTo(V.W, ty + V.vmin * 0.035); g.lineTo(0, ty + V.vmin * 0.035); g.fill();
  // sleepers and rails
  g.fillStyle = '#4e3c2c';
  for (let x = -20; x < V.W + 20; x += V.vmin * 0.035) g.fillRect(x, ty - V.vmin * 0.004, V.vmin * 0.012, V.vmin * 0.016);
  g.fillStyle = '#3a332e'; g.fillRect(0, ty - V.vmin * 0.006, V.W, 2); g.fillRect(0, ty + V.vmin * 0.008, V.W, 2);
  // the column, half-turned out of the ground by the works
  const ch = V.vmin * 0.22, cw = ch / 2.98, ccx = V.W * (V.portrait ? 0.7 : 0.66), cbase = ty + V.vmin * 0.17;
  g.save(); g.translate(ccx, cbase); g.rotate(-0.22); g.translate(-ccx, -cbase);
  drawColumn({ cx: ccx, base: cbase, w: cw, h: ch, rot: 0.6, light: 0.95, warm: 0.2 });
  g.restore();
  g.fillStyle = '#6e5940'; g.beginPath(); g.ellipse(ccx + cw * 0.3, cbase + V.vmin * 0.01, cw * 1.6, V.vmin * 0.02, 0, 0, TAU); g.fill();
  // Purser, hat in hand
  const pa = smooth(129.3, 130.2, t);
  if (pa > 0) {
    const px = ccx - cw * 1.8, pb = cbase + V.vmin * 0.012, s = V.vmin * 0.11;
    g.globalAlpha = pa; g.fillStyle = '#2a2420';
    g.fillRect(px - s * 0.06, pb - s * 0.5, s * 0.05, s * 0.5); g.fillRect(px + s * 0.02, pb - s * 0.5, s * 0.05, s * 0.5);
    g.beginPath(); g.moveTo(px - s * 0.13, pb - s * 0.48); g.lineTo(px - s * 0.1, pb - s * 0.95); g.lineTo(px + s * 0.12, pb - s * 0.95); g.lineTo(px + s * 0.15, pb - s * 0.48); g.fill();
    g.beginPath(); g.arc(px + s * 0.01, pb - s * 1.06, s * 0.1, 0, TAU); g.fill();
    const lift = smooth(130.4, 131.0, t) * (1 - smooth(132.4, 133.0, t));
    g.fillRect(px - s * 0.12, pb - s * (1.16 + lift * 0.12), s * 0.26, s * 0.03); g.fillRect(px - s * 0.07, pb - s * (1.3 + lift * 0.12), s * 0.16, s * 0.15);
    g.globalAlpha = 1;
  }
  // locomotive
  const x = trainX(t) * V.W, s = V.vmin * 0.16, by = ty - V.vmin * 0.01;
  // smoke puffs (stateless: each puff remembers where the chimney was)
  for (let k = 0; k < 40; k++) {
    const tb = 122.6 + k * 0.36;
    const age = t - tb;
    if (age < 0 || age > 4) continue;
    const cxp = trainX(tb) * V.W + s * 0.78;
    const r = s * (0.12 + age * 0.22);
    g.globalAlpha = 0.5 * (1 - age / 4);
    g.drawImage(TEX.smoke, cxp - age * s * 0.25 - r, by - s * 0.75 - age * s * 0.32 - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  g.save(); g.translate(x, by);
  g.fillStyle = '#231e1b';
  g.fillRect(-s * 1.9, -s * 0.42, s * 0.95, s * 0.3); // tender
  g.fillRect(-s * 0.85, -s * 0.62, s * 0.42, s * 0.52); // cab
  g.fillRect(-s * 0.9, -s * 0.66, s * 0.52, s * 0.06);
  g.beginPath(); g.roundRect(-s * 0.45, -s * 0.48, s * 1.35, s * 0.34, s * 0.1); g.fill(); // boiler
  g.beginPath(); g.moveTo(s * 0.7, -s * 0.48); g.lineTo(s * 0.66, -s * 0.78); g.lineTo(s * 0.9, -s * 0.78); g.lineTo(s * 0.86, -s * 0.48); g.fill(); // chimney
  g.beginPath(); g.moveTo(s * 0.88, -s * 0.16); g.lineTo(s * 1.08, -s * 0.02); g.lineTo(s * 0.88, -s * 0.02); g.fill(); // cowcatcher
  g.fillStyle = '#8c2f22'; g.fillRect(-s * 0.45, -s * 0.2, s * 1.35, s * 0.03);
  const wr = s * 0.13;
  [-1.6, -1.15, -0.6, -0.05, 0.5].forEach((wx, i) => {
    const r = i > 1 && i < 4 ? wr * 1.35 : wr;
    g.fillStyle = '#1a1614'; g.beginPath(); g.arc(wx * s, -r, r, 0, TAU); g.fill();
    g.strokeStyle = '#5a4b40'; g.lineWidth = 1.2;
    const a = (x / r) % TAU;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(wx * s, -r); g.lineTo(wx * s + Math.cos(a + k * Math.PI / 4) * r * 0.85, -r + Math.sin(a + k * Math.PI / 4) * r * 0.85); g.stroke(); }
  });
  g.restore();
  // year card
  const ya = win(t, 122.2, 128.5, 0.8, 1.2);
  text('1883', V.W / 2, V.H * 0.22, Math.min(V.W * 0.24, V.H * 0.14), FONT_M, '#3a2b20', 'center', ya * 0.9);
  vignette(0.35);
}

/* ---- 5b. A garden, a flowerpot, a saw ---- */
function gardenLayout() {
  const P = V.portrait;
  const ground = V.H * (P ? 0.66 : 0.72);
  const h = Math.min(V.H * (P ? 0.36 : 0.42), V.W * 0.9);
  return { ground, h, w: h / 2.98, cx: V.W / 2 };
}
function drawPot(x, y, s, sq) {
  const g = V.g;
  g.save(); g.translate(x, y); g.scale(1 + (1 - sq) * 0.5, sq);
  // leaves and flowers
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (hash(i * 7) - 0.5) * 2.2, d = s * (0.35 + hash(i) * 0.4);
    g.fillStyle = i % 2 ? '#4f6f3a' : '#5f8044';
    g.beginPath(); g.ellipse(Math.cos(a) * d, -s * 0.75 + Math.sin(a) * d * 0.6, s * 0.2, s * 0.13, a, 0, TAU); g.fill();
  }
  for (let i = 0; i < 4; i++) {
    const fx = (hash(i * 13) - 0.5) * s * 0.9, fy = -s * (1.05 + hash(i * 5) * 0.35);
    g.strokeStyle = '#4f6f3a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(fx * 0.5, -s * 0.75); g.lineTo(fx, fy); g.stroke();
    for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#d8423a' : '#c9302c'; g.beginPath(); g.arc(fx + Math.cos(k) * s * 0.07, fy + Math.sin(k) * s * 0.07, s * 0.06, 0, TAU); g.fill(); }
  }
  // the pot
  g.fillStyle = '#b55a36';
  g.beginPath(); g.moveTo(-s * 0.36, -s * 0.72); g.lineTo(s * 0.36, -s * 0.72); g.lineTo(s * 0.27, 0); g.lineTo(-s * 0.27, 0); g.fill();
  g.fillStyle = '#c96a43'; g.fillRect(-s * 0.42, -s * 0.82, s * 0.84, s * 0.14);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.moveTo(s * 0.1, -s * 0.72); g.lineTo(s * 0.36, -s * 0.72); g.lineTo(s * 0.27, 0); g.lineTo(s * 0.06, 0); g.fill();
  g.restore();
}
function drawGarden(t) {
  const g = V.g;
  const L = gardenLayout();
  fillBg(['#a9c2c0', '#c7d3c4', '#d9dcc6']);
  // wall
  const wallTop = L.ground - V.vmin * 0.42;
  g.fillStyle = '#e6dccb'; g.fillRect(0, wallTop, V.W, L.ground - wallTop);
  g.fillStyle = '#b8653f'; g.fillRect(0, wallTop - V.vmin * 0.02, V.W, V.vmin * 0.025);
  g.fillStyle = 'rgba(120,100,80,0.08)';
  for (let i = 0; i < 40; i++) g.fillRect(hash(i) * V.W, wallTop + hash(i * 3) * (L.ground - wallTop), V.vmin * 0.05, V.vmin * 0.012);
  cypress(V.W * 0.12, wallTop + V.vmin * 0.04, V.vmin * 0.5, '#3f5236');
  cypress(V.W * 0.9, wallTop + V.vmin * 0.05, V.vmin * 0.42, '#435838');
  g.fillStyle = '#6c7d4c'; g.fillRect(0, L.ground, V.W, V.H - L.ground);
  g.fillStyle = '#5d6e42'; g.fillRect(0, L.ground, V.W, V.vmin * 0.012);
  // the slab that will go: the bottom of the column, carrying the lost line
  const sawEnd = 145.55;
  const slabH = L.h * 0.09;
  const drop = smooth(sawEnd, sawEnd + 0.22, t) * slabH; // column settles once the slab is out
  const colBase = L.ground - slabH + drop;
  const R = L.w / 2, ry = R * 0.17;
  // slab
  const fall = clamp((t - sawEnd) / 1.1);
  if (fall < 1 || t < sawEnd) {
    g.save();
    let sx = L.cx, sy = L.ground;
    if (t >= sawEnd) {
      const k = easeOut(fall);
      sx += k * R * 2.6; sy += k * slabH * 0.4;
      g.translate(sx, sy); g.rotate(k * 1.25); g.translate(-sx, -sy);
      g.globalAlpha = 1 - smooth(0.75, 1, fall);
    }
    const st = sy - slabH;
    const sgrad = g.createLinearGradient(sx - R, 0, sx + R, 0);
    sgrad.addColorStop(0, '#6f675c'); sgrad.addColorStop(0.35, '#d9d0bf'); sgrad.addColorStop(0.7, '#b3a998'); sgrad.addColorStop(1, '#5a534a');
    g.fillStyle = sgrad;
    g.beginPath(); g.moveTo(sx - R, st);
    for (let i = 0; i <= 12; i++) { const th = -Math.PI / 2 + Math.PI * i / 12; g.lineTo(sx + R * Math.sin(th), st + ry * Math.cos(th)); }
    // ragged, uneven bottom
    for (let i = 12; i >= 0; i--) { const th = -Math.PI / 2 + Math.PI * i / 12; g.lineTo(sx + R * Math.sin(th), sy + ry * Math.cos(th) + (hash(i * 3.3) - 0.3) * slabH * 0.35); }
    g.closePath(); g.fill();
    g.font = `400 ${slabH * 0.52}px ${FONT_G}`;
    g.fillStyle = 'rgba(96,82,70,0.9)'; g.textAlign = 'center';
    g.fillText('· · ' + INSCRIPTION.lost + ' · ·', sx, st + slabH * 0.72);
    g.restore();
  }
  // broken pieces on the grass
  if (t > sawEnd + 0.9 && t < 149.5) {
    const k = clamp((t - sawEnd - 0.9) / 1.4), a = 1 - smooth(148.4, 149.4, t);
    g.globalAlpha = a; g.fillStyle = '#c9bfad';
    [[1.0, 0.3], [1.6, -0.2], [2.3, 0.5]].forEach(([d, rot], i) => {
      g.save(); g.translate(L.cx + R * (2.4 + d * k * 0.8), L.ground + V.vmin * 0.01); g.rotate(rot + k * (i - 1) * 0.6);
      g.beginPath(); g.moveTo(-R * 0.3, 0); g.lineTo(-R * 0.1, -slabH * 0.6); g.lineTo(R * 0.35, -slabH * 0.4); g.lineTo(R * 0.3, 0); g.fill(); g.restore();
    });
    g.globalAlpha = 1;
  }
  // the column itself
  const o = { cx: L.cx, base: colBase, w: L.w, h: L.h, rot: 0.15, light: 1, warm: 0.12 };
  drawColumn(o);
  const top = colBase - L.h;
  // the flowerpot arrives from above
  const potT = 136.25;
  if (t > potT - 0.65) {
    const fallK = clamp((t - (potT - 0.65)) / 0.65);
    const py = lerp(-V.H * 0.2, top, fallK * fallK);
    const bounce = t > potT ? Math.exp(-(t - potT) * 7) * Math.sin((t - potT) * 22) : 0;
    const sq = t > potT ? 1 - 0.16 * Math.exp(-(t - potT) * 9) : 1;
    drawPot(L.cx, py - Math.abs(bounce) * V.vmin * 0.012, L.w * 0.95, sq);
  }
  // the saw
  if (t > 139.4 && t < sawEnd + 0.2) {
    const a = smooth(139.4, 139.9, t) * (1 - smooth(sawEnd, sawEnd + 0.2, t));
    const ph = (t - 140.0) / 0.54;
    const off = Math.sin(ph * Math.PI) * R * 0.75;
    const yy = L.ground - slabH;
    g.save(); g.globalAlpha = a; g.translate(L.cx + off, yy);
    g.fillStyle = '#9aa1a6'; g.fillRect(-R * 2.1, -V.vmin * 0.008, R * 4.2, V.vmin * 0.016);
    g.fillStyle = '#7d8489';
    for (let k = -R * 2.1; k < R * 2.1; k += V.vmin * 0.012) { g.beginPath(); g.moveTo(k, V.vmin * 0.008); g.lineTo(k + V.vmin * 0.006, V.vmin * 0.016); g.lineTo(k + V.vmin * 0.012, V.vmin * 0.008); g.fill(); }
    g.fillStyle = '#7a4e2c'; g.beginPath(); g.roundRect(R * 2.0, -V.vmin * 0.03, R * 0.6, V.vmin * 0.06, V.vmin * 0.01); g.fill();
    g.restore();
    // marble dust
    for (let i = 0; i < (V.reduced ? 10 : 30); i++) {
      const tb = 140 + i * 0.18, age = t - tb;
      if (age < 0 || age > 1.4) continue;
      const dx = L.cx + (hash(i) - 0.5) * R * 2.2 + (hash(i * 3) - 0.5) * age * R * 2;
      const dy = yy + age * age * V.vmin * 0.08;
      sprite(TEX.dust, dx, dy, 2.4, 0.9 * (1 - age / 1.4));
    }
    g.globalAlpha = 1;
  }
  vignette(0.3);
  // the lost word, then the rubbing that saved it
  const fa = win(t, 149.1, 154.2, 0.5, 0.7);
  if (fa > 0) {
    g.fillStyle = `rgba(10,12,18,${0.55 * fa})`; g.fillRect(0, 0, V.W, V.H);
    const fs = Math.min(V.W * 0.24, V.H * 0.14);
    const cy = V.H * 0.4;
    g.save(); g.globalAlpha = fa;
    g.fillStyle = '#d6cdbb';
    g.beginPath(); g.moveTo(V.W / 2 - fs * 1.6, cy - fs * 0.9); g.lineTo(V.W / 2 + fs * 1.4, cy - fs * 1.1); g.lineTo(V.W / 2 + fs * 1.7, cy + fs * 0.5); g.lineTo(V.W / 2 - fs * 0.3, cy + fs * 0.75); g.lineTo(V.W / 2 - fs * 1.75, cy + fs * 0.35); g.closePath(); g.fill();
    g.restore();
    g.save(); g.shadowColor = 'rgba(255,200,110,0.9)'; g.shadowBlur = 26 * smooth(149.6, 150.6, t);
    text(INSCRIPTION.lost, V.W / 2, cy + fs * 0.25, fs, FONT_G, smooth(149.6, 150.6, t) > 0.5 ? '#9a7a3c' : '#6e6052', 'center', fa);
    g.restore();
    text('zēi · is alive', V.W / 2, cy + fs * 1.15, fs * 0.2, FONT_G, COL.cream, 'center', fa * smooth(150.2, 151, t), 400, 'italic');
  }
  const ra = win(t, 153.8, 159.2, 0.7, 0.8);
  if (ra > 0) {
    g.fillStyle = `rgba(10,12,18,${0.5 * ra})`; g.fillRect(0, 0, V.W, V.H);
    const pw = Math.min(V.W * 0.86, V.H * 0.9 * (900 / 420) * 0.5), ph = pw * (420 / 900);
    const slide = (1 - easeOut((t - 153.8) / 0.9)) * V.H * 0.15;
    g.save(); g.globalAlpha = ra; g.translate(V.W / 2, V.H * 0.4 + slide); g.rotate(-0.045);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-pw / 2 + 6, -ph / 2 + 8, pw, ph);
    g.drawImage(TEX.rubbing, -pw / 2, -ph / 2, pw, ph);
    g.restore();
  }
}

/* ---- 6a. Smyrna, 1922 ---- */
function drawFire(t) {
  const g = V.g, lt = t - 158.5;
  const fl = 0.8 + 0.2 * N2(t * 2.3, 5.1);
  const hor = V.H * (V.portrait ? 0.6 : 0.64);
  fillBg(['#120807', '#2a110b', [0.6, '#5a2312'], [1, '#2a120c']]);
  radial(V.W * 0.5, hor, V.vmin * 1.1, `rgba(232,116,50,${0.5 * fl})`);
  radial(V.W * 0.3, hor - V.vmin * 0.05, V.vmin * 0.5, `rgba(255,150,70,${0.22 * fl})`);
  // smoke
  for (let p = 0; p < 5; p++) {
    const px = V.W * (0.12 + p * 0.19 + hash(p) * 0.05);
    for (let k = 0; k < (V.reduced ? 4 : 8); k++) {
      const tb = 150 + k * 2.2 + hash(p * 7) * 2.2;
      const age = ((t - tb) % 17.6 + 17.6) % 17.6;
      const r = V.vmin * (0.05 + age * 0.016);
      const x = px + age * V.vmin * 0.02 + Math.sin(age * 0.7 + p) * V.vmin * 0.02;
      const y = hor - V.vmin * 0.05 - age * V.vmin * 0.05;
      g.globalAlpha = 0.6 * smooth(0, 2, age) * (1 - age / 17.6);
      g.drawImage(TEX.smoke, x - r, y - r, r * 2, r * 2);
    }
  }
  g.globalAlpha = 1;
  // skyline
  g.fillStyle = '#0c0605';
  g.beginPath(); g.moveTo(0, hor + 2);
  TEX.skyline.forEach((b) => {
    const x0 = b.x * V.W, x1 = (b.x + b.w) * V.W, h = b.h * V.H;
    g.lineTo(x0, hor - h);
    if (b.kind === 'dome') { g.arc((x0 + x1) / 2, hor - h, (x1 - x0) / 2, Math.PI, 0); }
    else if (b.kind === 'tower') { g.lineTo((x0 + x1) / 2, hor - h - V.vmin * 0.08); }
    g.lineTo(x1, hor - h);
  });
  g.lineTo(V.W, hor + 2); g.closePath(); g.fill();
  TEX.skyline.forEach((b) => { if (b.mast) { g.fillRect(b.x * V.W, hor - V.vmin * 0.16, 1.5, V.vmin * 0.16); } });
  // water and reflections
  g.fillStyle = '#140907'; g.fillRect(0, hor, V.W, V.H - hor);
  const band = g.createLinearGradient(0, hor, 0, hor + V.vmin * 0.22);
  band.addColorStop(0, `rgba(214,96,40,${0.55 * fl})`); band.addColorStop(0.35, `rgba(150,60,26,${0.32 * fl})`); band.addColorStop(1, 'rgba(20,9,7,0)');
  g.fillStyle = band; g.fillRect(0, hor, V.W, V.vmin * 0.22);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const y = hor + V.vmin * 0.01 + hash(i) * (V.H - hor) * 0.5;
    const w = V.vmin * (0.05 + hash(i * 3) * 0.2), x = hash(i * 5) * V.W + Math.sin(t * 0.8 + i) * 8;
    g.fillStyle = `rgba(230,120,50,${0.08 * fl * (1 - (y - hor) / (V.H - hor))})`;
    g.fillRect(x, y, w, 1.5);
  }
  // embers
  for (let i = 0; i < (V.reduced ? 15 : 45); i++) {
    const tb = 150 + hash(i) * 20, age = ((t - tb) % 7 + 7) % 7;
    const x = hash(i * 9) * V.W + Math.sin(age * 2 + i) * V.vmin * 0.03 + age * V.vmin * 0.02;
    const y = hor - age * V.vmin * 0.09;
    sprite(TEX.ember, x, y, 3 + hash(i * 2) * 3, (1 - age / 7) * (0.5 + 0.5 * Math.sin(t * 9 + i)));
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // a handcart carried out along the quay
  const ca = smooth(165.0, 165.8, t);
  if (ca > 0) {
    const cx = lerp(-0.15, 1.15, clamp((t - 164.6) / 6.0)) * V.W, cy = hor + V.vmin * 0.15, s = V.vmin * 0.13;
    g.globalAlpha = ca; g.fillStyle = '#0a0504';
    g.beginPath(); g.arc(cx, cy - s * 0.14, s * 0.14, 0, TAU); g.fill();
    g.fillRect(cx - s * 0.5, cy - s * 0.36, s * 0.75, s * 0.12);
    g.fillRect(cx - s * 0.38, cy - s * 0.8, s * 0.18, s * 0.44); // the stone, upright
    g.beginPath(); g.ellipse(cx - s * 0.29, cy - s * 0.8, s * 0.09, s * 0.025, 0, 0, TAU); g.fill();
    const wx = cx - s * 0.95, wb = cy;
    g.fillRect(wx - s * 0.05, wb - s * 0.55, s * 0.06, s * 0.55); g.fillRect(wx + s * 0.05, wb - s * 0.55, s * 0.06, s * 0.55);
    g.beginPath(); g.moveTo(wx - s * 0.12, wb - s * 0.52); g.lineTo(wx - s * 0.05, wb - s * 1.0); g.lineTo(wx + s * 0.15, wb - s * 0.98); g.lineTo(wx + s * 0.2, wb - s * 0.52); g.fill();
    g.beginPath(); g.arc(wx + s * 0.06, wb - s * 1.1, s * 0.1, 0, TAU); g.fill();
    g.save(); g.lineWidth = s * 0.05; g.strokeStyle = '#0a0504'; g.beginPath(); g.moveTo(wx + s * 0.15, wb - s * 0.78); g.lineTo(cx - s * 0.5, cy - s * 0.32); g.stroke(); g.restore();
    g.globalAlpha = 1;
  }
  vignette(0.55);
}

/* ---- 6b. The long way round: a map ---- */
function mapProj() {
  const pad = 30;
  const lonMin = -2, lonMax = 34, latMin = 34, latMax = 63;
  const k = Math.cos((48 * Math.PI) / 180);
  const spanX = (lonMax - lonMin) * k, spanY = latMax - latMin;
  const top = V.H * (V.portrait ? 0.1 : 0.08), bottom = V.H * (V.portrait ? 0.74 : 0.8);
  const availW = V.W - pad * 2, availH = bottom - top;
  const sc = Math.min(availW / spanX, availH / spanY);
  const ox = V.W / 2 - (spanX * sc) / 2, oy = top + (availH - spanY * sc) / 2;
  return { f: (lat, lon) => ({ x: ox + (lon - lonMin) * k * sc, y: oy + (latMax - lat) * sc }), sc, lonMin, lonMax, latMin, latMax };
}
function drawMap(t) {
  const g = V.g;
  fillBg(['#0a0f1a', '#0d1422', '#0a0f1a']);
  const M = mapProj();
  const ga = smooth(169.6, 171, t);
  g.strokeStyle = 'rgba(160,180,210,0.1)'; g.lineWidth = 1;
  g.globalAlpha = ga;
  for (let lat = 35; lat <= 60; lat += 5) { const a = M.f(lat, M.lonMin), b = M.f(lat, M.lonMax); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); text(`${lat}°N`, a.x + 2, a.y - 3, 10, FONT_G, '#8090a8', 'left', ga * 0.6); }
  for (let lon = 0; lon <= 30; lon += 5) { const a = M.f(M.latMin, lon), b = M.f(M.latMax, lon); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  g.globalAlpha = 1;
  const fsL = Math.max(12, Math.min(V.vmin * 0.038, 18));
  const city = (key, a, label, sub, side = 1) => {
    if (a <= 0.003) return;
    const p = PLACES[key], q = M.f(p.lat, p.lon);
    g.globalCompositeOperation = 'lighter'; sprite(TEX.gold, q.x, q.y, 10, a * 0.9); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = COL.goldHi; g.globalAlpha = a; g.beginPath(); g.arc(q.x, q.y, 2.6, 0, TAU); g.fill(); g.globalAlpha = 1;
    text(label, q.x + side * 10, q.y + 4, fsL, FONT_G, COL.cream, side > 0 ? 'left' : 'right', a);
    if (sub) text(sub, q.x + side * 10, q.y + 4 + fsL * 1.05, fsL * 0.72, FONT_G, '#b9ad96', side > 0 ? 'left' : 'right', a * 0.85, 400, 'italic');
  };
  city('tralles', ga * 0.55, 'Tralles', '', 1);
  city('smyrna', smooth(170.1, 170.6, t), 'Smyrna', '1922', -1);
  // route
  const arrived = {};
  ROUTE.forEach((r) => {
    const a = PLACES[r.from], b = PLACES[r.to];
    const pa = M.f(a.lat, a.lon), pb = M.f(b.lat, b.lon);
    const k = easeInOut((t - r.t) / 1.3);
    if (t < r.t) return;
    const bend = (r.to === 'hague' ? -1 : 1) * 0.12;
    const mx = (pa.x + pb.x) / 2 + (pb.y - pa.y) * bend, my = (pa.y + pb.y) / 2 - (pb.x - pa.x) * bend;
    const pt = (u) => ({ x: (1 - u) * (1 - u) * pa.x + 2 * (1 - u) * u * mx + u * u * pb.x, y: (1 - u) * (1 - u) * pa.y + 2 * (1 - u) * u * my + u * u * pb.y });
    g.save(); g.setLineDash([5, 6]); g.strokeStyle = 'rgba(233,182,96,0.75)'; g.lineWidth = 1.6;
    g.beginPath(); for (let i = 0; i <= 40; i++) { const u = (i / 40) * k; const p = pt(u); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); } g.stroke(); g.restore();
    if (k < 1) { const p = pt(k); g.globalCompositeOperation = 'lighter'; sprite(TEX.gold, p.x, p.y, 14, 1); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    arrived[r.to] = smooth(r.t + 1.2, r.t + 1.6, t);
  });
  city('istanbul', arrived.istanbul || 0, 'Istanbul', '', 1);
  city('stockholm', arrived.stockholm || 0, 'Stockholm', '', 1);
  city('hague', arrived.hague || 0, 'The Hague', t > 176.3 ? `${Math.floor(lerp(1922, 1966, easeInOut((t - 176.4) / 10.6)))}` : '', -1);
  city('copenhagen', arrived.copenhagen || 0, 'Copenhagen', '1966', 1);
  // The Hague, waiting
  if (t > 176 && t < 188) {
    const p = M.f(PLACES.hague.lat, PLACES.hague.lon);
    for (let i = 0; i < 3; i++) {
      const ph = ((t - 176) / 2.4 + i / 3) % 1;
      g.strokeStyle = `rgba(233,182,96,${0.4 * (1 - ph) * win(t, 176, 188, 0.6, 0.6)})`; g.lineWidth = 1.2;
      g.beginPath(); g.arc(p.x, p.y, 6 + ph * 30, 0, TAU); g.stroke();
    }
  }
  vignette(0.5);
}

/* ---- 7. Copenhagen ---- */
function drawMuseum(t) {
  const g = V.g, lt = t - 192.5;
  fillBg(['#0e1219', '#141922', '#0b0e14']);
  const floor = V.H * (V.portrait ? 0.74 : 0.8);
  g.fillStyle = '#090b10'; g.fillRect(0, floor, V.W, V.H - floor);
  // spotlight cone
  const cx = V.W / 2;
  const cone = g.createLinearGradient(0, 0, 0, floor);
  cone.addColorStop(0, 'rgba(230,236,255,0.0)'); cone.addColorStop(1, 'rgba(230,236,255,0.09)');
  g.fillStyle = cone; g.beginPath(); g.moveTo(cx - V.vmin * 0.04, 0); g.lineTo(cx + V.vmin * 0.04, 0); g.lineTo(cx + V.vmin * 0.3, floor); g.lineTo(cx - V.vmin * 0.3, floor); g.fill();
  radial(cx, floor, V.vmin * 0.4, 'rgba(200,215,255,0.1)');
  // plinth, column, vitrine
  const ph = V.vmin * 0.2, pw = V.vmin * 0.26;
  const ch = V.vmin * (V.portrait ? 0.44 : 0.4), cw = ch / 2.98;
  const pTop = floor - ph;
  g.fillStyle = '#1b1f27'; g.fillRect(cx - pw / 2, pTop, pw, ph);
  g.fillStyle = '#232833'; g.fillRect(cx - pw / 2, pTop, pw, V.vmin * 0.01);
  drawColumn({ cx, base: pTop, w: cw, h: ch, rot: -0.25 + lt * 0.025, light: 0.95, cool: 0.18, shadow: true });
  // label card
  const lw = pw * 0.62, lh = ph * 0.34, lx = cx - lw / 2, ly = pTop + ph * 0.3;
  g.fillStyle = '#d9d4c8'; g.fillRect(lx, ly, lw, lh);
  const lfs = Math.max(7, lh * 0.2);
  text('Seikilos stele', cx, ly + lh * 0.32, lfs * 1.1, FONT_G, '#1b1f27', 'center');
  text('Tralles · 1st–2nd century AD', cx, ly + lh * 0.58, lfs * 0.8, FONT_G, '#3b3f48', 'center', 1, 400, 'italic');
  text('Inv. 14897', cx, ly + lh * 0.84, lfs * 0.8, FONT_G, '#3b3f48', 'center');
  // glass
  const gx0 = cx - pw * 0.42, gx1 = cx + pw * 0.42, gy0 = pTop - ch - V.vmin * 0.08;
  g.fillStyle = 'rgba(170,190,220,0.035)'; g.fillRect(gx0, gy0, gx1 - gx0, pTop - gy0);
  g.strokeStyle = 'rgba(200,215,240,0.28)'; g.lineWidth = 1; g.strokeRect(gx0, gy0, gx1 - gx0, pTop - gy0);
  const sx = lerp(gx0 - 40, gx1 + 40, ((lt * 0.08) % 1));
  g.save(); g.beginPath(); g.rect(gx0, gy0, gx1 - gx0, pTop - gy0); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.moveTo(sx, gy0); g.lineTo(sx + 26, gy0); g.lineTo(sx - 30, pTop); g.lineTo(sx - 56, pTop); g.fill();
  g.restore();
  // visitors drifting past
  const people = [[192.3, 9.0, 1, 0.95], [195.6, 8.0, -1, 1.1, 2.6], [199.2, 7.5, 1, 0.85]];
  people.forEach(([t0, dur, dir, sc, pause], i) => {
    let k = (t - t0) / dur;
    if (pause) { const mid = 0.48; const pk = pause / dur; k = k < mid ? k : k < mid + pk ? mid : k - pk; }
    if (k < 0 || k > 1) return;
    const x = dir > 0 ? lerp(-0.15, 1.15, k) * V.W : lerp(1.15, -0.15, k) * V.W;
    const s = V.vmin * 0.34 * sc, b = V.H + s * 0.1;
    const bob = Math.abs(Math.sin(t * 5 + i)) * s * 0.012;
    g.fillStyle = 'rgba(4,5,8,0.92)';
    g.beginPath(); g.arc(x, b - s * 0.82 - bob, s * 0.075, 0, TAU); g.fill();
    g.beginPath(); g.roundRect(x - s * 0.12, b - s * 0.72 - bob, s * 0.24, s * 0.62, s * 0.08); g.fill();
  });
  vignette(0.55);
}

/* ---- 8. Finale: the song becomes a constellation ---- */
function finaleLayout() {
  const P = V.portrait;
  const y0 = V.H * (P ? 0.08 : 0.07), y1 = V.H * (P ? 0.5 : 0.52);
  const rowH = (y1 - y0) / 4;
  const x0 = P ? 22 : V.W * 0.16, x1 = P ? V.W - 22 : V.W * 0.84;
  return { y0, rowH, x0, x1 };
}
function noteStarPos(F, n) {
  const row = n.line, e = n.e - row * 12;
  const x = lerp(F.x0, F.x1, (e + 0.5) / 12);
  const yb = F.y0 + F.rowH * (row + 0.85);
  const y = yb - (rungOf(n.sign) / 7) * F.rowH * 0.7;
  return { x, y };
}
function drawFinale(t) {
  const g = V.g, lt = t - 205;
  plate('finale', () => {
    const q = V.g;
    fillBg(['#04070f', '#0a1020', '#141b2e']);
    q.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const u = i / 40;
      sprite(TEX.blue, lerp(-0.1, 1.1, u) * V.W, lerp(0.15, 0.55, u) * V.H + Math.sin(u * 9) * V.vmin * 0.03, V.vmin * (0.16 + hash(i) * 0.1), 0.035);
    }
    TEX.stars.forEach((s) => sprite(TEX.white, s.x * V.W, s.y * V.H * 0.85, s.r * 1.5, 0.35));
    q.globalCompositeOperation = 'source-over';
  });
  g.globalCompositeOperation = 'lighter';
  TEX.stars.forEach((s, i) => { if (i % 2) sprite(TEX.white, s.x * V.W, s.y * V.H * 0.85, s.r * 1.5, 0.4 * Math.sin(t * s.s + s.p) ** 2); });
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  // ground and the stone
  hills(31, V.H * 0.9, V.vmin * 0.05, '#05070c', 1.3);
  const P = V.portrait;
  const ch = V.vmin * (P ? 0.3 : 0.2), cw = ch / 2.98;
  const ccx = V.W / 2, cbase = V.H * (P ? 0.9 : 0.93);
  radial(ccx, cbase - ch * 0.5, V.vmin * 0.4, 'rgba(233,182,96,0.16)');
  const o = { cx: ccx, base: cbase, w: cw, h: ch, rot: -0.2 + lt * 0.015, light: 0.95, warm: 0.3, glow: { song: 0.35 + 0.5 * win(t, 206.5, 233, 1, 3) } };
  const info = drawColumn(o);
  const srcX = ccx, srcY = cbase - ch;
  // stars from notes
  const F = finaleLayout();
  const lastT = PASS_F[PASS_F.length - 1].t;
  const glowAll = smooth(lastT + 0.8, lastT + 2.8, t);
  const landed = [];
  PASS_F.forEach((n, i) => {
    const age = t - n.t;
    if (age < 0) return;
    const p = noteStarPos(F, n);
    const k = easeOut(age / 1.1);
    const cpx = lerp(srcX, p.x, 0.3), cpy = Math.min(srcY, p.y) - V.vmin * 0.12;
    const bez = (u) => ({ x: (1 - u) * (1 - u) * srcX + 2 * (1 - u) * u * cpx + u * u * p.x, y: (1 - u) * (1 - u) * srcY + 2 * (1 - u) * u * cpy + u * u * p.y });
    g.globalCompositeOperation = 'lighter';
    if (k < 1) {
      for (let j = 0; j < 6; j++) { const q = bez(Math.max(0, k - j * 0.035)); sprite(TEX.gold, q.x, q.y, 6 - j * 0.7, 0.6 * (1 - j / 6)); }
    }
    const q = bez(k);
    const big = (n.syl === 2 ? 1.6 : 1) * (0.8 + Math.min(n.dur, 1.5) * 0.35);
    const tw = 0.75 + 0.25 * Math.sin(t * 2.2 + i * 1.7);
    sprite(TEX.gold, q.x, q.y, (11 + glowAll * 6) * big * tw, 0.85);
    sprite(TEX.white, q.x, q.y, 2.6 * big, 1);
    if (n.syl === 2 && k >= 1) sprite(TEX.gold, q.x, q.y, 30 + 6 * Math.sin(t * 1.5), 0.25);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    if (k >= 1) landed.push({ n, p });
  });
  // constellation lines within each row
  g.strokeStyle = COL.goldHi; g.lineWidth = 1;
  for (let i = 1; i < landed.length; i++) {
    const a = landed[i - 1], b = landed[i];
    if (a.n.line !== b.n.line) continue;
    g.globalAlpha = 0.28 + glowAll * 0.25;
    g.beginPath(); g.moveTo(a.p.x, a.p.y); g.lineTo(b.p.x, b.p.y); g.stroke();
  }
  g.globalAlpha = 1;
  // title
  const ta = smooth(lastT + 1.6, lastT + 3.4, t);
  if (ta > 0) {
    const fs = Math.min(V.W * 0.084, V.H * 0.07, 64);
    const y = V.H * (P ? 0.6 : 0.62);
    g.save(); g.shadowColor = 'rgba(255,200,120,0.5)'; g.shadowBlur = 24;
    text('While you live, shine.', V.W / 2, y, fs, FONT_M, COL.cream, 'center', ta);
    g.restore();
    text('ὅσον ζῇς, φαίνου', V.W / 2, y + fs * 0.85, fs * 0.5, FONT_G, COL.gold, 'center', ta * 0.9, 400, 'italic');
  }
  vignette(0.45);
}

/* ---------------- the director ---------------- */
const SCENES = [
  { a: 0, b: 23.6, fin: 0.01, fout: 1.6, draw: drawStone },
  { a: 23, b: 46.8, fin: 1.4, fout: 1.6, draw: drawTralles },
  { a: 46, b: 83.0, fin: 1.4, fout: 1.0, draw: drawSong },
  { a: 82.4, b: 107.7, fin: 1.0, fout: 1.2, draw: drawAccent },
  { a: 107, b: 122.6, fin: 1.2, fout: 0.9, draw: drawTime },
  { a: 122, b: 134.2, fin: 0.9, fout: 1.0, draw: drawTrain },
  { a: 133.4, b: 159.2, fin: 1.0, fout: 1.2, draw: drawGarden },
  { a: 158.4, b: 170.2, fin: 1.2, fout: 1.0, draw: drawFire },
  { a: 169.4, b: 193.2, fin: 1.0, fout: 1.0, draw: drawMap },
  { a: 192.4, b: 205.8, fin: 1.0, fout: 1.4, draw: drawMuseum },
  { a: 205, b: 1e9, fin: 1.6, fout: 0, draw: drawFinale },
];
function renderFrame(t) {
  const g = V.g;
  g.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#05070c'; g.fillRect(0, 0, V.W, V.H);
  const vis = SCENES.filter((s) => t >= s.a && t < s.b);
  vis.forEach((s, i) => {
    const wIn = s.fin > 0.02 ? smooth(s.a, s.a + s.fin, t) : 1;
    const wOut = s.fout > 0 ? 1 - smooth(s.b - s.fout, s.b, t) : 1;
    let a = Math.min(wIn, wOut);
    if (i === 0 && vis.length > 1) a = wIn; // the outgoing scene stays solid under the incoming one
    if (a <= 0.003) return;
    if (a >= 0.999) { s.draw(t); return; }
    // draw into the main canvas at reduced opacity via an offscreen layer
    const L = layer();
    const lg = L.getContext('2d');
    lg.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    lg.globalAlpha = 1; lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, V.W, V.H);
    const keep = V.g; V.g = lg; s.draw(t); V.g = keep;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = a; g.drawImage(L, 0, 0); g.restore();
  });
}
const PLATES = new Map();
function plate(key, draw) {
  let p = PLATES.get(key);
  if (!p || p.w !== V.cv.width || p.h !== V.cv.height) {
    const c = canvasOf(V.cv.width, V.cv.height), x = c.getContext('2d');
    x.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    const keep = V.g; V.g = x; draw(); V.g = keep;
    p = { c, w: V.cv.width, h: V.cv.height };
    PLATES.set(key, p);
  }
  const g = V.g;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.drawImage(p.c, 0, 0); g.restore();
}
let _layer = null;
function layer() {
  if (!_layer || _layer.width !== V.cv.width || _layer.height !== V.cv.height) _layer = canvasOf(V.cv.width, V.cv.height);
  return _layer;
}
