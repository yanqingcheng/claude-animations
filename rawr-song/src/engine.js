/* ===== engine: the score and the synth band ===== */
const BPM = 140, BEAT = 60 / BPM, BAR = BEAT * 4, SR = 44100, PRE = 0.25;
const SEC_TAIL = 3;
const SAMK = 6803.3; // SAM: f0 = SAMK / pitch
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const CH = {
  C:  { root: 36, tri: [55, 60, 64] },
  G:  { root: 43, tri: [55, 59, 62] },
  Am: { root: 45, tri: [57, 60, 64] },
  F:  { root: 41, tri: [57, 60, 65] },
};
const PROG = ['C', 'G', 'Am', 'F'];
// the hook: per bar, [eighth-slot, length in eighths, midi]
const HOOK = [
  [[0, 2, 67], [2, 2, 67], [4, 1, 64], [5, 1, 67], [6, 2, 72]],
  [[0, 2, 71], [2, 2, 67], [4, 4, 74]],
  [[0, 2, 72], [2, 2, 72], [4, 1, 69], [5, 1, 72], [6, 2, 76]],
  [[0, 2, 74], [2, 2, 72], [4, 4, 69]],
  [[0, 2, 67], [2, 2, 67], [4, 1, 64], [5, 1, 67], [6, 2, 72]],
  [[0, 2, 71], [2, 2, 67], [4, 4, 74]],
  [[0, 2, 72], [2, 2, 72], [4, 1, 69], [5, 1, 72], [6, 2, 76]],
  [[0, 1, 72], [1, 1, 72], [2, 2, 72], [4, 1, 74], [5, 1, 74], [6, 2, 74]],
];
// a harmony line under the hook, chord tones a third or fourth below (finale only)
const HARM = [[64, 64, 60, 64, 67], [67, 62, 71], [69, 69, 64, 69, 72], [69, 69, 65], [64, 64, 60, 64, 67], [67, 62, 71], [69, 69, 64, 69, 72], [69, 69, 69, 71, 71, 71]];
// lead synth answers while the dinosaurs hold a long note: [sixteenth-slot, length, midi]
const LEADFILL = {
  1: [[8, 2, 86], [10, 1, 83], [11, 1, 79], [12, 2, 83], [14, 2, 86]],
  3: [[8, 2, 81], [10, 1, 84], [11, 1, 81], [12, 2, 77], [14, 2, 79]],
  5: [[8, 2, 86], [10, 1, 88], [11, 1, 86], [12, 2, 83], [14, 2, 79]],
};
const ARP_STEPS = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3];

const NAMES = {
  dino: 'xX_RaWrSaUrUs_Xx', duck: 'QuAcKeRz_2k6', cow: '~*m00_c0w*~',
  owl: 'o_rly_owl', bee: 'bUzZ_bUzZ_x', moon: 'keith_the_moon',
};

