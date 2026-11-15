---
name: goat-doodle-notes
description: Doodle Notes · Гар зураас. Keeps the user's phone clips exactly as filmed (colour untouched) and adds thick white or black hand-drawn marker lines that draw themselves on - a ring round the product, a line under the price, arrows, stars, sparkles, hearts and short handwritten Mongolian notes that write on word by word. Claude looks at the real frames and places every ring around the real thing. Built on HyperFrames. Renders a 1080x1920 MP4 for Reels/TikTok. Best for coaches and health ("look here"), real estate (arrows to features), auto (circle the wheel or the price), ecommerce (underline the price); safe for nail and hair colour because the footage is never graded. Use whenever the user wants doodles, hand-drawn arrows or circles, "look here" notes on a video, or types /goat-doodle-notes, /гар-зураас, or says "гар зураастай болго", "дугуйлаад сумаар заа", "үнийн доор зураас тат", "draw arrows on my video", "doodle on it", even if they don't name the skill.
---

# Doodle Notes · Гар зураас

The footage stays exactly as filmed. On top, thick marker lines draw themselves on, one stroke at a time: a ring round the product, an arrow, a star, a sparkle or a heart, and a short handwritten note that writes itself on word by word. The key line (price, phone, offer) writes on the same way and gets its own underline. The ink wobbles very slightly, like real marker. It is the only GOAT look that never touches the colour and adds nothing but drawn lines.

