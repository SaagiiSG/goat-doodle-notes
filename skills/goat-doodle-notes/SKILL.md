---
name: goat-doodle-notes
description: Doodle Notes · Гар зураас. Keeps the user's phone clips exactly as filmed (colour untouched) and adds thin white hand-drawn marker lines that draw themselves on - a circle round the product, a line under the price, arrows, stars, hearts and short handwritten Mongolian notes. Renders a 1080x1920 MP4 for Reels/TikTok. Best for coaches and health ("look here"), real estate (arrows to features), auto (circle the wheel or the price), ecommerce (underline the price); safe for nail and hair colour because the footage is never graded. Use whenever the user wants doodles, hand-drawn arrows or circles, "look here" notes on a video, or types /goat-doodle-notes, /гар-зураас, or says "гар зураастай болго", "дугуйлаад сумаар заа", "үнийн доор зураас тат", "draw arrows on my video", "doodle on it", even if they don't name the skill.
---

# Doodle Notes · Гар зураас

The footage stays exactly as filmed. On top, thin marker lines draw themselves on, one stroke at a time: a circle round the product, a line under the price, an arrow, a star or a heart, and a short handwritten note. The lines wobble very slightly, like real ink. It is the only GOAT look that never touches the colour and adds nothing but drawn lines.

