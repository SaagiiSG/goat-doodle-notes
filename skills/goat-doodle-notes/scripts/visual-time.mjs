// Motion graphics in time, Node side: each part drawn while it's said. matchSpeech finds every "say" in words.json,
// timeParts gives each part of a composed visual its time, placeVisuals puts the visuals on the edited video's
// timeline (on the 30 fps grid, one at a time), and visualFlashes and visualSfx hand the look its flashes and sounds
// to merge with its own. Node built-ins only.
import { compose, numbersIn, parseNumber } from "./visuals.mjs";
import { SOUNDS } from "./sound.mjs";

// The core defaults, in seconds (cps: letters typed or written a second); a skin's "pace" may override any of them.
export const PACE = { enter: 0.5, exit: 0.3, lead: 0.1, gap: 0.3, stagger: 0.06, draw: 0.45, pop: 0.3, count: 0.8, cps: 16,
  read: 1, between: 1, sayMin: 0.25, sayMax: 1.2, before: 2, saidWindow: 5, emptyMax: 2, hold: 0.6, drift: 0.03 };
const GLIDE = 0.6, PRESS = 0.12; // a screen's cursor glides to its button, then presses it (the design floor)
const LOOPS = ["type", "marker", "projector"]; // sounds that play for their "dur"
const SFX = ["enter", "exit", "land", "draw", "tick", "type"];
const TYPED = ["write", "words", "type"];
const EPS = 1e-6;

const isNum = (n) => typeof n === "number" && Number.isFinite(n);
const frame = (t) => Math.round(t * 30) / 30;
const frameUp = (t) => Math.ceil(t * 30 - EPS) / 30;
const s2 = (t) => t.toFixed(2);
const r3 = (n) => Math.round(n * 1000) / 1000;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const paceOf = (skin) => ({ ...PACE, ...skin?.pace });
// lower case, punctuation stripped, as words: "Speaking, on demand!" -> ["speaking", "on", "demand"]
const tokens = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);

// Every object in a visual with a "say", in reading order: its own first, then its things in the order written.
function saying(v, out = []) {
  if (Array.isArray(v)) for (const x of v) saying(x, out);
  else if (v && typeof v === "object") {
    if (v.say !== undefined) out.push(v);
    for (const x of Object.values(v)) saying(x, out);
  }
  return out;
}

// Each "say" in each visual, found as consecutive words of words.json from 2 s before the visual's start to its end,
// the first match after the part before it: it gains "at" (0.1 s before its first word) and "len" (its words' length,
// 0.25 to 1.2 s). A "said" visual's numbers are checked against the speech. Returns copies; the plan is left as it is.
export function matchSpeech(visuals, words) {
  const toks = words.flatMap((w) => tokens(w.text).map((x) => ({ x, w })));
  return visuals.map((visual) => {
    const v = structuredClone(visual), lo = Math.max(0, v.start - PACE.before), hi = v.end;
    const win = toks.filter((k) => k.w.start >= lo - EPS && k.w.start <= hi + EPS);
    let i = 0;
    for (const o of saying(v)) {
      const want = typeof o.say === "string" ? tokens(o.say) : [], n = want.length;
      if (!n) throw new Error(`a "say" is the words as they're said, like "trial reel", not ${JSON.stringify(o.say)}`);
      let j = i;
      while (j + n <= win.length && !want.every((x, k) => win[j + k].x === x)) j++;
      if (j + n > win.length) {
        const from = i ? win[i - 1].w.end : lo, there = [...new Set(win.slice(i).map((k) => k.w))].map((w) => w.text).join(" ");
        throw new Error(`"${o.say.trim()}" isn't said between ${s2(from)} and ${s2(hi)} s (words there: ${there || "none"}): ` +
          "copy the words from words.json, in the order the parts are said");
      }
      const first = win[j].w, last = win[j + n - 1].w;
      o.at = Math.max(0, frame(first.start - PACE.lead));
      o.len = r3(clamp(last.end - first.start, PACE.sayMin, PACE.sayMax));
      i = j + n;
    }
    if (v.source === "said") said(v, words);
    return v;
  });
}