function mkScore() {
  const yrs = Math.max(1, new Date().getFullYear() - 2007);
  const P = (arr, o) => { arr.push(o); return o; };
  const main = [], vamp = [], fin = [];
  const cMain = [], cVamp = [], cFin = [];

  function roll(ev, b0, b1, v0 = .25, v1 = 1) {
    const span = b1 - b0;
    let b = b0;
    while (b < b1 - 1e-6) {
      const p = (b - b0) / span;
      const step = p < .4 ? .5 : p < .8 ? .25 : .125;
      P(ev, { k: 'snare', b, v: v0 + (v1 - v0) * p });
      b += step;
    }
  }

  function chorus(ev, b0, o) {
    const tr = o.tr || 0;
    for (let i = 0; i < o.bars; i++) {
      const b = b0 + i * 4, j = i % 8, last = j === 7;
      const halves = last ? [['F', 0, 2], ['G', 2, 2]] : [[PROG[j % 4], 0, 4]];
      for (let q = 0; q < 4; q++) {
        P(ev, { k: 'kick', b: b + q, v: 1, duck: 1 });
        P(ev, { k: 'ho', b: b + q + .5, v: 1 });
        P(ev, { k: 'hc', b: b + q + .25, v: .55 });
        P(ev, { k: 'hc', b: b + q + .75, v: .75 });
      }
      P(ev, { k: 'clap', b: b + 1, v: 1 });
      P(ev, { k: 'clap', b: b + 3, v: 1 });
      for (const [ch, off, len] of halves) {
        const c = CH[ch];
        for (let s = 0; s < len * 2; s++)
          P(ev, { k: 'bass', b: b + off + s * .5, d: .4, m: c.root + tr + (s % 2 ? 12 : 0), v: s % 2 ? 1 : .85 });
        if (o.pad) P(ev, { k: 'pad', b: b + off, d: len - .06, m: [...c.tri, c.tri[0] + 12].map(x => x + tr), v: o.pad });
        if (o.stab) for (const s of [0, 3, 6, 8, 11, 14]) {
          const sb = s / 4;
          if (sb >= off && sb < off + len) P(ev, { k: 'stab', b: b + sb, d: .2, m: c.tri.map(x => x + tr), v: o.stab });
        }
        if (o.arp) {
          const pool = [c.tri[1] + 12, c.tri[2] + 12, c.tri[0] + 24, c.tri[1] + 24];
          for (let s = off * 4; s < (off + len) * 4; s++)
            P(ev, { k: 'arp', b: b + s / 4, d: .2, m: pool[ARP_STEPS[s]] + tr, v: o.arp, pan: s % 2 ? .6 : -.6 });
        }
      }
      const L = typeof o.layers === 'function' ? o.layers(i) : o.layers;
      if (L) HOOK[j].forEach(([s, len, m], n) =>
        P(ev, { k: 'vox', who: 'dino', w: 'rawr', b: b + s / 2, d: len / 2, m: m + tr, hm: o.harm ? HARM[j][n] + tr : undefined, layers: L, v: 1, bub: o.bub || ['RAWR!', 'i love you'] }));
      const lead = typeof o.lead === 'function' ? o.lead(i) : o.lead;
      if (lead) {
        const fillN = LEADFILL[j];
        for (const [s, len, m] of HOOK[j]) {
          if (fillN && s >= 4) continue;
          P(ev, { k: 'lead', b: b + s / 2, d: len / 2 * .92, m: m + 12 + tr, v: lead });
        }
        if (fillN) for (const [s, len, m] of fillN) P(ev, { k: 'lead', b: b + s / 4, d: len / 4 * .9, m: m + tr, v: lead * .9 });
      }
      if (last && o.fill) for (let n = 0; n < 8; n++) P(ev, { k: 'snare', b: b + 2 + n * .25, v: .3 + .6 * n / 7 });
    }
    if (o.crash) P(ev, { k: 'crash', b: b0, v: 1 });
  }

  // the rest of the chatroom, bar by bar
  function animals(ev, b0, i, tr, full, o = {}) {
    const b = b0 + i * 4, j = i % 8;
    if (o.cow !== false) P(ev, { k: 'vox', who: 'cow', w: 'moo', b, d: 2, m: [48, 47, 45, 45][j % 4] + tr, v: 1, bub: ['MOO', 'brb'] });
    const dm = [64, 62, 64, 65][j % 4] + tr;
    if (o.duck !== false) {
      if (full) P(ev, { k: 'vox', who: 'duck', w: 'quack', b: b + 1.5, d: .5, m: dm, v: .85, bub: ['QUACK', 'lol'] });
      P(ev, { k: 'vox', who: 'duck', w: 'quack', b: b + 3.5, d: .5, m: dm, v: 1, bub: ['QUACK', 'lol'] });
    }
    if (o.owl !== false) {
      if (j === 1 || j === 5) {
        P(ev, { k: 'vox', who: 'owl1', w: 'hoo', b: b + 2, d: .9, m: 71 + tr, bend: 1.15, v: 1, bub: ['HOO?', 'o rly?'] });
        P(ev, { k: 'vox', who: 'owl2', w: 'hoo', b: b + 3, d: .9, m: 67 + tr, bend: .9, v: 1, bub: ['HOO.', 'ya rly.'] });
      }
      if (j === 3) {
        P(ev, { k: 'vox', who: 'owl1', w: 'hoo', b: b + 2, d: 1.6, m: 72 + tr, v: 1, bub: ['HOO!!', 'NO WAI!!'] });
        P(ev, { k: 'vox', who: 'owl2', w: 'hoo', b: b + 2, d: 1.6, m: 65 + tr, v: 1, bub: ['HOO!!', 'NO WAI!!'] });
      }
    }
    if (full && o.bee !== false && (j === 4 || j === 6 || (o.beeAll && (j === 0 || j === 2))))
      P(ev, { k: 'buzz', b: b + 1, d: .5, tr, v: 1, bub: ['BZZ', '*nudge*'] });
  }

  /* ---------- MAIN: intro 0-16, a1 16-48, b 48-64, a2 64-96, c 96-128 ---------- */
  P(main, { k: 'modem', b: 0 });
  P(main, { k: 'chimeIn', b: 6, m: [79, 84, 88], v: 1 });
  P(main, { k: 'spad', b: 8, d: 8, m: [55, 59, 62, 67], v: .9, atk: 2.2 });
  for (let q = 0; q < 8; q++) P(main, { k: 'kick', b: 8 + q, v: .4 + .075 * q });
  for (let q = 0; q < 4; q++) P(main, { k: 'ho', b: 12.5 + q, v: .8 });
  roll(main, 13, 16);
  P(main, { k: 'riser', b: 12, d: 4, v: 1 });
  P(main, {
    k: 'vox', who: 'narr', b: 8, d: 7, v: 1,
    parts: [['"rawr"', 'RAO4R'], ['means', 'MIY4NZ'], ['"i', 'AY4'], ['love', 'LAH5V'], ['you"', 'YUW4,'], ['in', 'IHN'], ['dinosaur.', 'DAY4NAXSAOR.']],
  });

  chorus(main, 16, { bars: 8, pad: .55, stab: .9, layers: i => 1 + (i >> 1), crash: 1, fill: 1 });
  for (const b of [24, 32, 40]) P(main, { k: 'pop', b, v: 1 });

  // B: the duck
  P(main, { k: 'crash', b: 48, v: .7 });
  P(main, { k: 'kick', b: 48, v: 1 }); P(main, { k: 'kick', b: 50, v: .9 });
  P(main, { k: 'kick', b: 52, v: .9 }); P(main, { k: 'kick', b: 54, v: .9 });
  for (let s = 0; s < 14; s++) P(main, { k: 'hc', b: 48 + s * .5, v: .7 });
  P(main, { k: 'bass', b: 48, d: 3.6, m: 41, v: .9 });
  P(main, { k: 'bass', b: 52, d: 2.9, m: 43, v: .9 });
  P(main, { k: 'spad', b: 48, d: 3.9, m: [57, 60, 65], v: .8, atk: .1 });
  P(main, { k: 'spad', b: 52, d: 2.95, m: [55, 59, 62], v: .8, atk: .1 });
  P(main, { k: 'vox', who: 'duck', w: 'quack', b: 50, d: 1, m: 69, v: 1, bub: ['QUACK', 'lol'] });
  P(main, { k: 'vox', who: 'dino', w: 'rawr', b: 52, d: 1.5, m: 71, bend: 1.19, layers: 1, v: 1, bub: ['RAWR?', 'i love you?'] });
  P(main, { k: 'vox', who: 'duck', w: 'quack', b: 54, d: .9, m: 67, bend: .88, v: 1, bub: ['QUACK.', 'k.'] });
  P(main, { k: 'scratch', b: 55, v: 1 });
  P(main, { k: 'cricket', b: 56.5, v: 1 }); P(main, { k: 'cricket', b: 57.4, v: .8 });
  P(main, { k: 'slide', b: 56.75, d: 1.1, v: 1 });
  P(main, { k: 'sparkle', b: 58, v: 1 });
  P(main, { k: 'vox', who: 'duck', w: 'quack', b: 58, d: .5, m: 67, v: 1, bub: ['QUACK QUACK!', 'jk!! ily2 :P'] });
  P(main, { k: 'vox', who: 'duck', w: 'quack', b: 58.5, d: .75, m: 72, v: 1, bub: ['QUACK QUACK!', 'jk!! ily2 :P'] });
  for (let q = 0; q < 4; q++) P(main, { k: 'kick', b: 60 + q, v: .7 + .1 * q });
  for (let s = 0; s < 8; s++) P(main, { k: 'bass', b: 60 + s * .5, d: .4, m: 43 + (s % 2 ? 12 : 0), v: .9 });
  P(main, { k: 'stab', b: 60, d: .3, m: [55, 59, 62], v: 1 });
  roll(main, 61, 64);
  P(main, { k: 'riser', b: 60, d: 4, v: 1 });
  P(main, { k: 'vox', who: 'dino', w: 'rawr', b: 60, d: 1.5, m: 74, layers: 2, v: 1, bub: ['RAWR!!', 'I LOVE YOU!!1!'] });
  P(main, { k: 'chimeIn', b: 61, m: [79, 83], v: .7 });
  P(main, { k: 'chimeIn', b: 62, m: [83, 86], v: .7 });
  P(main, { k: 'chimeIn', b: 63, m: [86, 91], v: .7 });

  // A2: the whole chatroom
  chorus(main, 64, { bars: 8, pad: 1, stab: .5, layers: i => i < 4 ? 3 : 4, lead: i => i >= 4 ? 1 : 0, crash: 1, fill: 1 });
  for (let i = 0; i < 8; i++) animals(main, 64, i, 0, i >= 4);

  // C: everyone signs off
  const cB = 96;
  P(main, { k: 'crash', b: cB, v: .5 });
  for (let i = 0; i < 8; i++) {
    const b = cB + i * 4, ch = i === 7 ? 'F' : PROG[i % 4], c = CH[ch];
    if (i < 2) { P(main, { k: 'kick', b, v: .9 }); P(main, { k: 'kick', b: b + 2, v: .8 }); for (let q = 0; q < 4; q++) P(main, { k: 'hc', b: b + q + .5, v: .7 }); }
    else if (i < 4) P(main, { k: 'kick', b, v: .75 });
    if (i < 4) P(main, { k: 'bass', b, d: 3.7, m: c.root, v: .8 });
    P(main, { k: 'spad', b, d: 3.98, m: [...c.tri, c.tri[0] + 12], v: i < 6 ? 1 : .85, atk: .25 });
  }
  for (let i = 0; i < 4; i++) for (const [s, len, m] of HOOK[i])
    P(main, { k: 'box', b: cB + i * 4 + s / 2, d: len / 2, m: m + 12, v: .72 });
  [[79, 76], [74, 71], [72, 69], [69, null]].forEach(([a, b2], i) => {
    const b = cB + 16 + i * 4;
    P(main, { k: 'box', b, d: 2, m: a, v: .85 });
    if (b2) P(main, { k: 'box', b: b + 2, d: 2, m: b2, v: .8 });
  });
  P(main, { k: 'buzz', b: cB, d: .45, tr: 0, v: .8, bub: ['BZZ', 'g2g bye xx'], soft: 1 });
  P(main, { k: 'chimeOut', b: cB + 2, m: [79, 72], v: 1 });
  P(main, { k: 'vox', who: 'dino', w: 'rawr', b: cB + 4, d: 1.5, m: 67, layers: 1, v: 1.1, bub: ['rawr', 'i love you'] });
  P(main, { k: 'vox', who: 'owl1', w: 'hoo', b: cB + 8, d: .7, m: 72, v: 1, bub: ['HOO', 'g2g, school 2moz'] });
  P(main, { k: 'vox', who: 'owl2', w: 'hoo', b: cB + 8.75, d: .9, m: 69, v: 1, bub: ['HOO', 'g2g, school 2moz'] });
  P(main, { k: 'chimeOut', b: cB + 10, m: [76, 69], v: 1 });
  P(main, { k: 'vox', who: 'dino', w: 'rawr', b: cB + 12, d: 1.5, m: 65, layers: 1, v: 1.05, bub: ['rawr', 'i love you'] });
  P(main, { k: 'vox', who: 'duck', w: 'quack', b: cB + 16, d: .9, m: 64, v: 1, bub: ['QUACK', 'g2g, mum needs the phone'] });
  P(main, { k: 'chimeOut', b: cB + 18, m: [79, 72], v: 1 });
  P(main, { k: 'vox', who: 'dino', w: 'rawr', b: cB + 20, d: 1.5, m: 62, layers: 1, v: 1, bub: ['rawr', 'i love you'] });
  P(main, { k: 'chimeIn', b: cB + 22, m: [81, 88], v: .5 });
  P(main, { k: 'vox', who: 'cow', w: 'moo', b: cB + 24, d: 2, m: 45, v: 1, bub: ['MOO', "brb, tea's ready"] });
  P(main, { k: 'chimeOut', b: cB + 26.5, m: [76, 69], v: 1 });
  P(main, { k: 'vox', who: 'dino', w: 'rawr', b: cB + 28, d: 3, m: 60, bend: .94, layers: 1, v: .95, bub: ['rawr…', 'i love you…'] });

  /* ---------- VAMP: 8 bars rendered, the last 4 loop ---------- */
  const VP = ['Am', 'F', 'C', 'G'];
  const VARP = { Am: [81, 84, 88, 84], F: [81, 84, 89, 84], C: [79, 84, 88, 84], G: [79, 83, 86, 83] };
  for (let i = 0; i < 8; i++) {
    const b = i * 4, ch = VP[i % 4], c = CH[ch];
    P(vamp, { k: 'spad', b, d: 3.98, m: [...c.tri, c.tri[0] + 12], v: .9, atk: .3 });
    P(vamp, { k: 'bass', b, d: 3.5, m: c.root + 12, v: .35, soft: 1 });
    VARP[ch].forEach((m, q) => P(vamp, { k: 'box', b: b + q, d: 1, m, v: q === 0 ? .8 : .6 }));
    P(vamp, { k: 'kick', b, v: .32, soft: 1 }); P(vamp, { k: 'kick', b: b + .6, v: .22, soft: 1 });
    if (i % 4 === 1) P(vamp, { k: 'cricket', b: b + 2.5, v: 1 });
    if (i % 4 === 3) { P(vamp, { k: 'cricket', b: b + 1.5, v: .9 }); P(vamp, { k: 'cricket', b: b + 3, v: .7 }); }
    if (i % 4 === 0) P(vamp, { k: 'vox', who: 'dino', w: 'rawr', b: b + 2, d: 1.5, m: 69, bend: 1.12, layers: 1, v: 1, bub: ['rawr?', 'i love you?'], vi: 0 });
    if (i % 4 === 2) P(vamp, { k: 'vox', who: 'dino', w: 'rawr', b: b + 2, d: 1.6, m: 64, bend: .94, layers: 1, v: .85, bub: ['rawr.', 'i love you.'], vi: 1 });
  }

  /* ---------- FINALE: f0 0-8 (the build), f1 8-40, f2 40-72 (loops forever) ---------- */
  const T = 2;
  P(fin, { k: 'chimeIn', b: 0, m: [74 + T, 79 + T, 83 + T, 86 + T], v: 1.2 });
  P(fin, { k: 'kick', b: 0, v: 1 }); P(fin, { k: 'crash', b: 0, v: .8 });
  P(fin, { k: 'spad', b: 0, d: 7.4, m: [55 + T, 59 + T, 62 + T, 67 + T], v: 1.1, atk: 3 });
  P(fin, { k: 'pad', b: 4, d: 3.4, m: [55 + T, 59 + T, 62 + T, 67 + T], v: .9, atk: 1.2 });
  P(fin, { k: 'riser', b: 0, d: 7.5, v: 1.2 });
  roll(fin, 1, 7.5, .2, 1);
  for (let q = 0; q < 4; q++) P(fin, { k: 'kick', b: 4 + q, v: .6 + .12 * q });
  for (let s = 0; s < 7; s++) P(fin, { k: 'bass', b: 4 + s * .5, d: .4, m: 43 + T + (s % 2 ? 12 : 0), v: .9 });
  P(fin, { k: 'vox', who: 'dino', w: 'rawr', b: 5, d: 2.4, m: 67 + T, bend: 1.335, layers: 4, v: 1.1, bub: ['RAAAWR!!!', 'I LOVE YOU!!!1!one!'] });
  chorus(fin, 8, { tr: T, bars: 16, pad: 1, stab: .5, layers: 4, lead: 1, arp: 1, fill: 1, harm: 1 });
  P(fin, { k: 'crash', b: 8, v: 1.2 }); P(fin, { k: 'crash', b: 24, v: .8 }); P(fin, { k: 'crash', b: 40, v: 1 }); P(fin, { k: 'crash', b: 56, v: .8 });
  // f1: everyone comes back, one per bar
  P(fin, { k: 'chimeIn', b: 9.5, m: [79 + T, 84 + T], v: .7 });
  P(fin, { k: 'vox', who: 'duck', w: 'quack', b: 10, d: .9, m: 64 + T, v: 1, bub: ['QUACK!', 'lol hi again'] });
  P(fin, { k: 'vox', who: 'duck', w: 'quack', b: 11.5, d: .5, m: 64 + T, v: 1, bub: ['QUACK!', 'lol hi again'] });
  P(fin, { k: 'vox', who: 'cow', w: 'moo', b: 12, d: 2.6, m: 47 + T, v: 1.1, bub: ['MOO!', 'back!! soz, that took ' + yrs + ' yrs'] });
  P(fin, { k: 'chimeIn', b: 15.5, m: [81 + T, 84 + T], v: .7 });
  P(fin, { k: 'vox', who: 'owl1', w: 'hoo', b: 16.5, d: .5, m: 72 + T, v: 1, bub: ['HOO!', 'ya rly. we r back'] });
  P(fin, { k: 'vox', who: 'owl2', w: 'hoo', b: 17, d: .9, m: 69 + T, v: 1, bub: ['HOO!', 'ya rly. we r back'] });
  P(fin, { k: 'buzz', b: 21, d: .5, tr: T, v: 1, bub: ['BZZ!', '*nudge* *nudge*'] });
  P(fin, { k: 'vox', who: 'duck', w: 'quack', b: 15.5, d: .5, m: 62 + T, v: 1, bub: ['QUACK', 'lol'] });
  P(fin, { k: 'vox', who: 'duck', w: 'quack', b: 19.5, d: .5, m: 64 + T, v: 1, bub: ['QUACK', 'lol'] });
  P(fin, { k: 'vox', who: 'duck', w: 'quack', b: 23.5, d: .5, m: 65 + T, v: 1, bub: ['QUACK', 'lol'] });
  P(fin, { k: 'vox', who: 'cow', w: 'moo', b: 20, d: 2, m: 45 + T, v: 1, bub: ['MOO', 'brb'] });
  for (let i = 4; i < 8; i++) animals(fin, 8, i, T, true);
  for (let i = 0; i < 8; i++) animals(fin, 40, i, T, true, { beeAll: 1 });

  /* ---------- visual cues ---------- */
  const toast = (arr, b, who, io, life, extra) => arr.push({ k: 'toast', b, who, io, life: life || 3.6, extra });
  toast(cMain, 6, 'you', 'in');
  toast(cMain, 61, 'cow', 'in', 2.4); toast(cMain, 62, 'owl', 'in', 2.4); toast(cMain, 63, 'bee', 'in', 2.6);
  toast(cMain, cB + 2, 'bee', 'out'); toast(cMain, cB + 10, 'owl', 'out');
  toast(cMain, cB + 18, 'duck', 'out'); toast(cMain, cB + 22, 'moon', 'in', 3.4); toast(cMain, cB + 26.5, 'cow', 'out');
  toast(cFin, 0, 'you', 'in', 3.6, '(last seen: 2007)'); toast(cFin, 3.7, 'moon', 'out', 3.6, '(was still typing)');
  toast(cFin, 9.5, 'duck', 'in', 3); toast(cFin, 12, 'cow', 'in', 3.4); toast(cFin, 15.5, 'owl', 'in'); toast(cFin, 20.5, 'bee', 'in');

  // so syllables that start exactly on the loop point keep their run-up when the loop wraps
  const ghost = (ev, a, z) => { for (const e of ev.slice()) if (e.k === 'vox' && e.b >= a && e.b < a + 0.01) ev.push({ ...e, b: e.b + (z - a), ghost: 1 }); };
  ghost(fin, 40, 72);

  return {
    yrs,
    main: { name: 'main', beats: 128, ev: main, cues: cMain },
    vamp: { name: 'vamp', beats: 32, loop: [16, 32], ev: vamp, cues: cVamp },
    fin: { name: 'fin', beats: 72, loop: [40, 72], ev: fin, cues: cFin },
  };
}

