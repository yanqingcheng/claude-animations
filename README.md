# claude-animations

Animations Claude built for me, kept here. Each folder opens by double-clicking its `index.html` (or serve the folder statically; no build step, no dependencies).

| Folder | What | Made by | Date |
|---|---|---|---|
| `while-you-live-shine-fable/` | The Seikilos epitaph as a ~3m20 animated film, single self-contained HTML file (second cut) | Fable | 2 Oct 2026 |
| `while-you-live-shine-opus/` | Same topic, separate build: ~4 min film plus a playable lyre. Multi-file (`data.js`, `audio.js`, `scenes.js`, `main.js`) | Opus | 3 Oct 2026 |
| `lantern-field/` | Interactive lantern field: first, abstract version of the "hopes for the world" piece | Claude | 2 Oct 2026 |
| `lantern-valley/` | The finished "hopes for the world" piece: a flame passed between people on hillsides, lanterns rising over a lake into dawn. 45s, plays live in `index.html`; also the MP4 and the scripts that rendered it | Fable | 2 Oct 2026 |
| `rawr-song/` | The Rawr Song: a 2006-style Flash cartoon without the Flash. A dinosaur sings "rawr" (which means "i love you"), the other animals answer in MSN-speak, and at one point it waits for you to say it back. Interactive in `index.html`; also the 1m40 MP4 film cut, the source and the script that rendered it | Fable | 8 Oct 2026 |

Notes

- These are the published artifact files as they stood on 8 Oct 2026, saved verbatim, so each `index.html` carries the small page wrapper the artifact host adds.
- `lantern-field/` is the early interactive page; `lantern-valley/` is the later, richer scene it turned into. See `lantern-valley/README.md` for how to play or re-render it.
- The MP4 exports of the Seikilos pieces are not in here either.
- `rawr-song/index.html` is the exception to the first note: it is built from `rawr-song/src/` by `build.js`, the same code as the published artifact. See `rawr-song/README.md`.
- Fonts load from Google Fonts, so a first open needs a connection. `rawr-song/` also fetches its singing voice from jsDelivr.
