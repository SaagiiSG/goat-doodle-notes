// 04 Doodle Notes: the footage exactly as filmed, with thick marker lines that draw themselves on
// (a ring round the product, an arrow, a star, a line under the price), handwritten notes written word by word,
// plain captions of what is said, and full-screen paper pages where the marker acts out the point.
// Positions are pixels of the 1080x1920 frame; Claude reads a frame at each doodle's time and boxes the real thing.
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { missing } from "./scripts/fonts.mjs";
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

// SVG path of one doodle. box = [left, top, right, bottom] in frame pixels; for underline and arrow it is
// [fromX, fromY, toX, toY]. The seed fixes the shape; variants 0–2 re-wobble it a pixel or two (the "boil").
export function doodlePath(shape, box, seed, variant) {
  const base = GOAT.rng(seed), boil = GOAT.rng(seed * 7919 + variant + 1);
  const dx = (boil() * 2 - 1) * 1.5, dy = (boil() * 2 - 1) * 1.5;
  let strokes = PEN[shape](box, base).map((s) => wobble(wobble(dense(s), base, 2.5), boil, 1.2).map(([x, y]) => [x + dx, y + dy]));
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
  schedule(plan, Infinity);
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
  const drawing = [
    ...(plan.doodles ?? []).map((d, i) => [start(d), start(d) + DRAW, `doodle ${i + 1} (${d.shape}) draws on`]),
    ...(plan.texts ?? []).map((t) => [start(t), start(t) + writeTime(t), `"${shown(String(t.text).trim())}" writes on`]),
  ].filter(([a]) => a >= FIRST);
  for (const p of pages)
    for (const [a, b, what] of drawing)
      if (a < p.end - EPS && b > p.start + EPS)
        throw new Error(`${what} at ${s2(a)}–${s2(b)} s, under ${p.what} (${s2(p.start)}–${s2(p.end)} s): draw it ` +
          "before the page comes in or after it has left");
  return { pages: pages.map(({ what, ...p }) => p) };
}

// ---------------------------------------------------------------- captions: one plain row of what is said

// The captions keep one height all video: their middle at captionY (default 1190, under the chin on a chest-up shot;
// Claude moves them above the head on a close-up), 40 px each way (Shantell Sans 56 px and its shadow), so 310–1200
// keeps them inside the safe box.
const CAP = { y: 1190, half: 40, min: 310, max: 1200, room: 30, lineGap: 20 };
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
export function captionLayout(plan, captions = [], dur = Infinity) {
  const on = plan.captions !== false && captions.length > 0;
  const y = plan.look?.captionY ?? CAP.y, band = on ? { y, top: y - CAP.half, bottom: y + CAP.half } : null;
  const texts = plan.texts ?? [];
  const lineY = texts.map((t) => {
    if (t.role !== "line") return undefined;
    if (t.y !== undefined || !band) return t.y ?? 1104;
    const [a, b] = lineBox(t, 1104);
    return a < band.bottom && b > band.top ? band.top - CAP.lineGap - (lineText(t) + 17) : 1104;
  });
  // a page writes on the larger side of the captions
  const above = [270, band ? band.top - CAP.room : 1248], below = [band ? band.bottom + CAP.room : 270, 1248];
  const pageArea = !band ? [270, 1248] : above[1] - above[0] >= below[1] - below[0] ? above : below;
  if (!band) return { band, lineY, pageArea };
  const things = [
    ...(plan.doodles ?? []).map((d, i) => [`doodle ${i + 1} (${d.shape})`, d,
      inkY([0, 1, 2].map((v) => doodlePath(d.shape, boxOf(d), 21 + i * 97, v)))]),
    ...texts.map((t, i) => [`"${shown(String(t.text).trim())}" (${t.role})`, t, t.role === "note" ? noteBox(t) : lineBox(t, lineY[i])]),
  ];
  for (const [what, x, [a, b]] of things) {
    if (!(a < band.bottom && b > band.top)) continue;
    const from = start(x), to = Number(x.end ?? dur), c = captions.find((c) => c.start < to && c.end > from);
    if (c)
      throw new Error(`${what} at y ${Math.round(a)}–${Math.round(b)} crosses the captions (y ${band.top}–${band.bottom}) while ` +
        `"${c.text}" shows (${s2(c.start)}–${s2(c.end)} s): move it, give the captions another height with ` +
        '"look": {"captionY": …}, or turn them off with "captions": false');
  }
  return { band, lineY, pageArea };
}