/* ===== voices ===== */
const WORDS = {
  rawr:  { pre: 'R',  vow: 'AO', post: 'R', a: .180, b: .1270, ant: .060 },
  quack: { pre: 'KW', vow: 'AE', post: 'K', a: .286, b: .0846, ant: .120 },
  moo:   { pre: 'M',  vow: 'UX', post: 'W', a: .190, b: .1058, ant: .070 },
  hoo:   { pre: '/H', vow: 'UX', post: 'W', a: .169, b: .1058, ant: .050 },
};
const DINO_LAYERS = [
  { c: 1.5,  cents: 0,  pan: 0,    dl: 0,    g: 1 },
  { c: 1.36, cents: 9,  pan: .5,   dl: .013, g: .6, side: 1 },
  { c: 1.66, cents: -8, pan: -.5,  dl: .021, g: .6, side: 1 },
  { c: 1.05, cents: 3,  pan: -.1,  dl: .007, g: .7, oct: -12 },
];
const VOICE = {
  duck: { c: 1.3,  mouth: 190, throat: 190 },
  cow:  { c: .82,  mouth: 128, throat: 128 },
  owl1: { c: 1.22, mouth: 160, throat: 110 },
  owl2: { c: 1.08, mouth: 160, throat: 110 },
};

function prepareVox(score, Sam, mkBuf) {
  const cache = new Map();
  const render = (phon, opt) => {
    const key = phon + '|' + opt.pitch + '|' + opt.speed + '|' + (opt.mouth || 128) + '|' + (opt.throat || 128) + '|' + (opt.singmode ? 1 : 0);
    let b = cache.get(key);
    if (b === undefined) {
      let f = null;
      try { f = new Sam(opt).buf32(phon, true); } catch (e) { f = null; }
      b = f && f.length ? mkBuf(f) : null;
      cache.set(key, b);
    }
    return b;
  };
  const sung = (e, voice) => {
    const W = WORDS[e.w];
    const f = hz((voice.side && e.hm ? e.hm : e.m) + (voice.oct || 0)) * Math.pow(2, (voice.cents || 0) / 1200);
    const pitch = clamp(Math.round(SAMK * voice.c / f), 8, 120);
    const rate = f * pitch / SAMK;
    const real = e.d * BEAT * (e.d <= .5 ? .96 : .92);
    const T = real * rate * (e.bend ? .3 + .7 * (1 + e.bend) / 2 : 1);
    const n = clamp(Math.round((T - W.a) / W.b), 1, 16);
    const speed = clamp(Math.round(72 * T / (W.a + W.b * n)), 40, 130);
    const buf = render(W.pre + W.vow.repeat(n) + W.post, { pitch, speed, mouth: voice.mouth || 128, throat: voice.throat || 128, singmode: true });
    return buf && { buf, rate, ant: W.ant * speed / 72 / rate, real, g: voice.g || 1, pan: voice.pan || 0, dl: voice.dl || 0 };
  };
  let ok = true;
  for (const sec of [score.main, score.vamp, score.fin]) for (const e of sec.ev) {
    if (e.k !== 'vox') continue;
    if (e.who === 'narr') {
      const opt = { pitch: 64, speed: 74, singmode: false };
      const buf = render(e.parts.map(p => p[1]).join(' '), opt);
      if (!buf) { ok = false; continue; }
      let acc = ''; const wt = [0];
      for (const p of e.parts) { acc += (acc ? ' ' : '') + p[1]; let f = null; try { f = new Sam(opt).buf32(acc, true); } catch (x) {} wt.push(f ? f.length / 22050 : wt[wt.length - 1] + .3); }
      e.wordT = wt;
      e.plays = [{ buf, rate: 1, ant: 0, real: buf.duration, g: 1, pan: 0, dl: 0 }];
      continue;
    }
    const voices = e.who === 'dino' ? DINO_LAYERS.slice(0, e.layers || 1) : [VOICE[e.who]];
    const plays = voices.map(v => sung(e, v)).filter(Boolean);
    if (!plays.length) ok = false; else e.plays = plays;
  }
  return ok;
}

