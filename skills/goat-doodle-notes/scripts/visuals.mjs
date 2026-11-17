// Motion graphics that act out what is said, Node side. A visual in plan.json is parts (text, number, path, arrow,
// ring, bar, tick, icon, image), layouts (row, column, grid, stack, axis) or a recipe that expands to them. compose
// checks it against the guard rails and lays it out into boxes inside the look's stage; the browser (goat-visuals.js)
// only draws the boxes it is given. Node built-ins only.
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { missing, textWidth } from "./fonts.mjs";
import { SAFE, photoPng } from "./media.mjs";

export const LIMITS = { group: 6, parts: 24, words: 40, rows: 3, points: 24, minPx: 28 };
export const RECIPES = ["count", "big", "bars", "line", "ring", "steps", "checklist", "compare", "trend", "quote", "timeline",
  "table", "pin", "chat", "news", "screen"];
const REVEALS = ["write", "words", "type", "draw", "grow", "count", "pop", "blur", "slam", "fade"];
const STYLES = ["value", "title", "label", "small"];
const ARROWS = ["right", "left", "up", "down", "up-right", "down-right"];
const PLOTS = ["bars", "line", "dots"];
const KINDS = ["browser", "app", "comment"];
const SOURCES = ["said", "member", "test"];
// px: between things, line height (x the size), inside a frame, a window's title bar
const GAP = 24, LEAD = 1.2, PAD = 24, BAR = 56;
const FAN = (4 * Math.PI) / 180; // a stack fans its things ±4°

const isNum = (n) => typeof n === "number" && Number.isFinite(n);
const r1 = (n) => Math.round(n * 10) / 10;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const list = (a, last = "or") => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} ${last} ${a.at(-1)}`);
const quoted = (a) => a.map((x) => `"${x}"`);
const fmt = (b) => `[${b.join(", ")}]`;
const meets = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
// whether the segment a-z passes through box b (Liang-Barsky clipping)
function crosses([ax, ay], [zx, zy], [x0, y0, x1, y1]) {
  let t0 = 0, t1 = 1;
  const dx = zx - ax, dy = zy - ay;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; t0 = Math.max(t0, r); } else { if (r < t0) return false; t1 = Math.min(t1, r); }
  }
  return t0 <= t1;
}
const inBox = (b, o) => Array.isArray(b) && b.length === 4 && b.every(isNum) && b[2] > b[0] && b[3] > b[1] &&
  b[0] >= o[0] && b[1] >= o[1] && b[2] <= o[2] && b[3] <= o[3];
const SAFE_TEXT = `the safe box x ${SAFE[0]}–${SAFE[2]}, y ${SAFE[1]}–${SAFE[3]}`;

// Points on a circle (degrees, 0 = right, y down), for icons in their 0–100 box and for marks in px.
const arc = (cx, cy, r, a0 = 0, a1 = 360, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
  return [r1(cx + r * Math.cos(a)), r1(cy + r * Math.sin(a))];
});
// n points around (50, cy) from the top, cycling through the radii (a star's tips and dips, a gear's teeth)
const around = (n, radii, cy) => Array.from({ length: n + 1 }, (_, i) => {
  const a = ((-90 + (360 * i) / n) * Math.PI) / 180, r = radii[i % radii.length];
  return [r1(50 + r * Math.cos(a)), r1(cy + r * Math.sin(a))];
});
const heart = Array.from({ length: 33 }, (_, i) => {
  const t = (i / 32) * 2 * Math.PI;
  return [r1(50 + 41.6 * Math.sin(t) ** 3), r1(46 - 2.6 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)))];
});

// The 19 icons, drawn in code as strokes (point lists) in a 0–100 box, y down. No outside assets.
export const ICONS = {
  clock: [arc(50, 50, 40), [[50, 24], [50, 50], [68, 60]]],
  calendar: [[[14, 22], [86, 22], [86, 88], [14, 88], [14, 22]], [[14, 40], [86, 40]], [[34, 12], [34, 30]], [[66, 12], [66, 30]]],
  pin: [[[50, 92], ...arc(50, 38, 28, 140, 400, 20), [50, 92]], arc(50, 38, 10, 0, 360, 12)],
  phone: [[[30, 8], [70, 8], [70, 92], [30, 92], [30, 8]], [[44, 16], [56, 16]], arc(50, 83, 3, 0, 360, 8)],
  chat: [[[12, 18], [88, 18], [88, 68], [44, 68], [26, 86], [28, 68], [12, 68], [12, 18]], [[26, 36], [74, 36]], [[26, 50], [60, 50]]],
  heart: [heart],
  star: [around(10, [42, 18], 54)],
  person: [arc(50, 30, 16), arc(50, 92, 30, 180, 360, 12)],
  people: [arc(34, 36, 12), arc(34, 90, 22, 180, 360, 12), arc(66, 30, 14), arc(66, 90, 26, 180, 360, 12)],
  scissors: [arc(28, 76, 12), arc(72, 76, 12), [[36, 67], [80, 8]], [[64, 67], [20, 8]]],
  car: [[[8, 64], [8, 50], [24, 46], [36, 28], [66, 28], [80, 46], [92, 50], [92, 64], [8, 64]], arc(28, 66, 9), arc(72, 66, 9)],
  home: [[[10, 50], [50, 14], [90, 50]], [[22, 40], [22, 88], [78, 88], [78, 40]], [[42, 88], [42, 62], [58, 62], [58, 88]]],
  bag: [[[18, 34], [82, 34], [88, 90], [12, 90], [18, 34]], arc(50, 34, 16, 180, 360, 12)],
  camera: [[[10, 30], [32, 30], [38, 20], [62, 20], [68, 30], [90, 30], [90, 80], [10, 80], [10, 30]], arc(50, 55, 16)],
  sparkle: [[[50, 8], [58, 42], [92, 50], [58, 58], [50, 92], [42, 58], [8, 50], [42, 42], [50, 8]]],
  money: [[[8, 28], [92, 28], [92, 72], [8, 72], [8, 28]], arc(50, 50, 12), [[18, 40], [18, 60]], [[82, 40], [82, 60]]],
  chip: [[[28, 28], [72, 28], [72, 72], [28, 72], [28, 28]], [[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]],
    ...[38, 50, 62].flatMap((p) => [[[p, 28], [p, 14]], [[p, 72], [p, 86]], [[28, p], [14, p]], [[72, p], [86, p]]])],
  gear: [around(32, [42, 42, 31, 31], 50), arc(50, 50, 12)],
  cursor: [[[30, 12], [30, 80], [46, 64], [58, 90], [68, 86], [56, 60], [78, 60], [30, 12]]], // starts at its tip
};

const hex = (c) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(typeof c === "string" ? c : "");
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// The WCAG contrast ratio of two hex colours (rounded to 6 places only to drop float noise: 21, not 21.000000000000004).
export function contrast(fg, bg) {
  const [a, b] = [fg, bg].map((c) => {
    const rgb = hex(c);
    if (!rgb) throw new Error(`"${c}" is not a colour like "#FFFFFF"`);
    return luminance(rgb);
  });
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 1e6) / 1e6;
}

// A number with its unit, as written: "25 000₮", "1,500", "1,5", "4.8", "90%", "Day 1", "2024". A separator followed
// by exactly 3 digits groups thousands after a first group of 1–3 digits not starting with 0 ("25 000", but not
// "0.500" or "12345.678"); otherwise "." or "," is the decimal mark. null when it isn't one number.
const NUM = /^(\D*?)((?:[1-9]\d{0,2}([ ,.\u00a0\u202f])\d{3}(?:\3\d{3})*)|\d+)(?:([.,])(\d+))?(\D*)$/;
export function parseNumber(s) {
  if (typeof s !== "string" && !isNum(s)) return null;
  const m = NUM.exec(String(s).trim());
  if (!m) return null;
  const [, pre, int, sep = "", decSep = "", frac = "", post] = m;
  if (sep && sep === decSep) return null;
  const num = Number((sep ? int.split(sep).join("") : int) + (frac ? `.${frac}` : ""));
  return { pre, num, dec: frac.length, sep, decSep, post, year: !sep && !frac && /^\d{4}$/.test(int) && num >= 1900 && num <= 2100 };
}

// Every number shown anywhere in a visual (or a string), as written: "25 000₮ and 1,5" -> ["25 000", "1,5"]. Times,
// the source, the words to say, file names, icon names and path points are not shown, so they don't count.
const NOT_SHOWN = new Set(["start", "end", "source", "say", "at", "len", "recipe", "kind", "plot", "dir", "area", "box", "cols", "style",
  "path", "arrow", "icon", "image", "tick", "circle", "underline", "frame"]);
const DIGITS = /\d+(?:[ ,\u00a0\u202f]\d{3}(?!\d))*(?:[.,]\d+)?/g;
export function numbersIn(visual) {
  const out = [];
  const walk = (v, key) => {
    if (NOT_SHOWN.has(key)) return;
    if (typeof v === "string" || isNum(v)) for (const m of String(v).matchAll(DIGITS)) out.push(m[0]);
    else if (Array.isArray(v)) for (const x of v) walk(x);
    else if (v && typeof v === "object") for (const k in v) walk(v[k], k);
  };
  walk(visual);
  return out;
}
// The same as digit groups, separators removed ("25 000₮" -> "25000"): any digit shown needs a "source".
export function digitsIn(visual) {
  return numbersIn(visual).map((m) => m.replace(/\D/g, ""));
}

// The larger side of a caption band {top, bottom} inside box, kept room px clear of it.
export function clearOf(box, band, room = 30) {
  const above = band.top - room - box[1], below = box[3] - band.bottom - room;
  return above >= below ? [box[0], box[1], box[2], Math.min(box[3], band.top - room)]
    : [box[0], Math.max(box[1], band.bottom + room), box[2], box[3]];
}

// A look's SKIN: placement, a stage inside SAFE, four text styles that fit the floor (28 px at least, WCAG contrast
// against the surface they sit on, weights under 400 only from 48 px), a reveal for each kind of part, 1 or 3 variants.
export function checkSkin(skin) {
  if (!["cutaway", "overlay", "frame"].includes(skin.place)) throw new Error(`a skin's "place" is cutaway, overlay or frame, not "${skin.place}"`);
  for (const name of STYLES) {
    const s = skin.styles?.[name];
    if (!s) throw new Error(`the skin has no "${name}" style`);
    if (!existsSync(s.file ?? "")) throw new Error(`the ${name} style's font ${s.file} isn't there`);
    if (!(isNum(s.factor) && s.factor > 0)) throw new Error(`the ${name} style needs a "factor" above 0: its weight's width over the font's default`);
    if (!(isNum(s.min) && s.min >= LIMITS.minPx)) throw new Error(`the ${name} style's smallest size is ${s.min} px: ${LIMITS.minPx} px at least`);
    if (!(isNum(s.max) && s.max >= s.min)) throw new Error(`the ${name} style's largest size (${s.max} px) is under its smallest (${s.min} px)`);
    if (!isNum(s.weight)) throw new Error(`the ${name} style needs a "weight", like 400`);
    if (s.weight < 400 && s.min < 48) throw new Error(`the ${name} style is weight ${s.weight} from ${s.min} px: weights under 400 need 48 px at least`);
    if (!hex(s.color) || !hex(s.on)) throw new Error(`the ${name} style needs a "color" and the "on" surface it sits on, as hex like "#FFFFFF"`);
    const need = s.min >= 48 || s.weight >= 700 ? 3 : 4.5, c = contrast(s.color, s.on);
    if (c < need) throw new Error(`the ${name} style's contrast ${Math.floor(c * 10) / 10}:1 is under ${need}:1 (${s.color} on ${s.on}): ` +
      "darken or lighten one of them");
  }
  for (const k of ["text", "number", "stroke", "bar", "ring", "icon", "image"])
    if (!REVEALS.includes(skin.reveal?.[k])) throw new Error(`the skin's ${k} reveal "${skin.reveal?.[k]}" is not one of ${list(REVEALS)}`);
  if (![1, 3].includes(skin.variants)) throw new Error('a skin\'s "variants" is 1 or 3');
  // shortcut: probes the stage with an empty plan, a look whose stage reads the plan checks its own in its tests
  for (const v of skin.place === "overlay" ? [{}, { area: "top" }, { area: "bottom" }] : [{}]) {
    const b = skin.stage(v, {});
    if (!inBox(b, SAFE)) throw new Error(`the stage ${Array.isArray(b) ? fmt(b) : b}${v.area ? ` for "area": "${v.area}"` : ""} runs outside ${SAFE_TEXT}`);
  }
}

