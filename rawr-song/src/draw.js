/* ===== stage: every frame is drawn from the song position alone, so picture and sound can't drift ===== */
const W = 550, H = 400, TAU = Math.PI * 2;
const OUT = '#1d1238';
const F_DISP = '"Luckiest Guy", "Arial Black", Impact, sans-serif';
const F_COMIC = '"Comic Sans MS", "Comic Neue", "Chalkboard SE", cursive';
const F_UI = 'Tahoma, Verdana, "Segoe UI", sans-serif';
const F_PIX = 'Silkscreen, "Courier New", monospace';
const lerp = (a, b, t) => a + (b - a) * t;
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ss = (a, b, x) => { x = sat((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const fract = x => x - Math.floor(x);
const back = x => { x = sat(x); const k = 1.70158; return 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); };
const rnd = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const groundY = x => 640 - 370 * Math.sqrt(1 - Math.pow((x - 275) / 520, 2));
const beatPulse = b => Math.exp(-fract(b) * 4.5);

/* night tint: every scene colour goes through col() */
let TINT = 0;
const _cc = new Map();
function col(hex) {
  const q = Math.round(TINT * 16);
  if (!q) return hex;
  const key = hex + q;
  let c = _cc.get(key);
  if (!c) {
    const n = q / 16, r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const f = (v, m, a) => Math.round(v * (1 - n) + (v * m + a) * n);
    c = 'rgb(' + f(r, .40, 10) + ',' + f(g, .44, 12) + ',' + f(b, .70, 46) + ')';
    _cc.set(key, c);
  }
  return c;
}
function mix(a, b, t) {
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const x = p(a), y = p(b);
  return 'rgb(' + x.map((v, i) => Math.round(lerp(v, y[i], t))).join(',') + ')';
}

/* shape helpers */
function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), rot || 0, 0, TAU); }
function fs(c, fill, stroke, lw) {
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 3; c.stroke(); }
}
function rr(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function tri(c, x1, y1, x2, y2, x3, y3, fill, stroke, lw) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); fs(c, fill, stroke, lw || 2.5); }
function heart(c, x, y, s, fill, stroke) {
  c.beginPath(); c.moveTo(x, y + s * .9);
  c.bezierCurveTo(x - s * 1.5, y - s * .1, x - s * .75, y - s * 1.1, x, y - s * .35);
  c.bezierCurveTo(x + s * .75, y - s * 1.1, x + s * 1.5, y - s * .1, x, y + s * .9);
  fs(c, fill, stroke, Math.max(1.2, s * .28));
}
function star(c, x, y, r, n, inner, rot) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = (rot || 0) + i * Math.PI / n - Math.PI / 2, q = i % 2 ? r * inner : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  c.closePath();
}
function txt(c, s, x, y, font, fill, stroke, lw, align) {
  c.font = font; c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.strokeText(s, x, y); }
  c.fillStyle = fill; c.fillText(s, x, y);
}

