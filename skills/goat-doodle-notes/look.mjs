// 04 Doodle Notes: the footage exactly as filmed, with thick marker lines that draw themselves on
// (a ring round the product, an arrow, a star, a line under the price), handwritten notes written word by word,
// plain captions of what is said, and full-screen paper pages where the marker acts out the point.
// Positions are pixels of the 1080x1920 frame; Claude reads a frame at each doodle's time and boxes the real thing.
// Visuals (graphs, lists, a before and after) are drawn in the same marker, on a paper page or over the footage in a
// box, each part as its words are said.
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { missing, textWidth } from "./scripts/fonts.mjs";
import { SAFE } from "./scripts/media.mjs";
import { checkSkin, compose } from "./scripts/visuals.mjs";
import { placeVisuals, visualSfx, spaceSfx, flashClash } from "./scripts/visual-time.mjs";
import { headsAt } from "./scripts/cutout.mjs";
await import("./scripts/goat-lib.js"); // GOAT.rng, the same seeded random the template uses

export const NAME = "doodle-notes";
export const TALKS = true;

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1920, DEG = Math.PI / 180;
const DRAW = 0.4, STEP = 0.12; // a stroke draws on in 0.4 s; words appear whole, 0.12 s apart
const FONTS = { note: "Caveat[wght].ttf", line: "ShantellSans[BNCE,INFM,SPAC,wght].ttf" }; // captions use the line's font
// Longest row that fits 840 px at the smallest size (note 56 px, line 40 px), from the fonts' advance widths
// at weight 700: mixed Mongolian text runs 0.37–0.41 em a letter in Caveat and 0.56–0.62 in Shantell Sans.
const ROW = { note: 36, line: 34 };
const INKS = ["white", "black"];
const LINEAR = ["underline", "arrow"]; // these take "from"/"to"; the rest take a "box"

// ---------------------------------------------------------------- shapes: strokes of [x, y] points

function dense(pts, step = 6) { // split long straight segments so the hand wobble can bend them
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

function wobble(pts, r, amp) { // hand tremor: a slow, smooth sideways drift along the stroke
  const p = [r(), r(), r(), r()].map((x) => x * 6.3);
  let s = 0;
  return pts.map(([x, y], i) => {
    if (i) s += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    return [x + amp * (Math.sin(s / 41 + p[0]) + 0.5 * Math.sin(s / 17 + p[1])),
      y + amp * (Math.sin(s / 37 + p[2]) + 0.5 * Math.sin(s / 15 + p[3]))];
  });
}

const SHAPES = {
  // a quick pen ring touching the box's sides: starts at −30° (upper right), runs past its start, ends a little wider
  circle([x0, y0, x1, y1], r) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    const tilt = (r() * 2 - 1) * 3 * DEG, n = Math.max(90, Math.round((rx + ry) / 2));
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n, a = -30 * DEG + u * 385 * DEG, g = 0.96 + 0.07 * u;
      const x = rx * g * Math.cos(a), y = ry * g * Math.sin(a);
      pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
    }
    return [pts];
  },
  underline([ax, ay, bx, by], r) {
    const n = Math.max(8, Math.round(Math.hypot(bx - ax, by - ay) / 6)), ph = r() * 6.3;
    return [Array.from({ length: n + 1 }, (_, k) => [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n + 5 * Math.sin((2 * Math.PI * k) / n + ph)])];
  },
  arrow([ax, ay, bx, by]) { // a shaft bowed upwards the way a hand swings it, then the head at "to"
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let nx = -(by - ay) / len, ny = (bx - ax) / len;
    if (ny > 0) [nx, ny] = [-nx, -ny];
    const c = [(ax + bx) / 2 + nx * 0.18 * len, (ay + by) / 2 + ny * 0.18 * len], n = Math.max(10, Math.round(len / 6));
    const shaft = Array.from({ length: n + 1 }, (_, k) => {
      const u = k / n;
      return [(1 - u) ** 2 * ax + 2 * (1 - u) * u * c[0] + u * u * bx, (1 - u) ** 2 * ay + 2 * (1 - u) * u * c[1] + u * u * by];
    });
    const back = Math.atan2(c[1] - by, c[0] - bx), h = Math.min(Math.max(0.22 * len, 44), 80);
    const barb = (s) => [bx + h * Math.cos(back + s), by + h * Math.sin(back + s)];
    return [shaft, dense([barb(0.5), [bx, by], barb(-0.5)])];
  },
  star([x0, y0, x1, y1]) { // one-line pen star
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 0.05 * (y1 - y0), r = Math.min(x1 - x0, y1 - y0) / 2;
    return [dense(Array.from({ length: 6 }, (_, k) => [cx + r * Math.cos((-90 + k * 144) * DEG), cy + r * Math.sin((-90 + k * 144) * DEG)]))];
  },
  sparkle([x0, y0, x1, y1]) { // a four-point twinkle, its sides curving in to the centre (a plain + read as "plus")
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.min(x1 - x0, y1 - y0) / 2;
    const tip = (k) => [cx + r * Math.cos((k * 90 - 90) * DEG), cy + r * Math.sin((k * 90 - 90) * DEG)];
    const pts = [];
    for (let k = 0; k < 4; k++) for (let i = k ? 1 : 0; i <= 12; i++) {
      const u = i / 12, [ax, ay] = tip(k), [bx, by] = tip(k + 1);
      pts.push([(1 - u) ** 2 * ax + 2 * (1 - u) * u * cx + u * u * bx, (1 - u) ** 2 * ay + 2 * (1 - u) * u * cy + u * u * by]);
    }
    return [pts];
  },
  heart([x0, y0, x1, y1]) { // one line, from the dip round both lobes, overlapping at the end
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.min((x1 - x0) / 32, (y1 - y0) / 29);
    return [Array.from({ length: 121 }, (_, k) => {
      const t = (k / 120) * (2 * Math.PI + 0.25);
      return [cx + r * 16 * Math.sin(t) ** 3,
        cy - 2.5 * r - r * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
    })];
  },
};
// Page marks: SHAPES plus a tick (a list item's check), which plans can't use as a doodle.
const PEN = {
  ...SHAPES,
  tick([x0, y0, x1, y1]) { // a short dip, then the long stroke up to the top right
    const w = x1 - x0, h = y1 - y0;
    return [dense([[x0 + 0.04 * w, y0 + 0.55 * h], [x0 + 0.36 * w, y1 - 0.04 * h], [x1 - 0.04 * w, y0 + 0.04 * h]])];
  },
};

// The marker: long segments split so the hand can bend them, a slow tremor, then the boil (a second, smaller tremor
// and a shift of a pixel or two that differ in each of the 3 variants; the template shows one per 0.1 s).
const shiftOf = (boil) => [(boil() * 2 - 1) * 1.5, (boil() * 2 - 1) * 1.5];
const marker = (pts, base, boil, [dx, dy]) => wobble(wobble(dense(pts), base, 2.5), boil, 1.2).map(([x, y]) => [x + dx, y + dy]);

// One stroke ([x, y] points in frame pixels) in marker: variant 0–2 of seed. Every stroke of a visual goes through it.
export function inkPath(points, seed, variant) {
  const base = GOAT.rng(seed), boil = GOAT.rng(seed * 7919 + variant + 1);
  return marker(points, base, boil, shiftOf(boil));
}

