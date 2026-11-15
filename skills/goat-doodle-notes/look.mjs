// 04 Doodle Notes: the footage exactly as filmed, with thick marker lines that draw themselves on
// (a ring round the product, an arrow, a star, a line under the price) and handwritten notes written word by word.
// Positions are pixels of the 1080x1920 frame; Claude reads a frame at each doodle's time and boxes the real thing.
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { missing } from "./scripts/fonts.mjs";
await import("./scripts/goat-lib.js"); // GOAT.rng, the same seeded random the template uses

export const NAME = "doodle-notes";
export const TALKS = false;

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1920, DEG = Math.PI / 180;
const DRAW = 0.4, STEP = 0.12; // a stroke draws on in 0.4 s; words appear whole, 0.12 s apart
const FONTS = { note: "Caveat[wght].ttf", line: "ShantellSans[BNCE,INFM,SPAC,wght].ttf" };
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

// SVG path of one doodle. box = [left, top, right, bottom] in frame pixels; for underline and arrow it is
// [fromX, fromY, toX, toY]. The seed fixes the shape; variants 0–2 re-wobble it a pixel or two (the "boil").
export function doodlePath(shape, box, seed, variant) {
  const base = GOAT.rng(seed), boil = GOAT.rng(seed * 7919 + variant + 1);
  const dx = (boil() * 2 - 1) * 1.5, dy = (boil() * 2 - 1) * 1.5;
  let strokes = SHAPES[shape](box, base).map((s) => wobble(wobble(dense(s), base, 2.5), boil, 1.2).map(([x, y]) => [x + dx, y + dy]));
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
}

const words = (t) => String(t.text).trim().split(/\s+/).length;
// how long a text takes to write on: its words 0.12 s apart, then a line's own underline
const writeTime = (t) => (words(t) - 1) * STEP + 0.1 + (t.role === "line" ? DRAW : 0);

// Every path is made here (pure, tested) and handed to the template; the line's underline is made 1000 px
// long and stretched to the words' measured width in the browser.
export async function prepare(ctx) {
  const doodles = (ctx.plan.doodles ?? []).map((d, i) => ({
    start: start(d), end: Number(d.end ?? ctx.dur), color: d.color,
    paths: [0, 1, 2].map((v) => doodlePath(d.shape, boxOf(d), 21 + i * 97, v)),
  }));
  const texts = (ctx.plan.texts ?? []).map((t, i) =>
    t.role === "line" ? { ...t, under: [0, 1, 2].map((v) => doodlePath("underline", [0, 0, 1000, 0], 5003 + i * 89, v)) } : t);
  return { doodles, texts, draw: DRAW, step: STEP };
}

// Soft on purpose (Saagii, 14 Nov: "tone down"; the old look used 0.8); members raise them with "sfx": {"volume": …}.
export function sfx(plan) {
  return [
    ...(plan.doodles ?? []).filter((d) => start(d) >= FIRST).map((d) => ({ sound: "marker", at: start(d), dur: DRAW, volume: 0.4 })),
    ...(plan.texts ?? []).filter((t) => start(t) >= FIRST).map((t) => ({ sound: "marker", at: start(t), dur: writeTime(t), volume: 0.4 })),
  ].sort((a, b) => a.at - b.at);
}
