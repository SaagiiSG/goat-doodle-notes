---
name: goat-doodle-notes
description: "Doodle Notes · Гар зураас. Keeps the user's phone clips as filmed (colour untouched) and adds thick white or black marker lines that draw themselves on: a ring round the product, a line under the price, arrows, stars, sparkles, hearts, short handwritten Mongolian notes, plain white captions, and, when a point deserves it, a full-screen paper sheet where the marker acts it out (a ticked list, one big word, a before and after). Claude places every ring around the real thing in the frames. Built on HyperFrames; renders a 1080x1920 MP4 for Reels/TikTok. Best for coaches, real estate (arrows to features), auto and ecommerce; safe for nail and hair colour (never graded). Use whenever the user wants doodles, hand-drawn arrows or circles, \"look here\" notes on a video, a hand-written page or list in a video, or types /goat-doodle-notes, /гар-зураас, or says \"гар зураастай болго\", \"дугуйлаад сумаар заа\", \"үнийн доор зураас тат\", \"draw arrows on my video\", \"doodle on it\", even if they don't name the skill."
---

# Doodle Notes · Гар зураас

The footage stays exactly as filmed. On top, thick marker lines draw themselves on, one stroke at a time: a ring round the product, an arrow, a star, a sparkle or a heart, and a short handwritten note that writes itself on word by word. The key line (price, phone, offer) writes on the same way and gets its own underline. Plain white captions show what is said. When a point deserves the whole screen, the footage gives way to a sheet of ruled paper and the marker acts it out: ticks down a list, one big word ringed, a before and after with an arrow, or the one sentence that matters with its key word underlined; then the paper slides away and the footage is back. The ink wobbles very slightly, like real marker. It is the only GOAT look that never touches the colour and adds nothing but drawn lines and paper.