// SVG path of one doodle. box = [left, top, right, bottom] in frame pixels; for underline and arrow it is
// [fromX, fromY, toX, toY]. The seed fixes the shape; variants 0–2 re-wobble it a pixel or two (the "boil").
export function doodlePath(shape, box, seed, variant) {
  const base = GOAT.rng(seed), boil = GOAT.rng(seed * 7919 + variant + 1), shift = shiftOf(boil);
  let strokes = PEN[shape](box, base).map((s) => marker(s, base, boil, shift));
  if (shape === "circle") { // the wobble may push it out: pull it back to the box ± 6%
    const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, all = strokes.flat();
    const fx = Math.min(1, (0.53 * (x1 - x0)) / Math.max(...all.map((p) => Math.abs(p[0] - cx))));
    const fy = Math.min(1, (0.53 * (y1 - y0)) / Math.max(...all.map((p) => Math.abs(p[1] - cy))));
    strokes = strokes.map((s) => s.map(([x, y]) => [cx + (x - cx) * fx, cy + (y - cy) * fy]));
  }
  return strokes.map((s) => "M" + s.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")).join("");
}

// ---------------------------------------------------------------- plan

const isNum = (n) => typeof n === "number" && Number.isFinite(n);
const point = (p) => Array.isArray(p) && p.length === 2 && p.every(isNum) && p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H;
const boxOf = (d) => (LINEAR.includes(d.shape) ? [...d.from, ...d.to] : d.box);
const start = (x) => Number(x.start ?? 0);
const FIRST = 1 / 30; // anything starting before the second frame is already drawn on frame 0 (the thumbnail)

function ink(color, what) {
  if (color !== undefined && !INKS.includes(color)) throw new Error(`${what} "color" must be "white" or "black"`);
}
function times(x, what) {
  if (x.start !== undefined && !(isNum(x.start) && x.start >= 0)) throw new Error(`${what}: "start" must be seconds, 0 or more`);
  if (x.end !== undefined && !(isNum(x.end) && x.end > start(x))) throw new Error(`${what} must end after it starts`);
}

export function validate(plan) {
  ink(plan.look?.color, "look");
  if (plan.captions !== undefined && typeof plan.captions !== "boolean") throw new Error('"captions" must be true or false');
  const cy = plan.look?.captionY;
  if (cy !== undefined && !(isNum(cy) && cy >= CAP.min && cy <= CAP.max))
    throw new Error(`"captionY" must be the captions' middle in pixels from the top, ${CAP.min}–${CAP.max} (inside the safe box)`);
  const doodles = plan.doodles ?? [], texts = plan.texts ?? [];
  const coords = [...doodles.flatMap((d) => [d.box, d.from, d.to]), ...texts.map((t) => t.at)].filter(Array.isArray).flat();
  if (coords.length && coords.every((n) => isNum(n) && n <= 1))
    throw new Error("positions are pixels of the 1080x1920 frame now (the middle is [540, 960]), not 0–1 fractions");
  doodles.forEach((d, i) => {
    if (!SHAPES[d.shape]) throw new Error(`doodle ${i + 1}: "shape" must be one of ${Object.keys(SHAPES).join(", ")}`);
    const what = `doodle ${i + 1} (${d.shape})`;
    if (LINEAR.includes(d.shape)) {
      for (const k of ["from", "to"])
        if (!point(d[k])) throw new Error(`${what}: "${k}" must be [x, y] in pixels inside the 1080x1920 frame`);
      if (Math.hypot(d.to[0] - d.from[0], d.to[1] - d.from[1]) < 40) throw new Error(`${what} is shorter than 40 px`);
    } else {
      const b = d.box;
      if (!(Array.isArray(b) && b.length === 4 && b.every(isNum) && point(b.slice(0, 2)) && point(b.slice(2)) &&
        b[2] - b[0] >= 80 && b[3] - b[1] >= 80))
        throw new Error(`${what}: "box" must be [left, top, right, bottom] in pixels inside the 1080x1920 frame, at least 80 px each way`);
    }
    ink(d.color, what);
    times(d, what);
  });
  for (const t of texts) {
    if (t.role === "caption")
      throw new Error('text role "caption" is not used: captions now come from what is said (transcript.json). Remove the "caption" texts');
    if (!["note", "line"].includes(t.role)) throw new Error(`text role "${t.role}" is not used by this look. Use "note" or "line".`);
    const what = `"${t.text}"`;
    if (!String(t.text ?? "").trim()) throw new Error(`a "${t.role}" text is empty`);
    for (const row of String(t.text).split("\n"))
      if ([...row.trim()].length > ROW[t.role])
        throw new Error(`"${row.trim()}" is too long for one ${t.role} row (${ROW[t.role]} characters at most): split it into rows with \\n`);
    if (t.at !== undefined && !point(t.at)) throw new Error(`${what}: "at" must be [x, y] in pixels inside the 1080x1920 frame`);
    if (t.y !== undefined && !(isNum(t.y) && t.y >= 0 && t.y <= H)) throw new Error(`${what}: "y" must be pixels from the top, 0–1920`);
    ink(t.color, what);
    times(t, what);
    const bad = missing(String(t.text), join(SKILL_DIR, "fonts", FONTS[t.role]));
    if (bad.length) throw new Error(`"${t.text}" uses ${bad.join(" ")}, which ${t.role === "note" ? "Caveat" : "Shantell Sans"} can't draw`);
  }
  checkSkin(SKIN);
  placeAll(plan);
}

const words = (t) => String(t.text).trim().split(/\s+/).length;
// how long a text takes to write on: its words 0.12 s apart, then a line's own underline
const writeTime = (t) => (words(t) - 1) * STEP + 0.1 + (t.role === "line" ? DRAW : 0);

// ---------------------------------------------------------------- pages: the footage gives way to a sheet of paper

const KINDS = ["list", "big", "compare", "note"];
// Seconds. The sheet slides in for 0.6 s and out for 0.5 s (each a gradual, eased brightness change: one flash);
// the marker writes at a handwriting pace, in letters a second at each kind's full size (spaces count; the pen
// moves 600–900 px a second); a tick, an underline, an arrow and a ring draw on in 0.25, 0.35, 0.45 and 0.55 s
// (a double underline is two 0.3 s strokes), with 0.1 s between strokes. 1 s to read what is written before the
// sheet leaves; 1 s of footage at least between two sheets, unless the next one replaces it on the paper.
export const T = { in: 0.6, out: 0.5, read: 1, gap: 1, pause: 0.1, tick: 0.25, under: 0.35, double: 0.3, arrow: 0.45,
  ring: 0.55, cps: { list: 14, note: 12, compare: 10, big: 5 } };
// Longest row, from Caveat's advance widths at weight 700 (mixed Mongolian text runs 0.38–0.43 em a letter): a list
// item 700 px wide at 80 px, a note row 840 px at 84 px, a before/after word 800 px at 100 px, the big word 800 px at
// 220 px. look.js draws them bigger when they fit (128, 140, 170/210 and 400 px) and only a row of wide capitals goes
// smaller.
const PAGE_ROW = { list: 20, note: 23, compare: 18, big: 8 };
const NOTE_ROWS = 3, RING = 5, EPS = 1e-6; // a big word of up to 5 letters is ringed, a longer one double-underlined
const CAVEAT = join(SKILL_DIR, "fonts", FONTS.note);
const frame = (t) => (t === Infinity ? t : Math.round(t * 30) / 30); // the frame look.js shows it on
const s2 = (t) => t.toFixed(2);
const shown = (s) => s.replace(/\s*\n\s*/g, " / ");

function draws(text, what) {
  const bad = missing(text, CAVEAT);
  if (bad.length) throw new Error(`${what}: "${shown(text)}" uses ${bad.join(" ")}, which Caveat can't draw`);
}

// One row: a list item, the big word, a before or after word.
function oneRow(v, label, max, what) {
  const s = typeof v === "string" || isNum(v) ? String(v).trim() : "";
  if (!s) throw new Error(`${what}: ${label} is empty`);
  if (s.includes("\n")) throw new Error(`${what}: ${label} "${shown(s)}" is one row: remove the \\n`);
  if ([...s].length > max) throw new Error(`${what}: ${label} "${s}" is too long (${max} characters at most): shorten it`);
  draws(s, what);
  return s;
}

// A page's rows (and a note's key word: row, first and end character).
function content(p, what) {
  if (p.kind === "list") {
    if (!Array.isArray(p.items) || p.items.length < 2 || p.items.length > 4)
      throw new Error(`${what}: "items" takes 2 to 4 items, like ["…", "…"]`);
    return { rows: p.items.map((x, i) => oneRow(x, `item ${i + 1}`, PAGE_ROW.list, what)) };
  }
  if (p.kind === "big") {
    const word = oneRow(p.text, "the word", PAGE_ROW.big, what);
    return { rows: [word], mark: [...word].length <= RING ? "ring" : "double" };
  }
  if (p.kind === "compare")
    return { rows: [oneRow(p.before, '"before"', PAGE_ROW.compare, what), oneRow(p.after, '"after"', PAGE_ROW.compare, what)] };
  const text = typeof p.text === "string" ? p.text.trim() : "";
  if (!text) throw new Error(`${what}: the text is empty`);
  const raw = text.split("\n").map((r) => r.trim());
  if (raw.some((r) => !r)) throw new Error(`${what}: "${shown(text)}" has an empty row: remove the extra \\n`);
  if (raw.length > NOTE_ROWS) throw new Error(`${what}: "${shown(text)}" has ${raw.length} rows: ${NOTE_ROWS} rows at most`);
  const stars = raw.map((r) => [...r].filter((c) => c === "*").length);
  if (!stars.some(Boolean)) throw new Error(`${what}: "${shown(text)}": mark its key word with *…*, and it gets underlined`);
  const row = stars.findIndex(Boolean);
  if (stars.reduce((a, b) => a + b) !== 2 || stars[row] !== 2)
    throw new Error(`${what}: "${shown(text)}" underlines one key word: put one *…* pair round it, in one row`);
  const chars = [...raw[row]], a = chars.indexOf("*"), b = chars.indexOf("*", a + 1);
  if (!chars.slice(a + 1, b).join("").trim()) throw new Error(`${what}: "${shown(text)}": the key word is empty`);
  const rows = raw.map((r) => r.replaceAll("*", ""));
  for (const r of rows)
    if ([...r].length > PAGE_ROW.note)
      throw new Error(`${what}: "${r}" is too long for one row (${PAGE_ROW.note} characters at most): split it into rows with \\n`);
  draws(rows.join(" "), what);
  return { rows, key: { row, from: a, to: b - 1 } };
}

// When each stroke goes on, from the page's own rows. A page up from frame 0 is already written on it.
function strokes(p) {
  const steps = [];
  let t = p.start + T.in;
  const add = (step, dur) => { steps.push({ ...step, at: t, dur }); t += dur; };
  const pause = () => { t += T.pause; };
  const write = (row) => add({ do: "write", row }, [...p.rows[row]].length / T.cps[p.kind]);
  if (p.kind === "list") p.rows.forEach((_, i) => { if (i) pause(); write(i); add({ do: "tick", row: i }, T.tick); });
  else if (p.kind === "big") {
    write(0);
    pause();
    if (p.mark === "ring") add({ do: "ring", row: 0 }, T.ring);
    else { add({ do: "under", row: 0, n: 0 }, T.double); pause(); add({ do: "under", row: 0, n: 1 }, T.double); }
  } else if (p.kind === "compare") {
    write(0); pause(); add({ do: "arrow" }, T.arrow); pause(); write(1); pause(); add({ do: "under", row: 1 }, T.under);
  } else {
    p.rows.forEach((_, i) => { if (i) pause(); write(i); });
    pause();
    add({ do: "under", row: p.key.row }, T.under);
  }
  return p.at0 ? { steps: steps.map((x) => ({ ...x, at: 0, dur: 0 })), done: 0 } : { steps, done: t };
}
const FIX = { list: "use fewer or shorter items", big: "shorten the word", compare: "shorten the words", note: "shorten the sentence" };

// The pages on the frame grid look.js shows them on, sorted, each with its strokes' times. One at a time; 1 s of
// footage between two, or the next starts exactly as one ends and replaces it on the paper (no flash: paper over
// paper). Refuses a page too short to come in, write, be read and leave, and one over a doodle, note or line that
// is drawing on. A page from 0 is written on frame 0; one that runs to the video's end stays. dur is Infinity
// before prep (validate).
export function schedule(plan, dur = Infinity) {
  if (!(dur === Infinity || (isNum(dur) && dur > 0))) throw new Error("the video's length must be seconds");
  const D = frame(dur), list = plan.pages ?? [];
  if (!Array.isArray(list)) throw new Error('"pages" must be a list, like [{"kind": "big", "text": "…", "start": 2, "end": 6}]');
  const pages = list.map((p, i) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error(`page ${i + 1} must be {"kind": …, "start": …, "end": …}`);
    if (!KINDS.includes(p.kind)) throw new Error(`page ${i + 1}: "kind" must be one of ${KINDS.join(", ")}`);
    const what = `the ${p.kind} page`;
    if (!(isNum(p.start) && p.start >= 0)) throw new Error(`${what}: "start" must be seconds, 0 or more`);
    if (p.end !== undefined && !(isNum(p.end) && p.end > p.start)) throw new Error(`${what} must end after it starts`);
    const start = frame(p.start), end = Math.min(frame(p.end ?? Infinity), D);
    if (start >= D) throw new Error(`${what} starts at ${s2(start)} s, after the video ends (${s2(dur)} s)`);
    return { kind: p.kind, ...content(p, what), start, end, what };
  }).sort((a, b) => a.start - b.start);
  pages.forEach((p, i) => {
    const prev = pages[i - 1];
    Object.assign(p, { at0: p.start === 0, stays: p.end >= D - EPS, replaces: false });
    p.enters = !p.at0;
    p.leaves = !p.stays;
    if (!prev) return;
    if (p.start < prev.end - EPS)
      throw new Error(`${p.what} starts at ${s2(p.start)} s, inside ${prev.what} (${s2(prev.start)}–${s2(prev.end)} s): one page at a time`);
    const gap = p.start - prev.end;
    if (gap < EPS) Object.assign(p, { replaces: true, enters: false }), (prev.leaves = false);
    else if (gap < T.gap - EPS)
      throw new Error(`only ${s2(gap)} s of footage between ${prev.what} (ends ${s2(prev.end)} s) and ${p.what} ` +
        `(starts ${s2(p.start)} s): leave ${T.gap} s or more, or start ${p.what} at ${s2(prev.end)} s so it replaces ` +
        `${prev.what} on the paper`);
  });
  for (const p of pages) {
    const { steps, done } = strokes(p);
    const write = p.at0 ? 0 : done - p.start - T.in, out = p.leaves ? T.out : 0;
    p.steps = steps;
    p.need = (p.at0 ? 0 : T.in) + write + T.read + out;
    if (p.end - p.start < p.need - EPS)
      throw new Error(`${p.what} at ${s2(p.start)} s shows for ${s2(p.end - p.start)} s but needs ${s2(p.need)} s (` +
        (p.at0 ? "it is written on frame 0" : `it comes in for ${T.in} s and writes for ${s2(write)} s`) +
        `, then ${T.read} s to read${out ? ` and ${T.out} s to leave` : ""}): end it later, or ${FIX[p.kind]}`);
  }
  for (const p of pages)
    for (const [a, b, what] of drawingOf(plan))
      if (a < p.end - EPS && b > p.start + EPS)
        throw new Error(`${what} at ${s2(a)}–${s2(b)} s, under ${p.what} (${s2(p.start)}–${s2(p.end)} s): draw it ` +
          "before the page comes in or after it has left");
  return { pages: pages.map(({ what, ...p }) => p) };
}

