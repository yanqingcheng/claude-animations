'use strict';
/* ==========================================================================
   DATA: the song as carved, the script, the timeline.
   Melody = the standard reading of the stone's notation (Pöhlmann & West;
   the Wikipedia transcription in "two sharps"). Each Greek sign is a pitch.
   Playback is a fourth lower, tuned in Pythagorean ratios.
   ========================================================================== */

// Greek vocal-notation sign -> rung on the ladder (0 = lowest)
const SIGN_ORDER = ['⅂', 'Χ', 'Φ', 'C', 'Ο', 'Κ', 'Ι', 'Ζ'];
// modern names in the common transcription (for the notes panel)
const SIGN_MODERN = { '⅂': 'E', 'Χ': 'F♯', 'Φ': 'G', 'C': 'A', 'Ο': 'B', 'Κ': 'C♯', 'Ι': 'D', 'Ζ': 'E′' };
// Pythagorean ratios relative to the C-sign (the song's lower pitch centre)
const SIGN_RATIO = { '⅂': 3 / 4, 'Χ': 27 / 32, 'Φ': 8 / 9, 'C': 1, 'Ο': 9 / 8, 'Κ': 81 / 64, 'Ι': 4 / 3, 'Ζ': 3 / 2 };
const BASE_HZ = 329.63; // C-sign sounds as E4
const signHz = (s) => BASE_HZ * SIGN_RATIO[s];
const rungOf = (s) => SIGN_ORDER.indexOf(s);

/* One entry per syllable.
   g: Greek syllable, tr: transliteration, s: signs (one per note),
   d: durations in eighth-notes per note, mark: 'di' (2-beat line) | 'tri' (3-beat),
   dot: stigme (dot) over the sign(s), v: sung vowel (Koine-ish), c: onset consonant */
const SONG = [
  { g: 'Ὅ', tr: 'hó', s: ['C'], d: [1], v: 'o', c: 'h' },
  { g: 'σον', tr: 'son', s: ['Ζ'], d: [2], mark: 'di', v: 'o', c: 's' },
  { g: 'ζῇς', tr: 'zêis', s: ['Ζ'], d: [3], mark: 'tri', dot: 1, v: 'i', c: 'z' },
  { g: 'φαί', tr: 'phaí', s: ['Κ', 'Ι', 'Ζ'], d: [1, 1, 1], v: 'e', c: 'f' },
  { g: 'νου', tr: 'nou', s: ['Ι'], d: [3], mark: 'tri', dot: 1, v: 'u', c: 'n' },

  { g: 'μη', tr: 'mē', s: ['Κ'], d: [2], mark: 'di', v: 'i', c: 'm' },
  { g: 'δὲν', tr: 'dèn', s: ['Ι'], d: [1], v: 'e', c: 'd' },
  { g: 'ὅ', tr: 'hó', s: ['Ζ'], d: [1], dot: 1, v: 'o', c: 'h' },
  { g: 'λως', tr: 'lōs', s: ['Ι', 'Κ'], d: [1, 1], dot: 1, v: 'o', c: 'l' },
  { g: 'σὺ', tr: 'sù', s: ['Ο'], d: [1], v: 'y', c: 's' },
  { g: 'λυ', tr: 'lu', s: ['C'], d: [2], mark: 'di', v: 'y', c: 'l' },
  { g: 'ποῦ', tr: 'poû', s: ['Ο', 'Φ'], d: [1, 2], mark: 'tri', dot: 1, v: 'u', c: 'p' },

  { g: 'πρὸς', tr: 'pròs', s: ['C'], d: [1], v: 'o', c: 'p' },
  { g: 'ὀ', tr: 'o', s: ['Κ'], d: [1], v: 'o', c: '' },
  { g: 'λί', tr: 'lí', s: ['Ζ'], d: [1], v: 'i', c: 'l' },
  { g: 'γον', tr: 'gon', s: ['Ι'], d: [1], dot: 1, v: 'o', c: 'g' },
  { g: 'ἔσ', tr: 'és', s: ['Κ', 'Ι'], d: [1, 1], dot: 1, v: 'e', c: '' },
  { g: 'τι', tr: 'ti', s: ['Κ'], d: [1], v: 'i', c: 't' },
  { g: 'τὸ', tr: 'tò', s: ['C'], d: [2], mark: 'di', v: 'o', c: 't' },
  { g: 'ζῆν', tr: 'zên', s: ['Ο', 'Φ'], d: [1, 2], mark: 'tri', dot: 1, v: 'i', c: 'z' },

  { g: 'τὸ', tr: 'tò', s: ['C'], d: [1], v: 'o', c: 't' },
  { g: 'τέ', tr: 'té', s: ['Κ'], d: [1], v: 'e', c: 't' },
  { g: 'λος', tr: 'los', s: ['Ο'], d: [1], v: 'o', c: 'l' },
  { g: 'ὁ', tr: 'ho', s: ['Ι'], d: [1], dot: 1, v: 'o', c: 'h' },
  { g: 'χρό', tr: 'khró', s: ['Ζ'], d: [1], dot: 1, v: 'o', c: 'kh' },
  { g: 'νος', tr: 'nos', s: ['Κ'], d: [1], dot: 1, v: 'o', c: 'n' },
  { g: 'ἀπ', tr: 'ap', s: ['C'], d: [1], v: 'a', c: '' },
  { g: 'αι', tr: 'ai', s: ['C'], d: [2], mark: 'di', v: 'e', c: '' },
  { g: 'τεῖ', tr: 'teî', s: ['C', 'Χ', '⅂'], d: [1, 1, 1], mark: 'tri', dot: 1, v: 'i', c: 't' },
];
// line boundaries (each line = 12 eighths = two bars of 6/8)
(function assignLines() {
  let acc = 0;
  for (const syl of SONG) {
    syl.line = Math.floor(acc / 12);
    syl.e0 = acc; // start, in eighths from song start
    acc += syl.d.reduce((a, b) => a + b, 0);
  }
})();

