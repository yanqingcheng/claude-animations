# The Rawr Song

A 2006-style Flash cartoon, minus the Flash. A small dinosaur knows one word, "rawr", which means "i love you" in dinosaur. He sings it, more dinosaurs turn up, and the other animals answer in MSN: the duck says "k.", the cow says "brb", the owls say "o rly?". Then everyone signs off and he waits for you to say it back. When you do, they all sign back in, the key goes up a tone, and it loops forever.

The picture is drawn on one Canvas 2D context from the song position alone, so sound and picture can't drift apart. All of the sound is synthesised in the browser when the page loads: drums, bass, pads, lead, the dial-up modem, and the vocals. The singer is S.A.M., the 1982 "Software Automatic Mouth" speech synth (through the `sam-js` port), rendered one syllable at a time, tuned to the melody and stacked into a choir.

## Files

| File | What |
|---|---|
| `index.html` | The cartoon. Plays live and interactive, with sound. Click Play. Built from `src/` |
| `rawr-song.mp4` | The film cut: 1200x900, 30fps, H.264/AAC, 1m40. It has an ending, which the page doesn't |
| `src/engine.js` | The score (every note, as data) and the synth that renders it with the Web Audio API |
| `src/draw.js` | Every character and scene. `drawFrame(ctx, state)` draws one frame for a given beat |
| `src/main.js` | The page: preloader, clock, buttons, the chat box, the right-click menu |
| `src/film.js` | The film cut: the same score and drawing code on a fixed timeline, with a cursor that answers for you and an iris-out ending |
| `src/page.html`, `src/style.css` | Markup and styles for the page around the stage |
| `build.js` | Assembles `src/` into `index.html` |
| `record.js` | Steps `film.js` frame by frame in headless Chromium (Playwright), renders the soundtrack with the same synth, and pipes both to ffmpeg |

## On the page

Poke the dinosaur. Right-click the movie. Set the quality to low. Leave him waiting a while before you answer: there is a moon, and its name is Keith.

## Rebuilding and re-rendering

```
node build.js       # src/ -> index.html
npm install         # Playwright, sam-js and the three fonts, for the render
node record.js      # -> rawr-song.mp4, about four minutes on two cores
```

`record.js` needs `ffmpeg` on the path and a Chromium for Playwright (`npx playwright install chromium`, or point `CHROMIUM_PATH` at one). Nothing is captured in real time: each frame is drawn for an exact song position and the soundtrack is rendered offline, so every run gives the same film. `--from` and `--to` (in seconds) render just a section.

## Known rough edges

- It was composed and mixed by measurement, not by ear. Pitches, levels and loop points were checked numerically, because the model that wrote it can't listen.
- Tested in Chromium only. Safari and Firefox should work but haven't been tried.
- On load the page builds about 100 seconds of audio in the browser, which takes a few seconds, longer on a phone.
- The voice library (`sam-js`) is fetched from jsDelivr at runtime and isn't kept in this repo: S.A.M. is abandonware and the port carries no open licence. If it can't load, the page falls back to a plainer synthesised voice and says so.
- Fonts come from Google Fonts, so a first open needs a connection.
- In the film the chat box and cursor are drawn on the canvas. On the page they are real HTML controls.