// Each doodle, note and line that draws on after frame 0: [from, to, what].
const drawingOf = (plan) => [
  ...(plan.doodles ?? []).map((d, i) => [start(d), start(d) + DRAW, `doodle ${i + 1} (${d.shape}) draws on`]),
  ...(plan.texts ?? []).map((t) => [start(t), start(t) + writeTime(t), `"${shown(String(t.text).trim())}" writes on`]),
].filter(([a]) => a >= FIRST);

// ---------------------------------------------------------------- captions: one plain row of what is said

// The captions keep one height all video: their middle at captionY (default 1190, under the chin on a chest-up shot;
// Claude moves them above the head on a close-up), 40 px each way (Shantell Sans 56 px and its shadow), so 310–1200
// keeps them inside the safe box.
const CAP = { y: 1190, half: 40, min: 310, max: 1200, room: 30, lineGap: 20 };
const CLEAR = 60; // px between the captions and a visual over the footage, so the two never read as one
// A voice-only video with no clips is all paper. With clips (silent ones, or photos, under the voice) the footage
// stays the canvas, as in any video: the voice is only the speech.
const allPaper = (plan) => !!plan.voice && !plan.clips?.length;
const SHANTELL = join(SKILL_DIR, "fonts", FONTS.line);
const clamp = (x, a, b) => Math.min(Math.max(x, a), Math.max(a, b));
// Where look.js puts a note or line (its sizes from the letters: 0.41 em a letter in Caveat, 0.6 in Shantell Sans,
// measured), so the check below sees what the viewer will.
const rowsOf = (t) => String(t.text).split("\n").map((r) => r.trim());
const widest = (t) => Math.max(...rowsOf(t).map((r) => [...r].length));
function noteBox(t) {
  const size = clamp(840 / (widest(t) * 0.41), 40, 120), h = rowsOf(t).length * 1.02 * size;
  const tilt = Math.min(840, widest(t) * 0.41 * size) * 0.035, y = clamp((t.at ?? [454, 365])[1], 270 + h / 2 + tilt, 1248 - h / 2 - tilt);
  return [y - h / 2 - tilt, y + h / 2 + tilt];
}
const lineText = (t) => rowsOf(t).length * 1.12 * clamp(840 / (widest(t) * 0.6), 30, 84);
function lineBox(t, top) {
  const y = clamp(top, 270, 1248 - lineText(t) - 24);
  return [y, y + lineText(t) + 17]; // its wavy underline hangs 4 px under the words, ±5 px, 16 px thick
}
const inkY = (paths) => { // a doodle's top and bottom, its 16 px stroke and shadow included
  const ys = paths.flatMap((d) => [...d.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1])));
  return [Math.min(...ys) - 12, Math.max(...ys) + 12];
};

