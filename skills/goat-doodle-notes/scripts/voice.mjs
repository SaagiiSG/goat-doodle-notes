// Voice-only videos: a voice-over is the speech when no clip speaks. The member's script gives the exact words and
// Whisper only their times, since Whisper's Mongolian words are poor. Node built-ins only.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const MAX_LETTERS = 6000; // a 6000 x 6000 table is 144 MB, about 8 minutes of speech at 12–13 letters/s

// A clip carries no sound of its own: a photo, a clip without a sound track, or one with "sound": false.
// clips are probed (prep's checkClips: each with its info).
export const soundless = (c) => c.info.still || !c.info.audio || c.sound === false;

// A voice-over, and nothing else speaking (no clips, or only soundless ones).
export const voiceMode = (plan, clips) => !!plan.voiceover && clips.every(soundless);

// "script": a .txt next to the plan (its path from the plan's folder), or the words themselves. null when there's none.
export function readScript(plan, planDir) {
  const s = plan.script;
  if (s == null) return null;
  if (typeof s !== "string" || !s.trim()) throw new Error('"script" is the words of the voice-over, or a .txt file with them');
  if (!/\.txt$/i.test(s.trim()) || /\n/.test(s.trim())) return s;
  const path = resolve(planDir, s.trim());
  if (!existsSync(path)) throw new Error(`the script file ${s.trim()} is missing (looked for ${path})`);
  return readFileSync(path, "utf8");
}

// Each letter or digit of a list of words (lower case), with the word it's in.
const lettersOf = (texts) => texts.flatMap((t, w) => (t.toLowerCase().match(/[\p{L}\p{N}]/gu) ?? []).map((ch) => ({ ch, w })));

// The script's words with Whisper's times: the two letter strings lined up along a Levenshtein path. A script word
// runs from the first Whisper word its letters match to the end of the last one, and one with no letter matched is
// spread evenly between its timed neighbours; starts never go back. The share found is of the longer side, so a script
// for part of a longer voice is refused. A price written "25 000₮" stays one word, so no caption splits it.
export function alignScript(script, words) {
  const texts = [];
  for (const t of script.split(/\s+/).filter(Boolean)) {
    if (/\d$/.test(texts.at(-1) ?? "") && /^\d{3}(?!\d)/.test(t)) texts[texts.length - 1] += ` ${t}`;
    else texts.push(t);
  }
  const a = lettersOf(texts), b = lettersOf(words.map((w) => w.text)), n = a.length, m = b.length, W = m + 1;
  if (n > MAX_LETTERS)
    throw new Error(`the script has ${n} letters, more than ${MAX_LETTERS}: split the voice into parts under 4 minutes, each with its own script`);
  const D = new Uint32Array((n + 1) * W);
  for (let j = 0; j <= m; j++) D[j] = j;
  for (let i = 1; i <= n; i++) {
    D[i * W] = i;
    for (let j = 1; j <= m; j++)
      D[i * W + j] = Math.min(D[(i - 1) * W + j - 1] + (a[i - 1].ch === b[j - 1].ch ? 0 : 1), D[(i - 1) * W + j] + 1, D[i * W + j - 1] + 1);
  }
  // walk back, keeping the letters that line up and are the same. A step keeps the last one's direction while that's
  // as good, so words the voice skips or adds stay one gap, not letters matched stray across it.
  const first = [], last = [];
  let found = 0;
  for (let i = n, j = m, step = "both"; i > 0 && j > 0;) {
    const same = a[i - 1].ch === b[j - 1].ch, d = D[i * W + j];
    const ok = { both: d === D[(i - 1) * W + j - 1] + (same ? 0 : 1), script: d === D[(i - 1) * W + j] + 1, voice: d === D[i * W + j - 1] + 1 };
    step = ok[step] ? step : ok.both ? "both" : ok.script ? "script" : "voice";
    if (step === "both") {
      if (same) {
        const s = a[i - 1].w, h = b[j - 1].w;
        found++;
        first[s] = h;
        last[s] ??= h;
      }
      i--; j--;
    } else if (step === "script") i--;
    else j--;
  }
  const pct = n ? Math.floor((100 * found) / Math.max(n, m)) : 0;
  if (pct < 50) throw new Error(`the script doesn't match the voice (${pct}% of its letters found): is it the right file?`);

  const out = texts.map((text, s) => (first[s] === undefined ? { text } : { text, start: words[first[s]].start, end: words[last[s]].end }));
  for (let s = 0; s < out.length;) {
    if (out[s].start !== undefined) { s++; continue; }
    let e = s;
    while (e < out.length && out[e].start === undefined) e++;
    const t0 = s ? out[s - 1].end : Math.min(words[0].start, out[e]?.start ?? Infinity);
    const t1 = Math.max(t0, e < out.length ? out[e].start : words.at(-1).end), k = e - s;
    for (let i = s; i < e; i++) Object.assign(out[i], { start: t0 + ((t1 - t0) * (i - s)) / k, end: t0 + ((t1 - t0) * (i - s + 1)) / k });
    s = e;
  }
  out.forEach((w, i) => {
    if (i) w.start = Math.max(w.start, out[i - 1].start);
    w.end = Math.max(w.end, w.start);
  });
  return out;
}