/* ===== characters ===== */
const DINO_PAL = [ // body, shade, belly, spikes
  ['#9be53b', '#6fc22a', '#f2ffb5', '#ff3d9a'], ['#4fd8ea', '#27b3cc', '#d9fbff', '#ffe14a'], ['#ff8fc7', '#f0609f', '#ffe3f1', '#7be04a'],
  ['#b99cff', '#9373ea', '#efe6ff', '#ffb13d'], ['#ffb347', '#f08c1f', '#fff0c9', '#4fd8ea'], ['#ffe14a', '#f2c21c', '#fffbd1', '#b99cff'],
  ['#7df0b2', '#43cf88', '#e6fff1', '#ff6b6b'], ['#ff7b6b', '#e8523f', '#ffe1d6', '#ffe14a'],
];
function drawEye(c, x, y, r, o) {
  const kind = o.eye || 'open', O = col(OUT);
  if (o.blink || kind === 'happy' || kind === 'closed') {
    c.beginPath();
    if (kind === 'happy') c.arc(x, y + r * .25, r * .8, Math.PI * 1.12, Math.PI * 1.88);
    else c.arc(x, y - r * .35, r * .8, Math.PI * .15, Math.PI * .85);
    c.strokeStyle = O; c.lineWidth = 2.8; c.stroke();
    return;
  }
  const R = kind === 'shock' ? r * 1.15 : r;
  ell(c, x, y, R, R); fs(c, col('#ffffff'), O, 2.5);
  const lx = (o.look ? o.look[0] : 0) * R * .36, ly = (o.look ? o.look[1] : 0) * R * .36;
  if (kind === 'star') {
    star(c, x + lx * .5, y + ly * .5, R * .78, 5, .5, o.spin || 0); fs(c, col('#ffcf1f'), O, 1.5);
    ell(c, x + lx * .5 - R * .2, y + ly * .5 - R * .25, R * .16, R * .16); fs(c, '#fff');
  } else {
    const pr = kind === 'shock' ? R * .28 : kind === 'sad' ? R * .62 : R * .5;
    ell(c, x + lx, y + ly, pr, pr); fs(c, O);
    ell(c, x + lx - pr * .38, y + ly - pr * .42, pr * .36, pr * .36); fs(c, '#fff');
    if (kind === 'sad') { ell(c, x + lx + pr * .35, y + ly + pr * .3, pr * .2, pr * .2); fs(c, '#fff'); }
  }
  if (kind === 'sad') { c.beginPath(); c.moveTo(x - R * 1.2, y - R * 1.15); c.lineTo(x + R * .6, y - R * 1.75); c.strokeStyle = O; c.lineWidth = 2.6; c.stroke(); }
}
function drawDino(c, x, y, s, o) {
  const pal = DINO_PAL[(o.pal || 0) % DINO_PAL.length], sq = o.sq || 0, m = sat(o.mouth || 0);
  const BODY = col(pal[0]), SHADE = col(pal[1]), BELLY = col(pal[2]), SPIKE = col(pal[3]), O = col(OUT);
  c.save();
  c.translate(x, y + (o.hop || 0)); c.rotate(o.tilt || 0);
  c.scale((o.flip ? -1 : 1) * s * (1 + .09 * sq), s * (1 - .11 * sq));
  c.lineJoin = c.lineCap = 'round';
  const wag = (o.wag || 0) * 7;
  c.beginPath(); c.moveTo(-10, -16); c.quadraticCurveTo(-46, -8, -62, -40 + wag); c.quadraticCurveTo(-40, -36, -14, -52); c.closePath(); fs(c, BODY, O, 3);
  tri(c, -17, -63, -33, -62, -24, -48, SPIKE, O); tri(c, -25, -46, -40, -41, -26, -31, SPIKE, O);
  ell(c, -10, -5, 11, 7); fs(c, SHADE, O, 3);
  ell(c, 0, -34, 26, 30); fs(c, BODY, O, 3);
  ell(c, 8, -29, 15, 20); fs(c, BELLY);
  ell(c, 11, -5, 13, 7.5); fs(c, BODY, O, 3);
  c.beginPath(); c.moveTo(17, -9); c.lineTo(17.5, -4); c.moveTo(21, -8); c.lineTo(21.5, -4); c.strokeStyle = O; c.lineWidth = 1.6; c.stroke();
  // little arms
  const arm = o.arm || 0;
  for (const [ax, ay, ph] of [[3, -47, .25], [15, -45, 0]]) {
    c.save(); c.translate(ax, ay); c.rotate(.55 - 1.5 * arm + (arm > .1 ? Math.sin((o.t || 0) * 22 + ph * 6) * .18 : 0));
    ell(c, 8, 0, 9, 4.6); fs(c, ph ? SHADE : BODY, O, 2.6);
    c.beginPath(); c.moveTo(14, -2); c.lineTo(17, -3.5); c.moveTo(14.5, 1.5); c.lineTo(17.5, 2); c.strokeStyle = O; c.lineWidth = 1.5; c.stroke();
    c.restore();
  }
  // head
  c.save(); c.translate(4, -58); c.rotate(-.22 * m + (o.head || 0)); c.translate(-4, 58);
  const cx = 14, cy = -76, rx = 32, ry = 25, hx = 4, hy = -80;
  for (const a of [-1.95, -2.4, -2.85]) { // spikes along the back of the head
    const bx = cx + rx * Math.cos(a), by = cy + ry * Math.sin(a), nx = Math.cos(a) / rx, ny = Math.sin(a) / ry, nl = Math.hypot(nx, ny);
    const ux = nx / nl, uy = ny / nl;
    tri(c, bx - uy * 6.5 - ux * 3, by + ux * 6.5 - uy * 3, bx + ux * 12, by + uy * 12, bx + uy * 6.5 - ux * 3, by - ux * 6.5 - uy * 3, SPIKE, O);
  }
  ell(c, cx, cy, rx - 1.5, ry - 1.5); fs(c, col('#8c1245'));
  if (m > .12) { ell(c, 25, -67 + 5 * m, 11, 2 + 6 * m); fs(c, col('#ff7fb0')); }
  const aU = -(.03 + .44 * m), aL = .04 + .24 * m;
  const Ux = cx + rx * Math.cos(aU), Uy = cy + ry * Math.sin(aU), Lx = cx + rx * Math.cos(aL), Ly = cy + ry * Math.sin(aL);
  c.beginPath(); c.moveTo(hx, hy); c.lineTo(Lx, Ly); c.ellipse(cx, cy, rx, ry, 0, aL, TAU + aU); c.closePath(); fs(c, BODY, O, 3);
  // teeth
  let dx = Ux - hx, dy = Uy - hy, dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
  for (const f of [.6, .8]) { const px = hx + (Ux - hx) * f, py = hy + (Uy - hy) * f; tri(c, px - dx * 4.2, py - dy * 4.2, px - dy * 7.5, py + dx * 7.5, px + dx * 4.2, py + dy * 4.2, '#fff', O, 1.8); }
  if (m > .3) {
    dx = Lx - hx; dy = Ly - hy; dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    for (const f of [.7, .88]) { const px = hx + (Lx - hx) * f, py = hy + (Ly - hy) * f; tri(c, px - dx * 3.4, py - dy * 3.4, px + dy * 5.5, py - dx * 5.5, px + dx * 3.4, py + dy * 3.4, '#fff', O, 1.6); }
  }
  ell(c, 36, -89, 1.8, 1.3); fs(c, O);
  c.globalAlpha = .55; ell(c, 27, -82.5 + (m > .5 ? -2 : 0), 5, 3); fs(c, col('#ff6fa8')); c.globalAlpha = 1;
  drawEye(c, 13, -91, 8, o);
  if (o.tear > 0) {
    const ty = -80 + o.tear * 16;
    c.beginPath(); c.moveTo(15, ty - 7); c.quadraticCurveTo(21, ty + 3, 15, ty + 4); c.quadraticCurveTo(9, ty + 3, 15, ty - 7); fs(c, col('#7fd6ff'), O, 1.6);
  }
  c.restore();
  c.restore();
}
function drawDuck(c, x, y, s, o) {
  const O = col(OUT), Y = col('#ffd92e'), YD = col('#f5b800'), OR = col('#ff8a1f'), m = sat(o.mouth || 0), sq = o.sq || 0;
  c.save(); c.translate(x, y + (o.hop || 0)); c.rotate(o.tilt || 0);
  c.scale((o.flip ? -1 : 1) * s * (1 + .08 * sq), s * (1 - .1 * sq)); c.lineJoin = c.lineCap = 'round';
  const wk = o.walk || 0;
  for (const [fx, ph] of [[-7, 0], [9, Math.PI]]) {
    const lift = wk ? Math.max(0, Math.sin(wk + ph)) * 5 : 0;
    c.beginPath(); c.moveTo(fx - 5, -1 - lift); c.lineTo(fx + 9, -1 - lift); c.lineTo(fx + 1, -8 - lift); c.closePath(); fs(c, OR, O, 2.5);
  }
  tri(c, -22, -30, -37, -41, -20, -40, Y, O, 3);
  ell(c, 0, -23, 27, 21); fs(c, Y, O, 3);
  ell(c, -4, -23, 13, 9, -.25 - m * .5); fs(c, YD, O, 2.5);
  ell(c, 16, -53, 17, 17); fs(c, Y, O, 3);
  // beak
  c.beginPath(); c.moveTo(29, -51); c.lineTo(45, -49 + m * 9); c.lineTo(29, -45 + m * 5); c.closePath(); fs(c, OR, O, 2.5);
  if (o.tongue) { ell(c, 41, -44, 4.5, 6); fs(c, col('#ff7fb0'), O, 1.8); }
  c.beginPath(); c.moveTo(28, -59); c.lineTo(50, -53 - m * 2); c.lineTo(28, -49); c.closePath(); fs(c, OR, O, 2.5);
  const up = sat(o.shades == null ? 0 : 1 - o.shades);
  if (up > .5 || o.shades == null) {
    if (o.blink) { c.beginPath(); c.arc(20, -58, 3, Math.PI * .1, Math.PI * .9); c.strokeStyle = O; c.lineWidth = 2; c.stroke(); }
    else { ell(c, 20, -58, 3.2, 3.6); fs(c, O); ell(c, 19, -59.2, 1.1, 1.1); fs(c, '#fff'); }
  }
  if (o.shades != null) {
    c.save(); c.translate(6, -60); c.rotate(-.75 * up); c.translate(0, -up * 5);
    c.beginPath(); c.moveTo(-2, 0); c.lineTo(8, -1); c.strokeStyle = O; c.lineWidth = 2.4; c.stroke();
    rr(c, 6, -6, 27, 11, 4); fs(c, col('#15102b'), O, 2);
    c.beginPath(); c.moveTo(11, -3); c.lineTo(17, -3); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.6; c.stroke();
    c.restore();
  }
  c.restore();
}
function drawCow(c, x, y, s, o) {
  const O = col(OUT), WH = col('#ffffff'), BK = col('#2a2440'), PK = col('#ffb9cc'), m = sat(o.mouth || 0), sq = o.sq || 0;
  c.save(); c.translate(x, y + (o.hop || 0)); c.rotate(o.tilt || 0);
  c.scale(s * (1 + .08 * sq), s * (1 - .1 * sq)); c.lineJoin = c.lineCap = 'round';
  const sw = Math.sin((o.t || 0) * 3) * 6;
  c.beginPath(); c.moveTo(34, -30); c.quadraticCurveTo(54, -30, 54 + sw * .4, -52); c.strokeStyle = O; c.lineWidth = 6; c.stroke();
  c.strokeStyle = WH; c.lineWidth = 2.5; c.stroke();
  ell(c, 54 + sw * .4, -56, 5, 7, .2); fs(c, BK, O, 2);
  ell(c, -30, -9, 13, 10); fs(c, WH, O, 3); ell(c, 30, -9, 13, 10); fs(c, WH, O, 3);
  ell(c, 0, -38, 40, 36);
  c.save(); c.clip(); c.fillStyle = WH; c.fillRect(-50, -80, 100, 90);
  ell(c, -26, -52, 17, 14, .3); fs(c, BK); ell(c, 27, -22, 15, 12, -.2); fs(c, BK); ell(c, 12, -66, 10, 7); fs(c, BK);
  c.restore();
  ell(c, 0, -38, 40, 36); fs(c, null, O, 3);
  ell(c, 0, -5, 13, 8); fs(c, PK, O, 2.5);
  for (const hx of [-24, 10]) {
    rr(c, hx, -15, 14, 17, 4); fs(c, WH, O, 3);
    c.beginPath(); c.moveTo(hx, -3); c.lineTo(hx + 14, -3); c.lineTo(hx + 14, -2); c.quadraticCurveTo(hx + 14, 2, hx + 10, 2); c.lineTo(hx + 4, 2); c.quadraticCurveTo(hx, 2, hx, -2); c.closePath(); fs(c, col('#4a4060'), O, 2);
  }
  // head
  c.save(); c.translate(0, -70); c.rotate((o.head || 0) - .1 * m); c.translate(0, 70);
  for (const d of [-1, 1]) {
    c.beginPath(); c.moveTo(d * 23, -119); c.quadraticCurveTo(d * 31, -134, d * 16, -133); c.quadraticCurveTo(d * 19, -126, d * 13, -121); c.closePath(); fs(c, col('#f6e7b4'), O, 2.5);
    ell(c, d * 37, -106, 12, 7, d * .4); fs(c, d > 0 ? BK : WH, O, 2.5);
    ell(c, d * 37, -106, 6.5, 3.3, d * .4); fs(c, PK);
  }
  rr(c, -30, -125, 60, 54, 21);
  c.save(); c.clip(); c.fillStyle = WH; c.fillRect(-32, -127, 64, 60); ell(c, 19, -113, 17, 17); fs(c, BK); c.restore();
  rr(c, -30, -125, 60, 54, 21); fs(c, null, O, 3);
  const e1 = { eye: o.eye, blink: o.blink, look: [-.8, -.7] }, e2 = { eye: o.eye, blink: o.blink, look: [.7, .8] };
  drawEye(c, -13, -105, 7, e1); drawEye(c, 14, -105, 7, e2);
  ell(c, 0, -80 + 2 * m, 25, 15 + 4 * m); fs(c, PK, O, 3);
  ell(c, -9, -86, 3, 2, .4); fs(c, col('#c9668a')); ell(c, 9, -86, 3, 2, -.4); fs(c, col('#c9668a'));
  if (m < .12) { c.beginPath(); c.arc(0, -79, 9, Math.PI * .2, Math.PI * .8); c.strokeStyle = O; c.lineWidth = 2.2; c.stroke(); }
  else { ell(c, 0, -73 + 3 * m, 9, 1.5 + 7.5 * m); fs(c, col('#7a1a45'), O, 2.2); ell(c, 0, -70 + 8 * m, 5.5, 1 + 3 * m); fs(c, col('#ff7fb0')); }
  c.restore();
  ell(c, sw * .25, -62, 6, 6.5); fs(c, col('#ffd23f'), O, 2.2);
  c.beginPath(); c.moveTo(sw * .25 - 3, -59.5); c.lineTo(sw * .25 + 3, -59.5); c.strokeStyle = O; c.lineWidth = 1.5; c.stroke();
  c.restore();
}
function drawOwl(c, x, y, s, o) {
  const O = col(OUT), BR = col(o.alt ? '#b9834d' : '#a9713f'), BD = col('#7d4f2a'), CR = col('#f6e2b8'), m = sat(o.mouth || 0), wide = sat(o.wide || 0), flap = sat(o.flap || 0);
  c.save(); c.translate(x, y + (o.hop || 0)); c.rotate(o.tilt || 0); c.scale(s * (1 + .06 * (o.sq || 0)), s * (1 - .08 * (o.sq || 0))); c.lineJoin = c.lineCap = 'round';
  for (const d of [-1, 1]) { c.save(); c.translate(d * 20, -34); c.rotate(d * (-.1 + flap * 1.7)); ell(c, d * 3, 12, 7.5, 16); fs(c, BD, O, 2.5); c.restore(); }
  for (const d of [-1, 1]) tri(c, d * 16, -45, d * 23, -63, d * 5, -52, BD, O, 2.5);
  ell(c, 0, -27, 23, 27); fs(c, BR, O, 3);
  ell(c, 0, -18, 14, 16); fs(c, CR);
  c.beginPath(); for (const [vx, vy] of [[-5, -18], [5, -18], [0, -10]]) { c.moveTo(vx - 3, vy - 2); c.lineTo(vx, vy + 1); c.lineTo(vx + 3, vy - 2); }
  c.strokeStyle = col('#c9a56b'); c.lineWidth = 1.6; c.stroke();
  for (const d of [-1, 1]) { ell(c, d * 7, -1.5, 5, 3); fs(c, col('#ff8a1f'), O, 2); }
  for (const d of [-1, 1]) {
    ell(c, d * 10, -39, 11, 11); fs(c, col('#e9c88c'), O, 2.5);
    if (o.blink) { c.beginPath(); c.moveTo(d * 10 - 6, -39); c.lineTo(d * 10 + 6, -39); c.strokeStyle = O; c.lineWidth = 2.4; c.stroke(); continue; }
    const R = 6.8 + 2.6 * wide; ell(c, d * 10, -39, R, R); fs(c, '#fff', O, 2);
    const lk = o.look || [0, 0], pr = 3.4 + 1.2 * wide; ell(c, d * 10 + lk[0] * 2.6, -39 + lk[1] * 2.6, pr, pr); fs(c, O);
    ell(c, d * 10 + lk[0] * 2.6 - 1.2, -40.4 + lk[1] * 2.6, 1.1, 1.1); fs(c, '#fff');
  }
  if (wide > .4) for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 4, -53 - wide * 3); c.lineTo(d * 16, -55 - wide * 4); c.strokeStyle = O; c.lineWidth = 2.2; c.stroke(); }
  c.beginPath(); c.moveTo(-4.5, -31); c.lineTo(4.5, -31); c.lineTo(0, -25 + (m > .1 ? -1 : 0)); c.closePath(); fs(c, col('#ff8a1f'), O, 2);
  if (m > .1) tri(c, -3.5, -27 + m * 2, 3.5, -27 + m * 2, 0, -22 + m * 5, col('#ff8a1f'), O, 2);
  c.restore();
}
function drawBee(c, x, y, s, o) {
  const O = col(OUT), fl = Math.sin((o.t || 0) * 70);
  c.save(); c.translate(x, y); c.rotate(o.tilt || 0); c.scale((o.flip ? -1 : 1) * s, s); c.lineJoin = c.lineCap = 'round';
  c.globalAlpha = .82;
  ell(c, -3, -12, 7, 12, -.5 + fl * .35); fs(c, col('#eafaff'), O, 2);
  ell(c, 6, -12, 7, 12, .3 + fl * .35); fs(c, col('#eafaff'), O, 2);
  c.globalAlpha = 1;
  tri(c, -13, -3, -23, 0, -13, 3, O, O, 1.5);
  ell(c, 0, 0, 15, 11);
  c.save(); c.clip(); c.fillStyle = col('#ffd92e'); c.fillRect(-16, -12, 32, 24); c.fillStyle = O; c.fillRect(-8, -12, 5, 24); c.fillRect(1, -12, 5, 24); c.restore();
  ell(c, 0, 0, 15, 11); fs(c, null, O, 2.5);
  ell(c, 10, -2, 1.9, 2.2); fs(c, O);
  c.beginPath(); c.arc(10, 2, 3, Math.PI * .15, Math.PI * .8); c.moveTo(8, -9); c.quadraticCurveTo(9, -17, 13, -18); c.moveTo(11, -8); c.quadraticCurveTo(14, -14, 18, -14);
  c.strokeStyle = O; c.lineWidth = 1.7; c.stroke();
  ell(c, 13, -18, 1.6, 1.6); fs(c, O); ell(c, 18, -14, 1.6, 1.6); fs(c, O);
  c.restore();
}