// The captions' band (null when there are none), each key line's top, and the room a page writes in. Refuses a note,
// line or doodle on screen across the band while a caption shows; a line without its own "y" goes just above low
// captions instead.
// The captions' band over the footage when they're on (at captionY), and the page's own low caption line: while a
// page is up the captions move down to it (as in a voice-only video, all paper), and the page writes in the room above.
const lineAt = (y) => ({ y, top: y - CAP.half, bottom: y + CAP.half });
const bandOf = (plan, on) => (on ? lineAt(plan.look?.captionY ?? CAP.y) : null);
const PAGE_LINE = lineAt(CAP.y);
const roomOf = (on) => [270, on ? PAGE_LINE.top - CAP.room : 1248];

export function captionLayout(plan, captions = [], dur = Infinity) {
  const on = plan.captions !== false && captions.length > 0;
  const band = allPaper(plan) ? (on ? PAGE_LINE : null) : bandOf(plan, on), pageBand = on ? PAGE_LINE : null;
  const texts = plan.texts ?? [];
  const lineY = texts.map((t) => {
    if (t.role !== "line") return undefined;
    if (t.y !== undefined || !band) return t.y ?? 1104;
    const [a, b] = lineBox(t, 1104);
    return a < band.bottom && b > band.top ? band.top - CAP.lineGap - (lineText(t) + 17) : 1104;
  });
  const pageArea = roomOf(on);
  if (!band) return { band, pageBand, lineY, pageArea };
  const things = [
    ...(plan.doodles ?? []).map((d, i) => [`doodle ${i + 1} (${d.shape})`, d,
      inkY([0, 1, 2].map((v) => doodlePath(d.shape, boxOf(d), 21 + i * 97, v)))]),
    ...texts.map((t, i) => [`"${shown(String(t.text).trim())}" (${t.role})`, t, t.role === "note" ? noteBox(t) : lineBox(t, lineY[i])]),
    ...(plan.visuals ?? []).filter((v) => onFootage(v) && Array.isArray(v.box))
      .map((v) => [`the visual at ${s2(start(v))} s over the footage`, v, [v.box[1], v.box[3]], CLEAR]),
  ];
  for (const [what, x, [a, b], near = 0] of things) {
    if (!(a < band.bottom + near && b > band.top - near)) continue;
    const from = start(x), to = Number(x.end ?? dur), c = captions.find((c) => c.start < to && c.end > from);
    if (c)
      throw new Error(`${what} at y ${Math.round(a)}–${Math.round(b)} ${near ? `comes within ${near} px of` : "crosses"} the captions ` +
        `(y ${band.top}–${band.bottom}) while "${c.text}" shows (${s2(c.start)}–${s2(c.end)} s): move it, give the captions ` +
        'another height with "look": {"captionY": …}, or turn them off with "captions": false');
  }
  return { band, pageBand, lineY, pageArea };
}


// ---------------------------------------------------------------- visuals: the core's parts, drawn in this marker

// The ink on the page (a WCAG 15:1 pair), and over the footage: white on its soft dark shadow, or black on its light edge.
const INK = "#1B1A1F", PAPER = "#F6F0E2";
const hand = (max, min) => ({ file: CAVEAT, weight: 700, factor: 1.03, max, min, color: INK, on: PAPER });
// Caveat at 700 runs 1.024 × its default advances, Shantell Sans at 600 1.056 (summed over Latin, Cyrillic and digits).
// The largest sizes are the pages' own (big 400, compare 210, list 128): a visual fills the page as a page did.
export const SKIN = {
  place: "cutaway",
  // on the page: the room above its low caption line, x 120–960; over the footage: its own box
  stage: (v, plan = {}) => (onFootage(v) ? v.box : [120, 270, 960, roomOf(plan.captions !== false)[1]]),
  styles: { value: hand(400, 100), title: hand(210, 56), label: hand(128, 40),
    small: { file: SHANTELL, weight: 600, factor: 1.06, max: 56, min: 28, color: INK, on: PAPER } },
  reveal: { text: "write", number: "write", stroke: "draw", bar: "draw", ring: "draw", icon: "draw", image: "draw" },
  counts: false,
  variants: 3,
  texture: inkPath,
  replace: true,
  flashes: { enter: true, exit: true },
  sounds: { enter: ["paper", 0.3], land: ["marker", 0.24], draw: ["marker", 0.24], tick: ["marker", 0.24], type: ["marker", 0.24] },
  pace: { enter: T.in, exit: T.out, read: T.read, between: T.gap, draw: T.arrow, cps: T.cps.list },
  footageInk: [["#FFFFFF", "#000000"], ["#111111", "#FFFFFF"]],
};
const SOUND_MAX = 0.6; // a marker scratch is at most this long
const r1 = (n) => Math.round(n * 10) / 10;
const frameUp = (t) => Math.ceil(t * 30 - 1e-6) / 30;
const meets = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const hasKey = (v, k) => v !== null && typeof v === "object" && (Object.hasOwn(v, k) || Object.values(v).some((x) => hasKey(x, k)));