**Good for:** coaches and health ("look here"), real estate (arrows to the big window, the new kitchen), auto (circle the wheel, underline the price), ecommerce (underline the price), nails and hair colour (the shade is never changed). Talking to the camera or silent footage both work.
**Not for:** shots where a line would have to cover the face or the product, and fast handheld footage (the lines stay where they are drawn; they don't follow moving things). If that is all the user has, say so and suggest another GOAT look.

Talk to the user in the language they write in (usually Mongolian). Keep messages short and plain; many users are not technical. `SKILL_DIR` means this skill's base directory (shown when the skill loads). Run commands from the user's project folder with absolute paths into `SKILL_DIR`. `goat` below means `node SKILL_DIR/scripts/goat.mjs`.

## 1. Setup check (first time on a machine)

**Every new video, first:** run `claude plugin marketplace update goat-doodle-notes`, then `claude plugin update goat-doodle-notes@goat-doodle-notes`. If it installs a new version, tell the user a new version was installed and ask them to type `/reload-plugins` before you go on. If either command fails (offline, or installed from a zip), carry on and don't mention it.

Run `node --version` (needs 22 or newer) and `ffmpeg -version`. If either is missing, show the install command and ask before installing (it is their computer):
- Mac: `brew install node ffmpeg whisper-cpp` (whisper-cpp makes the captions; Homebrew's build uses the Mac's graphics chip, so it is fast).
- Windows: `winget install OpenJS.NodeJS.LTS` and `winget install Gyan.FFmpeg`, then close and reopen the terminal. For captions, download `whisper-bin-x64.zip` from https://github.com/ggml-org/whisper.cpp/releases, unzip it, and set `HYPERFRAMES_WHISPER_PATH` to the `whisper-cli.exe` inside (`setx HYPERFRAMES_WHISPER_PATH "C:\path\to\whisper-cli.exe"`, then reopen the terminal). Without it the captions step tries to build Whisper and needs developer tools.

Footage with nobody talking needs no whisper-cpp (see step 3). The first talking video downloads, once, the speech model (Whisper large-v3-turbo, about 1.6 GB), and the first render a private copy of Chrome that draws the frames. Tell the user the first run takes a while; after that it starts at once. Nothing is uploaded: everything runs on their computer, with no account.

**Long steps:** the first `transcribe` (the 1.6 GB download) and every `render` can run longer than a normal command timeout. Run them in the background, or with a 600000 ms timeout, and wait for them to end. Never stop one and start it again: an interrupted download starts again from zero. Whisper needs about 2 GB of memory; on an 8 GB computer ask the user to close other heavy apps first.

**Windows has not been tested yet.** If a step fails there, show the error to the user in plain words.

## 2. Collect the clips and words

Make `raw/` and `output/` in the current folder. Ask for:
1. **The clips.** Drag them into the chat or copy them into `raw/`. Photos work too.
2. **What to point at,** in their words: "the new sofa", "the wheel", "the nail art".
3. **The words:** short notes of 1–3 words and one key line with the price, phone or offer the user gave. On a talking video, take them from what the speaker says. Never invent a price, phone number or date. Ask.

**What to film** (tell the user before they shoot, if they haven't yet): phone upright, and **hold it still for 2–3 seconds on each thing that gets a drawing**, so the ring stays round it. Leave some plain space (a wall, a table top) where a note can go. Someone talking to the camera: **film from the chest up**, the chin about halfway down the screen (no lower than y 1100 of 1920, a little past the middle), so the captions fit under the chin.

If they speak English, add `"language": "en"` to plan.json, so the transcript comes out in English (Whisper hears Mongolian otherwise).

Then run `goat probe raw/*`. It prints each file's size, length, whether it has sound, whether it is HDR, and `speech` spans (when someone is talking).

## 3. Prepare, transcribe, cut

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
2. `goat transcribe plan.json`: writes what the speaker says, word by word with times, to `.work-doodle-notes/transcript.json`, and prints it as caption lines. **No one talking** (probe shows no `speech` spans, or only music): skip this step and write `[]` into `.work-doodle-notes/transcript.json` instead. Captions and pause cutting turn off, and whisper-cpp isn't needed.
3. **Fix the words.** Whisper gets many Mongolian words wrong. Fix obvious spelling yourself, then show the user the caption lines and ask them to correct anything wrong. Change only the `text` of each word in `transcript.json`; keep `start` and `end`. If two words came out as one, split the time between them; if one word came out as two, give the merged word the first one's `start` and the second one's `end`. If Whisper missed words the user did say, add them with times between their neighbours. Never add words they didn't say; delete words Whisper made up. If the transcript is junk (music, no speech), write `[]` into `transcript.json`: captions and pause cutting turn off.
4. `goat cut plan.json`: cuts the pauses down to a short breath and moves the word times to match. It only cuts where it also hears quiet, never cuts photos or clips without sound, and stops with a message if it would cut more than 60% of the video. Add `"cut": false` to plan.json if the user doesn't want pauses cut. **If the words are fixed after this step, run `cut` again** (it is quick: the video is reused when the cuts don't change); `render` refuses to run on an old cut. Then read `.work-doodle-notes/words.json` (the words with their times after the cut) to time the notes, the key line and the pages.

## 4. Place the doodles and write the words

The user can't give you pixel positions, so you look. `cut.mp4` is the finished frame without the drawings, on the finished video's clock. For every doodle, pull two frames with a grid: one at `start` + 0.4 (when it has just drawn on) and one at `end` − 0.1. Never pull at `end` itself: a doodle usually ends on a cut, where that frame is already the next clip, and at the video's very end ffmpeg writes no file at all. For a ring from 1.0 to 3.0 s:

`ffmpeg -y -loglevel error -ss 1.4 -i .work-doodle-notes/cut.mp4 -frames:v 1 -vf "drawgrid=w=120:h=120:t=2:c=red@0.8,scale=540:-2" output/look-1.4.jpg`
and the same with `-ss 2.9` (`output/look-2.9.jpg`).

Read the images. It is half size: each red square is 120x120 pixels of the real 1080x1920 frame, and a point at (x, y) in the image is (2x, 2y) in the plan. Find the real object in both frames (things drift while the camera moves) and write every position in **pixels of the 1080x1920 frame**: (0, 0) is the top-left corner, (1080, 1920) the bottom-right.

While you look, decide the ink: **white** on dark and mid-tone areas, **black** on bright areas (white walls, sky, a white table).

Then add `doodles`, `texts`, `pages` and `look` to plan.json. Times are seconds on the finished video (a clip starts where the clips before it end). Take every note, line and page word from what the speaker says (the words you fixed in step 3), what the footage shows, or what the user gave you, never from the examples here:

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
    {"role": "line", "text": "Гоёл хумс", "y": 1130, "start": 4.2, "end": 6.0, "color": "white"}
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
- `line`: the key line (price, phone, offer) in Shantell Sans (up to 84 px), starting at x 120 and running right about 50 px a letter (a longer line shrinks to fit 840 px). **At most 34 characters a row** (spaces count): split a longer line into two rows with `\n`. Capitals are wider, so a row in capitals gets smaller type. `y` is its top (default 1104, or just above the captions when they sit low). It gets its own wavy underline under all its rows, drawn just after the last word. Don't add a separate underline doodle under it.
- Notes and lines always stay inside the area no app buttons cover (x 120–960, y 270–1248); one placed outside it is moved in. Keep a circle off the line's row, and point from a note to the thing with an arrow when the thing is outside that area.
- `color` (`white` or `black`) overrides `look.color` for one text.

**Captions** are made from `words.json` automatically: plain white Shantell Sans 56 px, 2–4 words at a time, a hard swap, no highlight, pop or animation. They keep **one height for the whole video**, set by `look.captionY` (their middle, 310–1200; default 1190, so they end at 1230, inside the safe area). Read the frames you pulled and choose it:
- **Chest-up shot** (the chin stays above y 1100): set it about 70 px under the lowest the chin goes, or leave the default 1190.
- **Close-up** (the chin goes below y 1100, so captions under it would leave the safe area): put them above the head instead, about 330–400, and check every frame you pulled: the captions' band (`captionY` ± 40) must stay clear of the top of the hair as the head moves. Tell the user a chest-up shot fits captions better.
- While a caption shows, **no note, line or doodle may cross the captions' band**: `render` refuses and names the one that does and the caption it meets. Move it, change `captionY`, or turn captions off with `"captions": false`. A key `line` without its own `y` sits just above low captions on its own.
- While a page is up, the captions turn to the page's dark ink (same font and size, no shadow), and the page writes on the larger side of them, a little smaller when that side is short.

**pages:** when a point deserves the whole screen, the footage gives way to a sheet of warm ruled paper that slides up with a little turn and settles, the marker acts the point out in Caveat at handwriting speed, and the sheet slides away. Use one to act out what the video says or shows, in the speaker's or the user's own words: what's included, a number or word to remember, a before and after, the one line that matters. One or two pages in a video is plenty; never fill one with example text.

```json
{
  "pages": [
    {"kind": "list", "items": ["Буйдан", "Хөшиг", "Зөөлөн дэр"], "start": 6.4, "end": 11.0},
    {"kind": "big", "text": "Урлаг", "start": 12.0, "end": 16.0},
    {"kind": "compare", "before": "Энгийн", "after": "Урлаг", "start": 17.0, "end": 21.4},
    {"kind": "note", "text": "Хумс бүр\n*гараар* зурагдана", "start": 21.4, "end": 26.1}
  ]
}
```

| kind | needs | what the marker does |
|---|---|---|
| `list` | `items`: 2–4 short items, one row each, **20 characters at most** | writes each item, then ticks it, one after another |
| `big` | `text`: one number or word, **8 characters at most** | writes it large, then rings it (5 characters or fewer) or underlines it twice (longer) |
| `compare` | `before`, `after`: one short word or number each, **18 characters at most** | writes the first, draws an arrow down, writes the second and underlines it |
| `note` | `text`: one short sentence, **3 rows of 23 characters at most** (`\n` between rows), its key word marked `*like this*` | writes the rows, then underlines the key word |

Characters count spaces. `start` is when the sheet starts to come in; `end` (default: the end of the video) is when it has gone. A page that runs to the end of the video stays there; one from `"start": 0` is already written on the first frame.

**Page timing** (the render refuses a plan that breaks these, with the time it needs):
- The sheet comes in over 0.6 s and leaves over 0.5 s. Writing starts once it has landed.
- The marker writes at a handwriting pace: `list` 14 letters a second, `note` 12, `compare` 10, `big` 5. A tick takes 0.25 s, an underline 0.35 s, an arrow 0.45 s, a ring 0.55 s, a double underline twice 0.3 s, with 0.1 s between strokes.
- A page lasts at least **0.6 s in + its writing + 1 s to read + 0.5 s out** (no 0.5 s out when it stays to the end or the next page replaces it). For example: a ringed 5-letter `big` about 3.8 s, a 3-item `list` of short words about 4.6 s, a two-row `note` of 25 letters about 4.7 s.
- One page at a time. Leave **at least 1 s of footage between two pages**, or start the next page exactly when the last one ends: it slides over it, paper on paper, without the footage coming back.
- No doodle, note or line may be drawing on while a page is up. Ones drawn before it hide under the paper and come back after it.
- Each sheet coming in or leaving is a gradual change of brightness (dimmed paper that lights up as it lands), and these rules keep them at least 1 s apart, so a page never flashes.

**The first frame is the Reels thumbnail.** Anything with `"start": 0` is already drawn on it, so give the first note (or the first ring) `"start": 0` and the thumbnail says what the video is about.

**look** options:
- `color`: `white` (default) or `black`. The ink for everything on the footage that doesn't set its own `color`. Pages are always dark ink on paper.
- `captionY`: the captions' height (see Captions).

**Auto sound effects** (soft, so they sit under the clips' own sound; raise them with `"sfx": {"volume": 1.5}`): a marker scratch while each doodle draws and while each note or line writes on, a soft paper sound as each sheet comes in and one short scratch as it starts writing. Nothing for what is already there on the first frame, and never two within 0.5 s.

**Timing:** draw one thing at a time, about 0.3–0.6 s apart: note first, then the arrow, then the ring, then the key line. Two moves sell: a ring round the product and a line under the price. Three to five drawings per shot is plenty. On a talking video, start each drawing or page a moment before the words it shows are said.

Before rendering, tell the user the plan in plain words (each shot, what gets circled or pointed at, the words, each page and what it says, the ink colour, where the captions go) and ask "OK?". This is the only approval needed.

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

It draws the lines, words, captions and pages over the footage, mixes the sound and writes the MP4 plus a contact sheet (one frame per second) at `.work-doodle-notes/sheet.jpg`. On our test Mac a 12 s video with two pages took 20–30 s and a 6 s talking one about 13 s. Run the next render only after the last one ends. Read the contact sheet, the first frame and, for each shot, one full-size frame just before its drawings fade, and one with each page fully written:
`ffmpeg -y -loglevel error -ss 2.7 -i output/doodle-notes.mp4 -frames:v 1 output/check-1.jpg` (and one per shot and page).
Check that:
- the first frame (the thumbnail) shows the footage and the first note or ring;
- each ring is round the right thing, each arrow points at it, and no line covers a face or the product;
- the ink stands out (swap `color` if not), and no note or line crosses a ring or another word;
- the captions never cover the face, the mouth or the top of the hair;
- each page's words are spelled right and fit what is said.
Move things and render again if needed.

If a render fails twice, stop and explain the error in plain words. Don't loop.

## 6. Hand over

Tell the user where the file is (`output/doodle-notes.mp4`) and that it is ready to post. Music can be added in the Instagram/TikTok app.

## Rules

- Every word and graphic on screen comes from what this video says or shows, or from what the user gave you. The examples in this file are only examples: never put them in a video. If the user hasn't given the words, ask.
- The footage is never graded. Don't add a grade, filter or colour change: that is the point of this look.
- Anything the viewer must read (price, phone, offer) goes in `line`, which always sits inside the area no app buttons cover. Never invent a price, number or date; ask.
- Every ring and arrow is placed from a frame you looked at, and so is the captions' height. Never guess a position.
- Use only the fonts bundled in `SKILL_DIR/fonts` (Caveat and Shantell Sans; they have Ө ө Ү ү). Don't swap in other fonts. Emoji and symbols such as ★ ♥ → can't be drawn: use a `star` or `heart` doodle instead.
- Captions stay plain (white on the footage, dark ink on a page) with no highlight, pop or bounce.
- Lines, notes, captions and paper pages only: no stickers, photos or cut-outs (that is a different GOAT look).
- The speech model and Chrome run on the user's computer. Nothing is uploaded.
- The output is 1080x1920, 30 fps, H.264, sound normalised to -14 LUFS (Instagram/TikTok level).