/* ===== scenery ===== */
function drawCloud(c, x, y, s, fill, stroke) {
  const parts = [[-24, 2, 13], [-6, -8, 18], [15, -3, 15], [31, 4, 10]];
  c.save(); c.translate(x, y); c.scale(s, s);
  c.beginPath(); for (const [px, py, r] of parts) { c.moveTo(px + r, py); c.arc(px, py, r, 0, TAU); } c.rect(-24, 2, 55, 12);
  c.strokeStyle = stroke; c.lineWidth = 6; c.lineJoin = 'round'; c.stroke(); c.fillStyle = fill; c.fill();
  c.restore();
}
function drawSun(c, x, y, r, b, shades, t) {
  const O = OUT, p = beatPulse(b);
  c.save(); c.translate(x, y); c.scale(1 + .05 * p, 1 + .05 * p); c.lineJoin = 'round';
  c.save(); c.rotate(t * .35);
  for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); tri(c, -6, -r - 5, 0, -r - 17 - (i % 2) * 5, 6, -r - 5, '#ffb81f', O, 2.5); }
  c.restore();
  ell(c, 0, 0, r, r); fs(c, '#ffe14a', O, 3);
  c.globalAlpha = .5; ell(c, -15, 8, 5.5, 3.5); fs(c, '#ff8fa8'); ell(c, 15, 8, 5.5, 3.5); fs(c, '#ff8fa8'); c.globalAlpha = 1;
  if (shades) {
    rr(c, -20, -9, 17, 11, 4); fs(c, '#15102b', O, 2); rr(c, 3, -9, 17, 11, 4); fs(c, '#15102b', O, 2);
    c.beginPath(); c.moveTo(-3, -5); c.lineTo(3, -5); c.moveTo(-20, -5); c.lineTo(-27, -8); c.moveTo(20, -5); c.lineTo(27, -8); c.strokeStyle = O; c.lineWidth = 2.2; c.stroke();
    c.beginPath(); c.moveTo(-16, -6); c.lineTo(-11, -6); c.moveTo(7, -6); c.lineTo(12, -6); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.5; c.stroke();
  } else { ell(c, -9, -5, 2.6, 4); fs(c, O); ell(c, 9, -5, 2.6, 4); fs(c, O); }
  c.beginPath(); c.arc(0, 4, 9, Math.PI * .12, Math.PI * .88); c.strokeStyle = O; c.lineWidth = 2.5; c.lineCap = 'round'; c.stroke();
  c.restore();
}
function drawMoon(c, x, y, typing, t) {
  const O = '#2a2358';
  const g = c.createRadialGradient(x, y, 20, x, y, 78); g.addColorStop(0, 'rgba(255,250,200,.35)'); g.addColorStop(1, 'rgba(255,250,200,0)');
  c.fillStyle = g; c.fillRect(x - 80, y - 80, 160, 160);
  ell(c, x, y, 27, 27); fs(c, '#f7f3cf', O, 3);
  ell(c, x - 13, y - 12, 5, 4); fs(c, '#dfdab0'); ell(c, x + 14, y + 12, 6, 5); fs(c, '#dfdab0'); ell(c, x + 12, y - 15, 3, 2.5); fs(c, '#dfdab0');
  ell(c, x - 8, y - 2, 2.3, 2.6); fs(c, O); ell(c, x + 7, y - 2, 2.3, 2.6); fs(c, O);
  c.beginPath(); c.moveTo(x - 6, y + 9); c.lineTo(x + 6, y + 9); c.strokeStyle = O; c.lineWidth = 2.4; c.lineCap = 'round'; c.stroke();
}
function drawBranch(c) {
  const O = col(OUT), BR = col('#8a5a34');
  c.lineCap = c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-30, 86); c.quadraticCurveTo(70, 96, 168, 110); c.strokeStyle = O; c.lineWidth = 15; c.stroke(); c.strokeStyle = BR; c.lineWidth = 9; c.stroke();
  c.beginPath(); c.moveTo(138, 106); c.quadraticCurveTo(160, 96, 176, 92); c.strokeStyle = O; c.lineWidth = 10; c.stroke(); c.strokeStyle = BR; c.lineWidth = 5; c.stroke();
  for (const [lx, ly, a] of [[178, 90, -.5], [168, 112, .5], [20, 84, -1.2]]) { c.save(); c.translate(lx, ly); c.rotate(a); ell(c, 9, 0, 10, 5.5); fs(c, col('#5fd04a'), O, 2.2); c.restore(); }
}
function drawFlower(c, x, y, sway, k, closed) {
  const O = col(OUT), petal = col(['#ffffff', '#ff9fd0', '#ffe66b', '#b9a2ff'][k % 4]);
  c.save(); c.translate(x, y); c.rotate(sway);
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(3, -9, 0, -18); c.strokeStyle = O; c.lineWidth = 4.5; c.lineCap = 'round'; c.stroke(); c.strokeStyle = col('#3a9a2a'); c.lineWidth = 2; c.stroke();
  ell(c, 5, -8, 5, 2.4, -.5); fs(c, col('#5fd04a'), O, 1.6);
  c.translate(0, -19);
  const r = closed ? 2.4 : 4.2;
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - Math.PI / 2; ell(c, Math.cos(a) * r, Math.sin(a) * r, 3.6, 3.6); fs(c, petal, O, 1.6); }
  ell(c, 0, 0, 2.8, 2.8); fs(c, col('#ffc21f'), O, 1.4);
  c.restore();
}
const FLOWERS = [[16, 58, 0], [52, 40, 1], [118, 62, 2], [188, 48, 3], [232, 74, 1], [322, 70, 0], [366, 46, 2], [428, 64, 3], [498, 44, 1], [536, 66, 0]];
const CLOUDS = [[60, 52, 1, 9], [300, 34, .8, 6], [520, 96, .7, 12]];
function drawSky(c, env, st) {
  const t = st.wall;
  let top, bot;
  if (env.party > 0) {
    const h = (st.t * 22) % 360;
    top = 'hsl(' + h + ',88%,62%)'; bot = 'hsl(' + ((h + 70) % 360) + ',95%,82%)';
  }
  const dTop = '#2f9bff', dBot = '#c6f0ff', sTop = '#7a4bd6', sBot = '#ffb36b', nTop = '#0b1038', nBot = '#3a2a7c';
  let a = mix(dTop, nTop, env.night), z = mix(dBot, nBot, env.night);
  if (env.sunset > 0) { a = mix(a.startsWith('rgb') ? rgbHex(a) : a, sTop, env.sunset * .8); z = mix(rgbHex(z), sBot, env.sunset); }
  const g = c.createLinearGradient(0, 0, 0, 330);
  g.addColorStop(0, a); g.addColorStop(1, z);
  c.fillStyle = g; c.fillRect(-40, -40, W + 80, H + 80);
  if (env.party > 0) {
    c.globalAlpha = env.party;
    const g2 = c.createLinearGradient(0, 0, 0, 330); g2.addColorStop(0, top); g2.addColorStop(1, bot);
    c.fillStyle = g2; c.fillRect(-40, -40, W + 80, H + 80);
    // sunburst
    c.save(); c.translate(275, 250); c.rotate(st.t * .25); c.fillStyle = 'rgba(255,255,255,.22)';
    for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(-58, -520); c.lineTo(58, -520); c.closePath(); c.fill(); }
    c.restore();
    c.globalAlpha = 1;
  }
  if (env.night > .05) {
    for (let i = 0; i < 46; i++) {
      const x = rnd(i) * W, y = rnd(i + 99) * 250, tw = .5 + .5 * Math.sin(t * (1 + rnd(i + 7) * 2.5) + i);
      c.globalAlpha = env.night * (.35 + .65 * tw);
      if (i % 7 === 0) { star(c, x, y, 4.5, 4, .32, 0); fs(c, '#fff8c9'); } else { c.fillStyle = '#fff'; c.fillRect(x, y, 1.6, 1.6); }
    }
    c.globalAlpha = 1;
  }
}
function rgbHex(s) { if (s[0] === '#') return s; const m = s.match(/\d+/g).map(Number); return '#' + m.map(v => v.toString(16).padStart(2, '0')).join(''); }
function drawRainbow(c, amt) {
  if (amt <= 0) return;
  const cols = ['#ff4d6d', '#ff9f1c', '#ffe14a', '#5fe36a', '#3fb8ff', '#8f6bff'];
  c.save(); c.beginPath(); c.rect(-40, -40, (W + 80) * amt, H + 80); c.clip();
  c.lineWidth = 9; c.lineCap = 'butt';
  cols.forEach((k, i) => { c.beginPath(); c.arc(275, 372, 262 - i * 9, Math.PI, TAU); c.strokeStyle = k; c.stroke(); });
  c.lineWidth = 3; c.strokeStyle = OUT;
  c.beginPath(); c.arc(275, 372, 266.5, Math.PI, TAU); c.stroke(); c.beginPath(); c.arc(275, 372, 212.5, Math.PI, TAU); c.stroke();
  c.restore();
}
function drawHills(c, env, st, b) {
  const O = col(OUT);
  ell(c, 40, 470, 230, 190); fs(c, col('#59c98f'), O, 3);
  ell(c, 520, 480, 250, 190); fs(c, col('#4fbf9a'), O, 3);
}
function drawGround(c, env, st, b) {
  const O = col(OUT);
  ell(c, 275, 640, 520, 370);
  const g = c.createLinearGradient(0, 265, 0, 400); g.addColorStop(0, col('#8fe85a')); g.addColorStop(1, col('#43b02f'));
  fs(c, g, O, 3.5);
  c.save(); ell(c, 275, 640, 520, 370); c.clip();
  c.globalAlpha = .35; ell(c, 215, 664, 520, 370); fs(c, col('#c8ff8a')); ell(c, 235, 676, 520, 370); fs(c, g); c.globalAlpha = 1;
  c.restore();
  c.strokeStyle = col('#2f8f22'); c.lineWidth = 2; c.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = 14 + i * 35 + rnd(i) * 12, y = groundY(x) + 30 + rnd(i + 30) * 60;
    c.beginPath(); c.moveTo(x - 4, y - 5); c.lineTo(x - 1, y); c.lineTo(x + 1, y - 7); c.lineTo(x + 3, y); c.lineTo(x + 6, y - 4); c.stroke();
  }
  FLOWERS.forEach(([x, dy, k], i) => drawFlower(c, x, groundY(x) + dy, Math.sin(b * Math.PI + i) * .16 * (env.night > .6 ? .3 : 1), k, env.night > .7));
}