// Every number a "said" visual shows has the value of a number in the speech from 5 s before it to its end: in one
// word ("4.8", "25,000"), or split across neighbouring words of digits only ("25" "000"). Thousands separators go and
// decimals stay, so "15" is not "1.5", and counting "1" "2" "3" is not 123.
function said(v, words) {
  const lo = Math.max(0, v.start - PACE.saidWindow), hi = v.end, heard = new Set();
  const value = (s) => parseNumber(s)?.num, hear = (s) => value(s) !== undefined && heard.add(value(s));
  let run = [];
  for (const w of [...words.filter((w) => w.start >= lo - EPS && w.start <= hi + EPS), null]) {
    const text = w ? String(w.text) : "";
    numbersIn(text).forEach(hear);
    if (/^[^\p{L}\d]*\d+[^\p{L}\d]*$/u.test(text)) { run.push(text.replace(/\D/g, "")); continue; }
    run.forEach((_, a) => { for (let b = a + 2; b <= run.length; b++) hear(run.slice(a, b).join(" ")); });
    run = [];
  }
  for (const m of numbersIn(v))
    if (!heard.has(value(m) ?? NaN)) throw new Error(`${m} isn't in what's said between ${s2(lo)} and ${s2(hi)} s: write it as digits ` +
      'in transcript.json, the way the visual shows it, or use "source": "member" if the member gave it');
}

// When a visual is in (its enter done; at once from 0) and when it starts to leave (at the end, if it stays).
function edges(start, end, stays, P) {
  start = frame(start); end = frame(end);
  const at0 = start < EPS;
  return { start, end, stays: !!stays, at0, in: at0 ? 0 : frame(start + P.enter), out: stays ? end : frame(end - P.exit) };
}

// A visual needs its last part drawn and 1 s to read before it starts to leave.
function readable(e, built, P) {
  if (built + P.read <= e.out + EPS) return;
  throw new Error(`the visual at ${s2(e.start)} s is drawn by ${s2(built)} s and needs ${P.read} s to read before ` +
    (e.stays ? `the video ends (${s2(e.out)} s): use fewer parts, or tie them to earlier words`
      : `it leaves at ${s2(e.out)} s: end it later, at ${s2(frameUp(built + P.read + P.exit))} s or after`));
}

// How long a part draws when no speech sets it: typed or written text at cps letters a second, a count, a pop, or a
// stroke, bar or fade.
function drawFor(p, P) {
  if (p.reveal === "count") return P.count;
  if (p.reveal === "pop" || p.reveal === "slam") return P.pop;
  if (TYPED.includes(p.reveal) && p.rows) return r3(Math.max(P.pop, p.rows.join("").replaceAll("*", "").length / P.cps));
  return P.draw;
}

// Each part's time t and how long it draws, dur. A said part starts 0.1 s before its words and draws for them, one
// with "at" starts then, and the rest follow the part before them gap s apart from when the visual is in, though
// nothing new lands while a field types or the cursor presses. A part's children (a bar's label and value, a card's
// insides) land with it, stagger s apart in reading order. A visual at 0 is drawn complete on frame 0. Every t and dur
// is a whole number of frames: times snap to the grid (a 0.06 s stagger lands 2 frames on), and a dur rounds up, so
// nothing draws shorter than its pace. visual is the matched plan visual, with "stays" when placeVisuals ran it to
// the video's end.
export function timeParts(composed, visual, skin) {
  const P = paceOf(skin), e = edges(visual.start, visual.end, visual.stays, P);
  const lens = new Map(saying(visual).map((o) => [`${o.at}|${o.say}`, o.len]));
  const parts = composed.parts.map((p) => ({ ...p })), press = parts.some((p) => p.button);
  const dur = (p) => frameUp(press && p.icon === "cursor" ? GLIDE + PRESS : drawFor(p, P));
  if (e.at0) for (const p of parts) Object.assign(p, { t: 0, dur: 0 });
  else {
    const group = [], last = [];
    let next = e.in, hold = e.in;
    for (const p of parts) {
      const own = p.at !== undefined;
      if (own && !(isNum(p.at) && p.at >= 0)) throw new Error(`"at" is seconds in the edited video, like 4.5, not ${JSON.stringify(p.at)}`);
      if (own || p.parent === null) {
        p.t = frame(own ? p.at : Math.max(next, hold));
        const len = p.say !== undefined && lens.get(`${p.at}|${p.say}`);
        p.dur = len ? frameUp(len) : dur(p);
        group[p.id] = p.id;
        next = p.t + P.gap;
      } else {
        const a = (group[p.id] = group[p.parent]);
        p.t = frame(Math.max(last[a] + P.stagger, hold));
        p.dur = dur(p);
      }
      last[group[p.id]] = p.t;
      if (p.reveal === "type" || (press && p.icon === "cursor")) hold = Math.max(hold, p.t + p.dur);
    }
    // the cursor glides, then presses; a typed field's caret goes as the cursor presses (focus leaves the field), as the
    // next thing lands, or as its typing ends when nothing follows
    for (const p of parts) {
      if (press && p.icon === "cursor") p.press = [frame(p.t + GLIDE), PRESS];
      if (p.reveal !== "type") continue;
      const done = p.t + p.dur, cursor = press && parts.find((q) => q.icon === "cursor" && q.id > p.id);
      const next = parts.find((q) => q.id > p.id && q.t >= done - EPS);
      p.caret = cursor ? frame(cursor.t + GLIDE) : next ? next.t : frame(done);
    }
    const early = parts.find((p) => p.t < e.in - EPS);
    if (early)
      throw new Error(`${early.say !== undefined ? `"${early.say}" (said)` : "a part"} lands at ${s2(early.t)} s, before the visual at ` +
        `${s2(e.start)} s is in (${s2(e.in)} s, after its ${P.enter} s enter): start the visual earlier, at ` +
        `${s2(Math.max(0, frame(early.t - P.enter)))} s or before`);
  }
  const built = frame(Math.max(...parts.map((p) => p.t + p.dur)));
  readable(e, built, P);
  return { ...composed, parts, built };
}

