// 04 Doodle Notes. Reads window.PLAN (written by goat.mjs; every stroke's path, every page's timing and the captions'
// height are worked out there) and builds one paused GSAP timeline. Anything that starts at 0 is already drawn on
// frame 0, the thumbnail.
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
  if (end < P.dur - 0.01) tl.to(e, { opacity: 0, duration: OUT, ease: "power1.in" }, Math.max(start, end - OUT));
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

// ---------------------------------------------------------------- pages
// The sheet slides up from just below the frame on an S-curve (0.6 s), turning from 7° and settling past square with
// a small give, dropping from 104% onto the desk, lit up from 72% as it lands so the light comes on gradually; it
// leaves the same way, up and off (0.5 s, speeding up). One that replaces another slides over it, paper on paper.
// The marker writes each row behind a soft mask at the pen's pace and draws ticks, rings, arrows and underlines on;
// the doodles and notes on the footage hide while a sheet is up.
const Y_IN = 2000, Y_OUT = -2100, IN_EASE = "power2.inOut", OUT_EASE = "power2.in"; // the 2060 px sheet starts and ends off screen
const pages = P.pages.map((pg, i) => {
  const sheet = el("div", "sheet", $("#pages")), hand = el("div", "hand", sheet);
  const r = GOAT.rng(4100 + i * 31);
  hand.style.transform = `rotate(${((r() * 2 - 1) * 1.2).toFixed(2)}deg)`; // written a touch off square
  const pen = hand.appendChild(document.createElementNS(NS, "svg"));
  pen.setAttribute("class", "pen");
  pen.setAttribute("viewBox", "0 0 1080 1920");
  const txt = el("div", "txt", hand);
  const rows = pg.rows.map((text, j) => {
    const row = el("div", "row", txt);
    const key = pg.key?.row === j ? pg.key : null, chars = [...text];
    if (!key) row.textContent = text;
    else {
      row.append(chars.slice(0, key.from).join(""));
      el("span", "", row, chars.slice(key.from, key.to).join(""));
      row.append(chars.slice(key.to).join(""));
    }
    return row;
  });
  const marks = [];
  for (const x of pg.steps) {
    if (x.do === "write") {
      if (pg.at0) gsap.set(rows[x.row], { "--p": 100 });
      else tl.fromTo(rows[x.row], { "--p": 0 }, { "--p": 100, duration: x.dur, ease: "none", immediateRender: false }, x.at);
    } else marks.push({ ...x, vs: doodle(x.paths, "black", pg.at0 ? 0 : x.at, Infinity, pen, x.dur) });
  }
  if (pg.at0) gsap.set(sheet, { visibility: "visible" });
  else {
    tl.set(sheet, { visibility: "visible" }, pg.start);
    tl.fromTo(sheet, { y: Y_IN, x: 90 }, { y: 0, x: 0, duration: T.in, ease: IN_EASE, immediateRender: false }, pg.start);
    tl.fromTo(sheet, { rotation: 7, scale: 1.04 },
      { rotation: 0, scale: 1, duration: T.in, ease: "back.out(1.7)", immediateRender: false }, pg.start);
    if (pg.enters) tl.fromTo(sheet, { filter: "brightness(0.72)" },
      { filter: "brightness(1)", duration: T.in, ease: "sine.inOut", immediateRender: false }, pg.start);
  }
  if (pg.leaves) {
    tl.fromTo(sheet, { y: 0, x: 0, rotation: 0, filter: "brightness(1)" },
      { y: Y_OUT, x: -60, rotation: -6, filter: "brightness(0.85)", duration: T.out, ease: OUT_EASE, immediateRender: false }, pg.end - T.out);
    tl.set(sheet, { visibility: "hidden" }, pg.end);
  }
  return { ...pg, sheet, hand, rows, marks };
});
pages.forEach((pg, i) => {
  const next = pages[i + 1];
  if (next?.replaces) tl.set(pg.sheet, { visibility: "hidden" }, next.start + T.in); // covered by the next sheet
  if (pg.at0) gsap.set("#marks", { opacity: 0 });
  else if (pg.enters) tl.set("#marks", { opacity: 0 }, pg.start + T.in);
  if (pg.leaves) tl.set("#marks", { opacity: 1 }, pg.end - T.out);
});