/* ===== the rig ===== */
const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
const shared = {};
function sharedBufs() {
  if (shared.noise) return shared;
  const tmp = shared.tmp = new OAC(1, 1, SR);
  const nb = shared.noise = tmp.createBuffer(1, SR * 2, SR), nd = nb.getChannelData(0);
  let s = 22222;
  for (let i = 0; i < nd.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; nd[i] = s / 2147483648 - 1; }
  return shared;
}
function mkWave(ctx, fn) {
  const n = 40, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) fn(k, re, im);
  return ctx.createPeriodicWave(re, im);
}
const LEVEL = {
  master: .6,
  kick: .9, clap: .6, snare: .36, hat: .2, crash: .2,
  bass: .36, pad: .1, stab: .12, lead: .14, arp: .07, box: .26, spad: .1,
  dino: .9, duck: .66, cow: .95, owl: .66, narr: 1.15, fx: .6,
  rev: .5, del: .5,
};
const SEND = { // [reverb, delay]
  clap: [.12, 0], snare: [.1, 0], crash: [.2, 0], pad: [.15, 0], stab: [.12, .1], lead: [.14, .22], arp: [.1, .25],
  box: [.35, .12], spad: [.3, 0], dino: [.13, .07], duck: [.1, 0], cow: [.12, 0], owl: [.2, .1], narr: [.08, 0], fx: [.15, 0],
};
function mkRig(ctx, opt) {
  opt = opt || {};
  const solo = opt.solo, sh = sharedBufs();
  const R = { ctx, s: {}, w: {}, rnd: 1, noise: sh.noise };
  const G = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const F = (type, f, q, to) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q; if (to) n.connect(to); return n; };
  const Pn = (p, to) => { if (!p || !ctx.createStereoPanner) return G(1, to); const n = ctx.createStereoPanner(); n.pan.value = p; if (to) n.connect(to); return n; };
  R.G = G; R.F = F;
  const explicit = (g, n) => { g.channelCount = n; g.channelCountMode = 'explicit'; return g; };
  R.dry = explicit(G(LEVEL.master), 2);
  R.rev = explicit(G(LEVEL.master), 1);
  R.del = explicit(G(LEVEL.master), 1);
  if (opt.live) R.dry.connect(opt.out || ctx.destination);
  else {
    const mg = ctx.createChannelMerger(4), sp = ctx.createChannelSplitter(2);
    mg.connect(ctx.destination);
    R.dry.connect(sp); sp.connect(mg, 0, 0); sp.connect(mg, 1, 1);
    R.rev.connect(mg, 0, 2); R.del.connect(mg, 0, 3);
  }
  R.duck = G(1, R.dry);
  // everything below is built the first time a note asks for it: idle nodes cost render time
  const memo = {};
  const lazy = (key, fn) => () => memo[key] || (memo[key] = fn());
  const group = (name, toDuck) => lazy('g:' + name, () => {
    const on = !solo || solo.includes(name);
    const out = G(on ? LEVEL[name] : 0, toDuck ? R.duck : R.dry), sd = SEND[name];
    if (sd && sd[0]) out.connect(G(sd[0], R.rev));
    if (sd && sd[1]) out.connect(G(sd[1], R.del));
    return out;
  });
  const g = {};
  for (const n of ['kick', 'clap', 'snare', 'hat', 'crash', 'stab', 'lead', 'arp', 'box', 'spad', 'dino', 'duck', 'cow', 'owl', 'narr', 'fx']) g[n] = group(n);
  g.bass = group('bass', true); g.pad = group('pad', true);
  const padIn = lazy('padIn', () => F('lowpass', 2600, .5, g.pad()));
  const arpIn = lazy('arpIn', () => F('highpass', 500, .5, g.arp()));
  const spadIn = lazy('spadIn', () => F('lowpass', 1300, .5, g.spad()));
  const dinoIn = lazy('dinoIn', () => F('highpass', 200, .6, F('lowpass', 7800, .5, g.dino())));
  const vx = (hp, lp, to, pan) => F('highpass', hp, .6, F('lowpass', lp, .5, pan ? Pn(pan, to) : to));
  const defs = {
    kick: () => g.kick(), click: () => F('highpass', 1800, .5, g.kick()),
    clap: () => F('bandpass', 1350, .9, F('highpass', 700, .5, g.clap())),
    snareN: () => F('bandpass', 2300, .6, g.snare()), snareT: () => g.snare(),
    hc: () => F('highpass', 9000, .7, g.hat()), ho: () => F('highpass', 7600, .7, g.hat()),
    crash: () => F('highpass', 5200, .5, g.crash()),
    bass: () => g.bass(),
    padL: () => Pn(-.7, padIn()), padC: () => padIn(), padR: () => Pn(.7, padIn()),
    stab: () => F('lowpass', 4200, .6, g.stab()), lead: () => F('lowpass', 7000, .5, g.lead()),
    arpL: () => Pn(-.6, arpIn()), arpR: () => Pn(.6, arpIn()),
    box: () => g.box(), spadL: () => Pn(-.5, spadIn()), spadR: () => Pn(.5, spadIn()),
    duck: () => vx(380, 5200, g.duck()), cow: () => vx(90, 4200, g.cow()),
    owl1: () => vx(250, 5200, g.owl(), -.35), owl2: () => vx(250, 5200, g.owl(), -.15),
    narr: () => vx(110, 6500, g.narr()), fx: () => g.fx(),
  };
  DINO_LAYERS.forEach((l, i) => { defs['dino' + i] = () => Pn(l.pan, dinoIn()); });
  R.S = n => R.s[n] || (R.s[n] = defs[n]());
  const waves = {
    p25: (k, re) => { re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * .25); },
    p12: (k, re) => { re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * .125); },
    bass: (k, re, im) => { im[k] = 2 / (Math.PI * k) * (k % 2 ? 1 : -1) + (k % 2 ? 2 / (Math.PI * k) : 0); },
  };
  R.W = n => R.w[n] || (R.w[n] = mkWave(ctx, waves[n]));
  return R;
}