**Good for:** coaches and health ("look here"), real estate (arrows to the big window, the new kitchen), auto (circle the wheel, underline the price), ecommerce (underline the price), nails and hair colour (the shade is never changed).
**Not for:** shots where a line would have to cover the face or the product, and fast handheld footage (the lines stay where they are drawn; they don't follow moving things). If that is all the user has, say so and suggest another GOAT look.

Talk to the user in the language they write in (usually Mongolian). Keep messages short and plain; many users are not technical. `SKILL_DIR` means this skill's base directory (shown when the skill loads). Run commands from the user's project folder with absolute paths into `SKILL_DIR`. `goat` below means `node SKILL_DIR/scripts/goat.mjs`.

## 1. Setup check (first time on a machine)

Run `node --version` (needs 22 or newer) and `ffmpeg -version`. If either is missing, show the install command and ask before installing (it is their computer):
- Mac: `brew install node ffmpeg`
- Windows: `winget install OpenJS.NodeJS.LTS` and `winget install Gyan.FFmpeg`, then close and reopen the terminal.

This look has no captions, so it needs no speech model. The first render downloads, once, a private copy of Chrome that draws the frames. Tell the user the first run takes a while; after that it starts at once. Nothing is uploaded: everything runs on their computer, with no account.

**Long steps:** the first `render` (the Chrome download) can run longer than a normal command timeout. Run it in the background, or with a 600000 ms timeout, and wait for it to end. Never stop it and start it again.

**Windows has not been tested yet.** If a step fails there, show the error to the user in plain words.

## 2. Collect the clips and words

Make `raw/` and `output/` in the current folder. Ask for:
1. **The clips.** Drag them into the chat or copy them into `raw/`. Photos work too.
2. **What to point at,** in their words: "the new sofa", "the wheel", "the nail art".
3. **The words:** short notes of 1–3 words ("Том цонх", "Шинэ загвар") and one key line with the price, phone or offer ("3 өрөө байр", "Гоёл 35 000₮"). Never invent a price, phone number or date. Ask.

**What to film** (tell the user before they shoot, if they haven't yet): phone upright, and **hold it still for 2–3 seconds on each thing that gets a drawing**, so the ring stays round it. Leave some plain space (a wall, a table top) where a note can go.

Then run `goat probe raw/*`. It prints each file's size, length, whether it has sound, whether it is HDR, and `speech` spans (when someone is talking).

## 3. Prepare

Write `plan.json` in the project folder with just the clips for now (paths are relative to it):

```json
{
  "output": "output/doodle-notes.mp4",
  "clips": [
    {"src": "raw/living.mov", "in": 0.5, "out": 3.5},
    {"src": "raw/nails.mov", "in": 0.0, "out": 3.0}
  ]
}
```

**clips** play in order with plain cuts. `in`/`out` trim a video (seconds); `dur` sets how long a photo shows. `cx`/`cy` (0–1, default 0.5) choose which part of a wider frame is kept. Add `"sound": false` to mute one clip.

Then run these in order. Each one says what to run first if a step is missing.
1. `goat prep plan.json`: joins the clips into one upright 1080x1920 video, colour untouched. **Run it again whenever `clips` change**, and place the doodles again after it.
2. `goat cut plan.json`: this look never cuts pauses; the step only readies the video (`.work-doodle-notes/cut.mp4`) and takes a second.

## 4. Place the doodles and write the words

The user can't give you pixel positions, so you look. `cut.mp4` is the finished frame without the drawings, on the finished video's clock. For every doodle, pull two frames with a grid: one at `start` + 0.4 (when it has just drawn on) and one at `end` − 0.1. Never pull at `end` itself: a doodle usually ends on a cut, where that frame is already the next clip, and at the video's very end ffmpeg writes no file at all. For a ring from 1.0 to 3.0 s:

`ffmpeg -y -loglevel error -ss 1.4 -i .work-doodle-notes/cut.mp4 -frames:v 1 -vf "drawgrid=w=120:h=120:t=2:c=red@0.8,scale=540:-2" output/look-1.4.jpg`
and the same with `-ss 2.9` (`output/look-2.9.jpg`).

Read the images. It is half size: each red square is 120x120 pixels of the real 1080x1920 frame, and a point at (x, y) in the image is (2x, 2y) in the plan. Find the real object in both frames (things drift while the camera moves) and write every position in **pixels of the 1080x1920 frame**: (0, 0) is the top-left corner, (1080, 1920) the bottom-right.

While you look, decide the ink: **white** on dark and mid-tone areas, **black** on bright areas (white walls, sky, a white table).

Then add `doodles`, `texts` and `look` to plan.json. Times are seconds on the finished video (a clip starts where the clips before it end):

```json
{
  "output": "output/doodle-notes.mp4",
  "clips": [
    {"src": "raw/living.mov", "in": 0.5, "out": 3.5},
    {"src": "raw/nails.mov", "in": 0.0, "out": 3.0}
  ],
  "doodles": [
    {"shape": "arrow",   "from": [620, 470], "to": [850, 590],  "start": 0.5, "end": 3.0},
    {"shape": "circle",  "box": [640, 975, 975, 1235],          "start": 1.0, "end": 3.0},
    {"shape": "sparkle", "box": [560, 900, 660, 1000],          "start": 1.5, "end": 3.0},
    {"shape": "circle",  "box": [320, 860, 590, 1100],          "start": 3.6, "end": 6.0, "color": "white"},
    {"shape": "heart",   "box": [750, 1100, 870, 1215],         "start": 4.9, "end": 6.0, "color": "white"}
  ],
  "texts": [
    {"role": "note", "text": "Том цонх", "at": [400, 420], "start": 0, "end": 3.0},
    {"role": "line", "text": "3 өрөө байр", "y": 760, "start": 1.9, "end": 3.0},
    {"role": "note", "text": "Шинэ\nзагвар", "at": [300, 700], "start": 3.2, "end": 6.0, "color": "white"},
    {"role": "line", "text": "Гоёл 35 000₮", "y": 1130, "start": 4.2, "end": 6.0, "color": "white"}
  ],
  "look": {"color": "black"}
}
```

**doodles** are the drawn lines, in 16 px marker. Each one draws itself on over 0.4 s from `start`, holds with a slight wobble, and fades out over the last 0.25 s before `end` (default: the end of the video). `color` (`white` or `black`) overrides `look.color` for one doodle.

| shape | needs | what it draws |
|---|---|---|
| `circle` | `box`: [left, top, right, bottom] round the thing | a quick pen ring, an oval that touches the box's four sides, ends overlapping |
| `underline` | `from`, `to`: [x, y] start and end | a slightly wavy line |
| `arrow` | `from`: [x, y] tail, `to`: [x, y] tip (on the edge of the thing it points at) | a bowed shaft, then the arrow head |
| `star` | `box`: the square it fills | a one-line pen star |
| `sparkle` | `box` | a four-point twinkle |
| `heart` | `box` | a one-line heart |

- **Circles:** draw the box round the object in both frames, with about 10% room on every side: the ring is an oval, so it cuts the corners of a box drawn tight on a square thing. It never goes more than 8% outside its box.
- Every `box` must be inside the frame and at least 80 px each way. Arrows and underlines need at least 40 px between `from` and `to`.
- Keep lines off faces and off the product itself: ring round it, point at its edge.

**texts** (both write themselves on word by word: each word appears whole, 0.12 s after the one before):
- `note`: handwritten (Caveat, up to 120 px), 1–3 words next to what it points at, tilted slightly. `at`: [x, y] is the centre of the note. `\n` breaks it into rows. About 45 px a letter wide at full size; a longer row shrinks to fit 840 px. **At most 36 characters a row** (spaces count): split a longer note into rows with `\n`.
- `line`: the key line (price, phone, offer) in Shantell Sans (up to 84 px), starting at x 120 and running right about 50 px a letter (a longer line shrinks to fit 840 px). **At most 34 characters a row** (spaces count): split a longer line into two rows with `\n`. Capitals are wider, so a row in capitals gets smaller type. `y` (default 1104) is its top. It gets its own wavy underline under all its rows, drawn just after the last word. Don't add a separate underline doodle under it.
- Notes and lines always stay inside the area no app buttons cover (x 120–960, y 270–1248); one placed outside it is moved in. Keep a circle off the line's row, and point from a note to the thing with an arrow when the thing is outside that area.
- `color` (`white` or `black`) overrides `look.color` for one text.

**The first frame is the Reels thumbnail.** Anything with `"start": 0` is already drawn on it, so give the first note (or the first ring) `"start": 0` and the thumbnail says what the video is about.

**look** options:
- `color`: `white` (default) or `black`. The ink for everything that doesn't set its own `color`.

**Auto sound effects** (soft, so they sit under the clips' own sound; raise them with `"sfx": {"volume": 1.5}`): a marker scratch while each doodle draws and while each note or line writes on. Nothing for what is already there on the first frame.

**Timing:** draw one thing at a time, about 0.3–0.6 s apart: note first, then the arrow, then the ring, then the key line. Two moves sell: a ring round the product and a line under the price. Three to five drawings per shot is plenty.

Before rendering, tell the user the plan in plain words (each shot, what gets circled or pointed at, the words, the ink colour) and ask "OK?". This is the only approval needed.

<!-- audio: this section is copied from core/skill-audio-node.md by build.py; edit it there -->
## Sound effects, voice-over and music

**Sound effects are on by default.** The look adds its own (see "Auto sound effects" above). They are made in code, so there's nothing to license, and they sit quietly under the voice.
- Turn them off: `"sfx": false`. Make them quieter or louder: `"sfx": {"volume": 0.6}`.
- Add one: `"sfx": {"add": [{"sound": "ding", "at": 4.2}]}`. Sounds: whoosh, swish, pop, click, type, shutter, boom, thud, hit, riser, ding, notify, shimmer, paper, tape, marker, projector, tick. `type`, `marker`, `projector` and `riser` also take `"dur"` in seconds; a riser should end on the moment it builds to.
- Let the user hear one render before adding more. Too many sounds feel cheap.

**Voice-over.** If the user wants to talk over the video, ask them to record it on their phone (a voice memo is fine: m4a, mp3 or wav) and copy it into `raw/`. Then add `"voiceover": {"src": "raw/vo.m4a", "at": 0.5}` (`at` = when it starts; optional `"volume"`). While the voice plays, the clips' own sound and the music dip automatically. Run `node SKILL_DIR/scripts/goat.mjs probe raw/vo.m4a` to get its `speech` spans and time the words on screen to them. The clips must add up to at least the voice-over's length (the render warns if not). Recording tips for the user: a small quiet room (a parked car or a wardrobe works), phone about 20 cm from the mouth, read the script out loud once before recording.

**Music.** `"music": {"src": "raw/song.mp3", "volume": 0.25}`. Only use music the user has the rights to. Music added inside the Instagram/TikTok app is the safe choice, so suggest that first.
<!-- /audio -->

## 5. Render and check

`goat render plan.json`

It draws the lines and words over the footage, mixes the sound and writes the MP4 plus a contact sheet (one frame per second) at `.work-doodle-notes/sheet.jpg`. On our test Mac a 9 s video took about 15 s and a 3 s one about 8 s. Run the next render only after the last one ends. Read the contact sheet, the first frame and, for each shot, one full-size frame just before its drawings fade:
`ffmpeg -y -loglevel error -ss 2.7 -i output/doodle-notes.mp4 -frames:v 1 output/check-1.jpg` (and one per shot).
Check that:
- the first frame (the thumbnail) shows the footage and the first note or ring;
- each ring is round the right thing, each arrow points at it, and no line covers a face or the product;
- the ink stands out (swap `color` if not), and no note or line crosses a ring or another word.
Move things and render again if needed.

If a render fails twice, stop and explain the error in plain words. Don't loop.

## 6. Hand over

Tell the user where the file is (`output/doodle-notes.mp4`) and that it is ready to post. Captions and music can be added in the Instagram/TikTok app.

## Rules

- The footage is never graded. Don't add a grade, filter or colour change: that is the point of this look.
- Anything the viewer must read (price, phone, offer) goes in `line`, which always sits inside the area no app buttons cover. Never invent a price, number or date; ask.
- Every ring and arrow is placed from a frame you looked at. Never guess a position.
- Use only the fonts bundled in `SKILL_DIR/fonts` (Caveat and Shantell Sans; they have Ө ө Ү ү). Don't swap in other fonts. Emoji and symbols such as ★ ♥ → can't be drawn: use a `star` or `heart` doodle instead.
- Lines only: no stickers, paper or cut-outs (that is a different GOAT look).
- The output is 1080x1920, 30 fps, H.264, sound normalised to -14 LUFS (Instagram/TikTok level).