// ---- expand: a plan visual (or any thing in it) into a tree of nodes {type, …props, say?, at?, deco?, children?}

const PARTS = ["text", "number", "path", "arrow", "ring", "bar", "tick", "icon", "image"];
const LAYOUTS = ["row", "column", "grid", "stack", "axis"];
const GROUP = { row: "things side by side", column: "things in a column", grid: "things in a grid" };
const timing = (v) => ({ ...(v.say !== undefined && { say: v.say }), ...(v.at !== undefined && { at: v.at }) });
const col = (children) => ({ type: "column", children: children.filter(Boolean) });
const asObject = (x, key) => (x !== null && typeof x === "object" && !Array.isArray(x) ? x : { [key]: x });

function rowsOf(t) {
  const s = typeof t === "string" || isNum(t) ? String(t) : "";
  if (!s.trim()) throw new Error("a text is empty: give it words or remove it");
  const rows = s.split("\n").map((r) => r.trim()), shown = rows.join(" / ");
  if (rows.some((r) => !r)) throw new Error(`"${shown}" has an empty row: remove the extra \\n`);
  if (rows.length > LIMITS.rows) throw new Error(`"${shown}" has ${rows.length} rows: ${LIMITS.rows} rows at most`);
  return rows;
}
const styleOf = (s, fallback) => {
  if (s !== undefined && !STYLES.includes(s)) throw new Error(`"style" is ${list(quoted(STYLES))}, not "${s}"`);
  return s ?? fallback;
};
const textNode = (t, style) => ({ type: "text", text: rowsOf(t).join("\n"), style });
function numberNode(x, style) {
  const s = String(x ?? "").trim();
  if (!parseNumber(s)) throw new Error(`"${s}" is not a number: write it as digits with its unit, like "90%", or use "text"`);
  return { type: "number", number: s, style };
}
// A recipe field: a text, or a number when it starts with one ("25 000₮", "90%"), or {text | number, say?, at?}.
function leaf(x, style, numStyle = style) {
  const o = asObject(x, isNum(x) || parseNumber(x)?.pre === "" ? "number" : "text");
  return { ...(o.number !== undefined ? numberNode(o.number, numStyle) : textNode(o.text, style)), ...timing(o) };
}
function need(v, ...keys) {
  for (const k of keys) if (v[k] === undefined) throw new Error(`a ${v.recipe} needs "${k}"`);
}
function items(v, key, lo, hi) {
  const a = v[key];
  if (!Array.isArray(a) || a.length < lo || a.length > hi) throw new Error(`a ${v.recipe} takes ${lo} to ${hi} ${key} in a list`);
  return a;
}
// A chart value: a number 0 or more, written as a number or as digits ("1 500"), with the unit kept in "unit".
function value(x, label) {
  if (x === undefined || x === null || x === "") throw new Error(`${label} has no "value"`);
  const n = isNum(x) ? { num: x, pre: "", post: "" } : parseNumber(x);
  if (!n || n.pre || n.post) throw new Error(`${label}'s value ${JSON.stringify(x)} isn't a number: write digits, and the unit in "unit"`);
  if (n.num < 0) throw new Error(`${label} is ${x}: values are 0 or more`);
  return n.num;
}
const needUnit = (unit, what) => {
  if (typeof unit !== "string" || !unit.trim()) throw new Error(`${what} needs a "unit" (like "₮", "%" or "students"), written on every value`);
  return unit.trim();
};
// "40" + "students" -> "40 students", "25 000" + "₮" -> "25 000₮"
const written = (x, unit) => `${String(x).trim()}${/^\p{L}/u.test(unit) ? " " : ""}${unit}`;