// "place" and "box": a visual sits on the page unless it says "place": "footage" with a box inside the safe box. A
// pin's "place" is its place's name, so a pin over the footage takes just the box.
const onFootage = (v) => (v?.recipe === "pin" ? v.box !== undefined : v?.place === "footage");
function placeOf(v, i, voice) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return; // placeVisuals says what's wrong
  const what = isNum(v.start) ? `the visual at ${s2(v.start)} s` : `visual ${i + 1}`;
  if (hasKey(v, "image")) throw new Error(`${what}: Doodle Notes draws in marker on paper or over the footage: no photos (another GOAT look shows them)`);
  if (v.recipe !== "pin" && v.place !== undefined && v.place !== "footage") throw new Error(`${what}: "place" is "footage", or leave it out for the page`);
  if (!onFootage(v)) {
    if (v.box !== undefined) throw new Error(`${what}: "box" goes with "place": "footage"`);
    return;
  }
  if (voice) throw new Error(`${what}: a voice-over with no clips has no footage: leave out "place" and "box" to draw it on the page`);
  const b = v.box;
  if (!(Array.isArray(b) && b.length === 4 && b.every(isNum) && b[0] >= SAFE[0] && b[1] >= SAFE[1] && b[2] <= SAFE[2] &&
    b[3] <= SAFE[3] && b[2] - b[0] >= 300 && b[3] - b[1] >= 240))
    throw new Error(`${what}: "box" must be [left, top, right, bottom] inside the safe box x 120–960, y 270–1248, at least 300 px ` +
      "wide and 240 px tall");
}

// A compare runs down the page, as the page did: before, an arrow down, after with its words underlined (a number
// after is ringed). When the after is said, the arrow draws on its words and the after is written next. A trend in a
// box over the footage much wider than tall puts its arrow beside its words, so the arrow still rises (or falls) at a
// slant, with the words at its tip. The other recipes are the core's.
function drawn(v) {
  // a checklist item too long for one row at the list's size goes on two, split at the space nearest its middle
  if (v?.recipe === "checklist" && !onFootage(v) && Array.isArray(v.items)) {
    const slot = ((840 - 24) * 5) / 6, st = SKIN.styles.label;
    const wrap = (t) => {
      if (typeof t !== "string" || t.includes("\n") || !t.trim().includes(" ") || textWidth(t.trim(), st, st.max) <= slot) return t;
      const w = t.trim().split(/\s+/), cut = w.map((_, i) => i).slice(1)
        .reduce((a, i) => (Math.max(w.slice(0, i).join(" ").length, w.slice(i).join(" ").length) <
          Math.max(w.slice(0, a).join(" ").length, w.slice(a).join(" ").length) ? i : a), 1);
      return `${w.slice(0, cut).join(" ")}\n${w.slice(cut).join(" ")}`;
    };
    return { ...v, items: v.items.map((x) => (x !== null && typeof x === "object" ? { ...x, text: wrap(x.text) } : wrap(x))) };
  }
  if (v?.recipe === "trend" && onFootage(v) && Array.isArray(v.box) && v.box[2] - v.box[0] > 1.6 * (v.box[3] - v.box[1]) &&
    ["up", "down"].includes(v.dir) && typeof v.text === "string" && !/\d/.test(v.text)) { // else the core's trend says what's wrong
    const { recipe, dir, text, say, at, ...rest } = v;
    return { ...rest, row: [{ arrow: `${dir}-right` }, { text, style: "title", ...(say !== undefined && { say }), ...(at !== undefined && { at }) }] };
  }
  if (v?.recipe !== "compare" || v.before === undefined || v.after === undefined) return v;
  const side = (x) => {
    const o = x !== null && typeof x === "object" ? x : { [isNum(x) || /^\d/.test(String(x).trim()) ? "number" : "text"]: x };
    return o.number !== undefined ? { ...o, number: String(o.number) } : { style: "title", ...o };
  };
  const { say, at, ...after } = side(v.after), keyed = after.number !== undefined ? { ...after, circle: true }
    : { ...after, text: String(after.text).includes("*") ? after.text : String(after.text).split("\n").map((r) => `*${r.trim()}*`).join("\n") };
  const { recipe, before: _b, after: _a, ...rest } = v;
  return { ...rest, compare: true, column: [side(v.before), { arrow: "down", ...(say !== undefined && { say }), ...(at !== undefined && { at }) }, keyed] };
}

// Where goat-visuals.js writes a text part: centred in its box (or at its left after a narrower mark in its row, in a
// panel of words, or typed), its rows 1.2 em apart down the middle of the box, each at its measured width. Caveat's
// baseline sits 0.93 em below a row's top at line-height 1.2 (ascent 0.96, descent 0.30), Shantell Sans's 0.95.
function leftAligned(p, parts) {
  if (p.reveal === "type") return true;
  const prose = (f) => f.type === "frame" && !f.button && parts.filter((q) => q.parent === f.id).every((q) => q.rows || prose(q));
  if (parts[p.parent] && prose(parts[p.parent])) return true;
  const q = parts[p.id - 1];
  if (!q || q.type === "arrow" || q.type === "frame") return false;
  const a = q.box, b = p.box, over = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return a[2] <= b[0] + 1 && over > 0.5 * Math.min(a[3] - a[1], b[3] - b[1]) && a[2] - a[0] < b[2] - b[0];
}
function rowsAt(p, parts) {
  const st = SKIN.styles[p.style], s = p.px[0], n = p.rows.length, left = leftAligned(p, parts);
  const top = (p.box[1] + p.box[3]) / 2 - (n * 1.2 * s) / 2, base = st.file === SHANTELL ? 0.95 : 0.93;
  return p.rows.map((row, k) => {
    const w = textWidth(row.replaceAll("*", ""), st, s);
    return { row, s, w, x: left ? p.box[0] : (p.box[0] + p.box[2]) / 2 - w / 2, base: top + k * 1.2 * s + base * s };
  });
}

// Stroke shapes in frame px: a bar's outline (the baseline is the axis) and its 45° hatch, 22 px apart across the
// strokes, rising from the bottom left; the axis as its baseline and a short y stroke, no ticks; a box round a panel.
const BAND = 1.2 * SKIN.styles.label.min + 4; // the axis's label band under its baseline (visuals.mjs)
function barStrokes([x0, y0, x1, y1]) {
  const out = [[[x0, y1], [x0, y0], [x1, y0], [x1, y1]]], k = 22 * Math.SQRT2, a = [x0 + 5, y0 + 5, x1 - 5, y1 - 2];
  for (let c = a[0] + a[1] + k / 2; c < a[2] + a[3] - 4; c += k) { // the line x + y = c
    const lo = Math.max(a[0], c - a[3]), hi = Math.min(a[2], c - a[1]);
    if (hi - lo > 4) out.push([[lo, c - lo], [hi, c - hi]]);
  }
  return out;
}
// Where compose's arrow runs in its box (visuals.mjs), drawn as today's arrow: a bowed shaft, then the head.
function arrowEnds(dir, [x0, y0, x1, y1]) {
  const m = Math.min(24, (x1 - x0) / 2, (y1 - y0) / 2), [a, b, c, d] = [x0 + m, y0 + m, x1 - m, y1 - m], cx = (a + c) / 2, cy = (b + d) / 2;
  return { right: [a, cy, c, cy], left: [c, cy, a, cy], up: [cx, d, cx, b], down: [cx, b, cx, d], "up-right": [a, d, c, b],
    "down-right": [a, b, c, d] }[dir];
}
const axisStrokes = ([x0, y0, x1, y1]) => [[[x0, y1 - BAND], [x1, y1 - BAND]], [[x0, y1 - BAND], [x0, y1 - BAND - 0.45 * (y1 - y0 - 2 * BAND)]]];
function boxStrokes(p) {
  const [x0, y0, x1, y1] = p.box, r = Math.min(24, (x1 - x0) / 4, (y1 - y0) / 4), pts = [];
  [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]].forEach(([cx, cy, a0]) => {
    for (let k = 0; k <= 6; k++) pts.push([cx + r * Math.cos((a0 + 15 * k) * DEG), cy + r * Math.sin((a0 + 15 * k) * DEG)]);
  });
  pts.push(pts[0], [pts[0][0] + 10, pts[0][1]]); // the pen runs a little past where it started
  return [pts, ...(p.chrome ? [[[x0, p.chrome[3]], [x1, p.chrome[3]]]] : [])];
}

