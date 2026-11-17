// 04 Doodle Notes. Reads window.PLAN (written by goat.mjs; every stroke's path, every visual's layout and timing and
// the captions' height are worked out there) and builds one paused GSAP timeline. Anything that starts at 0 is already
// drawn on frame 0, the thumbnail.
const P = window.PLAN, T = P.T;
const NS = "http://www.w3.org/2000/svg";
const $ = (s) => document.querySelector(s);
const el = (tag, cls, parent, text) => {
  const e = parent.appendChild(document.createElement(tag));
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const tl = gsap.timeline({ paused: true });
const ink = $("#ink");
const DEF = P.look.color ?? "white", OUT = 0.25, FIRST = 1 / 30;
const clamp = (x, a, b) => Math.min(Math.max(x, a), Math.max(a, b));
// a path made in a unit box, moved to (x0, y0) and stretched sx, sy
const place = (d, x0, y0, sx = 1, sy = 1) => d.replace(/(-?[\d.]+),(-?[\d.]+)/g,
  (_, x, y) => `${(x0 + x * sx).toFixed(1)},${(y0 + y * sy).toFixed(1)}`);

// Show from `start`; fade out over the last 0.25 s before `end`, unless it stays to the end of the video.
function life(e, start, end) {
  if (start >= FIRST) {
    gsap.set(e, { opacity: 0 });
    tl.set(e, { opacity: 1 }, start);
  }
  if (end < P.dur - 0.01) tl.to(e, { opacity: 0, duration: OUT, ease: "goat.out" }, Math.max(start, end - OUT));
}

// One doodle: each stroke in its three boiled copies (.v0–.v2). The strokes draw on one after another
// with stroke-dashoffset, sharing `draw` seconds by length. Returns [variant][stroke] paths.
function doodle(paths, color, start, end, parent = ink, draw = P.draw) {
  const g = parent.appendChild(document.createElementNS(NS, "g"));
  g.setAttribute("class", color);
  const vs = paths.map((d, v) => {
    const vg = g.appendChild(document.createElementNS(NS, "g"));
    vg.setAttribute("class", `v${v}`);
    return d.split(/(?=M)/).map((s) => {
      const p = vg.appendChild(document.createElementNS(NS, "path"));
      p.setAttribute("d", s);
      p.setAttribute("pathLength", "1");
      return p;
    });
  });
  if (start >= FIRST) {
    const lens = vs[0].map((p) => p.getTotalLength()), total = lens.reduce((a, b) => a + b, 0);
    let at = start;
    lens.forEach((len, j) => {
      const dur = (draw * len) / total;
      tl.fromTo(vs.map((v) => v[j]), { attr: { "stroke-dashoffset": 1 } },
        { attr: { "stroke-dashoffset": 0 }, duration: dur, ease: j ? "power1.out" : "power1.inOut" }, at);
      at += dur;
    });
  }
  life(g, start, end);
  return vs;
}

for (const d of P.doodles) doodle(d.paths, d.color ?? DEF, d.start, d.end);

// Notes and the key line write on word by word: each word appears whole, never cut mid-way.
const notes = [], lines = [];
for (const t of P.texts) {
  const e = el("div", `${t.role} ${t.color ?? DEF}`, $("#texts"));
  const spans = [];
  for (const row of String(t.text).split("\n")) {
    const r = el("div", "", e);
    row.trim().split(/\s+/).forEach((w, i) => {
      if (i) r.appendChild(document.createTextNode(" "));
      spans.push(el("span", "w", r, w));
    });
  }
  const start = t.start ?? 0, end = t.end ?? P.dur;
  if (start >= FIRST)
    spans.forEach((s, i) => tl.fromTo(s, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.1, ease: "power2.out" }, start + i * P.step));
  life(e, start, end);
  if (t.role === "note") notes.push({ el: e, at: t.at ?? [454, 365] });
  else {
    // its own underline, drawn just after the last word
    const at = start < FIRST ? start : start + (spans.length - 1) * P.step + 0.1;
    lines.push({ el: e, y: t.y, under: t.under, paths: doodle(t.under, t.color ?? DEF, at, end) });
  }
}