function axisNode(points, plot, unit, what) {
  if (!PLOTS.includes(plot)) throw new Error(`"plot" is ${list(quoted(PLOTS))}, not "${plot}"`);
  unit = needUnit(unit, what);
  const bars = plot === "bars", lo = bars ? 2 : 3, thing = bars ? "bar" : "point";
  if (!Array.isArray(points) || points.length < lo)
    throw new Error(bars ? `${what} needs 2 bars at least` : `${what} needs 3 points at least: use compare for two values`);
  if (points.length > 6) throw new Error(`${what} has ${points.length} ${thing}s: 6 at most`);
  const nums = points.map((p, i) => {
    if (p?.label === undefined) throw new Error(`${thing} ${i + 1} of ${what} needs a "label"`);
    return value(p.value, `the ${thing} "${p.label}"`);
  });
  if (nums.every((x) => x === 0)) throw new Error(`every value is 0 in ${what}: a chart needs one above 0, or show it another way`);
  return { type: "axis", plot, unit, children: points.map((p, i) => ({ type: bars ? "bar" : "dot", value: nums[i], ...timing(p),
    children: [textNode(p.label, "label"), numberNode(written(p.value, unit), "label")] })) };
}

function ringNode(s, unit, what = "the ring") {
  if (s?.parts !== undefined) {
    unit = needUnit(unit, what);
    if (!Array.isArray(s.parts) || s.parts.length < 2 || s.parts.length > 4) throw new Error(`${what}'s "parts" are 2 to 4 slices of a whole`);
    const nums = s.parts.map((p) => value(p?.value, `the slice "${p?.label}"`));
    if (nums.every((x) => x === 0)) throw new Error(`every value is 0 in ${what}: a chart needs one above 0`);
    return { type: "ring", ring: { parts: nums }, children: s.parts.map((p) => ({ ...col([textNode(p.label, "label"),
      numberNode(written(p.value, unit), "label")]), ...timing(p) })) };
  }
  unit = needUnit(unit, what);
  const of = s?.of ?? (unit === "%" ? 100 : undefined);
  if (of === undefined) throw new Error(`${what} needs "of" (the whole it fills toward), unless its unit is "%"`);
  const v = value(s.value, what), whole = value(of, `${what}'s "of"`);
  if (v === 0) throw new Error(`${what}'s value is 0: a chart needs a value above 0`);
  if (v > whole) throw new Error(`${what}'s value ${s.value} is more than its whole (${of})`);
  return { type: "ring", ring: { value: v, of: whole },
    children: [{ ...numberNode(written(s.value, unit), "title"), key: true }] };
}
const withTitle = (v, node) => (v.title !== undefined ? col([textNode(v.title, "title"), node]) : node);
const cell = (x) => (typeof x === "boolean" ? { type: "tick", tick: x } : leaf(x, "label"));