// The parts compose laid out, in this marker (each stroke's 3 boiled copies): today's tick, a bar outlined and
// hatched, the axis, a box round each panel, and a "circle" or "underline" hugging its words. Then the marks, each a
// part of its own: a big word ringed (5 letters or fewer) or underlined twice, a count ringed, and each *key* word
// underlined as it's written. A checklist row is written as it's said, then ticked. e: when the visual is in and out.
function inked(composed, where, v, e, max = null) {
  const parts = composed.parts.map((p) => ({ ...p })), add = [];
  const seed = (p, k = 0) => where * 1000 + p.id + k * 389;
  const three = (fn) => [0, 1, 2].map(fn);
  const ink = (strokes, sd) => three((k) => strokes.map((pts) => "M" + inkPath(pts, sd, k).map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L")).join(" "));
  const shape = (name, box, sd) => three((k) => doodlePath(name, box, sd, k).replaceAll(",", " ").replaceAll("L", " L"));
  const timed = e && parts.some((p) => p.t !== undefined);
  // a mark after its words are written, as long as it still leaves 1 s to read; dur 0 on a visual drawn at frame 0
  const after = (w, dur) => {
    if (!timed) return {};
    if (e.at0) return { t: 0, dur: 0 };
    const d = frameUp(dur);
    return { t: frame(Math.max(w.t, Math.min(w.t + w.dur, e.out - T.read - d))), dur: d };
  };
  const mark = (w, kind, box, d, time) => add.push({ id: parts.length + add.length, parent: w.id, type: "path", box: box.map(r1), d,
    reveal: "draw", mark: kind, ...time });
  const ring = (w, sd) => {
    const rs = rowsAt(w, parts), s = rs[0].s, x0 = Math.min(...rs.map((r) => r.x)), x1 = Math.max(...rs.map((r) => r.x + r.w));
    const top = rs[0].base - 0.75 * s, bottom = rs.at(-1).base + 0.25 * s, cy = (top + bottom) / 2, h = (bottom - top) / 2;
    const rx = Math.min(1.42 * ((x1 - x0) / 2) + 10, 440), ry = Math.max(h + 12, Math.min(1.42 * h + 10, cy - w.box[1] + 20, w.box[3] + 20 - cy));
    const cx = (x0 + x1) / 2;
    return [[cx - rx, cy - ry, cx + rx, cy + ry], sd];
  };
  const under = (r, from, len, dy = 0) => [from, r.base + 0.24 * r.s + dy, from + len, r.base + 0.24 * r.s + dy];

  // "circle": true on a part (compose's oval in the part's own box), found before anything moves
  const decos = new Set(parts.filter((p) => p.type === "path" && !p.map && !p.tip && parts[p.id - 1]?.rows &&
    p.box.every((x, k) => x === parts[p.id - 1].box[k])));
  const circled = (p) => decos.has(p);
  // a compare down the page: the words give the arrow 0.3 of the height (200 px at most), shrinking as needed
  if ((v?.recipe === "compare" || v?.compare) && parts.length >= 3 && parts[1].type === "arrow") {
    const [a, arrow, b] = parts, [x0, y0, x1, y1] = composed.stage, H = y1 - y0, want = Math.min(200, 0.3 * H);
    if (arrow.box[3] - arrow.box[1] < want) {
      const room = H - want - 48, hs = [a, b].map((x) => x.box[3] - x.box[1]), f = Math.min(1, room / (hs[0] + hs[1]));
      for (const x of [a, b]) x.px = [Math.max(x.px[1], Math.floor(x.px[0] * f)), x.px[1]];
      const ha = a.rows.length * 1.2 * a.px[0], hb = b.rows.length * 1.2 * b.px[0], ah = Math.min(200, H - 48 - ha - hb);
      let y = y0 + (H - ha - hb - ah - 48) / 2;
      a.box = [x0, y, x1, (y += ha)].map(r1);
      arrow.box = [x0, (y += 24), x1, (y += ah)].map(r1);
      b.box = [x0, (y += 24), x1, y + hb].map(r1);
    }
  }
  // a trend beside its words (drawn): the arrow takes the box's height, the words sit at its tip
  if (v?.recipe === "trend" && parts[0]?.type === "arrow" && parts[1]?.rows) {
    const [arrow, w] = parts, [, y0, , y1] = composed.stage, h = w.box[3] - w.box[1], up = arrow.arrow === "up-right";
    arrow.box = [arrow.box[0], y0, arrow.box[2], y1];
    w.box = [w.box[0], up ? y0 : y1 - h, w.box[2], up ? y0 + h : y1];
  }
  // a ringed word leaves its ring room inside the frame: at most 600 px wide, as the page wrote it
  const word = (v?.recipe === "big" || v?.recipe === "count") && parts.find((p) => p.key && p.rows);
  const ringed = word && (v.recipe === "count" || [...word.rows.join("\n").replaceAll("*", "")].length <= RING);
  for (const w of [ringed && word, ...parts.filter(circled).map((p) => parts[p.id - 1])].filter(Boolean)) {
    const wide = Math.max(...rowsAt(w, parts).map((r) => r.w));
    if (wide > 600) w.px = [Math.max(w.px[1], Math.floor((w.px[0] * 600) / wide)), w.px[1]];
  }
  // words in one column of the same style write at one size, the smallest that fits them all (as a page's list did);
  // an old page's words keep the page's own largest sizes instead (max: one per text part, in order)
  if (max) parts.filter((p) => p.rows).forEach((p, k) => { if (max[k]) p.px = [Math.max(p.px[1], Math.min(p.px[0], max[k])), p.px[1]]; });
  else for (const group of Map.groupBy(parts.filter((p) => p.rows && p.reveal !== "type"), (p) => `${p.style} ${p.box[0]} ${p.box[2]}`).values()) {
    const px = Math.min(...group.map((p) => p.px[0]));
    for (const p of group) p.px = [px, p.px[1]];
  }
  // a tick beside an item written on two rows sits by its first row
  for (const p of parts.filter((x) => x.type === "tick")) {
    const q = parts[p.id + 1];
    if (!(q?.rows?.length > 1 && q.box[1] < p.box[3] && p.box[1] < q.box[3] && q.box[0] >= p.box[2] - 1)) continue;
    const r = rowsAt(q, parts)[0], cy = r.base - 0.3 * r.s, h = Math.min(p.box[3] - p.box[1], 1.2 * r.s);
    p.box = [p.box[0], cy - h / 2, p.box[0] + h, cy + h / 2].map(r1);
    if (!p.tick) p.d = ink([[[22, 22], [78, 78]], [[78, 22], [22, 78]]].map((l) => l.map(([x, y]) => [p.box[0] + (x / 100) * h, p.box[1] + (y / 100) * h])), seed(p));
  }
  let pen = -Infinity; // when the last checklist row's tick is done
  for (const p of parts) {
    const prev = parts[p.id - 1];
    if (p.type === "arrow") p.d = shape("arrow", arrowEnds(p.arrow, p.box), seed(p));
    else if (p.type === "tick" && p.tick) p.d = shape("tick", p.box, seed(p));
    else if (p.type === "bar") p.d = ink(barStrokes(p.box), seed(p));
    else if (p.type === "axis") p.d = ink(axisStrokes(p.box), seed(p));
    else if (p.type === "frame") p.d = ink(boxStrokes(p), seed(p));
    else if (circled(p)) {
      const [box] = ring(prev, 0); // "circle": true on a part
      Object.assign(p, { d: shape("circle", box, seed(p)), mark: "ring", box: box.map(r1), ...after(prev, T.ring) });
    } else if (p.type === "path" && prev?.rows && p.box[1] === prev.box[3] && p.box[3] - p.box[1] === 16 && p.box[0] === prev.box[0]) {
      const r = rowsAt(prev, parts).at(-1), b = under(r, r.x - 14, r.w + 28); // "underline": true on a part
      Object.assign(p, { d: shape("underline", b, seed(p)), mark: "under", box: [b[0], b[1] - 12, b[2], b[3] + 12].map(r1), ...after(prev, T.under) });
    }
    // a checklist row: the words as they're said, then the tick (which now lands with them, for its sound). A row not
    // tied to words waits for the row before it: one pen writes one row at a time.
    const q = parts[p.id + 1];
    const row = q?.rows && (q.parent === p.id || (q.parent === p.parent && q.box[1] < p.box[3] && p.box[1] < q.box[3] && q.box[0] >= p.box[2] - 1));
    if (timed && !e.at0 && p.type === "tick" && row && p.t !== undefined) {
      const dur = p.say !== undefined ? p.dur : q.dur, latest = e.out - T.read - frameUp(T.tick) - dur;
      Object.assign(q, { t: p.say !== undefined ? p.t : frame(Math.max(p.t, Math.min(pen, latest))), dur, parent: p.parent });
      Object.assign(p, { parent: q.id, ...after(q, T.tick) });
      pen = p.t + p.dur;
    }
  }
  if (word) {
    if (ringed) {
      const [box] = ring(word, 0);
      mark(word, "ring", box, shape("circle", box, seed(word, 1)), after(word, T.ring));
    } else {
      const r = rowsAt(word, parts).at(-1), first = after(word, T.double);
      const one = under(r, r.x - 14, r.w + 28), two = under(r, r.x + 0.1 * r.w, 0.84 * r.w, 34);
      mark(word, "under", [one[0], one[1] - 14, one[2], one[3] + 14], shape("underline", one, seed(word, 1)), first);
      mark(word, "under", [two[0], two[1] - 14, two[2], two[3] + 14], shape("underline", two, seed(word, 2)),
        timed && !e.at0 ? after({ t: first.t, dur: first.dur + T.pause }, T.double) : first);
      // the small line under the word moves down to clear the second stroke, as far as the stage allows
      const line = parts[word.id + 1], clear = two[1] + 14 + 8 - (line?.box[1] ?? Infinity);
      if (line?.rows && clear > 0) {
        const dy = Math.min(clear, composed.stage[3] - line.box[3]);
        if (dy > 0) line.box = [line.box[0], line.box[1] + dy, line.box[2], line.box[3] + dy].map(r1);
      }
    }
  }
  // each *key* word underlined as the pen writes it (rows written one after another, each for its share of the letters)
  for (const p of parts.filter((x) => x.rows?.some((r) => r.includes("*")))) {
    const rs = rowsAt(p, parts), st = SKIN.styles[p.style], lens = p.rows.map((r) => r.replaceAll("*", "").length);
    const all = lens.reduce((a, b) => a + b, 0);
    let before = 0, n = 0;
    rs.forEach((r, k) => {
      let x = r.x, at = before;
      r.row.split(/\*([^*]+)\*/).forEach((bit, j) => {
        const w = textWidth(bit, st, r.s);
        if (j % 2 && bit.trim()) {
          const b = under(r, x - 8, w + 16), t0 = p.t + (p.dur * at) / all, t1 = p.t + (p.dur * (at + bit.length)) / all;
          mark(p, "under", [b[0], b[1] - 12, b[2], b[3] + 12], shape("underline", b, seed(p, 3 + n++)),
            !timed ? {} : e.at0 ? { t: 0, dur: 0 } : { t: frame(t0), dur: Math.max(1 / 30, frame(t1) - frame(t0)) });
        }
        x += w;
        at += bit.length;
      });
      before += lens[k];
    });
  }
  return { ...composed, parts: [...parts, ...add] };
}

// An old page as a visual on its own sheet: its recipe laid out by compose in the page's room, drawn in this marker,
// each row and stroke at the time schedule gave it.
const RECIPE_OF = {
  list: (p) => ({ recipe: "checklist", items: p.rows }),
  big: (p) => ({ recipe: "big", text: p.rows[0] }),
  compare: (p) => drawn({ recipe: "compare", before: p.rows[0], after: p.rows[1] }),
  note: (p) => ({ recipe: "quote", text: p.rows.map((r, i) => {
    if (i !== p.key.row) return r;
    const c = [...r];
    return `${c.slice(0, p.key.from).join("")}*${c.slice(p.key.from, p.key.to).join("")}*${c.slice(p.key.to).join("")}`;
  }).join("\n") }),
};
// The pages' own largest sizes, by part: a note 140 px, a compare 170 over 210 (a list, 128, and a big word, 400,
// are the styles' own).
const PAGE_PX = { note: [140], compare: [170, 210] };
function pagePlaced(p, i, stage) {
  const v = RECIPE_OF[p.kind](p), where = 1000 + i;
  const e = { at0: p.at0, in: p.at0 ? 0 : frame(p.start + T.in), out: p.leaves ? frame(p.end - T.out) : p.stays ? p.end : frame(p.end + T.in) };
  const composed = inked(compose(v, SKIN, stage, where), where, v, null, PAGE_PX[p.kind]);
  const parts = composed.parts, rows = parts.filter((x) => x.rows), ticks = parts.filter((x) => x.type === "tick");
  const marks = parts.filter((x) => x.mark), arrow = parts.find((x) => x.type === "arrow");
  const set = (x, s, end = s.at + s.dur) => Object.assign(x, { do: s.do, t: frame(s.at), dur: frame(end) - frame(s.at) });
  const writes = p.steps.filter((s) => s.do === "write"), strokes = p.steps.filter((s) => s.do !== "write");
  if (p.kind === "note") set(rows[0], writes[0], writes.at(-1).at + writes.at(-1).dur);
  else writes.forEach((s, k) => set(rows[k], s));
  strokes.forEach((s, k) => set(s.do === "tick" ? ticks[s.row] : s.do === "arrow" ? arrow : marks[k - (p.kind === "compare" ? 1 : 0)], s));
  for (const x of parts) if (x.t === undefined) Object.assign(x, { t: e.in, dur: 0 });
  return { start: p.start, end: p.stays || p.leaves ? p.end : frame(e.out + T.out), planEnd: p.end, ...e, stays: p.stays, replaces: p.replaces,
    test: false, drift: 0, paper: true, page: true, kind: p.kind, composed };
}

// Every visual on one timeline: the plan's visuals (placeVisuals: matched to the words and timed, by the core's rules)
// and its old pages (schedule: their own rules, messages and stroke times), each page a visual on its own sheet. One at
// a time; between a page and a visual 1 s of footage, or paper over paper exactly at an end, never paper and footage
// back to back. Nothing draws on under the paper. Returns them in time order, each Placed with paper (on a sheet) and
// planEnd (its end in the plan), the bright sheet moves (one in, one out; none over paper or in a voice-only video,
// where the page fills the frame) and the scheduled pages. on: whether captions show (validate assumes they do).
export function placeAll(plan, { dur = Infinity, words = null, voice = !!plan.voice, on } = {}) {
  const V = plan.visuals ?? [];
  voice = voice && !plan.clips?.length; // all paper; over clips the footage's rules hold
  if (voice) {
    if ((plan.pages ?? []).length)
      throw new Error("a voice-over with no clips is all paper: write each page as a visual (list → checklist, big → big, compare → compare, note → quote)");
    if ((plan.doodles ?? []).length || (plan.texts ?? []).length)
      throw new Error("a voice-over with no clips has no footage to draw doodles, notes or lines on: put the words in visuals, or add clips");
  }
  if (Array.isArray(V)) V.forEach((v, i) => placeOf(v, i, voice));
  const stagePlan = on === undefined ? plan : { ...plan, captions: on };
  const placed = placeVisuals(Array.isArray(V) ? V.map(drawn) : V, dur, SKIN, { plan: stagePlan, words, voice });
  const order = V.map((_, i) => i).sort((a, b) => frame(V[a].start) - frame(V[b].start));
  const visuals = placed.map((x, k) => {
    const v = V[order[k]];
    return { ...x, paper: !onFootage(v), planEnd: x.stays ? x.end : frame(v.end), composed: inked(x.composed, order[k], v, x) };
  });
  const what = (x) => (x.page ? `the ${x.kind} page` : `the visual at ${s2(x.start)} s`);
  visuals.forEach((x, i) => {
    if (x.replaces && (!x.paper || !visuals[i - 1].paper))
      throw new Error(x.paper ? `${what(x)} can't replace a visual over the footage exactly: leave 1 s of footage between them`
        : `a visual over the footage can't replace ${what(visuals[i - 1])} exactly: leave 1 s of footage between them`);
  });
  const { pages } = schedule(plan, dur), stage = SKIN.stage({}, stagePlan);
  const all = [...visuals, ...pages.map((p, i) => pagePlaced(p, i, stage))].sort((a, b) => a.start - b.start);
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i], gap = b.start - a.planEnd;
    if (!a.page === !b.page) continue; // each kind keeps its own rules
    if (gap < -EPS)
      throw new Error(b.page ? `the ${b.kind} page starts at ${s2(b.start)} s, inside the visual at ${s2(a.start)}–${s2(a.planEnd)} s: one at a time`
        : `the visual at ${s2(b.start)} s starts inside the ${a.kind} page (${s2(a.start)}–${s2(a.planEnd)} s): one at a time`);
    if (gap < EPS) {
      if (!a.paper || !b.paper)
        throw new Error(b.paper ? `${what(b)} can't replace a visual over the footage exactly: leave 1 s of footage between them`
          : `a visual over the footage can't replace ${what(a)} exactly: leave 1 s of footage between them`);
      Object.assign(b, { replaces: true });
      Object.assign(a, { out: b.in, end: frame(b.in + T.out) });
    } else if (gap < T.gap - EPS)
      throw new Error(`only ${s2(gap)} s of footage between ${what(a)} (ends ${s2(a.planEnd)} s) and ${what(b)}: leave ${T.gap} s or more, ` +
        `or start it at ${s2(a.planEnd)} s so it replaces it on the paper`);
  }
  for (const x of visuals.filter((v) => v.paper))
    for (const [a, b, w] of drawingOf(plan))
      if (a < x.planEnd - EPS && b > x.start + EPS)
        throw new Error(`${w} at ${s2(a)}–${s2(b)} s, under the visual at ${s2(x.start)}–${s2(x.planEnd)} s: draw it before the paper ` +
          "comes in or after it has left");
  const flashes = voice ? [] : all.flatMap((x, i) => (!x.paper ? []
    : [!x.at0 && !x.replaces && x.start, !x.stays && !all[i + 1]?.replaces && x.out].filter(isNum))).sort((a, b) => a - b);
  const clash = flashClash(flashes);
  if (clash) throw new Error(`two sheets move at ${s2(clash[0])} and ${s2(clash[1])} s, under 1/3 s apart: move one of them`);
  return { placed: all, flashes, pages };
}

