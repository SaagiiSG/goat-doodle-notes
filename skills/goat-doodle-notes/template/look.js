// 04 Doodle Notes. Reads window.PLAN (written by goat.mjs; every stroke's path is made there) and builds
// one paused GSAP timeline. Anything that starts at 0 is already drawn on frame 0, the thumbnail.
const P = window.PLAN;
const NS = "http://www.w3.org/2000/svg";
const $ = (s) => document.querySelector(s);
const tl = gsap.timeline({ paused: true });
const ink = $("#ink");
const DEF = P.look.color ?? "white", OUT = 0.25, FIRST = 1 / 30;
const clamp = (x, a, b) => Math.min(Math.max(x, a), Math.max(a, b));

// Show from `start`; fade out over the last 0.25 s before `end`, unless it stays to the end of the video.
function life(el, start, end) {
  if (start >= FIRST) {
    gsap.set(el, { opacity: 0 });
    tl.set(el, { opacity: 1 }, start);
  }
  if (end < P.dur - 0.01) tl.to(el, { opacity: 0, duration: OUT, ease: "power1.in" }, Math.max(start, end - OUT));
}

// One doodle: each stroke in its three boiled copies (.v0–.v2). The strokes draw on one after another
// with stroke-dashoffset, sharing 0.4 s by length. Returns [variant][stroke] paths.
function doodle(paths, color, start, end) {
  const g = ink.appendChild(document.createElementNS(NS, "g"));
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
      const dur = (P.draw * len) / total;
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
  const el = $("#texts").appendChild(document.createElement("div"));
  el.className = `${t.role} ${t.color ?? DEF}`;
  const spans = [];
  for (const row of String(t.text).split("\n")) {
    const r = el.appendChild(document.createElement("div"));
    row.trim().split(/\s+/).forEach((w, i) => {
      if (i) r.appendChild(document.createTextNode(" "));
      const s = r.appendChild(document.createElement("span"));
      s.className = "w";
      s.textContent = w;
      spans.push(s);
    });
  }
  const start = t.start ?? 0, end = t.end ?? P.dur;
  if (start >= FIRST)
    spans.forEach((s, i) => tl.fromTo(s, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.1, ease: "power2.out" }, start + i * P.step));
  life(el, start, end);
  if (t.role === "note") notes.push({ el, at: t.at ?? [454, 365] });
  else {
    // its own underline, drawn just after the last word
    const at = start < FIRST ? start : start + (spans.length - 1) * P.step + 0.1;
    lines.push({ el, y: t.y ?? 1104, under: t.under, paths: doodle(t.under, t.color ?? DEF, at, end) });
  }
}

// The boil: every stroke swaps to its next copy 10 times a second.
for (let k = 1; k / 10 < P.dur; k++) tl.set(ink, { attr: { "data-v": k % 3 } }, k / 10);

tl.set({}, {}, P.dur);
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;

// Sizes need the real fonts; the renderer waits for document.fonts.ready before the first frame.
// Notes and lines are kept inside the safe box (x 120–960, y 270–1248), where no app buttons cover them.
// validate caps a row at 36 / 34 letters, which fit at 56 / 40 px; only a row of wide capitals goes smaller.
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
    const s = (w + 26) / 1000, x0 = 110, y0 = top + h + 4;
    l.paths.forEach((v, i) => v[0].setAttribute("d", l.under[i].replace(/(-?[\d.]+),(-?[\d.]+)/g,
      (_, x, y) => `${(x0 + x * s).toFixed(1)},${(y0 + Number(y)).toFixed(1)}`)));
  }
}
layout();
document.fonts.ready.then(layout);