const RECIPE = {
  count: (v) => (need(v, "number"), col([{ ...numberNode(v.number, "value"), key: true, ...timing(v) },
    v.line !== undefined && textNode(v.line, "small")])),
  big: (v) => (need(v, "text"), col([{ ...textNode(v.text, "value"), key: true, ...timing(v) }, v.line !== undefined && textNode(v.line, "small")])),
  bars: (v) => withTitle(v, axisNode(v.bars, "bars", v.unit, "the bar chart")),
  line: (v) => withTitle(v, axisNode(v.points, "line", v.unit, "the line")),
  ring: (v) => withTitle(v, col([{ ...ringNode(v, v.unit), ...timing(v) }, v.label !== undefined && textNode(v.label, "label")])),
  steps: (v) => col(items(v, "items", 2, 4).map((x, i) => {
    const o = asObject(x, "text");
    return { type: "row", weights: [1, 5], ...timing(o), children: [textNode(String(i + 1), "title"), textNode(o.text, "label")] };
  })),
  checklist: (v) => col(items(v, "items", 2, 4).map((x) => {
    const o = asObject(x, "text");
    if (o.tick !== undefined && typeof o.tick !== "boolean") throw new Error('a checklist item\'s "tick" is true (✓) or false (✗)');
    return { type: "row", weights: [1, 5], ...timing(o), children: [{ type: "tick", tick: o.tick ?? true }, textNode(o.text, "label")] };
  })),
  compare: (v) => (need(v, "before", "after"), { type: "row", weights: [2, 1, 2],
    children: [leaf(v.before, "title", "value"), { type: "arrow", arrow: "right" }, { ...leaf(v.after, "title", "value"), key: true }] }),
  trend: (v) => {
    need(v, "dir", "text");
    if (!["up", "down"].includes(v.dir)) throw new Error(`a trend's "dir" is "up" or "down", not "${v.dir}"`);
    if (digitsIn(v).length) throw new Error(`"${String(v.text).replace(/\n/g, " / ")}": a trend has no numbers: use bars, a line or compare with a "source"`);
    const text = { ...textNode(v.text, "title"), key: true, ...timing(v) };
    return v.dir === "up" ? col([text, { type: "arrow", arrow: "up-right" }]) : col([{ type: "arrow", arrow: "down-right" }, text]);
  },
  quote: (v) => (need(v, "text"), col([{ ...textNode(v.text, "title"), ...timing(v) }, v.who !== undefined && textNode(v.who, "small")])),
  timeline: (v) => ({ type: "column", spine: true, children: items(v, "points", 2, 5).map((p) => {
    if (p?.when === undefined || p?.what === undefined) throw new Error('each timeline point needs a "when" and a "what"');
    return { type: "row", weights: [1, 2, 4], ...timing(p), children: [{ type: "dot" }, textNode(p.when, "title"), textNode(p.what, "label")] };
  }) }),
  table: (v) => {
    if (!Array.isArray(v.head) || v.head.length !== 2) throw new Error('a table\'s "head" names its 2 columns, like ["Before", "After"]');
    return col([{ type: "row", children: [null, ...v.head.map((h) => textNode(h, "small"))] },
      ...items(v, "rows", 2, 4).map((r) => {
        if (r?.label === undefined || !Array.isArray(r.cells) || r.cells.length !== 2)
          throw new Error('each table row is {"label": …, "cells": [a, b]}, one cell under each head');
        return { type: "row", ...timing(r), children: [textNode(r.label, "label"), ...r.cells.map(cell)] };
      })]);
  },
  pin: (v, where) => (need(v, "place"), col([{ type: "map", seed: where, children: [{ type: "icon", icon: "pin" }] },
    { ...textNode(v.place, "title"), ...timing(v) }, v.line !== undefined && textNode(v.line, "small")])),
  chat: (v) => (need(v, "message"), col([v.name !== undefined && textNode(v.name, "small"),
    { type: "row", weights: [5, 1],
      children: [{ ...leaf(v.message, "label"), reveal: "type", deco: { frame: true, bubble: "message" } }, null] },
    v.reply !== undefined && { type: "row", weights: [1, 5],
      children: [null, { ...leaf(v.reply, "label"), deco: { frame: true, bubble: "reply" } }] }])),
  news: (v) => (need(v, "headline"), { type: "column", deco: { frame: true }, children: [
    v.badge !== undefined && { type: "row", weights: [1, 2], children: [{ ...textNode(v.badge, "small"), deco: { frame: true } }, null] },
    { ...leaf(v.headline, "title"), reveal: "words" }, v.line !== undefined && textNode(v.line, "small")].filter(Boolean) }),
  // A window or a comment box: the field types itself, the cursor presses the button, the result appears.
  screen: (v) => {
    if (!KINDS.includes(v.kind)) throw new Error(`a screen's kind is browser, app or comment, not ${JSON.stringify(v.kind)}`);
    if (v.field === undefined) throw new Error('a screen needs a "field": the words typed into it');
    const kids = [{ ...leaf(v.field, "label"), reveal: "type", deco: { frame: true } }];
    if (v.button !== undefined) {
      const b = asObject(v.button, "text");
      kids.push({ type: "button", text: rowsOf(b.text).join("\n"), style: "label", ...timing(b) }, { type: "icon", icon: "cursor" });
    }
    if (v.result !== undefined) kids.push(v.result?.image !== undefined ? expand({ image: v.result.image }) : leaf(v.result, "label"));
    return { type: "frame", screen: v.kind, ...timing(v), children: kids };
  },
};

export function expand(v, where = 0) {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error('each thing in a visual is an object, like {"text": "…"}');
  if (v.recipe !== undefined) {
    if (!RECIPES.includes(v.recipe)) throw new Error(`"${v.recipe}" is not a recipe. Use one of ${list(RECIPES)}, or write the parts`);
    return RECIPE[v.recipe](v, where);
  }
  const keys = [...PARTS, ...LAYOUTS].filter((k) => v[k] !== undefined);
  if (!keys.length) throw new Error(`each thing needs one of ${list(quoted([...PARTS, ...LAYOUTS]))}, or a "recipe"`);
  if (keys.length > 1) throw new Error(`${list(quoted(keys), "and")} can't share one part: put them in a row or a column`);
  const k = keys[0], x = v[k];
  const deco = Object.fromEntries(["circle", "underline", "frame"].filter((d) => v[d] === true).map((d) => [d, true]));
  return { ...nodeOf(k, x, v, where), ...timing(v), ...(Object.keys(deco).length && { deco }) };
}

function nodeOf(k, x, v, where) {
  switch (k) {
    case "text": return textNode(x, styleOf(v.style, "label"));
    case "number": return numberNode(x, styleOf(v.style, "value"));
    case "path":
      if (!Array.isArray(x) || x.length < 2 || !x.every((p) => Array.isArray(p) && p.length === 2 && p.every((c) => isNum(c) && c >= 0 && c <= 100)))
        throw new Error('a "path" is 2 or more [x, y] points, each from 0 to 100 in its own box');
      if (x.length > LIMITS.points) throw new Error(`the path has ${x.length} points: ${LIMITS.points} points at most`);
      return { type: "path", path: x };
    case "arrow":
      if (!ARROWS.includes(x)) throw new Error(`an arrow points ${list(ARROWS)}, not ${JSON.stringify(x)}`);
      return { type: "arrow", arrow: x };
    case "ring": return ringNode(x, v.unit);
    case "bar": return { type: "bar", value: value(x, "the bar") };
    case "tick":
      if (typeof x !== "boolean") throw new Error('a "tick" is true (✓) or false (✗)');
      return { type: "tick", tick: x };
    case "icon":
      if (!Object.hasOwn(ICONS, x)) throw new Error(`"${x}" is not an icon. Use one of ${list(Object.keys(ICONS))}`);
      return { type: "icon", icon: x };
    case "image":
      if (typeof x !== "string" || !x.trim()) throw new Error('an "image" is the path to a photo, like "raw/photo.jpg"');
      return { type: "image", image: x };
    case "axis": return axisNode(x, v.plot ?? "bars", v.unit, "the axis");
  }
  if (!Array.isArray(x) || !x.length) throw new Error(`a ${k} is a list of things`);
  if (k === "stack" && x.length > 5) throw new Error(`the stack has ${x.length} things: 5 at most in a stack`);
  if (x.length > LIMITS.group) throw new Error(`the ${k} has ${x.length} things: ${LIMITS.group} ${GROUP[k]} at most; split it, or use two visuals`);
  if (k === "grid" && !(Number.isInteger(v.cols) && v.cols >= 1 && v.cols <= LIMITS.group)) throw new Error('a grid needs "cols": how many across, 1 to 6');
  return { type: k, ...(k === "grid" && { cols: v.cols }), children: x.map((c) => expand(c, where)) };
}

// ---- compose: the node tree laid out into boxes inside the stage, as parts flattened in reading order

const REVEAL_OF = { text: "text", number: "number", path: "stroke", arrow: "stroke", tick: "stroke", axis: "stroke", bar: "bar",
  ring: "ring", icon: "icon", image: "image", frame: "image" }; // a frame (panel, bubble, window) arrives like a photo