// The stills the head is looked for on (headsAt): each visual over the footage at its start, middle and end.
export const faceTimes = (placed) => placed.filter((x) => !x.paper).flatMap((x) => [x.start, (x.start + x.planEnd) / 2, x.planEnd]);
// Refuses a visual over the footage within 24 px of the head on any of its stills. heads null: no matte, unchecked.
export function faceClash(placed, heads) {
  if (!heads) return;
  const foot = placed.filter((x) => !x.paper), times = faceTimes(placed);
  heads.forEach((h, k) => {
    if (!h) return;
    const x = foot[Math.floor(k / 3)], head = [h.cx - h.width / 2, h.top, h.cx + h.width / 2, h.chin];
    if (meets(x.composed.stage, [head[0] - 24, head[1] - 24, head[2] + 24, head[3] + 24]))
      throw new Error(`the visual at ${s2(x.start)} s over the footage covers the face at ${s2(times[k])} s (head x ${Math.round(head[0])}–` +
        `${Math.round(head[2])}, y ${Math.round(head[1])}–${Math.round(head[3])}): move its "box" clear of the head`);
  });
}

// Every path and every time is worked out here (pure, tested) and handed to the template; the line's underline is
// made 1000 px long and stretched to the words' measured width in the browser.
export async function prepare(ctx) {
  const doodles = (ctx.plan.doodles ?? []).map((d, i) => ({
    start: start(d), end: Number(d.end ?? ctx.dur), color: d.color,
    paths: [0, 1, 2].map((v) => doodlePath(d.shape, boxOf(d), 21 + i * 97, v)),
  }));
  const captions = ctx.captions ?? [];
  for (const c of captions) {
    const bad = missing(c.text, SHANTELL);
    if (bad.length) throw new Error(`the caption "${c.text}" uses ${bad.join(" ")}, which Shantell Sans can't draw: ` +
      "fix that word in transcript.json and run cut again");
  }
  const { band, pageBand, lineY, pageArea } = captionLayout({ ...ctx.plan, voice: !!ctx.voice }, captions, ctx.dur);
  const texts = (ctx.plan.texts ?? []).map((t, i) => t.role === "line"
    ? { ...t, y: lineY[i], under: [0, 1, 2].map((v) => doodlePath("underline", [0, 0, 1000, 0], 5003 + i * 89, v)) } : t);
  const { placed } = placeAll(ctx.plan, { dur: ctx.dur, words: ctx.words ?? [], voice: !!ctx.voice, on: !!band });
  // shortcut: no stageImages, since Doodle refuses photos; add it if a part ever shows one
  if (placed.some((x) => !x.paper)) faceClash(placed, await headsAt(ctx, faceTimes(placed)));
  return { doodles, texts, visuals: placed, band, pageBand, pageArea, draw: DRAW, step: STEP, T };
}

