// Which characters a font file can draw ('cmap', formats 4 and 12) and how wide they are ('hmtx'), Node built-ins only.
import { readFileSync } from "node:fs";

// The font's tables by tag, read from the first font of a collection.
function tables(b) {
  const base = b.toString("latin1", 0, 4) === "ttcf" ? b.readUInt32BE(12) : 0;
  const t = {};
  for (let i = 0, n = b.readUInt16BE(base + 4); i < n; i++) {
    const r = base + 12 + i * 16;
    t[b.toString("latin1", r, r + 4)] = b.readUInt32BE(r + 8);
  }
  return t;
}

// codepoint -> glyph id
export function glyphs(fontPath) {
  const b = readFileSync(fontPath);
  const cmap = tables(b).cmap ?? -1;
  if (cmap < 0) throw new Error(`${fontPath} has no cmap table`);
  // best Unicode subtable: 3/10, then 3/1, then platform 0
  const rank = (p, e) => (p === 3 && e === 10 ? 3 : p === 3 && e === 1 ? 2 : p === 0 ? 1 : 0);
  let best = null, bestRank = 0;
  for (let i = 0, c = b.readUInt16BE(cmap + 2); i < c; i++) {
    const r = cmap + 4 + i * 8, k = rank(b.readUInt16BE(r), b.readUInt16BE(r + 2));
    if (k > bestRank) { bestRank = k; best = cmap + b.readUInt32BE(r + 4); }
  }
  if (best === null) throw new Error(`${fontPath} has no Unicode cmap`);
  const set = new Map(), fmt = b.readUInt16BE(best);
  if (fmt === 4) {
    const segs = b.readUInt16BE(best + 6) / 2, end = best + 14, start = end + segs * 2 + 2;
    const delta = start + segs * 2, range = delta + segs * 2;
    for (let s = 0; s < segs; s++) {
      const e = b.readUInt16BE(end + s * 2), st = b.readUInt16BE(start + s * 2);
      const d = b.readUInt16BE(delta + s * 2), ro = b.readUInt16BE(range + s * 2);
      for (let c = st; c <= e && c < 0xffff; c++) {
        let g = c;
        if (ro) {
          g = b.readUInt16BE(range + s * 2 + ro + (c - st) * 2);
          if (g) g = (g + d) & 0xffff;
        } else g = (c + d) & 0xffff;
        if (g) set.set(c, g);
      }
    }
  } else if (fmt === 12) {
    for (let i = 0, g = b.readUInt32BE(best + 12); i < g; i++) {
      const r = best + 16 + i * 12, st = b.readUInt32BE(r), e = b.readUInt32BE(r + 4), gid = b.readUInt32BE(r + 8);
      for (let c = st; c <= e; c++) if (gid + (c - st)) set.set(c, gid + (c - st));
    }
  } else throw new Error(`${fontPath}: cmap format ${fmt} is not supported`);
  return set;
}

export function missing(text, fontPath) {
  const g = glyphs(fontPath);
  return [...new Set([...text].filter((ch) => !/\s/.test(ch) && !g.has(ch.codePointAt(0))))];
}

const widths = new Map();
// codepoint -> advance in em at the font's default instance (a variable font's default axes)
export function advances(fontPath) {
  if (widths.has(fontPath)) return widths.get(fontPath);
  const b = readFileSync(fontPath), t = tables(b);
  if (t.head === undefined || t.hhea === undefined || t.hmtx === undefined) throw new Error(`${fontPath} has no hmtx table`);
  const upm = b.readUInt16BE(t.head + 18), n = b.readUInt16BE(t.hhea + 34);
  const adv = (gid) => b.readUInt16BE(t.hmtx + Math.min(gid, n - 1) * 4) / upm; // past n, the last advance repeats
  const map = new Map();
  for (const [c, gid] of glyphs(fontPath)) map.set(c, adv(gid));
  widths.set(fontPath, map);
  return map;
}

// px width of one row of text in a style {file, factor}: advances times the style's weight factor. A letter the font
// lacks counts as 1 em, so it is never measured narrower than it draws (missing() refuses it anyway).
export function textWidth(text, style, px) {
  const adv = advances(style.file);
  let em = 0;
  for (const ch of text) em += adv.get(ch.codePointAt(0)) ?? 1;
  return em * style.factor * px;
}