/* ===== instruments ===== */
const I = {}, LIFE = {};
function nz(R, t, len, dest) {
  const n = R.ctx.createBufferSource(); n.buffer = R.noise;
  R.rnd = (R.rnd * 16807) % 2147483647;
  n.connect(dest); n.start(t, (R.rnd % 1000) / 1000 * (2 - len - .01), len + .01);
  return n;
}
function osc(R, type, f, t, end, dest) {
  const o = R.ctx.createOscillator();
  if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
  o.frequency.setValueAtTime(f, t); o.connect(dest); o.start(t); o.stop(end);
  return o;
}
LIFE.kick = () => .42;
I.kick = (R, t, e) => {
  const g = R.G(0, R.S('kick')), v = e.v;
  const o = osc(R, 'sine', e.soft ? 110 : 165, t, t + .42, g);
  o.frequency.exponentialRampToValueAtTime(e.soft ? 55 : 54, t + .085); o.frequency.exponentialRampToValueAtTime(42, t + .32);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .004); g.gain.setTargetAtTime(0, t + .07, .065);
  if (!e.soft) { const ng = R.G(0, R.S('click')); ng.gain.setValueAtTime(.3 * v, t); ng.gain.setTargetAtTime(0, t, .005); nz(R, t, .04, ng); }
};
LIFE.clap = () => .4;
I.clap = (R, t, e) => {
  const g = R.G(0, R.S('clap'));
  nz(R, t, .4, g);
  g.gain.setValueAtTime(0, t);
  for (let k = 0; k < 3; k++) { const tk = t + k * .011; g.gain.setValueAtTime(e.v, tk); g.gain.exponentialRampToValueAtTime(e.v * .2, tk + .009); }
  g.gain.setValueAtTime(e.v, t + .033); g.gain.setTargetAtTime(0, t + .034, .055);
};
LIFE.snare = () => .2;
I.snare = (R, t, e) => {
  const g = R.G(0, R.S('snareN'));
  nz(R, t, .2, g);
  g.gain.setValueAtTime(e.v, t); g.gain.setTargetAtTime(0, t + .004, .035);
  const g2 = R.G(0, R.S('snareT')), o = osc(R, 'triangle', 215, t, t + .15, g2);
  o.frequency.exponentialRampToValueAtTime(150, t + .06);
  g2.gain.setValueAtTime(e.v * .7, t); g2.gain.setTargetAtTime(0, t + .003, .028);
};
LIFE.hc = () => .09; LIFE.ho = () => .31; LIFE.crash = () => 2;
I.hc = (R, t, e) => { const g = R.G(0, R.S('hc')); nz(R, t, .08, g); g.gain.setValueAtTime(e.v, t); g.gain.setTargetAtTime(0, t + .002, .012); };
I.ho = (R, t, e) => { const g = R.G(0, R.S('ho')); nz(R, t, .3, g); g.gain.setValueAtTime(e.v * 1.25, t); g.gain.setTargetAtTime(0, t + .004, .05); };
I.crash = (R, t, e) => { const g = R.G(0, R.S('crash')); nz(R, t, 1.9, g); g.gain.setValueAtTime(e.v, t); g.gain.setTargetAtTime(0, t + .01, .42); };
LIFE.bass = e => e.d * BEAT + .15;
I.bass = (R, t, e) => {
  const f = hz(e.m), end = t + e.d * BEAT, g = R.G(0, R.S('bass'));
  const lp = R.F('lowpass', 400, e.soft ? .7 : 3, g);
  const top = e.soft ? Math.min(900, f * 5) : Math.min(3400, f * 16);
  lp.frequency.setValueAtTime(top, t); lp.frequency.setTargetAtTime(Math.min(1500, f * (e.soft ? 3 : 4.5)), t + .01, .07);
  osc(R, R.W('bass'), f, t, end + .15, lp);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v, t + .005); g.gain.setTargetAtTime(e.v * .75, t + .01, .08); g.gain.setTargetAtTime(0, end, .018);
};
LIFE.pad = e => e.d * BEAT + .32;
I.pad = (R, t, e) => {
  const end = t + e.d * BEAT, atk = e.atk ? e.atk * BEAT : .03;
  ['padL', 'padC', 'padR'].forEach((sn, i) => {
    const g = R.G(0, R.S(sn));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v, t + atk); g.gain.setTargetAtTime(0, end, .05);
    for (const m of e.m) osc(R, 'sawtooth', hz(m), t, end + .3, g).detune.value = (i - 1) * 14;
  });
};
LIFE.stab = e => e.d * BEAT + .22;
I.stab = (R, t, e) => {
  const end = t + e.d * BEAT, g = R.G(0, R.S('stab'));
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v, t + .004); g.gain.setTargetAtTime(e.v * .25, t + .01, .05); g.gain.setTargetAtTime(0, end, .03);
  e.m.forEach((m, i) => { osc(R, 'sawtooth', hz(m), t, end + .22, g).detune.value = [-9, 4, 11][i % 3]; });
};
LIFE.lead = e => e.d * BEAT + .15;
I.lead = (R, t, e) => {
  const f = hz(e.m), dur = e.d * BEAT, end = t + dur, g = R.G(0, R.S('lead'));
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v, t + .006); g.gain.setTargetAtTime(e.v * .8, t + .01, .1); g.gain.setTargetAtTime(0, end, .022);
  const o1 = osc(R, R.W('p25'), f, t, end + .15, g), o2 = osc(R, R.W('p25'), f, t, end + .15, g); o2.detune.value = 9;
  if (dur > .3) {
    const lg = R.G(0), l = osc(R, 'sine', 5.6, t, end + .15, lg);
    lg.gain.setValueAtTime(0, t + .14); lg.gain.linearRampToValueAtTime(11, t + .3);
    lg.connect(o1.detune); lg.connect(o2.detune);
  }
};
LIFE.arp = () => .25;
I.arp = (R, t, e) => {
  const g = R.G(0, R.S(e.pan > 0 ? 'arpR' : 'arpL'));
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v, t + .003); g.gain.setTargetAtTime(0, t + .02, .04);
  osc(R, R.W('p12'), hz(e.m), t, t + .25, g);
};
LIFE.box = () => 2.1;
I.box = (R, t, e) => {
  const f = hz(e.m);
  [[1, 1, .3], [2, .22, .16], [4.02, .1, .06]].forEach(([mul, lv, tau]) => {
    const g = R.G(0, R.S('box'));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v * lv, t + .002); g.gain.setTargetAtTime(0, t + .004, tau);
    osc(R, 'sine', f * mul, t, t + tau * 7, g);
  });
};
LIFE.spad = e => e.d * BEAT + 1.42;
I.spad = (R, t, e) => {
  const atk = (e.atk || .3) * BEAT, end = t + e.d * BEAT;
  const gs = ['spadL', 'spadR'].map(sn => { const g = R.G(0, R.S(sn)); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(e.v, t + atk); g.gain.setTargetAtTime(0, end, .2); return g; });
  const sawIn = R.G(.35, gs[1]);
  for (const m of e.m) { osc(R, 'triangle', hz(m), t, end + 1.4, gs[0]).detune.value = -6; osc(R, 'sawtooth', hz(m), t, end + 1.4, sawIn).detune.value = 6; }
};
LIFE.riser = e => e.d * BEAT + .05;
I.riser = (R, t, e) => {
  const d = e.d * BEAT, g = R.G(0, R.S('fx')), bp = R.F('bandpass', 300, 1.4, g);
  bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(9000, t + d);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.5 * e.v, t + d * .97); g.gain.linearRampToValueAtTime(0, t + d);
  for (let k = 0; k < Math.ceil(d / 1.9); k++) nz(R, t + k * 1.9, Math.min(1.9, d - k * 1.9), bp);
  const g2 = R.G(0, R.S('fx')), o = osc(R, 'sawtooth', 110, t, t + d, R.F('lowpass', 2500, .5, g2));
  o.frequency.exponentialRampToValueAtTime(880, t + d);
  g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(.1 * e.v, t + d * .97); g2.gain.linearRampToValueAtTime(0, t + d);
};
LIFE.scratch = () => .4;
I.scratch = (R, t, e) => {
  const g = R.G(0, R.S('fx')), bp = R.F('bandpass', 900, 3, g);
  nz(R, t, .36, bp);
  bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(3600, t + .09); bp.frequency.exponentialRampToValueAtTime(600, t + .2); bp.frequency.exponentialRampToValueAtTime(2800, t + .3);
  g.gain.setValueAtTime(1.4 * e.v, t); g.gain.setValueAtTime(.2, t + .1); g.gain.setValueAtTime(1.3 * e.v, t + .12); g.gain.setValueAtTime(.2, t + .21); g.gain.setValueAtTime(1.1 * e.v, t + .23); g.gain.setTargetAtTime(0, t + .3, .015);
  const g2 = R.G(0, R.S('fx')), o = osc(R, 'sawtooth', 500, t, t + .36, g2);
  o.frequency.exponentialRampToValueAtTime(1400, t + .09); o.frequency.exponentialRampToValueAtTime(260, t + .2); o.frequency.exponentialRampToValueAtTime(1100, t + .3);
  g2.gain.setValueAtTime(.28, t); g2.gain.setTargetAtTime(0, t + .3, .015);
};
LIFE.slide = e => e.d * BEAT + .22;
I.slide = (R, t, e) => {
  const d = e.d * BEAT, g = R.G(0, R.S('fx')), o = osc(R, 'triangle', 740, t, t + d + .2, g);
  o.frequency.exponentialRampToValueAtTime(690, t + d * .25); o.frequency.exponentialRampToValueAtTime(250, t + d);
  const lg = R.G(14, o.detune); osc(R, 'sine', 6.5, t, t + d + .2, lg);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.42 * e.v, t + .03); g.gain.setTargetAtTime(0, t + d * .85, .05);
};
function bell(R, t, f, v, tau) {
  const g = R.G(0, R.S('fx'));
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .003); g.gain.setTargetAtTime(0, t + .006, tau);
  osc(R, 'sine', f, t, t + tau * 7, g); osc(R, 'triangle', f * 2, t, t + tau * 7, R.G(.18, g));
}
LIFE.chimeIn = e => (e.m.length - 1) * .085 + (.16 + (e.m.length - 1) * .05) * 7;
LIFE.chimeOut = () => 1.3; LIFE.sparkle = () => .8; LIFE.blip = () => .65; LIFE.modem = () => 2.55;
I.chimeIn = (R, t, e) => e.m.forEach((m, i) => bell(R, t + i * .085, hz(m), .5 * e.v, .16 + i * .05));
I.chimeOut = (R, t, e) => {
  e.m.forEach((m, i) => bell(R, t + i * .13, hz(m), .42 * e.v, .16));
  const g = R.G(0, R.S('fx')), o = osc(R, 'sine', 130, t + .27, t + .7, g);
  o.frequency.exponentialRampToValueAtTime(52, t + .4);
  g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(.9 * e.v, t + .27); g.gain.setTargetAtTime(0, t + .28, .06);
};
LIFE.pop = () => .2;
I.pop = (R, t, e) => {
  const g = R.G(0, R.S('fx')), o = osc(R, 'sine', 380, t, t + .2, g);
  o.frequency.exponentialRampToValueAtTime(1250, t + .07);
  g.gain.setValueAtTime(.5 * e.v, t); g.gain.setTargetAtTime(0, t + .05, .025);
};
I.sparkle = (R, t, e) => [96, 100, 103, 108, 112].forEach((m, i) => bell(R, t + i * .035, hz(m), .16 * e.v, .09));
LIFE.buzz = e => e.d * BEAT + .1;
I.buzz = (R, t, e) => {
  const d = e.d * BEAT, g = R.G(0, R.S('fx')), bp = R.F('bandpass', 1000, .7, g), tr = Math.pow(2, (e.tr || 0) / 12);
  const trem = R.G(1, bp), lg = R.G(1, trem.gain); osc(R, 'square', 31, t, t + d + .1, lg);
  for (const f of [196, 293.7, 99]) osc(R, 'sawtooth', f * tr, t, t + d + .1, trem);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((e.soft ? .4 : .62) * e.v, t + .008); g.gain.setTargetAtTime(0, t + d * .8, .02);
};
LIFE.cricket = () => .3;
I.cricket = (R, t, e) => {
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
    const tk = t + r * .16 + k * .024, g = R.G(0, R.S('fx'));
    g.gain.setValueAtTime(.085 * e.v, tk); g.gain.setTargetAtTime(0, tk + .008, .003);
    osc(R, 'sine', 4350 + r * 90, tk, tk + .03, g);
  }
};
I.blip = (R, t, e) => { bell(R, t, 880, .35 * e.v, .05); bell(R, t + .07, 1318.5, .35 * e.v, .08); };
I.modem = (R, t) => {
  const out = R.G(2.6, R.S('fx'));
  const tone = (f, a, z, v) => { const g = R.G(0, out); g.gain.setValueAtTime(0, t + a); g.gain.linearRampToValueAtTime(v, t + a + .004); g.gain.setValueAtTime(v, t + z - .004); g.gain.linearRampToValueAtTime(0, t + z); return osc(R, 'sine', f, t + a, t + z + .01, g); };
  tone(350, 0, .3, .2); tone(440, 0, .3, .2);
  const lo = [697, 770, 852, 941], hi = [1209, 1336, 1477], digits = [0, 7, 9, 4, 6, 1, 5];
  digits.forEach((d, i) => { const a = .33 + i * .078; tone(lo[d % 4], a, a + .056, .2); tone(hi[d % 3], a, a + .056, .2); });
  tone(2100, .95, 1.28, .22);
  tone(2250, 1.3, 1.4, .2); tone(1850, 1.4, 1.5, .2); tone(2250, 1.5, 1.6, .2); tone(1375, 1.6, 1.72, .2);
  const o = tone(3000, 1.72, 1.9, .16); o.frequency.exponentialRampToValueAtTime(900, t + 1.9);
  const g = R.G(0, out), bp = R.F('bandpass', 1800, .8, g);
  nz(R, t + 1.74, .75, bp);
  bp.frequency.setValueAtTime(1500, t + 1.74); bp.frequency.linearRampToValueAtTime(2700, t + 2.1); bp.frequency.linearRampToValueAtTime(1300, t + 2.46);
  g.gain.setValueAtTime(0, t + 1.74); g.gain.linearRampToValueAtTime(.55, t + 1.8); g.gain.setValueAtTime(.55, t + 2.38); g.gain.linearRampToValueAtTime(0, t + 2.48);
  tone(1200, 1.9, 2.46, .07); tone(2400, 1.9, 2.46, .05);
};
LIFE.vox = e => e.plays ? Math.max(...e.plays.map(p => p.real + p.dl + .05)) : e.d * BEAT + .1;
I.vox = (R, t, e) => {
  if (!e.plays) return voxSynth(R, t, e);
  e.plays.forEach((p, i) => {
    const s = R.ctx.createBufferSource(); s.buffer = p.buf;
    const g = R.G(0, R.S(e.who === 'dino' ? 'dino' + i : e.who));
    const t0 = Math.max(0, t + p.dl - p.ant), end = t + p.dl + p.real;
    s.playbackRate.setValueAtTime(p.rate, t0);
    if (e.bend) { s.playbackRate.setValueAtTime(p.rate, t + p.real * .3); s.playbackRate.linearRampToValueAtTime(p.rate * e.bend, end); }
    const v = (e.v || 1) * p.g;
    g.gain.setValueAtTime(v, t0); g.gain.setValueAtTime(v, Math.max(t0, end - .03)); g.gain.linearRampToValueAtTime(0, end + .012);
    s.connect(g); s.start(t0); s.stop(end + .03);
  });
};
// if the speech synth can't load, a talkbox-ish stand-in so the song still has a singer
function voxSynth(R, t, e) {
  if (e.who === 'narr') return;
  const L = e.who === 'dino' ? (e.layers || 1) : 1;
  const FORM = { rawr: [[380, 640, 420], [1250, 880, 1300]], quack: [[320, 780, 500], [900, 1750, 1500]], moo: [[300, 330, 320], [820, 780, 760]], hoo: [[320, 340, 330], [900, 860, 850]] }[e.w];
  const d = e.d * BEAT * .92;
  for (let k = 0; k < L; k++) {
    const f = hz(e.m + (k === 3 ? -12 : 0)), g = R.G(0, R.S(e.who === 'dino' ? 'dino' + k : e.who));
    FORM.forEach((fr, i) => {
      const bp = R.F('bandpass', fr[0], 7, R.G(i ? 1.3 : 2, g));
      bp.frequency.setValueAtTime(fr[0], t); bp.frequency.linearRampToValueAtTime(fr[1], t + Math.min(.07, d * .3)); bp.frequency.setValueAtTime(fr[1], t + d * .7); bp.frequency.linearRampToValueAtTime(fr[2], t + d);
      const o = osc(R, 'sawtooth', f, t, t + d + .05, bp); o.detune.value = [0, 9, -8, 3][k];
      if (e.bend) { o.frequency.setValueAtTime(f, t + d * .3); o.frequency.linearRampToValueAtTime(f * e.bend, t + d); }
    });
    const v = (e.v || 1) * [1, .6, .6, .7][k] * .5;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .02); g.gain.setValueAtTime(v, t + d - .03); g.gain.linearRampToValueAtTime(0, t + d);
  }
}