// Soft on purpose (Saagii: "tone down", "too much", then 16 Nov "bring the sounds effects down a bit"): a doodle's or
// text's marker at 0.24, a page's paper as its sheet comes in and one short marker as it starts writing, all at about
// 30% of v1's levels (0.8, and 1.0 for the paper). A visual's paper as its sheet comes in (none over the footage) and a
// marker of at most 0.6 s as each part draws. Nothing for what is already there on frame 0, and none within 0.5 s of
// the last one kept or while a marker plays. Members raise them with "sfx": {"volume": …}.
export function sfx(plan, ctx = {}) {
  const { placed, pages } = placeAll(plan, { dur: ctx.dur ?? Infinity, words: ctx.words ?? null, voice: !!(ctx.voice ?? plan.voice) });
  const { enter, ...drawing } = SKIN.sounds, footage = { ...SKIN, sounds: drawing };
  return spaceSfx([
    ...(plan.doodles ?? []).filter((d) => start(d) >= FIRST).map((d) => ({ sound: "marker", at: start(d), dur: DRAW, volume: 0.24 })),
    ...(plan.texts ?? []).filter((t) => start(t) >= FIRST).map((t) => ({ sound: "marker", at: start(t), dur: writeTime(t), volume: 0.24 })),
    ...pages.filter((p) => !p.at0).flatMap((p) => {
      const w = p.steps[0].at, last = p.steps.at(-1);
      return [{ sound: "paper", at: p.start, volume: 0.3 }, { sound: "marker", at: w, dur: Math.min(SOUND_MAX, last.at + last.dur - w), volume: 0.24 }];
    }),
    ...placed.filter((x) => !x.page).flatMap((x) => visualSfx([x], x.paper ? SKIN : footage))
      .map((e) => (e.sound === "marker" ? { ...e, dur: Math.min(SOUND_MAX, e.dur ?? frameUp(T.tick)) } : e)),
  ]);
}