/* ===== text furniture ===== */
const _wrap = new Map();
function wrapText(c, s, font, maxW) {
  const key = font + '|' + maxW + '|' + s;
  let r = _wrap.get(key);
  if (r) return r;
  c.font = font;
  const words = s.split(' '), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && c.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  r = { lines, w: Math.max(...lines.map(l => c.measureText(l).width)) };
  _wrap.set(key, r);
  return r;
}
// speech bubble: the noise, and what it means
function drawBubble(c, ax, ay, word, trans, tail, popAge, ts, opt) {
  opt = opt || {};
  const f1 = Math.round(19 * ts) + 'px ' + F_DISP, f2 = 'bold ' + Math.round(12.5 * ts) + 'px ' + F_COMIC;
  const w1 = wrapText(c, word, f1, 240 * ts), w2 = trans ? wrapText(c, '(' + trans + ')', f2, 178 * ts) : { lines: [], w: 0 };
  const lh1 = 21 * ts, lh2 = 15 * ts, padX = 11 * ts, padY = 7 * ts;
  const bw = Math.max(w1.w, w2.w) + padX * 2, bh = w1.lines.length * lh1 + w2.lines.length * lh2 + padY * 2;
  const x = Math.min(W - 6 - bw / 2, Math.max(6 + bw / 2, ax)), y = Math.max(6 + bh / 2, ay - bh / 2);
  const pop = 1 + .22 * Math.exp(-popAge * 7) * Math.cos(popAge * 9);
  c.save(); c.translate(x, y); c.scale(pop, pop); c.lineJoin = 'round';
  const O = OUT, fill = opt.fill || '#ffffff';
  if (tail) {
    const tx = tail[0] - x, ty = tail[1] - y, bx = Math.max(-bw / 2 + 16, Math.min(bw / 2 - 16, tx * .35)), down = ty > 0;
    const by = down ? bh / 2 - 2 : -bh / 2 + 2, len = Math.hypot(tx - bx, ty - by), k = Math.min(1, 26 / len);
    c.beginPath(); c.moveTo(bx - 8, by); c.lineTo(bx + (tx - bx) * k, by + (ty - by) * k); c.lineTo(bx + 8, by); c.closePath(); fs(c, fill, O, 3);
  }
  rr(c, -bw / 2, -bh / 2, bw, bh, 12 * ts); fs(c, fill, O, 3);
  if (tail) { const tx = tail[0] - x, bx = Math.max(-bw / 2 + 16, Math.min(bw / 2 - 16, tx * .35)), down = tail[1] - y > 0; c.fillStyle = fill; c.fillRect(bx - 6.5, down ? bh / 2 - 4 : -bh / 2 + 1, 13, 3); }
  let yy = -bh / 2 + padY + lh1 / 2 + 1 * ts;
  for (const l of w1.lines) { txt(c, l, 0, yy, f1, opt.ink || O); yy += lh1; }
  yy += (lh2 - lh1) / 2;
  for (const l of w2.lines) { txt(c, l, 0, yy, f2, opt.ink2 || '#e6007e'); yy += lh2; }
  c.restore();
  return { x, y, w: bw, h: bh };
}
function drawToast(c, tt, slide, lift, ts) {
  const w = 196 * ts, h = (tt.extra ? 54 : 43) * ts, x = W - w - 7, y = H - 7 - h - lift + (1 - slide) * (h + 12);
  c.save(); c.translate(x, y); c.lineJoin = 'round';
  c.fillStyle = 'rgba(10,10,40,.3)'; rr(c, 3, 3, w, h, 5); c.fill();
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f4f9ff'); g.addColorStop(1, '#bfd6f6');
  rr(c, 0, 0, w, h, 5); fs(c, g, '#1f4f9c', 2);
  const g2 = c.createLinearGradient(0, 0, w, 0); g2.addColorStop(0, '#2b6fe0'); g2.addColorStop(1, '#6aa8ff');
  c.save(); rr(c, 0, 0, w, h, 5); c.clip(); c.fillStyle = g2; c.fillRect(0, 0, w, 11 * ts); c.restore();
  txt(c, 'rawr messenger', 6 * ts, 6 * ts, Math.round(7.5 * ts) + 'px ' + F_PIX, '#fff', null, 0, 'left');
  txt(c, 'x', w - 8 * ts, 5.5 * ts, 'bold ' + Math.round(8 * ts) + 'px ' + F_UI, '#fff');
  const on = tt.io === 'in', ax = 7 * ts, ay = 16 * ts, as = 21 * ts;
  rr(c, ax, ay, as, as, 3); fs(c, '#ffffff', '#1f4f9c', 1.5);
  ell(c, ax + as / 2, ay + as * .38, as * .19, as * .19); fs(c, on ? '#35c24a' : '#a3a9b8');
  c.beginPath(); c.arc(ax + as / 2, ay + as * 1.02, as * .36, Math.PI, TAU); fs(c, on ? '#35c24a' : '#a3a9b8');
  txt(c, tt.name, ax + as + 6 * ts, 21 * ts, 'bold ' + Math.round(10.5 * ts) + 'px ' + F_UI, '#14244a', null, 0, 'left');
  txt(c, tt.line, ax + as + 6 * ts, 33.5 * ts, Math.round(10 * ts) + 'px ' + F_UI, '#3d4a6b', null, 0, 'left');
  if (tt.extra) txt(c, tt.extra, ax + as + 6 * ts, 45 * ts, 'italic ' + Math.round(9.5 * ts) + 'px ' + F_UI, '#6a5a8a', null, 0, 'left');
  c.restore();
}
function drawDialup(c, b, wall, ts) {
  const z = b < 6.4 ? back(sat((b - .5) / .6)) : 1 - ss(6.4, 7, b);
  if (z <= 0) return;
  const k = z * (ts > 1 ? 1.22 : 1);
  c.save(); c.translate(275, 190); c.scale(k, k); c.translate(-155, -80); c.lineJoin = 'round';
  c.fillStyle = 'rgba(10,10,40,.3)'; rr(c, 5, 6, 310, 160, 7); c.fill();
  rr(c, 0, 0, 310, 160, 7); fs(c, '#ece9d8', '#0a3fae', 3);
  const g = c.createLinearGradient(0, 0, 0, 24); g.addColorStop(0, '#3b88f5'); g.addColorStop(1, '#0a4fc4');
  c.save(); rr(c, 0, 0, 310, 160, 7); c.clip(); c.fillStyle = g; c.fillRect(0, 0, 310, 24); c.restore();
  txt(c, 'Connecting to teh internet…', 10, 12.5, 'bold 12px ' + F_UI, '#fff', null, 0, 'left');
  rr(c, 285, 5, 17, 14, 3); fs(c, '#e2533a', '#fff', 1.2); txt(c, '×', 293.5, 12, 'bold 12px ' + F_UI, '#fff');
  // two computers and the dots between them
  const pc = (x, y) => { rr(c, x, y, 30, 22, 2); fs(c, '#d6d2c0', '#555', 1.5); c.fillStyle = '#17b'; c.fillRect(x + 3, y + 3, 24, 14); c.fillStyle = '#aaa'; c.fillRect(x + 10, y + 22, 10, 4); c.fillRect(x + 5, y + 26, 20, 3); c.strokeStyle = '#555'; c.lineWidth = 1; c.strokeRect(x + 5, y + 26, 20, 3); };
  pc(26, 48); pc(254, 48);
  const stage = b < 2.2 ? 0 : b < 4 ? 1 : b < 6 ? 2 : 3;
  for (let i = 0; i < 9; i++) { const on = stage === 3 || Math.floor(wall * 9) % 9 === i; c.fillStyle = on ? (stage === 3 ? '#2aa838' : '#0a4fc4') : '#b9b5a2'; c.fillRect(70 + i * 20, 58, 8, 5); }
  const msg = ['Dialing…', 'Verifying username and password…', 'Logging on 2 the network…', 'Connected at 56,000 bps!!1!'][stage];
  txt(c, msg, 155, 96, (stage === 3 ? 'bold ' : '') + '12px ' + F_UI, '#111');
  c.strokeStyle = '#7b7b6a'; c.lineWidth = 1; c.strokeRect(28.5, 112.5, 180, 14); c.fillStyle = '#fff'; c.fillRect(29, 113, 179, 13);
  const segs = Math.min(15, Math.floor(b / 6 * 15)); c.fillStyle = '#2aa838'; for (let i = 0; i < segs; i++) c.fillRect(31 + i * 11.8, 115, 9.5, 9);
  rr(c, 222, 108, 64, 22, 3); fs(c, '#f5f4ea', '#0a3fae', 1.5); txt(c, 'Cancel', 254, 119.5, '11px ' + F_UI, '#111');
  txt(c, stage === 3 ? 'u r now online. be nice.' : 'do NOT pick up the phone', 155, 144, 'italic 10.5px ' + F_UI, '#6b6857');
  c.restore();
}
function drawTitle(c, st, away) {
  const t = st.wall, wob = Math.sin(t * 2.2) * .02;
  away = away || 0;
  c.save(); c.translate(275, 96 - away * 330); c.rotate(-.07 + wob); c.scale(1 + Math.sin(t * 4.4) * .012, 1 + Math.sin(t * 4.4 + 1) * .012); c.lineJoin = 'round';
  txt(c, 'THE', -148, -52, '30px ' + F_DISP, '#ffe14a', OUT, 8);
  const f = '104px ' + F_DISP;
  c.font = f; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = OUT; c.fillText('RAWR', 7, 18);
  c.strokeStyle = OUT; c.lineWidth = 14; c.strokeText('RAWR', 0, 10);
  const g = c.createLinearGradient(0, -40, 0, 56); g.addColorStop(0, '#ff3d9a'); g.addColorStop(.38, '#ffb13d'); g.addColorStop(.62, '#ffe14a'); g.addColorStop(1, '#7be04a');
  c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.strokeText('RAWR', 0, 10);
  c.fillStyle = g; c.fillText('RAWR', 0, 10);
  txt(c, 'SONG', 128, 74, '46px ' + F_DISP, '#4fd8ea', OUT, 10);
  c.restore();
  c.globalAlpha = 1 - away;
  for (let i = 0; i < 9; i++) {
    const x = [38, 96, 470, 520, 60, 486, 250, 410, 150][i], y = [40, 150, 30, 130, 208, 60, 18, 176, 186][i], tw = .5 + .5 * Math.sin(t * 3 + i * 1.7);
    star(c, x, y, 7 + tw * 7, 4, .4, t * .5 + i); fs(c, i % 2 ? '#ffffff' : '#fff39a', OUT, 1.8);
  }
  c.globalAlpha = 1;
}
function drawSubs(c, e, age, ts) {
  if (!e || !e.wordT) return;
  const font = 'bold ' + Math.round(19 * ts) + 'px ' + F_COMIC;
  c.font = font;
  const words = e.parts.map(p => p[0]), gap = 6 * ts, ws = words.map(w => c.measureText(w).width);
  // wrap into rows that fit the stage
  const rows = [[]]; let rw = 0;
  words.forEach((w, i) => { if (rw + ws[i] > W - 40 && rows[rows.length - 1].length) { rows.push([]); rw = 0; } rows[rows.length - 1].push(i); rw += ws[i] + gap; });
  rows.forEach((row, ri) => {
    const tw = row.reduce((s, i) => s + ws[i], 0) + gap * (row.length - 1);
    let x = (W - tw) / 2; const y = H - 30 * ts - (rows.length - 1 - ri) * 25 * ts;
    for (const i of row) {
      const said = age >= e.wordT[i], now = said && age < e.wordT[i + 1] + .08;
      if (age > e.wordT[i] - 1.2) txt(c, words[i], x, y - (now ? 3 : 0), font, said ? '#ffe14a' : '#ffffff', OUT, 6 * ts, 'left');
      x += ws[i] + gap;
    }
  });
}
function drawMarquee(c, t, ts, text) {
  const h = 19 * ts;
  c.fillStyle = '#0b0b10'; c.fillRect(-40, H - h, W + 80, h + 40);
  c.fillStyle = '#ff2e93'; c.fillRect(-40, H - h - 2, W + 80, 2);
  const font = Math.round(10 * ts) + 'px ' + F_PIX; c.font = font;
  const w = c.measureText(text).width + 60, x = -((t * 62 * ts) % w);
  for (let k = 0; k < Math.ceil((W + w) / w) + 1; k++) txt(c, text, x + k * w, H - h / 2 + 1, font, '#b6ff3b', null, 0, 'left');
}
const MARQUEE = '★ thx 4 watching ★ rawr means i love you in dinosaur ★ u r not cringe. u r early internet royalty ★ u were never 2 random ★ this loop never ends, like it was always meant 2 ★ keith is still typing ★ pls rate 5 stars + send 2 10 friends or ur left sock goes missing ★ ';