const ENGLISH = [
  'While you’re alive, shine.',
  'Let nothing grieve you at all.',
  'Life lasts only a little while,',
  'and time demands its due.',
];
const LINE_TR = [
  'hóson zêis, phaínou',
  'mēdèn hólōs sù lupoû',
  'pròs olígon ésti tò zên',
  'tò télos ho khrónos apaiteî',
];

// The inscription as it wraps the column (lunate sigma drawn as C).
const INSCRIPTION = {
  distich: ['ΕΙΚΩΝ Η ΛΙΘΟC', 'ΕΙΜΙ · ΤΙΘΗCΙ ΜΕ', 'CΕΙΚΙΛΟC ΕΝΘΑ', 'ΜΝΗΜΗC ΑΘΑΝΑΤΟΥ', 'CΗΜΑ ΠΟΛΥΧΡΟΝΙΟΝ'],
  // song rows as on the stone, with the notation signs over each row
  // six rows as cut on the stone; each pair = [letters, signs over them]
  song: [
    [['Ο', 'C'], ['CΟΝ ', 'Ζ'], ['ΖΗC ', 'Ζ'], ['ΦΑΙ', 'ΚΙΖ'], ['ΝΟΥ', 'Ι']],
    [['ΜΗ', 'Κ'], ['ΔΕΝ ', 'Ι'], ['Ο', 'Ζ'], ['ΛΩC ', 'ΙΚ'], ['CΥ', 'Ο']],
    [['ΛΥ', 'C'], ['ΠΟΥ ', 'ΟΦ'], ['ΠΡΟC ', 'C'], ['Ο', 'Κ'], ['ΛΙ', 'Ζ']],
    [['ΓΟΝ ', 'Ι'], ['ΕC', 'ΚΙ'], ['ΤΙ ', 'Κ'], ['ΤΟ ', 'C'], ['ΖΗΝ', 'ΟΦ']],
    [['ΤΟ ', 'C'], ['ΤΕ', 'Κ'], ['ΛΟC ', 'Ο'], ['Ο ', 'Ι'], ['ΧΡΟ', 'Ζ']],
    [['ΝΟC ', 'Κ'], ['ΑΠ', 'C'], ['ΑΙ', 'C'], ['ΤΕΙ', 'CΧ⅂']],
  ],
  signature: 'CΕΙΚΙΛΟC ΕΥΤΕΡ',
  lost: 'ΖΕΙ',
};

/* ---------------- Timeline (seconds) ---------------- */
const EIGHTH = 0.5;
const TL = {
  scaleRun: 49.4, scaleStep: 0.42,
  songA: 53.0,
  acc1: 89.4, acc2: 93.6, acc3: 99.6,
  finale: 207.0,
  end: 238.5,
  total: 240.5,
};

