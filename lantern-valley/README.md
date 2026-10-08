# Lantern Valley

A 45-second animation on one hope: that the good things (knowledge, patience, help) behave like flame, where giving it away costs the giver nothing. One light appears on a lakeshore at night, gets passed person to person up the hills, each person releases a lantern, and the dawn arrives in proportion to how many are lit.

## Files

| File | What |
|---|---|
| `index.html` | Plays the piece live in a browser, with sound. Click Play. |
| `lantern-valley.mp4` | The rendered film: 1080x1080, 30fps, H.264/AAC |
| `film.html` | The scene itself: vanilla JS on one Canvas 2D context, no libraries. Exposes `advance()`, which draws one frame |
| `render.py` | Steps `film.html` frame by frame in headless Chromium (Playwright) and pipes screenshots to ffmpeg. Writes `video.mp4` and `events.json` |
| `audio.py` | Synthesises the soundtrack (numpy/scipy) from `events.json`: a chord pad plus one bell per flame hand-off. Writes `audio.wav` |
| `events.json` | Time and position of each hand-off, logged by the render |
| `soundtrack.m4a` | The soundtrack, used by `index.html` |

## Re-rendering

Needs Python with `playwright`, `numpy` and `scipy`, a Chromium for Playwright, `ffmpeg`, and the Lora font installed locally.

```
python3 render.py
python3 audio.py
ffmpeg -i video.mp4 -i audio.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart lantern-valley.mp4
```

`render.py` looks for Chromium under `/opt/pw-browsers`; change `executable_path` if yours is elsewhere. The scene uses a seeded random generator and a fixed timestep, so every render is identical.

## Known rough edges

- The birds cross through the "CLAUDE" credit for a second or two near the end.
- The large out-of-focus foreground lanterns are subtle.
- `index.html` and `film.html` hold the same scene code; `index.html` adds the play button, font link and clock.