// The plan's visuals on the edited video's timeline, in time order: starts and ends on the 30 fps grid, one at a
// time, 1 s of the look between two (or, when the skin allows it, the next replacing the last exactly as it ends: the
// last stays up through the next one's enter and fades as its first part lands, a crossfade with nothing bare between).
// One running past the video's end stays to the end. In a voice-only video the first starts at 0, the screen is never
// empty for more than 2 s, and back-to-back is fine; each visual drifts (the browser grows it to 1 + drift about the
// stage's centre, from in to out), so its stage is kept drift/2 clear on each side. With words null (validate, before the video is cut) the says
// aren't matched and parts get no times. dur is Infinity before prep. plan goes to the skin's stage.
export function placeVisuals(visuals, dur, skin, { plan = {}, words = null, voice = false } = {}) {
  if (!Array.isArray(visuals)) throw new Error('"visuals" is a list, like [{"start": 1, "end": 6, "recipe": "big", "text": "…"}]');
  const P = paceOf(skin), D = dur === Infinity ? dur : frame(dur);
  const list = visuals.map((v, where) => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new Error(`visual ${where + 1} is not an object like {"start": 1, "end": 6, "recipe": "big", "text": "…"}`);
    if (!(isNum(v.start) && v.start >= 0)) throw new Error(`visual ${where + 1}: "start" must be seconds, 0 or more`);
    if (!(isNum(v.end) && v.end > v.start)) throw new Error(`the visual at ${s2(v.start)} s needs an "end" after its start, in seconds`);
    const start = frame(v.start), stays = v.end >= D - EPS;
    if (start >= D - EPS) throw new Error(`the visual at ${s2(v.start)} s starts after the video ends (${s2(dur)} s): move it earlier or remove it`);
    return { v, where, start, end: stays ? D : frame(v.end), stays };
  }).sort((a, b) => a.start - b.start);

  const empty = (a, b) => new Error(`the screen is empty from ${s2(a)} to ${s2(b)} s: add a visual or keep the one before longer`);
  if (voice && !list.length) throw new Error("a voice-only video needs visuals, the first at 0: the screen is never empty");
  list.forEach((x, i) => {
    const prev = list[i - 1], gap = prev ? x.start - prev.end : 0;
    if (prev && gap < -EPS)
      throw new Error(`the visual at ${s2(x.start)} s starts before the one at ${s2(prev.start)} s ends (${s2(prev.end)} s): one visual at a time`);
    x.replaces = !!prev && Math.abs(gap) < EPS;
    if (voice) {
      if (!prev && x.start > EPS) throw new Error(`in a voice-only video the first visual starts at 0, not ${s2(x.start)} s: the screen is never empty`);
      if (prev && gap > P.emptyMax + EPS) throw empty(prev.end, x.start);
    } else if (prev && (x.replaces ? !skin.replace : gap < P.between - EPS))
      throw new Error(`the look shows for only ${s2(gap)} s (${s2(prev.end)}–${s2(x.start)} s) between two visuals: leave ` +
        `${P.between} s or more${skin.replace ? `, or start the next one exactly at ${s2(prev.end)} s` : ""}`);
  });
  if (voice && D !== Infinity && D - list.at(-1).end > P.emptyMax + EPS) throw empty(list.at(-1).end, D);

  const matched = words == null ? list.map((x) => x.v) : matchSpeech(list.map((x) => x.v), words);
  return list.map((x, i) => {
    const v = matched[i], e = edges(x.start, x.end, x.stays, P);
    const drift = voice ? P.drift : 0, st = skin.stage(v, plan), dx = ((st[2] - st[0]) * drift) / 2, dy = ((st[3] - st[1]) * drift) / 2;
    let composed = compose(v, skin, [st[0] + dx, st[1] + dy, st[2] - dx, st[3] - dy], x.where);
    if (words == null) readable(e, e.in, P);
    else composed = timeParts(composed, { ...v, start: x.start, end: x.end, stays: x.stays }, skin);
    // a crossfade: one that's replaced stays up through the next one's enter, then leaves as its first part lands
    const next = list[i + 1]?.replaces && edges(list[i + 1].start, list[i + 1].end, list[i + 1].stays, P);
    const out = next ? next.in : e.out, end = next ? frame(next.in + P.exit) : x.end;
    return { start: x.start, end, in: e.in, out, at0: e.at0, stays: x.stays, replaces: x.replaces, test: v.source === "test", drift, composed };
  });
}