/* note list for a pass: [{t, dur, sign, hz, syl, k (index in syllable), first, line}] */
function buildPass(t0, opts = {}) {
  const notes = [];
  const durOf = opts.durOf || (() => EIGHTH);
  let t = t0, e = 0;
  SONG.forEach((syl, si) => {
    syl.s.forEach((sign, k) => {
      let dur = 0;
      for (let j = 0; j < syl.d[k]; j++) dur += durOf(e + j);
      notes.push({ t, dur, sign, hz: signHz(sign), syl: si, k, first: k === 0, line: syl.line, e });
      t += dur;
      e += syl.d[k];
    });
  });
  return notes;
}
const PASS_A = buildPass(TL.songA);
PASS_A[PASS_A.length - 1].dur = 1.6;
// finale: gentle ritardando in the last bar, long last note
const FINALE_DUR = (e) => {
  if (e < 42) return EIGHTH;
  return [0.56, 0.6, 0.62, 0.68, 0.82, 0.9][e - 42];
};
const PASS_F = buildPass(TL.finale, { durOf: FINALE_DUR });
PASS_F[PASS_F.length - 1].dur = 5.0;

function lineStarts(pass) {
  const out = [];
  pass.forEach((n) => { if (n.first && SONG[n.syl].e0 % 12 === 0 && n.k === 0) out[n.line] = n.t; });
  return out;
}
const LINES_A = lineStarts(PASS_A);
const LINES_F = lineStarts(PASS_F);

/* accent-explainer snippets: syllable indices */
const ACCENT_WORDS = [
  { syl: [3, 4], word: ['φαί', 'νου'], tr: 'phaí · nou', gloss: 'shine', t: TL.acc1, accent: 0, kind: 'rise', show: [84.6, 93.0] },
  { syl: [10, 11], word: ['λυ', 'ποῦ'], tr: 'lu · poû', gloss: 'grieve', t: TL.acc2, accent: 1, kind: 'risefall', show: [93.0, 99.2] },
  { syl: [0, 1], word: ['ὅ', 'σον'], tr: 'hó · son', gloss: 'as long as', t: TL.acc3, accent: 0, kind: 'rebel', show: [99.2, 107.6] },
];
function snippetNotes(w) {
  const out = [];
  let t = w.t;
  w.syl.forEach((si) => {
    const syl = SONG[si];
    syl.s.forEach((sign, k) => {
      const dur = syl.d[k] * EIGHTH;
      out.push({ t, dur, sign, hz: signHz(sign), syl: si, k, first: k === 0 });
      t += dur;
    });
  });
  out[out.length - 1].dur += 0.6;
  return out;
}
ACCENT_WORDS.forEach((w) => { w.notes = snippetNotes(w); });

/* ---------------- Captions: the stone speaks ---------------- */
const CAPTIONS = [
  [1.0, 5.0, 'I am an image, and a stone.'],
  [5.3, 7.6, 'Mostly stone.'],
  [8.0, 13.2, 'Seikilos put me here: a sign of deathless memory, built to last.'],
  [13.6, 18.0, 'That much is carved at the top. Below it, he did something rarer.'],
  [18.3, 22.8, 'He carved a song. With its tune.'],

  [24.6, 28.6, 'Tralles, in Asia Minor. Now Aydın, in Turkey.'],
  [28.9, 33.4, 'First century AD, or second. Scholars disagree. Confidently.'],
  [33.7, 36.6, 'Nobody knows who Seikilos was.'],
  [36.9, 40.6, 'My last surviving words say: Seikilos, to Euter…'],
  [40.9, 46.2, 'His wife Euterpe? The Muse Euterpe? I’d tell you, but that part isn’t written on me.'],

  [47.0, 52.6, 'The little letters over the words are the notes. Each one names a pitch.'],
  // song lines inserted below
  [77.6, 82.6, 'Cheerful advice for a grave marker. If I even am one. That’s argued about too.'],

  [83.0, 88.7, 'Ancient Greek had pitch built into its words. Accented syllables rose; some rose, then fell.'],
  [89.0, 92.6, 'Listen. The tune follows them.'],
  [96.6, 101.8, 'Mostly. The very first word ignores the rule. I respect that.'],
  [102.2, 107.0, 'So the melody holds the rise and fall of the words themselves.'],

  [108.0, 112.4, 'Then seventeen centuries happened to me.'],
  [113.0, 118.8, 'Empires came and went. I stayed more or less where I was.'],

  [124.0, 129.0, 'Around 1883, men building a railway near Aydın found me.'],
  [129.3, 133.4, 'The engineer was an Irishman called Edward Purser.'],
  [134.0, 138.4, 'Mrs Purser needed a stand for her flowerpots.'],
  [138.8, 143.4, 'My base was uneven. So they sawed it flat.'],
  [145.9, 148.9, 'My bottom line went with it.'],
  [149.2, 153.6, 'On it was a word: ZĒI. “Is alive.”'],
  [153.9, 158.4, 'We only know because someone had taken a paper rubbing first.'],

  [159.6, 165.0, '1922. Smyrna burned, and many thousands of people died.'],
  [165.4, 169.4, 'The Dutch consul took me into his keeping.'],
  [170.0, 176.0, 'His son-in-law carried me on. Istanbul. Stockholm. The Hague.'],
  [176.4, 181.6, 'Then decades in The Hague, with everyone assuming I was lost.'],
  [182.0, 186.6, 'I wasn’t lost. I knew exactly where I was.'],

  [187.4, 192.4, 'In 1966 the National Museum of Denmark acquired me.'],
  [192.8, 198.2, 'I’ve been in Copenhagen ever since, on display. Good lighting.'],
  [198.6, 204.4, 'People still sing me. That was the point.'],
];
LINES_A.forEach((t, i) => CAPTIONS.push([t, t + 5.85, ENGLISH[i], 'song']));
LINES_F.forEach((t, i) => {
  const next = LINES_F[i + 1] || (t + 9.5);
  CAPTIONS.push([t, Math.min(next - 0.1, t + 9), ENGLISH[i], 'song']);
});
CAPTIONS.sort((a, b) => a[0] - b[0]);