// ---------------------------------------------------------------- captions
// Plain white, one height all video, a hard swap, no animation. While a sheet is up they turn to the page's ink
// (and lose their shadow), switching in 0.12 s as the sheet's edge passes under them.
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
  // the first moment (0–1 of the move) the sheet covers the band, from its ease
  const when = (ease, covers) => {
    for (let k = 0; k <= 60; k++) if (covers(gsap.parseEase(ease)(k / 60))) return k / 60;
    return 1;
  };
  const inAt = when(IN_EASE, (p) => -70 + Y_IN * (1 - p) <= P.band.top - slack);
  const outAt = when(OUT_EASE, (p) => -70 + 2060 + Y_OUT * p <= P.band.bottom + slack);
  const swap = (to, at) => tl.to("#caps", { ...to, duration: SWAP, ease: "none", immediateRender: false }, Math.max(0, at - SWAP / 2));
  for (const pg of pages) {
    if (pg.at0) gsap.set("#caps", DARK);
    else if (pg.enters) swap(DARK, pg.start + inAt * T.in);
    if (pg.leaves) swap(LIGHT, pg.end - T.out + outAt * T.out);
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
const GRID = (y) => Math.round((y - 4) / 76) * 76 + 4; // the paper's ruled line nearest y
function fitRows(rows, maxWidth, max, min) {
  const size = Math.min(...rows.map((r) => GOAT.fit(r, maxWidth + 0.28 * max, max, min)));
  rows.forEach((r) => { r.style.fontSize = `${size}px`; });
  return size;
}
// put a row's baseline at y (the row's line box is Caveat's 0.96 em ascent + 0.30 descent), centred on cx or from x
function setRow(row, size, base, { cx, x }) {
  row.style.top = `${base - 0.96 * size}px`;
  row.style.left = `${cx === undefined ? x - 0.14 * size : cx - row.offsetWidth / 2}px`;
}
const inkW = (row, size) => row.offsetWidth - 0.28 * size;
// a mark's paths, placed: each stroke (an arrow has two) back into its own <path>
const setMark = (m, fn) => m.vs.forEach((v, k) => fn(m.paths[k]).split(/(?=M)/).forEach((d, j) => v[j].setAttribute("d", d)));

// Each page is laid out at its scale (look.mjs works out the largest that fits the room the captions leave: 1 when it
// fits as drawn), then moved, a ruled line at a time where it can, to sit inside that room.
function layoutPage(pg) {
  const [a0, a1] = P.pageArea, mid = (a0 + a1) / 2, R = pg.rows, k = pg.scale, room = a1 - a0;
  const marks = (what) => pg.marks.filter((m) => m.do === what);
  const most = (px, floor) => [px * k, Math.min(floor, px * k)]; // a size at this scale, and its floor
  let top, bottom; // the writing and its marks, top to bottom
  if (pg.kind === "list") {
    // 128 px, an item every third ruled line (every other one for 4 items or when the captions take room)
    const size = fitRows(R, 690, ...most(128, 64)), n = R.length;
    const pitch = (n - 1) * 228 + 1.16 * size <= room ? 228 : 152 * k;
    const b0 = GRID(mid - ((n - 1) * pitch) / 2 + 0.3 * size), t = Math.min(96, 0.75 * size);
    R.forEach((r, j) => setRow(r, size, b0 + j * pitch, { x: 260 }));
    marks("tick").forEach((m) => { // a tick left of its item, as tall as its letters
      const y = b0 + m.row * pitch - 0.32 * size;
      setMark(m, (d) => place(d, 236 - t, y - t / 2, t / 100, t / 100));
    });
    [top, bottom] = [b0 - 0.86 * size, b0 + (n - 1) * pitch + 0.3 * size];
  } else if (pg.kind === "big") {
    // a ringed word fits 600 px: an oval only takes in a box's corners at about 1.42 times its half-size
    const ring = marks("ring")[0], size = fitRows(R, ring ? 600 : 800, ...most(400, 160));
    const base = mid + 0.3 * size, w = inkW(R[0], size);
    setRow(R[0], size, base, { cx: 540 });
    [top, bottom] = [base - 0.86 * size, base + 0.3 * size];
    if (ring) {
      const rx = Math.min(1.42 * (w / 2) + 10, 440), cy = base - 0.25 * size, ry = 1.42 * 0.5 * size + 10;
      setMark(ring, (d) => place(d, 540 - rx, cy - ry, (2 * rx) / 1000, (2 * ry) / 1000));
      [top, bottom] = [cy - ry - 8, cy + ry + 8];
    }
    marks("under").forEach((m) => {
      const x0 = m.n ? 540 - w / 2 + 0.1 * w : 540 - w / 2 - 14, len = m.n ? 0.84 * w : w + 28;
      setMark(m, (d) => place(d, x0, base + 0.24 * size + m.n * 34, len / 1000, 1.4));
      bottom = Math.max(bottom, base + 0.24 * size + m.n * 34 + 15);
    });
  } else if (pg.kind === "compare") {
    const sb = fitRows([R[0]], 760, ...most(170, 72)), sa = fitRows([R[1]], 760, ...most(210, 72));
    const arrow = 200 * k, gap = 40 * k, height = 0.6 * sb + gap + arrow + gap + 0.6 * sa;
    // on the ruled lines when they still fit the room, else as worked out
    const at = (snap) => {
      const bb = snap(mid - height / 2 + 0.6 * sb), ba = snap(bb + 0.3 * sb + gap + arrow + gap + 0.6 * sa);
      return [bb, ba, bb - 0.86 * sb, ba + Math.max(0.3 * sa, 0.24 * sa + 13)];
    };
    let [bb, ba, t0, t1] = at(GRID);
    if (t1 - t0 > room) [bb, ba, t0, t1] = at((y) => y);
    setRow(R[0], sb, bb, { cx: 540 });
    setRow(R[1], sa, ba, { cx: 540 });
    const y = (bb + 0.3 * sb + ba - 0.62 * sa) / 2 - arrow / 2; // the arrow centred in the gap between the words
    setMark(marks("arrow")[0], (d) => place(d, 540 + 18 * k, y, k, k)); // its bow swings left: shifted right to look centred
    const w = inkW(R[1], sa), u = marks("under")[0];
    setMark(u, (d) => place(d, 540 - w / 2 - 14, ba + 0.24 * sa, (w + 28) / 1000, 1));
    [top, bottom] = [t0, t1];
  } else {
    // up to 140 px, a row every third ruled line when there is room, else every other one
    const size = fitRows(R, 840, ...most(140, 64)), n = R.length;
    const pitch = (n - 1) * 228 + 1.16 * size + 13 <= room && size > 120 ? 228 : 152 * k;
    const b0 = GRID(mid - ((n - 1) * pitch) / 2 + 0.3 * size);
    R.forEach((r, j) => setRow(r, size, b0 + j * pitch, { cx: 540 }));
    const row = R[pg.key.row], key = row.querySelector("span"), base = b0 + pg.key.row * pitch;
    setMark(pg.marks[0], (d) => place(d, row.offsetLeft + key.offsetLeft - 8, base + 0.24 * size, (key.offsetWidth + 16) / 1000, 1));
    [top, bottom] = [b0 - 0.86 * size, Math.max(b0 + (n - 1) * pitch + 0.3 * size, base + 0.24 * size + 13)];
  }
  // inside the room: by whole ruled lines when that still fits, else by just enough
  const over = bottom > a1 ? bottom - a1 : top < a0 ? top - a0 : 0;
  const lines = Math.sign(over) * Math.ceil(Math.abs(over) / 76) * 76;
  const dy = !over ? 0 : top - lines >= a0 - 1e-6 && bottom - lines <= a1 + 1e-6 ? -lines : -over;
  if (dy) pg.hand.style.translate = `0 ${dy}px`;
}

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
  pages.forEach(layoutPage);
  caps.forEach((e) => {
    GOAT.fit(e.firstChild, 840, 56, 40);
    e.style.top = `${P.band.y - e.offsetHeight / 2}px`;
  });
}
layout();
document.fonts.ready.then(layout);