// ---------------------------------------------------------------- visuals: on paper, or over the footage
// Every visual on the paper (an old page too) comes on its own sheet. The sheet slides up from just below the frame
// (0.6 s), turning from 7° and dropping from 104% onto the desk; coming in from the footage it is lit up from 72% as it
// lands, so the light comes on gradually (one flash). It leaves up and off (0.5 s). One that replaces another slides over
// it, paper on paper, with no change of light; in a voice-only video the paper fills the frame all along. The core
// (goat-visuals.js) draws the parts at the times Node gave them; the hooks below make them marker: each row written
// behind a soft nib, each stroke boiling with the rest, a bar filling bottom-up as it rises. Doodles and notes on the
// footage hide while a sheet is up. A visual over the footage is drawn straight on it, in the look's ink.
const { EASE } = GOAT.visuals, V = P.visuals;
const PAPER = P.voice && !P.clips.length; // a voice-over with no clips: all paper; over clips the footage stays
const Y_IN = 2000, Y_OUT = -2100; // the 2060 px sheet starts and ends off screen
const boil = [];
let nPath = 0;
// each stroke's other two copies, shown by the boil (#art's data-v) through CSS "d"
function boiled(e, p) {
  if (!e.paths || !p.d || p.d.length < 3) return;
  const copies = p.d.map((d) => d.split(/(?=M)/).map((x) => x.trim()));
  e.paths.forEach((path, k) => {
    const c = `b${nPath++}`;
    path.classList.add(c);
    for (const v of [1, 2]) boil.push(`#art[data-v="${v}"] .${c}{d:path("${copies[v][k]}")}`);
  });
}
// a row written on at the pen's pace (its share of the letters, constant speed) behind a soft-edged mask
function written(e, p) {
  if (!e.rows || p.reveal !== "write") return;
  e.classList.add("v-write");
  if (!(p.dur > 0)) return e.rows.forEach((r) => gsap.set(r, { "--p": 100 }));
  const lens = p.rows.map((r) => r.replaceAll("*", "").length), all = lens.reduce((a, b) => a + b, 0) || 1;
  let at = p.t;
  e.rows.forEach((r, k) => {
    const d = (p.dur * lens[k]) / all;
    tl.fromTo(r, { "--p": 0 }, { "--p": 100, duration: d, ease: "none", immediateRender: false }, at);
    at += d;
  });
}
// a bar rises whole, outline and hatch, from its baseline (the core draws stroked parts as lines instead)
const stroke = (e, p) => {
  boiled(e, p);
  if (p.type !== "bar" || !e.paths || !(p.dur > 0)) return;
  e.paths.forEach((x) => { x.style.strokeDasharray = "none"; });
  tl.fromTo(e, { clipPath: "inset(100% -10% 0% -10%)" }, { clipPath: "inset(-10% -10% -10% -10%)", duration: p.dur, ease: "none" }, p.t);
};
const hooks = { ease: "none", flourish: { text: written, number: written } }; // the pen moves at a steady speed
for (const k of ["path", "arrow", "ring", "bar", "tick", "icon", "axis", "frame"]) hooks.flourish[k] = stroke;

const paper = V.filter((v) => v.paper), next = (v) => V[V.indexOf(v) + 1];
const enters = (v) => !v.at0 && !v.replaces, leaves = (v) => !v.stays && !next(v)?.replaces;
if (PAPER) el("div", "sheet base", $("#pages"));
const sheets = paper.map((v, i) => {
  const sheet = el("div", "sheet", $("#pages")), hand = el("div", "hand", sheet);
  const r = GOAT.rng(4100 + i * 31);
  hand.style.transform = `rotate(${((r() * 2 - 1) * 1.2).toFixed(2)}deg)`; // written a touch off square
  GOAT.visuals.mount(hand, [v], tl, hooks);
  if (v.at0) gsap.set(sheet, { visibility: "visible" });
  else {
    tl.set(sheet, { visibility: "visible" }, v.start);
    tl.fromTo(sheet, { y: Y_IN, x: 90, rotation: 7, scale: 1.04 },
      { y: 0, x: 0, rotation: 0, scale: 1, duration: v.in - v.start, ease: EASE.out, immediateRender: false }, v.start);
    if (enters(v) && !PAPER) tl.fromTo(sheet, { filter: "brightness(0.72)" },
      { filter: "brightness(1)", duration: v.in - v.start, ease: "none", immediateRender: false }, v.start);
  }
  if (leaves(v)) {
    tl.fromTo(sheet, { y: 0, x: 0, rotation: 0 },
      { y: Y_OUT, x: -60, rotation: -6, duration: v.end - v.out, ease: EASE.out, immediateRender: false }, v.out);
    if (!PAPER) tl.fromTo(sheet, { filter: "brightness(1)" },
      { filter: "brightness(0.85)", duration: v.end - v.out, ease: "none", immediateRender: false }, v.out);
    tl.set(sheet, { visibility: "hidden" }, v.end);
  } else if (next(v)?.replaces) tl.set(sheet, { visibility: "hidden" }, next(v).in); // covered by the next sheet
  if (v.at0) gsap.set("#marks", { opacity: 0 });
  else if (enters(v)) tl.set("#marks", { opacity: 0 }, v.in);
  if (leaves(v)) tl.set("#marks", { opacity: 1 }, v.out);
  return sheet;
});
const foot = $("#visuals");
foot.classList.add(DEF);
GOAT.visuals.mount(foot, V.filter((v) => !v.paper), tl, { ...hooks, enter(layer, v) { // nothing shows before it starts
  if (!v.at0) tl.fromTo(layer, { opacity: 0 }, { opacity: 1, duration: v.in - v.start, ease: EASE.out }, v.start);
}, exit(layer, v) {
  if (!v.stays) tl.fromTo(layer, { opacity: 1 }, { opacity: 0, duration: v.end - v.out, ease: EASE.out, immediateRender: false }, v.out);
} });
el("style", "", document.head, boil.join("\n"));