/* ===== who is where, doing what ===== */
class Track {
  constructor(evs) { this.e = evs.filter(e => !e.ghost).slice().sort((a, b) => a.b - b.b); }
  last(b) { const e = this.e; let lo = 0, hi = e.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (e[m].b <= b) { r = m; lo = m + 1; } else hi = m - 1; } return r < 0 ? null : e[r]; }
  mouth(b) { const e = this.last(b + .06); if (!e) return 0; const x = b + .06 - e.b; return x < e.d * .88 ? sat(x / .07) : sat(1 - (x - e.d * .88) / .14); }
  bub(b, hold) { const e = this.last(b); if (!e || !e.bub) return null; const x = b - e.b; return x <= e.d + hold ? { e, age: x } : null; }
}
function makeTracks(score) {
  const T = {};
  for (const k of ['main', 'vamp', 'fin']) {
    const ev = score[k].ev, who = w => new Track(ev.filter(e => e.k === 'vox' && e.who === w));
    T[k] = {
      dino: who('dino'), duck: who('duck'), cow: who('cow'), owl1: who('owl1'), owl2: who('owl2'), narr: who('narr'),
      owl: new Track(ev.filter(e => e.k === 'vox' && (e.who === 'owl1' || e.who === 'owl2'))),
      bee: new Track(ev.filter(e => e.k === 'buzz')), cues: score[k].cues,
    };
  }
  return T;
}
const CLONES = [ // a1 slot [x,row], a2 slot [x,row], first beat on stage, when it shuffles over to make room
  { a1: [385, 0], a2: [382, 0], at: 24, pal: 1, mv: 61 }, { a1: [165, 0], a2: [176, 0], at: 32, pal: 2, mv: 60.4 }, { a1: [482, 0], a2: [516, 1], at: 32, pal: 3, mv: 47.6 },
  { a1: [68, 0], a2: [30, 1], at: 40, pal: 4, mv: 60.2 }, { a1: [330, 1], a2: [330, 1], at: 40, pal: 5, mv: 61 }, { a1: [220, 1], a2: [226, 1], at: 40, pal: 6, mv: 61 },
  { a1: [432, 1], a2: [432, 1], at: 40, pal: 7, mv: 61 }, { a1: [125, 1], a2: [132, 1], at: 64, pal: 1, mv: 61 },
];
const ROW = [{ dy: 22, s: .9 }, { dy: -4, s: .68 }];
const COW_X = 76;
const VAMP_LINES = [[['rawr?', 'i love you?'], ['rawr.', 'i love you.']], [['rawr?', 'i love you?'], ['rawr…', 'i love you…']], [['rawr??', 'i love you??'], ['rawr :(', 'i love you :(']], [['rawr?', 'hello? i love you?'], ['rawr.', 'i love you anyway.']]];

const FIN_LINES = ['i love you', 'i love you!!', 'ily xD', 'i love you sm', '*glomp*', 'i love you 4eva', 'ily ily ily', 'i love you 2'];