// When the skin's bright enters and exits start, for the look to merge with its own flashes (no enter for a visual up
// from frame 0, no exit for one that stays to the end). When a visual replaces the one before it, that exit and its
// enter are one flash at the boundary.
export function visualFlashes(placed, skin) {
  const f = skin.flashes;
  if (typeof f?.enter !== "boolean" || typeof f?.exit !== "boolean")
    throw new Error('a skin\'s "flashes" is {"enter": true or false, "exit": true or false}: whether its enter and exit are bright pulses');
  return placed.flatMap((p, i) => [!p.at0 && (p.replaces ? f.enter || f.exit : f.enter) && p.start,
    f.exit && !p.stays && !placed[i + 1]?.replaces && p.out].filter(isNum)).sort((a, b) => a - b);
}

// The first two flashes that start within gap s of each other (so at most 3 a second), or null.
export function flashClash(times, gap = 1 / 3) {
  const t = [...times].sort((a, b) => a - b);
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] < gap - EPS) return [t[i - 1], t[i]];
  return null;
}

// The skin's sounds ({enter, exit, land, draw, tick, type}: [sound, volume], each optional) for each visual: enter as
// it starts, land (or draw, for a stroke drawing) for each part that lands on its own, tick for each tick, type while
// a field types, exit as it starts to leave (not when the next one replaces it). A visual up from frame 0 is silent
// until it leaves. Loop sounds play for the part's dur. Not spaced: the look merges these with its own and runs spaceSfx.
export function visualSfx(placed, skin) {
  const s = skin.sounds ?? {};
  for (const [k, x] of Object.entries(s))
    if (!SFX.includes(k) || !Array.isArray(x) || !SOUNDS.includes(x[0]) || !(isNum(x[1]) && x[1] >= 0.09 && x[1] <= 0.3))
      throw new Error(`the skin's "${k}" sound is ${JSON.stringify(x)}: each of ${SFX.join(", ")} is [sound, volume], one of the ` +
        `${SOUNDS.length} sounds at 0.09 to 0.3`);
  const ev = [];
  const add = (k, at, d) => s[k] && ev.push({ sound: s[k][0], at: r3(at), volume: s[k][1], ...(d && LOOPS.includes(s[k][0]) && { dur: r3(d) }) });
  for (const [i, v] of placed.entries()) {
    if (!v.at0) {
      add("enter", v.start);
      for (const p of v.composed.parts) {
        if (p.t === undefined) continue;
        if (p.type === "tick") add("tick", p.t);
        else if (p.reveal === "type") add("type", p.t, p.dur);
        else if (p.at !== undefined || p.parent === null) add(p.d && p.reveal === "draw" ? "draw" : "land", p.t, p.dur);
      }
    }
    if (!v.stays && !placed[i + 1]?.replaces) add("exit", v.out); // a replace has one sound: the next one's enter
  }
  return ev.sort((a, b) => a.at - b.at);
}

// The look's sounds and the visuals' merged in time order: none within gap s of the last one kept, nor while a typing,
// marker or projector loop plays.
export function spaceSfx(events, gap = 0.5) {
  const out = [];
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const p = out.at(-1);
    if (!p || e.at >= p.at + Math.max(gap, LOOPS.includes(p.sound) ? p.dur ?? 0 : 0) - EPS) out.push(e);
  }
  return out;
}