// ---------------------------------------------------------------- captions
// Plain white at captionY over the footage, a hard swap, no animation. While a sheet is up they move down to the
// page's low line in the page's ink (no shadow): the move is a hard cut, the ink changes in 0.12 s, both as the sheet's
// edge passes. On a voice-only video's paper they are ink on that line all along.
const caps = P.captions.map((c) => {
  const e = el("div", "cap", $("#caps"));
  el("span", "", e, c.text);
  if (c.start < FIRST) gsap.set(e, { opacity: 1 });
  else tl.set(e, { opacity: 1 }, c.start);
  tl.set(e, { opacity: 0 }, c.end);
  return e;
});
if (P.band) {
  const DARK = { color: "#1b1a1f", "--sh": 0 }, LIGHT = { color: "#ffffff", "--sh": 1 }, SWAP = 0.12, slack = 60;
  const down = P.pageBand.y - P.band.y; // from captionY to the page's line
  // the first moment (0–1 of the move) the sheet covers the band, from its ease
  const when = (covers) => {
    for (let k = 0; k <= 60; k++) if (covers(gsap.parseEase(EASE.out)(k / 60))) return k / 60;
    return 1;
  };
  // in: once the sheet covers captionY (the page's lower line is covered before it); out: once its lower edge is
  // halfway between the two lines, so neither shows on the wrong ground for more than a frame
  const inAt = when((p) => -70 + Y_IN * (1 - p) <= P.band.top - slack);
  const outAt = when((p) => -70 + 2060 + Y_OUT * p <= (P.band.bottom + P.pageBand.bottom) / 2 + slack);
  const swap = (to, y, at) => {
    tl.set("#caps", { y }, Math.max(0, at));
    tl.to("#caps", { ...to, duration: SWAP, ease: "none", immediateRender: false }, Math.max(0, at - SWAP / 2));
  };
  if (PAPER) gsap.set("#caps", DARK);
  else for (const v of paper) {
    if (v.at0) gsap.set("#caps", { ...DARK, y: down });
    else if (enters(v)) swap(DARK, down, v.start + inAt * (v.in - v.start));
    if (leaves(v)) swap(LIGHT, 0, v.out + outAt * (v.end - v.out));
  }
}

// The boil: every stroke swaps to its next copy 10 times a second.
for (let k = 1; k / 10 < P.dur; k++) tl.set("#art", { attr: { "data-v": k % 3 } }, k / 10);

tl.set({}, {}, P.dur);
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;

// ---------------------------------------------------------------- layout
// Sizes need the real fonts; the renderer waits for document.fonts.ready before the first frame.
// Notes and lines are kept inside the safe box (x 120–960, y 270–1248), where no app buttons cover them.
// validate caps a row at 36 / 34 letters, which fit at 56 / 40 px; only a row of wide capitals goes smaller.
// The visuals are laid out in Node; goat-visuals.js sizes their words.
function layout() {
  for (const n of notes) {
    GOAT.fit(n.el, 840, 120, 40);
    const w = n.el.offsetWidth, h = n.el.offsetHeight, tilt = w * 0.035; // the −4° tilt lifts one end
    const x = clamp(n.at[0], 120 + w / 2, 960 - w / 2), y = clamp(n.at[1], 270 + h / 2 + tilt, 1248 - h / 2 - tilt);
    n.el.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px) rotate(-4deg)`;
  }
  for (const l of lines) {
    GOAT.fit(l.el, 840, 84, 30);
    const w = l.el.offsetWidth, h = l.el.offsetHeight, top = clamp(l.y, 270, 1248 - h - 24);
    l.el.style.top = `${top}px`;
    // the underline was made 1000 px long at y 0: stretch it to the words and hang it under them
    l.paths.forEach((v, i) => v[0].setAttribute("d", place(l.under[i], 110, top + h + 4, (w + 26) / 1000)));
  }
  caps.forEach((e) => {
    GOAT.fit(e.firstChild, 840, 56, 40);
    e.style.top = `${P.band.y - e.offsetHeight / 2}px`;
  });
}
layout();
document.fonts.ready.then(layout);