function drawFrame(c, st) {
  const mode = st.mode, b = st.b, ts = st.ts || 1, T = st.T ? st.T[mode === 'title' ? 'main' : mode] : null, wall = st.wall, rm = st.rm ? 0 : 1;
  const fxs = st.fx || {}, beatB = fxs.still ? Math.floor(b / 4) * 4 + .7 : b;
  const env = { night: 0, sunset: 0, party: 0 };
  const sun = { x: 478, y: 62, on: true, shades: false }, moon = { y: 500, on: false };
  if (mode === 'title') { sun.x = 508; sun.y = 232; }
  if (mode === 'main' && b < 3) { const u = ss(0, 3, b); sun.x = lerp(508, 478, u); sun.y = lerp(232, 62, u); }
  if (mode === 'main') {
    env.night = ss(100, 126, b); env.sunset = sat(1 - Math.abs(b - 109) / 13);
    const d = ss(96, 119, b); if (b >= 3) { sun.y = 62 + d * 300; sun.x = 478 - d * 46; } sun.on = d < 1;
    moon.on = b > 110; moon.y = 84 + (1 - ss(110, 126, b)) * 260;
  } else if (mode === 'vamp') { env.night = 1; sun.on = false; moon.on = true; moon.y = 84; }
  else if (mode === 'fin') {
    env.night = 1 - ss(.3, 3.2, b); env.sunset = sat(1 - Math.abs(b - 1.8) / 2.2) * .8; env.party = ss(7.7, 8.3, b);
    sun.y = 62 + (1 - back((b - .6) / 2.6)) * 300; sun.shades = b >= 8; moon.on = b < 3.5; moon.y = 84 + ss(0, 3, b) * 300;
  }
  TINT = env.night * .9;

  // camera: nudges, the big zoom, a pulse on the kick
  let z = 1, shx = 0, shy = 0, fxp = 275, fyp = 215;
  if (T && rm) {
    const e = T.bee.last(b);
    if (e && b - e.b < 1.1) { const x = b - e.b, a = 6.5 * Math.pow(1 - x / 1.1, 2) * (e.soft ? .5 : 1); shx += a * Math.sin(x * 46); shy += a * .45 * Math.cos(x * 61); }
    if (mode === 'fin') {
      if (b < 8) { z = 1 + .42 * ss(4, 7.3, b); shx += Math.sin(b * 53) * 1.6 * ss(4, 7.4, b); shy += Math.cos(b * 71) * 1.6 * ss(4, 7.4, b); fyp = 232; }
      else z = 1 + .014 * beatPulse(b) * (fxs.still ? 0 : 1);
      if (b > 12 && b < 13) { const x = b - 12, a = 7 * Math.pow(1 - x, 2); shy += a * Math.cos(x * 50); }
    }
  }
  if (mode === 'vamp' && rm) { z = 1 + .2 * ss(0, 10, st.raw == null ? 99 : st.raw); fyp = 262; }
  if (mode === 'fin' && b < 4 && rm) { z = Math.max(z, 1 + .2 * (1 - ss(0, 2.5, b))); if (b < 2.5) fyp = 262; }
  c.save();
  c.translate(fxp, fyp); c.scale(z, z); c.translate(-fxp + shx, -fyp + shy);
  drawSky(c, env, st);
  if (moon.on) drawMoon(c, 432, moon.y, false, wall);
  if (sun.on) drawSun(c, sun.x, sun.y, 30, mode === 'title' ? wall * 1.2 : beatB, sun.shades, wall);
  if (mode === 'fin') drawRainbow(c, ss(8.5, 11.5, b));
  CLOUDS.forEach(([x, y, s, v], i) => {
    const cx = ((x + wall * v) % (W + 160)) - 80;
    drawCloud(c, cx, y + Math.sin(wall * .7 + i) * 2, s, env.night > .5 ? mix('#ffffff', '#5b5aa8', env.night) : '#ffffff', env.night > .5 ? '#2a2358' : OUT);
  });
  drawHills(c, env, st, b);

  /* ---- cast ---- */
  const lead = { x: 275, y: groundY(275) + 22, s: 1.15, mouth: 0, sq: 0, arm: 0, look: [.35, .05], eye: 'open', tilt: 0, head: 0, hop: 0, wag: Math.sin(b * Math.PI), pal: 0, t: wall, show: true, behind: false, tear: 0, flip: false };
  const blinkOf = k => fract(wall * .31 + k * .37) > .955;
  lead.blink = blinkOf(0);
  let dm = T ? T.dino.mouth(b) : 0;
  const dance = (o, ph, amt) => { if (fxs.still) return; o.hop += -Math.abs(Math.sin(Math.PI * (b + ph))) * 7 * amt; o.sq += (beatPulse(b + ph) * .9 - .2) * amt; o.tilt += .05 * Math.sin(Math.PI * (b + ph)) * amt; };
  const sing = (o, m) => { o.mouth = m; o.arm = Math.max(o.arm, m); if (m > .5) o.eye = o.eye === 'star' ? 'star' : 'happy'; };
  let duck = null, cow = null, owls = null, bee = null, rain = 0, sadAll = 0, shockAll = 0, starAll = 0, bigHeart = 0;
  const clones = [];
  const addClone = (i, x, row, pal, o) => clones.push(Object.assign({ i, x, row, y: groundY(x) + ROW[row].dy, s: ROW[row].s, pal, mouth: 0, sq: 0, arm: 0, tilt: 0, head: 0, hop: 0, eye: 'open', look: [.35, .05], wag: Math.sin(b * Math.PI + i), t: wall + i, blink: blinkOf(i + 1), tear: 0, flip: false, pop: 1, age: 9 }, o || {}));

  if (mode === 'title') {
    lead.behind = true; lead.y += 64 + Math.sin(wall * 1.6) * 3; lead.eye = 'open';
    if (st.ptr) { const dx = st.ptr.x - 290, dy = st.ptr.y - 250, l = Math.hypot(dx, dy) || 1; lead.look = [dx / l, dy / l]; }
    if (st.ready) { lead.y -= 14; lead.arm = .5 + .5 * Math.sin(wall * 5); }
  } else if (mode === 'main') {
    if (b < 1.2) { lead.behind = true; lead.y += 50 + 80 * ss(0, 1.2, b); }
    else if (b < 6.6) lead.show = false;
    else if (b < 8) { const u = (b - 6.6) / 1.4; lead.y += 112 * (1 - u) - 96 * Math.sin(Math.PI * u); lead.behind = u < .45; lead.sq = u > .9 ? (u - .9) * 9 : -.5; lead.arm = 1; lead.eye = 'happy'; }
    else if (b < 16) {
      lead.sq = .2 * Math.sin(b * Math.PI); lead.look = b < 12 ? [.1, .5] : [.35, .05];
      const ne = T.narr.e[0], na = (b - 8) * BEAT;
      if (ne && ne.wordT) { if (na < ne.wordT[1] + .05) { lead.mouth = sat(na / .06); lead.arm = 1; } if (na > ne.wordT[2] && na < ne.wordT[5] + .5) bigHeart = sat((na - ne.wordT[2]) / .15) * sat((ne.wordT[5] + .5 - na) / .2); }
      if (b > 14.4) { const u = (b - 14.4) / 1.6; lead.sq = .3 + u * 1.1; lead.head = -.28 * u; lead.arm = u * .7; lead.eye = 'star'; }
    } else if (b < 48) { dance(lead, 0, 1); sing(lead, dm); }
    else if (b < 64) {
      lead.look = [1, 0];
      if (b < 52) { lead.sq = .1; if (b > 50 && b < 51) lead.hop = -Math.sin((b - 50) * Math.PI) * 10; }
      else if (b < 54.5) { sing(lead, dm); lead.tilt = .1; lead.eye = 'star'; lead.arm = Math.max(lead.arm, .5); }
      else if (b < 55.2) { lead.eye = 'shock'; shockAll = 1; lead.sq = -.3; }
      else if (b < 58.2) { sadAll = 1; lead.eye = 'sad'; lead.blink = false; lead.tear = ss(55.6, 57.6, b); lead.sq = .55; lead.head = .22; lead.tilt = Math.sin(b * 38) * .012; rain = ss(55.4, 56, b) * (1 - ss(57.9, 58.3, b)); lead.wag = 0; }
      else if (b < 60) { starAll = 1; lead.eye = 'star'; lead.hop = -Math.abs(Math.sin((b - 58) * Math.PI * 2)) * 9; lead.arm = .6; }
      else { starAll = 1; const u = sat((b - 60) / 1.5); lead.hop = -Math.sin(Math.PI * u) * 44; sing(lead, dm); lead.eye = 'star'; if (b > 61.5) dance(lead, 0, 1); }
    } else if (b < 96) { dance(lead, 0, 1); sing(lead, dm); }
    else {
      // sign-off: wave at whoever is leaving
      const k = b < 104 ? 0 : b < 112 ? 1 : b < 120 ? 2 : 3;
      lead.sq = .12 + .12 * k + .05 * Math.sin(b * Math.PI * .5); lead.head = .04 * k;
      lead.look = [[.8, -.7], [.8, -.7], [1, .1], [1, .2]][k]; lead.flip = k === 1 || k === 3;
      if (b >= 124) { lead.flip = false; lead.look = [.3, .3]; lead.eye = 'sad'; lead.blink = false; lead.head = .16; lead.sq = .5; }
      sing(lead, dm * .8); if (dm > .5 && b < 124) lead.eye = 'open';
      lead.wag *= 1 - k * .3;
    }
    // clones
    CLONES.forEach((cl, i) => {
      if (b < cl.at) return;
      const mv = ss(cl.mv, cl.mv + 1.4, b), x = lerp(cl.a1[0], cl.a2[0], mv), row = mv > .5 ? cl.a2[1] : cl.a1[1];
      const o = { pop: back((b - cl.at) / .6), age: b - cl.at };
      if (mv > 0 && mv < 1 && cl.a1[0] !== cl.a2[0]) o.hop = -Math.sin(mv * Math.PI) * 26;
      if (b >= 96) { const t0 = 96.5 + (7 - i) * 2, u = (b - t0) / 2.2; if (u > 1) return; if (u > 0) { const dir = x < 275 ? -1 : 1; o.xo = dir * u * (dir < 0 ? x + 90 : W - x + 90); o.hop = -Math.abs(Math.sin(u * Math.PI * 3)) * 22; o.flip = dir < 0; } }
      addClone(i, x + (o.xo || 0), row, cl.pal, o);
    });
    if (b >= 48) {
      duck = { x: 462, y: groundY(462) + 22, s: 1.05, flip: true, mouth: T.duck.mouth(b), shades: 1, sq: 0, hop: 0, tilt: 0, blink: blinkOf(11) };
      if (b < 50) { const u = sat((b - 48) / 1.9); duck.x = lerp(630, 462, u); duck.walk = b * 14; duck.tilt = Math.sin(b * 14) * .08; }
      else if (b < 55.2) { duck.sq = .15 * Math.sin(b * Math.PI); }
      else if (b < 58) { duck.flip = false; duck.tilt = -.05; }
      else if (b < 60.5) { duck.shades = 1 - back((b - 58) / .4); duck.tongue = b > 58.4; duck.hop = -Math.abs(Math.sin((b - 58) * Math.PI * 2)) * 8; }
      else if (b < 96) { duck.shades = ss(63, 64, b); dance(duck, .5, .8); }
      else if (b < 114) { duck.sq = .1; }
      else { const u = (b - 114) / 2.2; if (u > 1) duck = null; else { duck.x = lerp(462, 640, u); duck.flip = false; duck.walk = b * 14; duck.tilt = Math.sin(b * 14) * .08; } }
    }
    if (b >= 61) {
      cow = { x: COW_X, y: groundY(COW_X) + 22, s: .9, mouth: T.cow.mouth(b), sq: 0, hop: 0, tilt: 0, head: 0, t: wall, blink: blinkOf(21) };
      if (b < 62) { const u = (b - 61); cow.x = lerp(-90, COW_X, back(u)); cow.hop = -Math.sin(u * Math.PI) * 26; }
      else if (b < 96) { dance(cow, 0, .55); cow.head = -.12 * cow.mouth; }
      else if (b >= 122.5) { const u = (b - 122.5) / 2.2; if (u > 1) cow = null; else { cow.x = lerp(COW_X, -110, u); cow.hop = -Math.abs(Math.sin(u * Math.PI * 3)) * 16; } }
    }
    if (b >= 62) {
      const inn = back((b - 62) / .9), out = ss(106, 108.4, b);
      if (out < 1) owls = { dx: -190 * (1 - inn) - 60 * out, dy: -70 * (1 - inn) - 190 * out, fly: out > 0, branch: 1 - ss(107, 109, b) };
    }
    if (b >= 63) {
      const out = ss(98, 100, b);
      if (out < 1) bee = { x: 438 + Math.sin(wall * 1.9) * 26 + 180 * (1 - ss(63, 64, b)) + out * 190, y: 102 + Math.sin(wall * 3.1) * 11 - 90 * (1 - ss(63, 64, b)) - out * 170 };
    }
  } else if (mode === 'vamp') {
    lead.sq = .62; lead.wag = Math.sin(wall * .8) * .3; lead.look = [.75, -.75]; lead.eye = 'sad'; lead.blink = fract(wall * .23) > .93;
    const e = T.dino.last(b + .1);
    if (e && b - e.b < e.d + 1.2 && b - e.b > -.2) { lead.look = e.vi ? [.3, .5] : [.35, .05]; lead.head = e.vi ? .16 * ss(e.d, e.d + 1, b - e.b) : -.1; sing(lead, dm * (e.vi ? .55 : .8)); lead.eye = 'sad'; }
    if (st.sent) { const u = st.wall - st.sent.wall; lead.eye = u < .35 ? 'shock' : 'star'; lead.blink = false; lead.sq = .62 - back(u / .4) * .9; lead.look = [.35, .05]; lead.hop = u > .35 ? -Math.abs(Math.sin((u - .35) * 9)) * 12 : 0; lead.arm = 1; lead.head = -.1; }
  } else if (mode === 'fin') {
    if (b < 8) {
      lead.eye = 'star'; lead.blink = false; lead.spin = wall * 3; lead.arm = .6 + .4 * Math.sin(b * 12);
      lead.hop = -Math.abs(Math.sin(b * Math.PI)) * 12 * (1 - ss(4.6, 5, b));
      if (b >= 4.8) { sing(lead, Math.max(dm, ss(4.8, 5.1, b) * (b < 7.5 ? 1 : .6))); lead.sq = -.7; lead.head = -.2; lead.eye = 'happy'; }
    } else { dance(lead, 0, 1.2); sing(lead, dm); if (lead.eye === 'open') { lead.eye = 'star'; lead.spin = wall * 2; } lead.blink = false; }
    CLONES.forEach((cl, i) => { const at = 8 + i * .12; if (b >= at) addClone(i, cl.a2[0], cl.a2[1], cl.pal, { pop: back((b - at) / .5), age: b - at }); });
    if (b >= 9.3) { duck = { x: lerp(640, 462, back((b - 9.3) / .7)), y: groundY(462) + 22, s: 1.05, flip: true, mouth: T.duck.mouth(b), shades: b < 14 ? 0 : ss(14, 15, b), sq: 0, hop: 0, tilt: 0, blink: blinkOf(11) }; dance(duck, .5, .9); }
    if (b >= 11.3) {
      cow = { x: COW_X, y: groundY(COW_X) + 22, s: .9, mouth: T.cow.mouth(b), sq: 0, hop: 0, tilt: 0, head: 0, t: wall, blink: blinkOf(21) };
      if (b < 12) { cow.hop = -420 * Math.pow(1 - (b - 11.3) / .7, 1.6); cow.sq = -.6; } else if (b < 12.6) cow.sq = 1.6 * (1 - (b - 12) / .6); else { dance(cow, 0, .6); }
      cow.head = -.12 * cow.mouth;
    }
    if (b >= 15.3) { const inn = back((b - 15.3) / .9); owls = { dx: -190 * (1 - inn), dy: -70 * (1 - inn), branch: 1 }; }
    if (b >= 20.3) { const inn = ss(20.3, 21, b); bee = { x: 438 + Math.sin(wall * 1.9) * 26 + 180 * (1 - inn), y: 102 + Math.sin(wall * 3.1) * 11 - 90 * (1 - inn) }; }
  }
  for (const cl of clones) {
    if (mode === 'main' && b >= 48 && b < 64) {
      cl.look = [1, 0];
      if (shockAll) { cl.eye = 'shock'; cl.sq = -.3; } else if (sadAll) { cl.eye = 'sad'; cl.blink = false; cl.tear = ss(55.6 + cl.i * .08, 57.6, b); cl.sq = .5; cl.head = .2; }
      else if (starAll) { cl.eye = 'star'; cl.hop += -Math.abs(Math.sin((b - 58 + cl.i * .13) * Math.PI * 2)) * 8; if (b >= 60) sing(cl, dm); if (b > 61.5) dance(cl, 0, 1); }
    } else if (mode === 'main' && b >= 96) { cl.sq += .1; cl.look = [.8, -.3]; }
    else { dance(cl, cl.i % 2 ? .5 : 0, 1); sing(cl, T.dino.mouth(b - .04 * (cl.i % 3))); if (mode === 'fin' && cl.eye === 'open' && cl.i % 2) cl.eye = 'star'; }
  }

  if (fxs.jump > 0 && fxs.jump < 1) {
    const j = -Math.sin(Math.PI * fxs.jump) * 34;
    lead.hop += j; lead.arm = 1; for (const cl of clones) cl.hop += j * (.6 + .4 * rnd(cl.i + 3));
    if (duck) duck.hop += j * .9; if (cow) cow.hop += j * .7;
  }
  if (fxs.wink) { lead.eye = 'happy'; lead.blink = false; }
  if (lead.show && lead.behind) drawDino(c, lead.x, lead.y, lead.s, lead);
  drawGround(c, env, st, mode === 'title' ? wall * 1.2 : b);
  const drawClone = cl => {
    drawDino(c, cl.x, cl.y, cl.s * sat(cl.pop), cl);
    if (cl.age < .6) { // a little burst as each one pops in
      const u = cl.age / .6; c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.lineCap = 'round'; c.globalAlpha = 1 - u;
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, r0 = (26 + u * 34) * cl.s, r1 = r0 + 13 * cl.s, cy = cl.y - 55 * cl.s; c.beginPath(); c.moveTo(cl.x + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cl.x + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke(); }
      c.globalAlpha = 1;
    }
  };
  clones.filter(cl => cl.row === 1).forEach(drawClone);
  if (owls) {
    c.save(); c.translate(owls.dx, owls.dy);
    if (owls.branch > 0) { c.globalAlpha = owls.branch; drawBranch(c); c.globalAlpha = 1; }
    const e1 = T.owl1.last(b + .06), e2 = T.owl2.last(b + .06);
    const act = (e, k) => e && b - e.b < e.d + .5 ? (/!!/.test(e.bub[0]) ? 1 : .55) : 0;
    const o1 = { mouth: T.owl1.mouth(b), wide: act(e1), flap: owls.fly ? .5 + .5 * Math.sin(wall * 30) : act(e1) > .9 ? .7 : 0, look: [.6, 0], tilt: .06 * Math.sin(Math.PI * beatB * .5), blink: blinkOf(31), sq: beatPulse(beatB) * .5 };
    const o2 = { mouth: T.owl2.mouth(b), wide: act(e2), flap: owls.fly ? .5 + .5 * Math.sin(wall * 30 + 2) : act(e2) > .9 ? .7 : 0, look: [-.6, 0], tilt: -.06 * Math.sin(Math.PI * beatB * .5), blink: blinkOf(32), alt: 1, sq: beatPulse(beatB + .5) * .5 };
    drawOwl(c, 58, 94, 1, o1); drawOwl(c, 114, 101, .92, o2);
    c.restore();
  }
  if (cow) drawCow(c, cow.x, cow.y, cow.s, cow);
  clones.filter(cl => cl.row === 0).forEach(drawClone);
  if (duck) drawDuck(c, duck.x, duck.y, duck.s, duck);
  if (lead.show && !lead.behind) drawDino(c, lead.x, lead.y, lead.s, lead);
  if (bee) { const e = T.bee.last(b), zap = e && b - e.b < .6; drawBee(c, bee.x + (zap ? Math.sin(b * 60) * 4 : 0), bee.y, 1.1, { t: wall, flip: true, tilt: zap ? Math.sin(b * 50) * .2 : 0 }); }
  TINT = 0;

  /* ---- hearts ---- */
  if (T && mode !== 'title') {
    const singers = [lead].concat(clones);
    const evs = T.dino.e;
    for (let k = 0; k < evs.length; k++) {
      const e = evs[k], age = b - e.b;
      if (age < 0) break; if (age > 1.7) continue;
      singers.forEach((sg, si) => {
        if (!sg.show && sg === lead) return;
        if (si > 0 && (k + si) % 2) return;
        const seed = k * 13 + si * 7, dir = sg.flip ? -1 : 1, s0 = sg.s * (sg.pop == null ? 1 : sat(sg.pop));
        const x = sg.x + dir * (44 + rnd(seed) * 22 + age * 16) * s0, y = sg.y - (82 + age * (46 + rnd(seed + 1) * 26) + Math.sin(age * 5 + seed) * 4) * s0;
        c.globalAlpha = sat(1.7 - age) * (mode === 'vamp' ? .7 : 1);
        heart(c, x, y, (4 + rnd(seed + 2) * 3.5) * s0 * back(age / .25), ['#ff3d9a', '#ff6b6b', '#ffffff', '#ff9fd0'][seed % 4], OUT);
      });
    }
    c.globalAlpha = 1;
  }
  if (bigHeart > 0) { const k = bigHeart * (1 + .12 * Math.sin(wall * 9)); heart(c, lead.x + 12, lead.y - 168, 17 * k, '#ff3d9a', OUT); heart(c, lead.x + 7, lead.y - 172, 5 * k, '#ffffff', null); }
  if (st.pokes) for (const p of st.pokes) {
    const age = wall - p.wall; if (age > 1.2 || age < 0) continue;
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + p.wall, r = 14 + age * (60 + rnd(i + p.wall) * 50); c.globalAlpha = sat(1.2 - age); heart(c, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r - age * 20, 5 + rnd(i) * 3, i % 2 ? '#ff3d9a' : '#ffffff', OUT); }
    c.globalAlpha = 1;
  }
  /* ---- weather for the heartbroken ---- */
  if (rain > 0) {
    const cloudAt = (x, y, s) => {
      c.globalAlpha = rain; drawCloud(c, x, y, .62 * s, '#9aa3bd', OUT);
      c.strokeStyle = '#6fc3ff'; c.lineWidth = 2.2 * s; c.lineCap = 'round';
      for (let i = 0; i < 5; i++) { const ph = fract(wall * 1.7 + i * .23), rx = x - 16 * s + i * 8.5 * s, ry = y + 12 * s + ph * 26 * s; c.globalAlpha = rain * (1 - ph); c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx - 2 * s, ry + 6 * s); c.stroke(); }
      c.globalAlpha = 1;
    };
    cloudAt(lead.x + 6, lead.y - 150, 1);
    for (const cl of clones) cloudAt(cl.x + 4, cl.y - 128 * cl.s, cl.s * .95);
  }
  /* ---- confetti ---- */
  if (env.party > 0) {
    const cols = ['#ff3d9a', '#ffe14a', '#4fd8ea', '#7be04a', '#b99cff', '#ffffff'];
    for (let i = 0; i < 54; i++) {
      const sp = 60 + rnd(i) * 80, y = ((st.t * sp + rnd(i + 5) * 500) % (H + 60)) - 30, x = rnd(i + 9) * W + Math.sin(st.t * 2 + i) * 14;
      c.save(); c.translate(x, y); c.rotate(st.t * (2 + rnd(i + 3) * 4) + i); c.globalAlpha = env.party;
      c.fillStyle = cols[i % 6]; c.strokeStyle = OUT; c.lineWidth = 1.4;
      if (i % 3 === 0) { star(c, 0, 0, 6, 5, .5, 0); c.fill(); c.stroke(); } else { c.fillRect(-4, -2.5, 8, 5); c.strokeRect(-4, -2.5, 8, 5); }
      c.restore();
    }
  }
  if (mode === 'vamp') {
    for (let i = 0; i < 9; i++) { // fireflies
      const x = 60 + rnd(i) * 430 + Math.sin(wall * .5 + i * 2) * 24, y = 200 + rnd(i + 4) * 120 + Math.cos(wall * .7 + i) * 14, a = .5 + .5 * Math.sin(wall * 2.2 + i * 1.9);
      c.globalAlpha = a * .9; const g = c.createRadialGradient(x, y, 0, x, y, 9); g.addColorStop(0, 'rgba(230,255,140,1)'); g.addColorStop(1, 'rgba(230,255,140,0)'); c.fillStyle = g; c.fillRect(x - 9, y - 9, 18, 18);
    }
    c.globalAlpha = 1;
    if (st.cycle >= 2 && b > 12.6 && b < 14) { const u = (b - 12.6) / 1.4; c.strokeStyle = 'rgba(255,255,255,' + (1 - u) + ')'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(80 + u * 190, 30 + u * 70); c.lineTo(40 + u * 190, 15 + u * 70); c.stroke(); }
  }
  /* ---- speech ---- */
  if (T && mode !== 'title') {
    const say = (tr, x, y, tail, hold, over) => { const q = tr.bub(b, hold); if (!q) return; const tx = over || q.e.bub; drawBubble(c, x, y, tx[0], tx[1], tail, q.age * BEAT, ts); };
    if (cow) say(T.cow, cow.x + 26, cow.y - 142 + cow.hop * .3, [cow.x + 10, cow.y - 112], .8);
    if (owls) say(T.owl, 208 + owls.dx, 80 + owls.dy, [132 + owls.dx, 66 + owls.dy], .9);
    if (bee) say(T.bee, bee.x - 40, bee.y + 62, [bee.x - 10, bee.y + 14], .9);
    if (duck) say(T.duck, duck.x - 4, duck.y - 92, [duck.x - 22, duck.y - 62], mode === 'main' && b < 64 ? 1.6 : .7);
    if (lead.show && !lead.behind) {
      let over = null;
      if (mode === 'vamp') { const q = T.dino.bub(b, 1.2); if (q) over = VAMP_LINES[st.cycle % VAMP_LINES.length][q.e.vi]; }
      if (mode === 'fin' && b >= 8) over = ['RAWR!', FIN_LINES[Math.floor((b - 8) / 4) % FIN_LINES.length]];
      say(T.dino, lead.x + (lead.flip ? -22 : 22), lead.y - 150 + lead.hop * .5, [lead.x + (lead.flip ? -30 : 30), lead.y - 118 + lead.hop], mode === 'vamp' ? 1.2 : .75, over);
    }
  }
  c.restore();

  /* ---- furniture that sits on the glass: shakes with the window but doesn't zoom ---- */
  c.save(); c.translate(shx, shy);
  if (mode === 'main' && b < 7.1) drawDialup(c, b, wall, ts);
  if (mode === 'title') drawTitle(c, st, 0);
  if (mode === 'main' && b < 1.3) drawTitle(c, st, ss(0, 1.3, b));
  if (mode === 'main' && b >= 8 && b < 17.5) { const e = T.narr.e[0]; if (e) drawSubs(c, e, (b - 8) * BEAT, ts); }
  if (mode === 'vamp') {
    if (st.raw >= 9 && !st.sent) {
      const dots = '.'.repeat(1 + Math.floor(wall * 2.2) % 3), f = 'italic ' + Math.round(10.5 * ts) + 'px ' + F_UI, s = NAMES.moon + ' is typing' + dots;
      c.font = f; const w = c.measureText(NAMES.moon + ' is typing...').width + 16 * ts, x = Math.min(W - 8 - w, 432 - w / 2), y = 122;
      rr(c, x, y, w, 19 * ts, 9 * ts); fs(c, 'rgba(255,255,255,.92)', '#2a2358', 2); txt(c, s, x + 8 * ts, y + 10 * ts, f, '#3d3566', null, 0, 'left');
    }
  }
  if (st.sent && (mode === 'vamp' || (mode === 'fin' && b < 4.5))) {
    const u = st.wall - st.sent.wall, y = lerp(H + 60, H - 12, back(u / .45)) + (mode === 'fin' ? ss(3.5, 4.5, b) * 90 : 0);
    const said = st.sent.text, isRawr = /^\s*r+a+w+r+/i.test(said);
    drawBubble(c, ts > 1 ? 140 : 275, y, 'you: ' + said, isRawr ? null : 'in dinosaur: rawr', null, u, ts, { fill: '#fff6fb' }); // clear of the toasts when text is large
  }
  if (mode === 'fin' && b >= 26) drawMarquee(c, st.t, ts, MARQUEE);
  if (T && T.cues && mode !== 'title') {
    const act = T.cues.filter(q => q.k === 'toast' && b >= q.b && b < q.b + q.life);
    let lift = mode === 'fin' && b >= 26 ? 20 * ts : 0; // newest at the bottom, older ones stacked above; clear of the ticker
    for (let i = act.length - 1; i >= 0; i--) {
      const q = act[i], x = b - q.b, L = q.life, slide = Math.min(back(x / .35), 1 - ss(L - .45, L, x));
      const name = q.who === 'you' ? '★ YOU ★' : NAMES[q.who] + (q.who === 'owl' ? ' + 1' : '');
      const line = q.who === 'you' && mode === 'main' ? 'r now online' : q.io === 'in' ? 'has just signed in' : 'has signed out';
      drawToast(c, { name, line, io: q.io, extra: q.extra }, slide, lift, ts);
      lift += ((q.extra ? 54 : 43) * ts + 4) * sat(slide);
    }
  }
  // flashes on the drops (kept gentle)
  let fl = 0;
  if (mode === 'main') fl = Math.max(b >= 16 && b < 17 ? 1 - (b - 16) : 0, b >= 64 && b < 65 ? 1 - (b - 64) : 0) * .5;
  if (mode === 'fin') fl = b >= 7.5 && b < 8 ? ss(7.5, 8, b) * .9 : b >= 8 && b < 9.5 ? (1 - (b - 8) / 1.5) * .9 : 0;
  if (fl > 0) { c.fillStyle = 'rgba(255,255,255,' + (fl * (rm ? 1 : .4)) + ')'; c.fillRect(-40, -40, W + 80, H + 80); }
  c.restore();
}