**Good for:** coaches and health ("look here"), real estate (arrows to the big window, the new kitchen), auto (circle the wheel, underline the price), ecommerce (underline the price), nails and hair colour (the shade is never changed).
**Not for:** shots where a line would have to cover the face or the product, and fast handheld footage (the lines don't follow moving things). If that is all the user has, say so and suggest another GOAT look.

Talk to the user in the language they write in (usually Mongolian). Keep messages short and plain; many users are not technical. `SKILL_DIR` means this skill's base directory (shown when the skill loads). Run commands from the user's project folder with absolute paths into `SKILL_DIR`.

## 1. Setup check (first time on a machine)

Run `ffmpeg -version` and `uv --version`. If either is missing, show the install command and ask before installing (it is their computer):
- Mac: `brew install ffmpeg uv`
- Windows: `winget install Gyan.FFmpeg` and `winget install astral-sh.uv`, then close and reopen the terminal.

The first render downloads a small Python package (Pillow) once. After that it is instant.

## 2. Collect the clips and words

Make `raw/` and `output/` in the current folder. Ask for:
1. **The clips.** Drag them into the chat or copy them into `raw/`. Photos work too. Tell them what to film: **hold the phone still for 2–3 seconds wherever a drawing will go**, so the line doesn't have to chase a moving thing.
2. **What to point at,** in their words: "the new sofa", "the wheel", "the nail art".
3. **The words:** short notes of 1–4 words ("Том цонх", "Шинэ загвар") and one key line with the price, phone or offer ("3 өрөө байр · 9911-2233"). Never invent a price, phone number or date. Ask.

If this folder was already edited with `goat-video-editor`, use `output/cut.mp4` as the clip and `transcript/cut_words.json` (each word's `start`/`end` in seconds) to start a doodle on the word it shows.

Then run: `uv run SKILL_DIR/scripts/goatcut.py probe raw/*`
It prints each file's size, length, whether it has sound, whether it is HDR, and `speech` spans (when someone is talking).

### Look at the frames and place the doodles

The user can't give you pixel positions, so you look. For every shot that gets a drawing, pull one frame at the moment the drawing will show, cropped to the final 9:16 frame, with a grid:

`ffmpeg -y -loglevel error -ss SECONDS_INTO_THE_FILE -i raw/IMG_0412.MOV -frames:v 1 -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,drawgrid=w=108:h=192:t=2:c=red@0.7,scale=540:-2" output/look-1.jpg`

Read the image. The red lines are every 0.1 of the width and height: (0, 0) is the top-left corner, (1, 1) the bottom-right. Write every position in the plan as these fractions. If a clip has `cx`/`cy` in the plan, use `crop=1080:1920:(iw-1080)*CX:(ih-1920)*CY` instead (CX, CY = its numbers).

While you look, decide the ink: **white** on dark and mid-tone areas, **black** on bright areas (white walls, sky, a white table).

## 3. Write plan.json

Write `plan.json` in the project folder. Paths are relative to it.

```json
{
  "output": "output/doodle-notes.mp4",
  "clips": [
    {"src": "raw/living.mov", "in": 0.5, "out": 3.5},
    {"src": "raw/nails.mov", "in": 0.0, "out": 3.0}
  ],
  "doodles": [
    {"shape": "arrow",   "from": [0.56, 0.24], "to": [0.80, 0.32], "start": 0.5, "end": 3.0},
    {"shape": "circle",  "box": [0.62, 0.51, 0.84, 0.61],          "start": 1.0, "end": 3.0},
    {"shape": "sparkle", "at": [0.56, 0.50],                       "start": 1.5, "end": 3.0},
    {"shape": "circle",  "box": [0.33, 0.53, 0.55, 0.61],          "start": 3.3, "end": 6.0, "color": "white"},
    {"shape": "heart",   "at": [0.86, 0.46], "size": 0.1,          "start": 3.9, "end": 6.0, "color": "white"}
  ],
  "texts": [
    {"role": "note", "text": "Том цонх", "at": [0.40, 0.19], "start": 0.2, "end": 3.0},
    {"role": "line", "text": "3 өрөө байр · 9911-2233", "y": 0.44, "start": 1.9, "end": 3.0},
    {"role": "note", "text": "Шинэ\nзагвар", "at": [0.28, 0.33], "start": 3.4, "end": 6.0, "color": "white"},
    {"role": "line", "text": "Гоёл 35 000₮", "y": 0.62, "start": 4.2, "end": 6.0, "color": "white"}
  ],
  "look": {"color": "black"}
}
```

**clips** play in order with plain cuts. `in`/`out` trim a video (seconds); `dur` sets how long a photo shows. `cx`/`cy` (0–1, default 0.5) choose which part of a wide frame is kept. Add `"sound": false` to mute one clip.

**doodles** are the drawn lines. Every doodle has `start` and `end` (seconds on the finished video; a clip starts where the clips before it end). It draws itself on over 0.4 s from `start`, holds with a slight wobble, and fades out over the last 0.25 s before `end`. `color` (`white` or `black`) overrides `look.color` for one doodle.

| shape | needs | what it draws |
|---|---|---|
| `circle` | `box`: [left, top, right, bottom] of the thing to circle | a quick pen ring a little outside the box, ends overlapping |
| `underline` | `from`, `to`: [x, y] start and end | a slightly wavy line |
| `arrow` | `from`: [x, y] tail, `to`: [x, y] tip (the thing it points at) | a bowed shaft, then the arrow head |
| `star` | `at`: [x, y] centre, optional `size` (width as a fraction of the screen, default 0.08) | a one-line pen star |
| `sparkle` | `at`, optional `size` (default 0.06) | a small plus-shaped twinkle |
| `heart` | `at`, optional `size` (default 0.1) | a one-line heart |

**texts** (all write themselves on from left to right in 0.4 s):
- `note`: handwritten (Caveat), 1–4 words next to what it points at, tilted slightly. `at`: [x, y] is the centre of the note (default [0.42, 0.19]). Use `\n` to break it into two lines.
- `line`: the key line (price, phone, offer) in Shantell Sans, left-aligned at the safe edge. `y` (default 0.575) is its top. It always stays inside the area no app buttons cover (y 0.14–0.65), and it gets its own underline, drawn just after the words. Don't add a separate underline doodle under it.
- `color` (`white` or `black`) overrides `look.color` for one text.

**Auto sound effects:** a quiet marker scratch for 0.4 s while each doodle, note and line draws itself on.

**look** options:
- `color`: `white` (default) or `black`. The ink for everything that doesn't set its own `color`.

**Timing:** draw one thing at a time, about 0.3–0.6 s apart: note first, then the arrow, then the circle, then the key line. Two moves sell: a circle round the product and a line under the price. Three to five doodles per shot is plenty. Keep lines off faces and off the product itself.

Before rendering, tell the user the plan in plain words (each shot, what gets circled or pointed at, the words, the ink colour) and ask "OK?". This is the only approval needed.

<!-- audio: this section is copied from core/skill-audio.md by build.py; edit it there -->
## Sound effects, voice-over and music

**Sound effects are on by default.** The look adds its own (see "Auto sound effects" above). They are made in code, so there's nothing to license, and they sit quietly under the voice.
- Turn them off: `"sfx": false`. Make them quieter or louder: `"sfx": {"volume": 0.6}`.
- Add one: `"sfx": {"add": [{"sound": "ding", "at": 4.2}]}`. Sounds: whoosh, swish, pop, click, type, shutter, boom, thud, hit, riser, ding, notify, shimmer, paper, tape, marker, projector, tick. `type`, `marker`, `projector` and `riser` also take `"dur"` in seconds; a riser should end on the moment it builds to.
- Let the user hear one render before adding more. Too many sounds feel cheap.

**Voice-over.** If the user wants to talk over the video, ask them to record it on their phone (a voice memo is fine: m4a, mp3 or wav) and copy it into `raw/`. Then add `"voiceover": {"src": "raw/vo.m4a", "at": 0.5}` (`at` = when it starts; optional `"volume"`). While the voice plays, the clips' own sound and the music dip automatically. Run `goatcut.py probe raw/vo.m4a` to get its `speech` spans and time the words on screen to them. The clips must add up to at least the voice-over's length (the render warns if not). Recording tips for the user: a small quiet room (a parked car or a wardrobe works), phone about 20 cm from the mouth, read the script out loud once before recording.

**Music.** `"music": {"src": "raw/song.mp3", "volume": 0.25}`. Only use music the user has the rights to. Music added inside the Instagram/TikTok app is the safe choice, so suggest that first.
<!-- /audio -->

## 4. Render and check

`uv run SKILL_DIR/scripts/render.py plan.json`

A 30 s video takes about 30–60 s. Then look at three frames, each a moment after a doodle has finished drawing:
`ffmpeg -y -loglevel error -ss 2.8 -i output/doodle-notes.mp4 -frames:v 1 -vf scale=540:-2 output/check-1.jpg` (and two more). Read them. Check that each circle is round the right thing, each arrow points at it, the ink stands out (swap `color` if not), and no line covers a face or the product. Move things and render again if needed.

If a render fails twice, stop and explain the error in plain words. Don't loop.

## 5. Hand over

Tell the user where the file is (`output/doodle-notes.mp4`) and that it is ready to post. Captions and music can be added in the Instagram/TikTok app.

## Rules

- The footage is never graded. Don't add a grade, filter or colour change: that is the point of this look.
- Anything the viewer must read (price, phone, offer) goes in `line`, which always sits inside the area no app buttons cover.
- Use only the fonts bundled in `SKILL_DIR/fonts` (they have Ө ө Ү ү). Don't swap in other fonts.
- Lines only: no stickers, paper or cut-outs (that is a different GOAT look).
- The output is 1080x1920, 30 fps, H.264, sound normalised to -14 LUFS (Instagram/TikTok level).