// An upper bound of the height look.js gives a page's writing and marks at scale k: a Caveat row reaches 0.86 em above
// its baseline (Й) and 0.30 em below (з); sizes, row spacing (152 px), the arrow and its gaps shrink with k, the
// strokes and wavy underlines don't. Full size: list 128 px, note 140, compare 170 over 210, big 400.
export function blockHeight(p, k) {
  const n = p.rows.length;
  if (p.kind === "list") return k * ((n - 1) * 152 + 1.16 * 128);
  if (p.kind === "note") return k * ((n - 1) * 152 + 1.16 * 140) + 13;
  if (p.kind === "compare") return k * (1.16 * 170 + 280 + 0.9 * 210) + 13;
  return p.mark === "ring" ? k * 1.42 * 400 + 36 : k * 1.1 * 400 + 49;
}
// The largest scale (1 at most) at which a page fits the room it gets.
const fitScale = (p, [a0, a1]) => Math.min(1, (a1 - a0 - blockHeight(p, 0)) / (blockHeight(p, 1) - blockHeight(p, 0)));

// Each page mark is made in a unit box and fitted to the measured words in the browser (only the arrow keeps its size).
const MARKS = { tick: ["tick", [0, 0, 100, 100]], ring: ["circle", [0, 0, 1000, 1000]], under: ["underline", [0, 0, 1000, 0]],
  arrow: ["arrow", [0, 0, 0, 200]] };

// Every path and every height is worked out here (pure, tested) and handed to the template; the line's underline is
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
  const { band, lineY, pageArea } = captionLayout(ctx.plan, captions, ctx.dur);
  const texts = (ctx.plan.texts ?? []).map((t, i) => t.role === "line"
    ? { ...t, y: lineY[i], under: [0, 1, 2].map((v) => doodlePath("underline", [0, 0, 1000, 0], 5003 + i * 89, v)) } : t);
  const pages = schedule(ctx.plan, ctx.dur).pages.map((p, i) => ({
    ...p, scale: fitScale(p, pageArea),
    steps: p.steps.map((x, j) => (x.do === "write" ? x
      : { ...x, paths: [0, 1, 2].map((v) => doodlePath(MARKS[x.do][0], MARKS[x.do][1], 31007 + i * 131 + j * 17, v)) })),
  }));
  return { doodles, texts, pages, band, pageArea, draw: DRAW, step: STEP, T };
}

// Soft on purpose (Saagii: "tone down", "too much", then 16 Nov "bring the sounds effects down a bit"): a doodle's or
// text's marker at 0.24, a page's paper as its sheet comes in and one short marker as it starts writing, all at about
// 30% of v1's levels (0.8, and 1.0 for the paper). Nothing for what is already there on frame 0, and none within 0.5 s of the last one kept
// or while a marker plays. Members raise them with "sfx": {"volume": …}.
export function sfx(plan, ctx = {}) {
  const ev = [
    ...(plan.doodles ?? []).filter((d) => start(d) >= FIRST).map((d) => ({ sound: "marker", at: start(d), dur: DRAW, volume: 0.24 })),
    ...(plan.texts ?? []).filter((t) => start(t) >= FIRST).map((t) => ({ sound: "marker", at: start(t), dur: writeTime(t), volume: 0.24 })),
    ...schedule(plan, ctx.dur ?? Infinity).pages.filter((p) => !p.at0).flatMap((p) => {
      const w = p.steps[0].at, last = p.steps.at(-1);
      return [{ sound: "paper", at: p.start, volume: 0.3 }, { sound: "marker", at: w, dur: Math.min(0.6, last.at + last.dur - w), volume: 0.24 }];
    }),
  ].sort((a, b) => a.at - b.at);
  const out = [];
  for (const e of ev) {
    const p = out.at(-1);
    if (!p || e.at >= p.at + Math.max(0.5, p.dur ?? 0) - 1e-9) out.push(e);
  }
  return out;
}