/* ===== rendering =====
   The song repeats itself a lot, so each bar of each instrument is rendered once per distinct pattern
   and stamped wherever it recurs; reverb and echo are then run over the finished mix. */
function startRender(ctx) {
  return new Promise((res, rej) => {
    ctx.oncomplete = ev => res(ev.renderedBuffer);
    try { const p = ctx.startRendering(); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }
  });
}
function planPatterns(secs) {
  const pats = new Map();
  for (const S of secs) {
    const byBar = new Map();
    for (const e of S.sec.ev) {
      if (!I[e.k]) continue;
      const key = Math.floor(e.b / 4 + 1e-9) + '|' + (e.k === 'vox' ? 'vox:' + e.who : e.k);
      if (!byBar.has(key)) byBar.set(key, []);
      byBar.get(key).push(e);
    }
    for (const [key, evs] of byBar) {
      const B0 = parseInt(key, 10) * 4;
      let len = 0;
      for (const e of evs) len = Math.max(len, (e.b - B0) * BEAT + LIFE[e.k](e));
      const ducked = evs[0].k === 'bass' || evs[0].k === 'pad';
      const dk = ducked ? S.kicks.map(k => +(k.b - B0).toFixed(4)).filter(x => x > -1 && x * BEAT < len) : [];
      const sig = JSON.stringify([evs.map(e => [e.k, +(e.b - B0).toFixed(4), e.d, e.m, e.v, e.soft, e.atk, e.pan, e.tr, e.bend, e.layers, e.who, e.w, e.hm]), dk]);
      let p = pats.get(sig);
      if (!p) pats.set(sig, p = { evs, B0, len: len + .06, dk, uses: [] });
      p.uses.push([S, B0]);
    }
  }
  return [...pats.values()];
}
async function renderPattern(p, solo) {
  const ctx = new OAC(4, Math.ceil((PRE + p.len) * SR), SR);
  const R = mkRig(ctx, { solo });
  for (const x of p.dk) { const t = PRE + x * BEAT; if (t >= 0) { R.duck.gain.setValueAtTime(.3, t); R.duck.gain.linearRampToValueAtTime(1, t + .21); } }
  for (const e of p.evs) I[e.k](R, PRE + (e.b - p.B0) * BEAT, e);
  const buf = await startRender(ctx);
  for (let c = 0; c < 4; c++) {
    const a = buf.getChannelData(c);
    let live = false;
    for (let i = 0; i < a.length; i += 7) if (a[i] !== 0) { live = true; break; }
    if (!live) continue;
    for (const [S, B0] of p.uses) {
      const d = S.ch[c], off = Math.round(B0 * BEAT * SR), n = Math.min(a.length, S.N - off);
      for (let i = 0; i < n; i++) d[off + i] += a[i];
    }
  }
}
// echo (ping-pong, dotted eighth) and a small plate-ish reverb, mixed into L/R in place
function effects(L, Rr, rv, dl, N) {
  const D = Math.round(BEAT * .75 * SR), bl = new Float64Array(D), br = new Float64Array(D);
  const kd = 1 - Math.exp(-2 * Math.PI * 3000 / SR), kh = 1 - Math.exp(-2 * Math.PI * 320 / SR);
  const CT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AT = [556, 441, 341, 225], NC = CT.length, NA = AT.length;
  const cb = [], cl = new Int32Array(NC * 2), ci = new Int32Array(NC * 2), cf = new Float64Array(NC * 2);
  const ab = [], al = new Int32Array(NA * 2), ai = new Int32Array(NA * 2);
  for (let s = 0; s < 2; s++) {
    CT.forEach((n, i) => { cl[s * NC + i] = n + s * 23; cb.push(new Float64Array(n + s * 23)); });
    AT.forEach((n, i) => { al[s * NA + i] = n + s * 23; ab.push(new Float64Array(n + s * 23)); });
  }
  const FB = .86, DAMP = .32, IN = .03, WR = LEVEL.rev * 2.2, WD = LEVEL.del;
  let p = 0, lpd = 0, hl = 0, hr = 0;
  for (let i = 0; i < N; i++) {
    const a = bl[p], b = br[p];
    bl[p] = dl[i] + .36 * b; lpd += (a - lpd) * kd; br[p] = lpd;
    if (++p >= D) p = 0;
    const x = rv[i] * IN;
    let oL = 0, oR = 0;
    for (let c = 0; c < NC; c++) {
      let k = ci[c], buf = cb[c], y = buf[k];
      cf[c] = y * (1 - DAMP) + cf[c] * DAMP; buf[k] = x + cf[c] * FB; if (++k >= cl[c]) k = 0; ci[c] = k; oL += y;
      const c2 = c + NC; k = ci[c2]; buf = cb[c2]; y = buf[k];
      cf[c2] = y * (1 - DAMP) + cf[c2] * DAMP; buf[k] = x + cf[c2] * FB; if (++k >= cl[c2]) k = 0; ci[c2] = k; oR += y;
    }
    for (let c = 0; c < NA; c++) {
      let k = ai[c], buf = ab[c], bo = buf[k];
      buf[k] = oL + bo * .5; oL = bo - oL; if (++k >= al[c]) k = 0; ai[c] = k;
      const c2 = c + NA; k = ai[c2]; buf = ab[c2]; bo = buf[k];
      buf[k] = oR + bo * .5; oR = bo - oR; if (++k >= al[c2]) k = 0; ai[c2] = k;
    }
    hl += (oL - hl) * kh; hr += (oR - hr) * kh;
    L[i] += WD * (a * .981 + b * .195) + WR * (oL - hl);
    Rr[i] += WD * (a * .195 + b * .981) + WR * (oR - hr);
  }
}
function softClip(d) { // peaks above 0.72 are rounded off instead of chopped
  for (let i = 0; i < d.length; i++) { const x = d[i], ax = x < 0 ? -x : x; if (ax > .72) d[i] = (x < 0 ? -1 : 1) * (.72 + .27 * Math.tanh((ax - .72) / .27)); }
}
async function renderAll(Sam, onProgress, solo) {
  const sh = sharedBufs();
  const score = mkScore();
  const mkBuf = f => { const b = sh.tmp.createBuffer(1, f.length, 22050); b.getChannelData(0).set(f); return b; };
  const sung = Sam ? prepareVox(score, Sam, mkBuf) : false;
  const secs = ['main', 'vamp', 'fin'].map(k => {
    const sec = score[k], N = Math.ceil((PRE + sec.beats * BEAT + SEC_TAIL) * SR);
    return { k, sec, N, ch: [0, 1, 2, 3].map(() => new Float32Array(N)), kicks: sec.ev.filter(e => e.k === 'kick' && e.duck) };
  });
  const queue = planPatterns(secs);
  const total = queue.length + secs.length * 6;
  let done = 0;
  const step = n => { done += n || 1; if (onProgress) onProgress(Math.min(1, done / total)); };
  const K = clamp(navigator.hardwareConcurrency || 2, 2, 4);
  const patterns = queue.length;
  let failed = 0;
  const worker = async () => { while (queue.length) { try { await renderPattern(queue.pop(), solo); } catch (e) { failed++; } step(); } };
  await Promise.all(Array.from({ length: K }, worker));
  if (failed > patterns / 2) throw new Error('offline rendering unavailable');
  const bufs = {};
  const tick = () => new Promise(r => setTimeout(r, 0));
  for (const S of secs) {
    const [L, Rr, rv, dl] = S.ch;
    effects(L, Rr, rv, dl, S.N);
    step(4); await tick();
    const out = sh.tmp.createBuffer(2, S.N, SR);
    [L, Rr].forEach((d, c) => { softClip(d); out.getChannelData(c).set(d); });
    S.ch = null; bufs[S.k] = out;
    step(2); await tick();
  }
  return { score, bufs, sung };
}