const inset = (b, d) => {
  const dx = Math.min(d, (b[2] - b[0]) / 2), dy = Math.min(d, (b[3] - b[1]) / 2);
  return [b[0] + dx, b[1] + dy, b[2] - dx, b[3] - dy];
};
const square = (b, k = 1) => {
  const s = Math.min(b[2] - b[0], b[3] - b[1]) * k, x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2;
  return [x - s / 2, y - s / 2, x + s / 2, y + s / 2];
};
const in100 = (pts, b) => pts.map(([x, y]) => [b[0] + (x / 100) * (b[2] - b[0]), b[1] + (y / 100) * (b[3] - b[1])]);
const ellipse = (b) => arc(0, 0, 1, -90, 270, 32).map(([x, y]) => [(b[0] + b[2]) / 2 + (x * (b[2] - b[0])) / 2, (b[1] + b[3]) / 2 + (y * (b[3] - b[1])) / 2]);
// the arc from fraction f0 to f1 of a circle in box b, from the top, clockwise
const sweep = (b, f0, f1) => {
  const r = (b[2] - b[0]) / 2;
  return arc((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, r, -90 + 360 * f0, -90 + 360 * f1, Math.max(8, Math.ceil(48 * (f1 - f0))));
};
function arrowLines(dir, b) {
  const m = Math.min(24, (b[2] - b[0]) / 2, (b[3] - b[1]) / 2), [x0, y0, x1, y1] = inset(b, m);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const [from, to] = { right: [[x0, cy], [x1, cy]], left: [[x1, cy], [x0, cy]], up: [[cx, y1], [cx, y0]], down: [[cx, y0], [cx, y1]],
    "up-right": [[x0, y1], [x1, y0]], "down-right": [[x0, y0], [x1, y1]] }[dir];
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1, u = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
  const hs = Math.min(32, len * 0.3), wing = (s) => [to[0] - hs * u[0] - s * 0.6 * hs * u[1], to[1] - hs * u[1] + s * 0.6 * hs * u[0]];
  return [[from, to], [wing(1), to, wing(-1)]];
}
function rng(seed) { // mulberry32, as GOAT.rng in goat-lib.js
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A decorative street map, seeded by the visual's index: its edge, 3 streets each way and an avenue. No names.
function streets(b, seed) {
  const r = rng(seed), j = () => (r() - 0.5) * 16, lines = [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]];
  for (const k of [1, 2, 3]) { const y = k * 25 + j(); lines.push([[0, y], [50, y + j()], [100, y + j()]]); }
  for (const k of [1, 2, 3]) { const x = k * 25 + j(); lines.push([[x, 0], [x + j(), 50], [x + j(), 100]]); }
  lines.push([[0, 20 + r() * 60], [100, 20 + r() * 60]]);
  return lines.map((l) => in100(l, b));
}

// A box's height when it's laid out at width w: fixed px (texts at their size, a frame hugging what's in it, a screen
// at its rows) and flex (shapes sharing what's left by weight, from min to max px). A tick, dot, arrow or icon in a row
// with words takes the words' height (a list row); anything else in a row brings its own flex, min and max.
const NONE = { fixed: 0, flex: 0, min: 0, max: 0 };
const MARKS = ["tick", "dot", "arrow", "icon"];
// a grid is a column of rows, each cols wide (an empty slot keeps the columns lined up)
const gridRows = (n) => ({ type: "column", children: Array.from({ length: Math.ceil(n.children.length / n.cols) }, (_, r) =>
  ({ type: "row", children: Array.from({ length: n.cols }, (_, c) => n.children[r * n.cols + c] ?? null) })) });
const widths = (n, w) => {
  const ws = n.weights ?? n.children.map(() => 1), free = w - GAP * (n.children.length - 1), total = sum(ws);
  return ws.map((x) => (free * x) / total);
};
// Each flex thing's share of room: at least its min, at most its max, the rest by weight.
function share(ms, room) {
  const mins = sum(ms.map((m) => m.min));
  if (room <= mins) return ms.map((m) => (mins ? (m.min * Math.max(0, room)) / mins : 0));
  const out = ms.map((m) => m.min);
  let left = room - mins, open = ms.flatMap((m, i) => (m.flex > 0 && out[i] < m.max ? [i] : []));
  while (left > 1e-6 && open.length) {
    const total = sum(open.map((i) => ms[i].flex));
    let used = 0;
    for (const i of open) {
      const add = Math.min((left * ms[i].flex) / total, ms[i].max - out[i]);
      out[i] += add;
      used += add;
    }
    left -= used;
    open = open.filter((i) => out[i] < ms[i].max - 1e-6);
  }
  return out;
}

function layout(root, stage, skin, H) {
  const parts = [], st = skin.styles, R = skin.reveal;
  const shape = 2 * LEAD * st.label.max; // a shape weighs 2 rows of label text in a column
  const band = LEAD * st.label.min + 4, floor = 0.4 * H; // a chart's plot is 40% of the stage at least
  let scale = 1; // texts' share of their largest size, lowered when a chart would go under its floor
  const emit = (type, box, parent, more = {}) => {
    const b = box.map(r1), p = { id: parts.length, parent, type, box: b, ...more };
    if (p.lines) p.lines = p.lines.map((l) => l.map(([x, y]) => [clamp(x, b[0], b[2]), clamp(y, b[1], b[3])]));
    if (!p.reveal) p.reveal = R[REVEAL_OF[type]];
    parts.push(p);
    return p;
  };
  // a screen's rows: the field, the result (text below it, or an image over it) and the button, each a framed row
  const screenOf = (n) => {
    const button = n.children.find((c) => c.type === "button"), cursor = n.children.find((c) => c.type === "icon");
    const result = n.children.find((c, i) => i > 0 && c !== button && c !== cursor);
    const row = LEAD * st.label.max + 2 * PAD, text = result?.type === "image" ? null : result;
    const res = text ? (text.type === "text" ? text.text.split("\n").length : 1) * LEAD * st[text.style].max : 0;
    const count = 1 + !!button + !!text, bar = n.screen === "comment" ? 0 : BAR;
    return { button, cursor, result, row, res, bar, need: bar + 2 * PAD + row * (1 + !!button) + res + GAP * (count - 1), count };
  };
  // a text's size at width w: its style's largest (times scale), or what fits the width, never under its smallest
  const rowsIn = (n) => (n.type === "number" ? [n.number] : n.text.split("\n")).map((r) => r.replaceAll("*", ""));
  const textHeight = (n, w) => {
    const s = st[n.style], rows = rowsIn(n), per = Math.max(...rows.map((r) => textWidth(r, s, 1)));
    return rows.length * LEAD * Math.max(s.min, Math.min(Math.floor(s.max * scale), Math.floor(w / per)));
  };
  const most = (ms, key) => Math.max(0, ...ms.map((m) => m[key]));
  function measure(n, w) {
    if (!n) return NONE;
    const framed = n.deco?.frame ? 2 * PAD : 0, m = bare(n, w - framed);
    return { ...m, fixed: m.fixed + framed + (n.deco?.underline ? 16 : 0) };
  }
  function bare(n, w) {
    const flex = (weight, max, min = 0) => ({ fixed: 0, flex: weight, min: Math.min(min, max), max });
    switch (n.type) {
      case "text": case "number": return { ...NONE, fixed: textHeight(n, w) };
      case "button": return { ...NONE, fixed: textHeight(n, w - 2 * PAD) + 2 * PAD };
      case "column": {
        const ms = n.children.map((c) => measure(c, w));
        return { fixed: sum(ms.map((m) => m.fixed)) + GAP * (ms.length - 1), flex: sum(ms.map((m) => m.flex)),
          min: sum(ms.map((m) => m.min)), max: sum(ms.map((m) => (m.flex ? m.max : 0))) };
      }
      case "row": {
        const ws = widths(n, w), ms = n.children.map((c, i) => measure(c, ws[i]));
        const fixed = most(ms, "fixed"), from = fixed > 0 ? ms.filter((_, i) => !MARKS.includes(n.children[i]?.type)) : ms;
        return { fixed, flex: most(from, "flex"), min: most(from, "min"), max: most(from, "max") };
      }
      case "grid": return bare(gridRows(n), w);
      case "stack": { // a card turned 4° needs its width × sin 4° more height (see put)
        const k = n.children.length, off = 24 * (k - 1), ms = n.children.map((c) => measure(c, w - off)), a = k > 1 ? FAN : 0;
        return { fixed: most(ms, "fixed") * Math.cos(a) + (w - off) * Math.sin(a) + off, flex: most(ms, "flex"), min: most(ms, "min"),
          max: most(ms, "max") };
      }
      case "frame": return screenOf(n).result?.type === "image" ? flex(2 * shape, Infinity) : { ...NONE, fixed: screenOf(n).need };
      case "axis": return flex(2 * shape, Infinity, floor + 2 * band + 12);
      case "ring": return flex(2 * shape, n.ring.parts ? w * 0.56 : w, floor);
      case "map": return flex(shape, 0.6 * w);
      case "icon": case "tick": case "dot": return flex(shape, Math.min(w, 2 * shape));
      case "arrow": return flex(shape, ["left", "right"].includes(n.arrow) ? shape : w);
      case "path": return flex(shape, w);
      default: return flex(shape, Infinity); // an image, a bar
    }
  }

  function put(n, box, parent) {
    if (!n) return;
    const first = parts.length, outer = parent;
    if (n.deco?.frame) { // a chat bubble grows from its tail: the message's bottom left, the reply's bottom right
      const b = n.deco.bubble, tail = b && [b === "reply" ? box[2] : box[0], box[3]].map(r1);
      parent = emit("frame", box, parent, b ? { bubble: b, tail } : {}).id;
      box = inset(box, PAD);
    }
    if (n.deco?.underline) box = [box[0], box[1], box[2], Math.max(box[1], box[3] - 16)];
    const [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0;
    switch (n.type) {
      case "text": case "number": {
        const more = { style: n.style, rows: n.type === "text" ? n.text.split("\n") : [n.number], ...(n.key && { key: true }) };
        if (n.type === "number") {
          more.number = parseNumber(n.number);
          more.reveal = n.reveal ?? (skin.counts && more.number.num >= 10 && !more.number.year ? "count" : R.number);
        } else if (n.reveal) more.reveal = n.reveal;
        emit(n.type, box, parent, more);
        break;
      }
      case "button": {
        const f = emit("frame", box, parent, { button: true });
        emit("text", inset(box, PAD), f.id, { style: n.style, rows: n.text.split("\n") });
        break;
      }
      case "icon": { const b = square(box); emit("icon", b, parent, { icon: n.icon, lines: ICONS[n.icon].map((s) => in100(s, b)) }); break; }
      case "tick": {
        const b = square(box, 0.8);
        emit("tick", b, parent, { tick: n.tick, lines: (n.tick ? [[[18, 54], [40, 76], [84, 26]]] : [[[22, 22], [78, 78]], [[78, 22], [22, 78]]]).map((s) => in100(s, b)) });
        break;
      }
      case "arrow": emit("arrow", box, parent, { arrow: n.arrow, lines: arrowLines(n.arrow, box) }); break;
      case "path": emit("path", box, parent, { lines: [in100(n.path, box)] }); break;
      case "image": emit("image", box, parent, { src: n.image }); break;
      case "bar": emit("bar", [x0 + w * 0.2, y0, x1 - w * 0.2, y1], parent, { frac: 1 }); break;
      case "dot": {
        const r = Math.min(10, w / 2, h / 2), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        emit("path", [cx - r, cy - r, cx + r, cy + r], parent, { lines: [arc(cx, cy, r, 0, 360, 12)] });
        break;
      }
      case "map": {
        emit("path", box, parent, { map: true, lines: streets(box, n.seed) });
        const s = Math.min(w, h) * 0.36, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; // the pin's tip lands on the middle
        for (const c of n.children) put(c, [cx - s / 2, cy - s * 0.9, cx + s / 2, cy + s * 0.1], parent);
        break;
      }
      case "ring": ring(n, box, parent); break;
      case "column": { // each thing at its height, the flex ones sharing what's left; together in the middle (or at the top)
        const ms = n.children.map((c) => measure(c, w)), gaps = GAP * (n.children.length - 1);
        const extra = share(ms, h - gaps - sum(ms.map((m) => m.fixed)));
        let hs = ms.map((m, i) => m.fixed + extra[i]);
        const need = sum(hs);
        if (need > h - gaps) hs = hs.map((x) => (x * Math.max(0, h - gaps)) / need); // too much even at the smallest: fit refuses it
        const spine = n.spine && emit("path", box, parent), firsts = [];
        let y = y0 + (skin.align === "top" ? 0 : Math.max(0, (h - gaps - sum(hs)) / 2));
        n.children.forEach((c, i) => {
          y = r1(y);
          firsts.push(parts.length);
          put(c, [x0, y, x1, y + hs[i]], parent);
          y += hs[i] + GAP;
        });
        // the line through each row's dot, set once the rows are laid out (inside the column's box, so no clamp needed)
        if (spine) spine.lines = [firsts.map((i) => parts[i].box).map((b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2])];
        break;
      }
      case "row": {
        const ws = widths(n, w);
        let x = x0;
        n.children.forEach((c, i) => { put(c, [x, y0, x + ws[i], y1], parent); x += ws[i] + GAP; });
        break;
      }
      case "grid": put(gridRows(n), box, parent); break;
      case "stack": { // fanned ±4°, 24 px apart, each kept in its slot when turned: a card of words keeps its height and
        // narrows, a photo (or anything that stretches) shrinks whole
        const k = n.children.length, off = 24, sw = w - off * (k - 1), sh = h - off * (k - 1);
        let lead = null;
        n.children.forEach((c, i) => {
          const rot = k === 1 ? 0 : -4 + (8 * i) / (k - 1), a = (Math.abs(rot) * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
          const m = measure(c, sw), cx = x0 + i * off + sw / 2, cy = y0 + i * off + sh / 2;
          let bw, bh;
          if (m.flex) {
            const s = Math.min(sw / (sw * co + sh * si), sh / (sw * si + sh * co));
            [bw, bh] = [sw * s, sh * s];
          } else {
            bh = Math.min(sh, m.fixed);
            bw = Math.max(0, Math.min(sw, (sw - bh * si) / co, si ? (sh - bh * co) / si : Infinity));
          }
          const at = parts.length;
          put(c, [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], parent);
          const p = parts[at];
          if (!p) return;
          p.rot = r1(rot);
          // the things land together, a stagger apart in order (timeParts), unless one has its own say or at
          if (i && p.parent === parent && p.say === undefined && p.at === undefined) p.parent = lead;
          if (!i) lead = p.id;
        });
        break;
      }
      case "axis": axis(n, box, parent); break;
      case "frame": screen(n, box, parent); break;
    }
    if (n.deco?.underline) emit("path", [x0, y1, x1, y1 + 16], outer, { lines: [[[x0, y1 + 8], [x1, y1 + 8]]] });
    if (n.deco?.circle) emit("path", box, outer, { lines: [ellipse(box)] });
    // a timed thing: its first part takes the say or at, and the rest of it lands with that part
    if ((n.say !== undefined || n.at !== undefined) && parts.length > first) {
      const a = parts[first];
      Object.assign(a, timing(n));
      for (let i = first + 1; i < parts.length; i++) if (parts[i].parent === outer) parts[i].parent = a.id;
    }
  }

  function ring(n, box, parent) {
    const [x0, y0, x1, y1] = box;
    if (n.ring.parts) { // slices from the top, each named outside the ring beside its middle
      const total = sum(n.ring.parts), d = Math.min(y1 - y0, (x1 - x0) * 0.56), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const sq = [cx - d / 2, cy - d / 2, cx + d / 2, cy + d / 2], lh = 2 * LEAD * st.label.min + GAP + 4;
      let from = 0;
      const slices = n.ring.parts.map((v, i) => {
        const frac = v / total, mid = ((-90 + 360 * (from + frac / 2)) * Math.PI) / 180;
        const s = { from, frac, right: Math.cos(mid) >= 0, y: cy + Math.sin(mid) * (d / 2), node: n.children[i] };
        from += frac;
        return s;
      });
      for (const right of [true, false]) { // each side's labels top to bottom, never overlapping, inside the box
        const side = slices.filter((s) => s.right === right).sort((a, b) => a.y - b.y);
        let y = y0;
        side.forEach((s, i) => { s.top = clamp(Math.max(s.y - lh / 2, y), y0, y1 - (side.length - i) * lh); y = s.top + lh; });
      }
      for (const s of slices) {
        const { say, at, ...label } = s.node;
        const slice = emit("ring", sq, parent, { from: s.from, frac: s.frac, lines: [sweep(sq, s.from, s.from + s.frac)], ...timing({ say, at }) });
        put(label, s.right ? [sq[2] + GAP, s.top, x1, s.top + lh] : [x0, s.top, sq[0] - GAP, s.top + lh], slice.id);
      }
      return;
    }
    const sq = square(box), r = emit("ring", sq, parent, { frac: n.ring.value / n.ring.of, lines: [sweep(sq, 0, n.ring.value / n.ring.of)] });
    for (const c of n.children) put(c, square(sq, 0.62), r.id);
  }

  // A baseline with a value band above the plot and a label band below it. Bars start at 0 and share one scale; a
  // line or dots run from 0 to the largest value, x evenly spaced unless every label is a 4-digit year. Every point of
  // a line has a dot, drawn as the line reaches it.
  function axis(n, box, parent) {
    const [x0, y0, x1, y1] = box, k = n.children.length, line = n.plot === "line", lift = n.plot === "bars" ? 0 : 12;
    const plot = [x0, y0 + band + lift, x1, y1 - band], max = Math.max(...n.children.map((c) => c.value));
    emit("axis", box, parent, { lines: [[[plot[0], plot[3]], [plot[2], plot[3]]]] });
    const slot = (x1 - x0 - GAP * (k - 1)) / k, top = (v) => plot[3] - (v / max) * (plot[3] - plot[1]);
    const label = (c) => c.children[0].text;
    let xs = n.children.map((_, i) => x0 + slot / 2 + i * (slot + GAP));
    if (n.plot !== "bars" && n.children.every((c) => /^\d{4}$/.test(label(c)))) {
      const ys = n.children.map((c) => +label(c));
      if (ys.some((y, i) => i && y <= ys[i - 1])) throw new Error(`the years ${list(ys, "and")} aren't in order: list the points oldest first`);
      const a = xs[0], b = xs[k - 1];
      xs = ys.map((y) => a + ((y - ys[0]) / (ys[k - 1] - ys[0])) * (b - a));
    }
    const py = n.children.map((c) => top(c.value)), segs = line ? xs.slice(1).map((x, i) => [[xs[i], py[i]], [x, py[i + 1]]]) : [];
    const dots = xs.map((x, i) => [x - 10, py[i] - 10, x + 10, py[i] + 10]), taken = [];
    n.children.forEach((c, i) => {
      const x = xs[i], y = py[i], dot = arc(x, y, 10, 0, 360, 12);
      const half = Math.min(i ? (x - xs[i - 1] - GAP) / 2 : x - x0, i < k - 1 ? (xs[i + 1] - x - GAP) / 2 : x1 - x);
      const mark = n.plot === "bars"
        ? emit("bar", [x - slot * 0.3, y, x + slot * 0.3, plot[3]], parent, { frac: c.value / max })
        : line && i
          ? emit("path", box, parent, { tip: true, lines: [segs[i - 1], dot] }) // the line to the point, then its dot
          : emit("path", dots[i], parent, { lines: [dot] });
      Object.assign(mark, timing(c));
      put(c.children[0], [x - half, plot[3], x + half, y1], mark.id);
      put(c.children[1], line ? clear(c.children[1], i, half) : [x - half, y - band - lift, x + half, y - lift], mark.id);
    });

    // A line's value goes off its point on the side away from the line (above a point at or over its neighbours' mean,
    // else below), stepping aside or further off until it crosses no segment, no dot and no other value.
    function clear(node, i, half) {
      const x = xs[i], y = py[i], s = st.label, px = Math.max(s.min, Math.min(s.max, Math.floor(band / LEAD)));
      const tw = Math.min(2 * half, textWidth(node.number, s, px) + 8); // its text's width, or its slot when that's less
      const near = [py[i - 1], py[i + 1]].filter(isNum), up = y <= sum(near) / near.length + 1e-9;
      for (const dir of up ? [-1, 1] : [1, -1]) for (const off of [12, 24, 36]) for (const side of [0, -1, 1]) {
        const cx = x + side * (6 + tw / 2), b = dir < 0 ? [cx - tw / 2, y - off - band, cx + tw / 2, y - off]
          : [cx - tw / 2, y + off, cx + tw / 2, y + off + band];
        if (b[0] < x0 || b[2] > x1 || b[1] < y0 || b[3] > plot[3] - 2) continue;
        const near4 = [b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4];
        if (segs.some(([a, z]) => crosses(a, z, near4)) || [...dots, ...taken].some((d) => meets(d, b))) continue;
        taken.push(b);
        return b;
      }
      throw new Error(`the value "${node.number}" can't sit clear of the line: show it as bars, or with fewer points`);
    }
  }

  // The window: a title bar (three grey dots, drawn by the look; none on a comment box), the field, the result and
  // the button, sized to their rows and centred in the box; an image result takes the room from the field down.
  function screen(n, box, parent) {
    const { button, cursor, result, row: row0, res: res0, bar, need, count } = screenOf(n);
    const [x0, y0, x1, y1] = box, h = y1 - y0, fixed = bar + 2 * PAD + GAP * (count - 1);
    const q = need > h ? Math.max(0, (h - fixed) / (need - fixed)) : 1, row = row0 * q, res = res0 * q;
    const H = result?.type === "image" ? h : Math.min(h, need), top = y0 + (h - H) / 2;
    const f = emit("frame", [x0, top, x1, top + H], parent, { screen: n.screen, ...(bar && { chrome: [x0, top, x1, top + bar].map(r1) }) });
    const ix0 = x0 + PAD, ix1 = x1 - PAD, bottom = top + H - PAD;
    const field = [ix0, top + bar + PAD, ix1, top + bar + PAD + row];
    put(n.children[0], field, parent);
    let b = null;
    if (button) {
      const bw = (ix1 - ix0) * 0.6, cx = (ix0 + ix1) / 2;
      b = [cx - bw / 2, bottom - row, cx + bw / 2, bottom];
      put(button, b, parent);
      const cs = row * 0.6, tx = (b[0] + b[2]) / 2, ty = (b[1] + b[3]) / 2; // the cursor's tip (30, 12) on the button's middle
      put(cursor, [tx - 0.3 * cs, ty - 0.12 * cs, tx + 0.7 * cs, ty + 0.88 * cs], parent);
    }
    if (result) put(result, result.type === "image" ? [ix0, field[1], ix1, (b ? b[1] : bottom + PAD) - GAP]
      : [ix0, field[3] + GAP, ix1, field[3] + GAP + res], parent);
    return f;
  }

  // the whole visual at its height, in the middle of the stage; texts shrink (to their smallest) to give a chart its floor
  const top = col([root]), roomFor = () => { const m = measure(top, stage[2] - stage[0]); return m.fixed + m.min; };
  while (scale > 0.05 && roomFor() > stage[3] - stage[1] + 1e-6) scale -= 0.05;
  put(top, stage, null);
  return parts;
}

// The words a visual shows: a number counts as one.
const wordsOf = (parts) => sum(parts.map((p) => (p.type === "number" ? 1
  : p.rows ? p.rows.join(" ").replaceAll("*", "").split(/\s+/).filter(Boolean).length : 0)));

// A text fits its box at its style's smallest size: every row's measured width, and its rows' height. The advice
// says how many characters fit, from this text's own average advance.
function fit(p, st) {
  const shown = p.rows.join(" / "), plain = p.rows.map((r) => r.replaceAll("*", ""));
  const bad = missing(plain.join(" "), st.file);
  if (bad.length) throw new Error(`"${shown}" uses ${bad.join(" ")}, which ${basename(st.file).replace(/[[.-].*$/, "")} can't draw`);
  const w = p.box[2] - p.box[0], h = p.box[3] - p.box[1];
  for (const r of plain) {
    const wide = textWidth(r, st, st.min);
    if (wide > w + 0.5)
      throw new Error(`"${r}" is ${Math.ceil(wide)} px wide at ${st.min} px but its slot is ${Math.floor(w)} px: about ` +
        `${Math.floor(w / (wide / [...r].length))} characters fit; shorten it, or put fewer things side by side`);
  }
  if (p.rows.length * LEAD * st.min > h + 0.5)
    throw new Error(`"${shown}" takes ${p.rows.length} rows at ${st.min} px but its slot is ${Math.floor(h)} px tall: ` +
      `${Math.floor(h / (LEAD * st.min))} rows fit; use fewer rows, or give it more room`);
  const per = Math.max(...plain.map((r) => textWidth(r, st, 1))); // px wide per px of size, the widest row
  // 1e-6: a box laid out to the text's size comes back to that size, not one under it
  p.px = [Math.max(st.min, Math.min(st.max, Math.floor(h / (p.rows.length * LEAD) + 1e-6), Math.floor(w / per))), st.min];
}

// Point lists in px through the skin's texture (marker wobble, …), once per variant, as SVG path data.
function strokes(lines, skin, seed) {
  const tex = skin.texture ?? ((pts) => pts);
  return Array.from({ length: skin.variants ?? 1 }, (_, k) =>
    lines.map((pts) => "M" + tex(pts, seed, k).map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L")).join(" "));
}

// A visual laid out for a look: the guard rails that need no video (size, honest numbers, measured fit), then the
// parts in reading order, each with its box, style, reveal and strokes. where is the visual's index in plan.visuals.
export function compose(visual, skin, stage, where = 0) {
  const about = isNum(visual?.start) ? `the visual at ${visual.start.toFixed(2)} s` : `visual ${where + 1}`;
  const why = Object.hasOwn(skin.refuse ?? {}, visual?.recipe ?? "") && skin.refuse[visual.recipe];
  if (why) throw new Error(`this look doesn't draw a ${visual.recipe}: ${why}`);
  const root = expand(visual, where), digits = digitsIn(visual);
  if ((visual.source !== undefined && !SOURCES.includes(visual.source)) || (digits.length && visual.source === undefined))
    throw new Error(`${about} shows ${digits[0] ?? "numbers"}${visual.source === undefined ? "" : ` with "source": ${JSON.stringify(visual.source)}`}: ` +
      'a visual with numbers needs "source": "said", "member" or "test"');
  if (!inBox(stage, SAFE)) throw new Error(`the stage ${Array.isArray(stage) ? fmt(stage) : stage} runs outside ${SAFE_TEXT}`);
  // test numbers carry a TEST DATA tag in the label style along the stage's top, with 12 px clear under it
  const tag = visual.source === "test" ? [stage[0], stage[1], stage[2], r1(stage[1] + LEAD * skin.styles.label.min)] : null;
  const parts = layout(root, tag ? [stage[0], tag[3] + 12, stage[2], stage[3]] : stage, skin, stage[3] - stage[1]);
  if (parts.length > LIMITS.parts) throw new Error(`${about} has ${parts.length} parts: ${LIMITS.parts} parts at most; split it into two visuals`);
  const words = wordsOf(parts), most = Math.min(LIMITS.words, skin.maxWords ?? Infinity);
  if (words > most) throw new Error(`${about} shows ${words} words: ${most} words at most; keep the words that are said`);
  for (const p of parts) {
    if (p.rows) fit(p, skin.styles[p.style]);
    if (p.lines) { p.d = strokes(p.lines, skin, where * 1000 + p.id); delete p.lines; }
  }
  return { parts, words, source: visual.source ?? null, stage: stage.map(r1), ...(tag && { tag }) };
}

// Each image part's photo read upright (photoPng) into <hfDir>/media/v<i>-<j>.png, for visual i's part j, with its src
// pointing there. One photo at a time (an 8 GB laptop); returns copies, the placed visuals are left as they are.
export async function stageImages(placed, { planDir, hfDir }) {
  const out = [];
  for (const [i, v] of placed.entries()) {
    const parts = [];
    for (const p of v.composed.parts) {
      if (p.type !== "image") { parts.push(p); continue; }
      const name = `v${i}-${p.id}.png`;
      await photoPng(resolve(planDir, p.src), join(hfDir, "media", name));
      parts.push({ ...p, src: `media/${name}` });
    }
    out.push({ ...v, composed: { ...v.composed, parts } });
  }
  return out;
}