const CHAPTERS = [
  [24.0, 46.0, 'Tralles, Asia Minor', '1st or 2nd century AD'],
  [47.0, 82.4, 'The song', 'as carved, with its notation'],
  [82.8, 107.0, 'Words with a tune in them', ''],
  [122.4, 158.2, 'Aydın, then a garden', 'c. 1883'],
  [158.8, 169.4, 'Smyrna', '1922'],
  [169.8, 192.2, 'A long way round', '1922 to 1966'],
  [192.6, 204.8, 'Copenhagen', '1966 to now'],
];

/* ---------------- Ambience levels: [time, level] keyframes ---------------- */
const BEDS = {
  drone: [[0, 0], [4, 0.5], [22, 0.5], [25, 0.24], [45, 0.24], [48, 0.34], [77, 0.34], [83, 0.22], [106, 0.22], [108, 0.48], [121, 0.48], [122.5, 0], [148.8, 0], [150.4, 0.26], [157.6, 0.26], [159.2, 0.22], [186, 0.22], [188, 0.12], [204, 0.12], [207, 0.5], [236, 0.5], [242, 0.18], [99999, 0.18]],
  wind: [[0, 0], [3, 0.14], [22, 0.14], [25, 0.1], [45, 0.1], [47, 0], [107, 0], [109, 0.3], [121, 0.3], [123, 0.06], [133, 0.06], [134.5, 0.17], [157, 0.17], [158.5, 0], [160, 0.16], [170, 0.16], [172, 0], [205, 0], [208, 0.08], [99999, 0.08]],
  cicadas: [[0, 0], [23.5, 0], [26, 0.2], [44, 0.2], [46.5, 0], [133.5, 0], [135, 0.05], [157, 0.05], [158.5, 0], [99999, 0]],
  fire: [[0, 0], [158.5, 0], [160, 0.5], [168, 0.5], [170.5, 0], [99999, 0]],
  room: [[0, 0], [192, 0], [193.5, 0.45], [204, 0.45], [206, 0], [99999, 0]],
  rumble: [[0, 0], [122.4, 0], [124, 0.35], [127.2, 0.7], [131, 0.3], [133.4, 0], [99999, 0]],
};
function bedLevel(name, t) {
  const k = BEDS[name];
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t < k[i][0]) {
      const [t0, v0] = k[i - 1], [t1, v1] = k[i];
      return v0 + (v1 - v0) * ((t - t0) / (t1 - t0));
    }
  }
  return k[k.length - 1][1];
}

/* Map coordinates (lat, lon) */
const PLACES = {
  tralles: { name: 'Tralles', lat: 37.85, lon: 27.84 },
  smyrna: { name: 'Smyrna', lat: 38.42, lon: 27.14 },
  istanbul: { name: 'Istanbul', lat: 41.01, lon: 28.98 },
  stockholm: { name: 'Stockholm', lat: 59.33, lon: 18.07 },
  hague: { name: 'The Hague', lat: 52.08, lon: 4.30 },
  copenhagen: { name: 'Copenhagen', lat: 55.68, lon: 12.57 },
};
const ROUTE = [
  { from: 'smyrna', to: 'istanbul', t: 171.0 },
  { from: 'istanbul', to: 'stockholm', t: 172.7 },
  { from: 'stockholm', to: 'hague', t: 174.4 },
  { from: 'hague', to: 'copenhagen', t: 187.6 },
];
