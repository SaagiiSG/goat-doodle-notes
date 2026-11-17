// Motion graphics in the browser (plain script, loaded after goat-lib.js; sets GOAT.visuals). Node has laid out every
// part in its box and timed it on the 30 fps grid (visuals.mjs, visual-time.mjs): this builds each part at its box and
// plays its reveal at its t for its dur, never working out a time of its own. No DOM at load, so Node can test format
// and the start states. The look styles the parts by class (.v-value, .v-frame, …) and hands mount its hooks.
(function () {
  const GOAT = (globalThis.GOAT = globalThis.GOAT || {});
  const EASE = { out: "goat.out", inOut: "goat.inOut" };
  if (globalThis.gsap && globalThis.CustomEase) {
    gsap.registerPlugin(CustomEase);
    CustomEase.create(EASE.out, "0.23,1,0.32,1"); // enters and landings
    CustomEase.create(EASE.inOut, "0.77,0,0.175,1"); // moves on screen
  }

  // Each reveal's start state, to the part as laid out. The design floor: from scale 0.9 or more, rising 24 px at most,
  // blurring in from 8 px at most. write and grow wipe on (clip), type and count change the text, draw strokes it on.
  const REVEAL = {
    write: { scale: 1, y: 0, blur: 0, opacity: 1, clip: "left" },
    words: { scale: 1, y: 12, blur: 0, opacity: 0 }, // each word, one after another
    type: { scale: 1, y: 0, blur: 0, opacity: 1 },
    draw: { scale: 1, y: 0, blur: 0, opacity: 1 },
    grow: { scale: 1, y: 0, blur: 0, opacity: 1, clip: "bottom" }, // a bar from its baseline
    count: { scale: 1, y: 0, blur: 0, opacity: 0 },
    pop: { scale: 0.9, y: 0, blur: 0, opacity: 0 },
    blur: { scale: 1, y: 0, blur: 8, opacity: 0 },
    slam: { scale: 1.1, y: 0, blur: 0, opacity: 0 },
    fade: { scale: 1, y: 0, blur: 0, opacity: 0 },
    stack: { scale: 0.94, y: 0, blur: 0, opacity: 0 }, // a card or photo landing on a stack, from its own centre
    result: { scale: 1, y: 16, blur: 0, opacity: 0 }, // a screen's result, rising from the button that made it
  };
  const FPS = 30, BLINK = 0.25, FADE = 0.2; // a caret blinks at 2 Hz
  const SVG = "http://www.w3.org/2000/svg";
  const CLASS = { text: "v-text", number: "v-text", path: "v-path", axis: "v-path v-axis", arrow: "v-arrow", ring: "v-ring",
    bar: "v-bar", tick: "v-tick", icon: "v-icon", image: "v-image", frame: "v-frame" };
  const TEXTY = ["write", "words", "type", "draw", "grow"]; // reveals that draw a stroke on, or wipe a bar or panel on
  const BASE = `.v-layer{position:absolute;inset:0;pointer-events:none}
.v{position:absolute;box-sizing:border-box;margin:0}
.v-text{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;line-height:1.2}
.v-text.v-left{align-items:flex-start;text-align:left}
.v-text>div{width:max-content}
.v-text .v-word{display:inline-block}
.v>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.v path{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round}
.v-image{object-fit:cover;display:block}
.v-chrome{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:12px;padding:0 24px}
.v-chrome i{width:14px;height:14px;border-radius:50%;background:currentColor}
.v-caret{display:inline-block;width:.07em;height:1.05em;margin-left:.04em;vertical-align:-.15em;background:currentColor;opacity:0}
.v-test{white-space:nowrap;text-align:right;line-height:1.2}`;

  // A number part's value at fraction k of its count, written the way the plan writes it ("25 000₮" at 0.5 is
  // "12 500₮"): rounded to its decimals, grouped by its separator, its own decimal mark. A year stays as it is.
  function format(n, k) {
    const dec = n.dec || 0, f = 10 ** dec, kk = Math.min(Math.max(k, 0), 1);
    const [int, frac] = (n.year ? n.num : Math.round(n.num * kk * f) / f).toFixed(dec).split(".");
    return (n.pre || "") + (n.sep ? int.replace(/\B(?=(\d{3})+(?!\d))/g, n.sep) : int) +
      (frac ? (n.decSep || ".") + frac : "") + (n.post || "");
  }

  const el = (tag, cls, parent, text) => {
    const e = parent.appendChild(parent.ownerDocument.createElement(tag));
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const svgEl = (tag, parent, attrs) => {
    const e = parent.appendChild(parent.ownerDocument.createElementNS(SVG, tag));
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const place = (e, b) => Object.assign(e.style, { left: `${b[0]}px`, top: `${b[1]}px`, width: `${b[2] - b[0]}px`, height: `${b[3] - b[1]}px` });
  const plain = (r) => r.replaceAll("*", "");
  const centre = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

  // One element per part at its box, each visual in its own layer in host (the 1080x1920 frame), each reveal added to
  // tl at the part's t for its dur. hooks: {ease, hz?, drift?: false, enter(layer, visual, tl), exit(layer, visual, tl),
  // flourish?: {[part type]: (el, part, tl, visual)}}. A visual that replaces the one before crossfades with 2 px of blur.
  function mount(host, placed, tl, hooks = {}) {
    const doc = host.ownerDocument;
    if (!doc.getElementById("goat-visuals")) { // first in <head>, so the look's own CSS wins
      const css = el("style", "", doc.head, BASE);
      css.id = "goat-visuals";
      doc.head.prepend(css);
    }
    const ease = hooks.ease || EASE.out, hz = hooks.hz || FPS, fits = [];
    // a stop-motion look (hooks.hz) holds each tween on its own grid
    const ez = (name, d) => {
      if (!hooks.hz) return name;
      const f = gsap.parseEase(name), n = d * hooks.hz;
      return (p) => (p >= 1 ? 1 : f(Math.floor(p * n + 1e-6) / n));
    };
    const from = (e, s, at, d, name = ease) => {
      const a = {}, b = { duration: d, ease: ez(name, d) };
      if (s.opacity !== 1) { a.opacity = s.opacity; b.opacity = 1; }
      if (s.scale !== 1) { a.scale = s.scale; b.scale = 1; }
      if (s.y) { a.y = s.y; b.y = 0; }
      if (s.blur) { a.filter = `blur(${s.blur}px)`; b.filter = "blur(0px)"; }
      if (Object.keys(a).length) tl.fromTo(e, a, b, at);
    };
    // a wipe from one side; the clip opens past the box (accents, descenders) and is gone once it's on
    const wipe = (e, side, at, d) => {
      const [a, b] = side === "left" ? ["inset(-30% 100% -30% -30%)", "inset(-30% 0% -30% -30%)"]
        : ["inset(100% -30% 0% -30%)", "inset(0% -30% 0% -30%)"];
      tl.fromTo(e, { clipPath: a }, { clipPath: b, duration: d, ease: ez(ease, d) }, at);
      tl.set(e, { clipPath: "none" }, at + d);
    };

    const layers = placed.map((v, i) => {
      const layer = el("div", "v-layer", host), parts = v.composed.parts, els = [];
      const kids = (f) => parts.filter((q) => q.parent === f.id);
      // a panel of words only (a bubble, a field, a news panel): its words sit at its left, as written
      const prose = (f) => f.type === "frame" && !f.button && kids(f).every((q) => q.rows || prose(q));
      for (const p of parts) els[p.id] = build(p, layer, parts, prose);
      if (v.composed.tag) tag(layer, v.composed.tag);
      rotate(parts, els);
      if (hooks.enter) hooks.enter(layer, v, tl);
      if (hooks.exit) hooks.exit(layer, v, tl);
      // a voice-only video's held visual drifts so it's never a frozen frame: linear, 1 to 1 + drift about the stage's
      // centre, from in to out (Node kept the stage drift/2 clear on each side). A skin with its own motion: hooks.drift false
      if (v.drift && hooks.drift !== false) {
        const [cx, cy] = centre(v.composed.stage);
        gsap.set(layer, { transformOrigin: `${cx}px ${cy}px` });
        tl.fromTo(layer, { scale: 1 }, { scale: 1 + v.drift, duration: v.out - v.in, ease: "none", immediateRender: false }, v.in);
      }
      if (v.replaces) tl.fromTo(layer, { filter: "blur(2px)" }, { filter: "blur(0px)", duration: v.in - v.start, ease: EASE.out, immediateRender: false }, v.start);
      if (placed[i + 1] && placed[i + 1].replaces)
        tl.fromTo(layer, { filter: "blur(0px)" }, { filter: "blur(2px)", duration: v.end - v.out, ease: EASE.out, immediateRender: false }, v.out);
      for (const p of parts) {
        if (p.dur > 0) reveal(p, els[p.id], v, parts, els); // a part with no dur is drawn complete (a visual at 0)
        const f = hooks.flourish && hooks.flourish[p.type];
        if (f) f(els[p.id], p, tl, v);
      }
      return layer;
    });
    const fit = () => fits.forEach((f) => f());
    fit();
    if (doc.fonts) doc.fonts.ready.then(fit);
    return layers;

    function build(p, layer, parts, prose) {
      const e = el(p.type === "image" ? "img" : "div", `v ${CLASS[p.type]}`, layer);
      place(e, p.box);
      if (p.style) e.classList.add(`v-${p.style}`);
      if (p.key) e.classList.add("v-key");
      if (p.map) e.classList.add("v-map");
      if (p.icon === "cursor") e.classList.add("v-cursor");
      if (p.button) e.classList.add("v-button");
      if (p.bubble) { // a chat bubble (.v-message, .v-reply) grows from its tail
        e.classList.add(`v-${p.bubble}`);
        e.style.transformOrigin = `${p.tail[0] - p.box[0]}px ${p.tail[1] - p.box[1]}px`;
      }
      if (p.screen) {
        e.classList.add("v-window");
        e.dataset.kind = p.screen;
        if (p.chrome) {
          const c = el("div", "v-chrome", e);
          c.style.height = `${p.chrome[3] - p.chrome[1]}px`;
          for (let k = 0; k < 3; k++) el("i", "", c);
        }
      }
      if (p.type === "frame" && !p.screen && !p.button && parts.some((s) => s.screen && inside(p.box, s.box))) e.classList.add("v-field");
      if (p.type === "image") e.src = p.src;
      if (p.d) strokes(p, e);
      if (p.rows) text(p, e, parts, prose);
      return e;
    }

    function text(p, e, parts, prose) {
      const w = p.box[2] - p.box[0], [max, min] = p.px;
      e.style.fontSize = `${max}px`;
      e.style.whiteSpace = "nowrap";
      if (left(p, parts, prose)) e.classList.add("v-left");
      if (p.reveal === "count") {
        const row = el("div", "", e, p.rows[0]);
        e.rows = [row];
        e.style.fontVariantNumeric = "tabular-nums";
        // sized at the string it ends on, whatever the count shows now
        fits.push(() => { const now = row.textContent; row.textContent = p.rows[0]; GOAT.fit(e, w, max, min); row.textContent = now; });
        return;
      }
      e.rows = p.rows.map((r) => {
        const row = el("div", "", e);
        if (p.reveal === "type") {
          row.typed = el("span", "v-typed", row, plain(r));
          row.caret = el("span", "v-caret", row);
        } else if (p.reveal === "words") plain(r).split(/\s+/).forEach((w, j) => {
          if (j) row.append(" ");
          el("span", "v-word", row, w);
        });
        else r.split(/\*([^*]+)\*/).forEach((s, j) => s && (j % 2 ? el("em", "", row, s) : row.append(s)));
        return row;
      });
      if (p.reveal !== "type") return fits.push(() => GOAT.fit(e, w, max, min));
      fits.push(() => {
        const now = e.rows.map((r) => r.typed.textContent);
        e.rows.forEach((r, k) => { r.typed.textContent = plain(p.rows[k]); });
        GOAT.fit(e, w, max, min);
        e.rows.forEach((r, k) => { r.typed.textContent = now[k]; });
      });
    }

    // Text sits in the middle of its box, or at its left: typed, in a panel of words, or after a narrower marker in its
    // row (a tick, a dot, a step's number), never after an arrow (a before and after stays balanced).
    function left(p, parts, prose) {
      if (p.reveal === "type") return true;
      const up = parts[p.parent];
      if (up && prose(up)) return true;
      const q = parts[p.id - 1];
      if (!q || q.type === "arrow" || q.type === "frame") return false;
      const a = q.box, b = p.box, over = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      return a[2] <= b[0] + 1 && over > 0.5 * Math.min(a[3] - a[1], b[3] - b[1]) && a[2] - a[0] < b[2] - b[0];
    }

    // Strokes as SVG over the part's box, one path per stroke so each draws from its own start. A ring or a map fills
    // its box to the edge, so it's drawn a little smaller, about its middle, to keep its stroke inside the box.
    function strokes(p, e) {
      const [x0, y0, x1, y1] = p.box, s = svgEl("svg", e, { viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}` });
      if (p.type === "ring" && p.from === undefined && p.frac < 1) { // a progress ring's track: the whole it fills toward
        const [cx, cy] = centre(p.box), r = (x1 - x0) / 2;
        e.track = svgEl("path", s, { class: "v-track", d: `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}` });
      }
      e.paths = p.d[0].split(/(?=M)/).map((d) => svgEl("path", s, { d: d.trim(), pathLength: 1 }));
      if (p.type === "ring" || p.map) {
        const sw = parseFloat(getComputedStyle(e.paths[0]).strokeWidth) || 0;
        s.setAttribute("viewBox", `${x0 - sw / 2} ${y0 - sw / 2} ${x1 - x0 + sw} ${y1 - y0 + sw}`);
      }
    }

    // the TEST DATA tag in the band compose kept clear for it, at the label style's smallest size
    function tag(layer, b) {
      const t = el("div", "v v-test v-label", layer, "TEST DATA");
      place(t, b);
      t.style.fontSize = `${(b[3] - b[1]) / 1.2}px`;
    }

    // A stack's cards turn about their own middles, and what's on a card turns with it (about the card's middle, as an
    // offset held in xPercent/yPercent, so its own reveal still scales about its own middle and rises straight up).
    function rotate(parts, els) {
      for (const p of parts) {
        let a = p;
        while (a && a.rot === undefined) a = parts[a.parent];
        if (!a || !a.rot) continue;
        const r = (a.rot * Math.PI) / 180, [cx, cy] = centre(p.box), [ax, ay] = centre(a.box), vx = cx - ax, vy = cy - ay;
        const dx = vx * Math.cos(r) - vy * Math.sin(r) - vx, dy = vx * Math.sin(r) + vy * Math.cos(r) - vy;
        gsap.set(els[p.id], { rotation: a.rot, xPercent: (100 * dx) / (p.box[2] - p.box[0]), yPercent: (100 * dy) / (p.box[3] - p.box[1]) });
      }
    }

    function reveal(p, e, v, parts, els) {
      const t = p.t, d = p.dur, r = p.reveal;
      const button = p.press && [...parts].reverse().find((q) => q.button && q.id < p.id);
      if (button) return press(p, e, v, button, parts, els);
      const scr = parts.filter((q) => q.screen && q.id < p.id).at(-1);
      if (scr && p.type !== "frame" && p.type !== "icon" && (p.parent === scr.parent || p.parent === scr.id) && inside(p.box, scr.box))
        return from(e, REVEAL.result, t, d, EASE.out); // the screen's result
      if (p.rot !== undefined) return from(e, REVEAL.stack, t, d);
      if (e.paths) {
        if (!TEXTY.includes(r)) return from(e, REVEAL[r], t, d);
        if (e.track) from(e.track, REVEAL.fade, t, Math.min(d, FADE));
        return e.paths.forEach((path, k) => {
          // an arrow's head, or a line's dot (tip), draws once the stroke to it is nearly there (goat.out is 97% of the
          // way at half time)
          const head = (p.type === "arrow" || p.tip) && k > 0, at = head ? t + d / 2 : t, len = head ? d / 2 : d;
          path.style.strokeDasharray = "1 2"; // 1.01 to 0: no round cap left showing at the start
          tl.fromTo(path, { attr: { "stroke-dashoffset": 1.01 } }, { attr: { "stroke-dashoffset": 0 }, duration: len, ease: ez(ease, len) }, at);
        });
      }
      if (r === "count") {
        const row = e.rows[0], n = Math.max(1, Math.round(d * hz)), f = gsap.parseEase(EASE.out);
        from(e, REVEAL.count, t, Math.min(d, FADE));
        for (let k = 0; k < n; k++) tl.set(row, { textContent: format(p.number, f(k / n)) }, t + k / hz);
        return tl.set(row, { textContent: p.rows[0] }, t + d); // the last frame is the string as written
      }
      if (p.rows) {
        if (r === "type") return type(p, e);
        if (r === "words") {
          const ws = e.querySelectorAll(".v-word"), one = Math.min(d, 0.4), gap = ws.length > 1 ? (d - one) / (ws.length - 1) : 0;
          return ws.forEach((w, k) => from(w, REVEAL.words, t + k * gap, one));
        }
        if (!TEXTY.includes(r)) return from(e, REVEAL[r], t, d);
        // written on row by row, each for its share of the letters
        const lens = p.rows.map((x) => plain(x).length), all = lens.reduce((a, b) => a + b, 0);
        let at = t;
        return e.rows.forEach((row, k) => { wipe(row, "left", at, (d * lens[k]) / all); at += (d * lens[k]) / all; });
      }
      // a bar, a panel or a photo
      if (r === "grow" || (p.type === "bar" && TEXTY.includes(r))) return wipe(e, "bottom", t, d);
      if (r === "write") return wipe(e, "left", t, d);
      from(e, REVEAL[TEXTY.includes(r) || r === "count" ? "fade" : r], t, d);
    }

    // Typed at the pace Node set (its dur is the letters at cps), one letter at a time, with a caret blinking at 2 Hz on
    // the row being typed: the last row's stays until Node's caret time (the press, the next thing landing, or the end).
    function type(p, e) {
      const n = p.rows.reduce((s, r) => s + plain(r).length, 0), step = p.dur / Math.max(1, n);
      let k = 0;
      e.rows.forEach((row, j) => {
        const s = plain(p.rows[j]), a = p.t + k * step;
        row.typed.textContent = "";
        for (let c = 1; c <= s.length; c++) tl.set(row.typed, { textContent: s.slice(0, c) }, p.t + (k + c - 1) * step);
        k += s.length;
        blink(row.caret, a, j < e.rows.length - 1 ? p.t + k * step : p.caret);
      });
    }
    // one tween whose ease is the blink: on, fading out and back every 0.5 s, linear; hidden at its two ends
    function blink(caret, a, b) {
      const len = b - a;
      if (len <= 0) return;
      tl.fromTo(caret, { opacity: 0 }, { opacity: 1, duration: len, immediateRender: false, ease: (q) => {
        if (q <= 0 || q >= 1) return 0;
        const ph = ((q * len) / BLINK) % 2;
        return 1 - (ph < 1 ? ph : 2 - ph);
      } }, a);
    }

    // The cursor glides in from below and to the right (inside the stage) to the button until Node's press = [at, for],
    // then the button presses to 0.97 and back, about its middle.
    function press(p, e, v, button, parts, els) {
      const st = v.composed.stage, dx = Math.max(0, Math.min(120, st[2] - p.box[2])), dy = Math.max(0, Math.min(96, st[3] - p.box[3]));
      const [at, len] = p.press;
      tl.fromTo(e, { x: dx, y: dy }, { x: 0, y: 0, duration: at - p.t, ease: EASE.inOut }, p.t);
      tl.fromTo(e, { opacity: 0 }, { opacity: 1, duration: FADE, ease: EASE.out }, p.t);
      const [bx, by] = centre(button.box);
      for (const q of [button, ...parts.filter((x) => x.parent === button.id)]) {
        const b = els[q.id];
        tl.set(b, { transformOrigin: `${bx - q.box[0]}px ${by - q.box[1]}px` }, at);
        tl.to(b, { scale: 0.97, duration: len / 2, ease: EASE.out }, at);
        tl.to(b, { scale: 1, duration: len / 2, ease: EASE.out }, at + len / 2);
      }
    }
  }

  const inside = (b, o) => b[0] >= o[0] && b[1] >= o[1] && b[2] <= o[2] && b[3] <= o[3];

  // The plain caption line, for a look without captions of its own (a voice-only video): each group (PLAN.captions)
  // on one line, centred in style.box, fitted from style.max down to style.min px, cut in at its start and out at its
  // end, with no highlight and no pop (Saagii's rule). The look styles .v-caption (font, ink that follows its canvas,
  // a shadow over footage) and adds the timeline this returns to its own: tl.add(GOAT.visuals.captions(…), 0).
  function captions(host, groups, style = {}) {
    const { box = [120, 1130, 960, 1248], max = 56, min = 36 } = style, line = gsap.timeline(), fits = [];
    for (const g of groups) {
      const e = el("div", "v v-caption", host, g.text);
      place(e, box);
      Object.assign(e.style, { position: "absolute", textAlign: "center", lineHeight: `${box[3] - box[1]}px`, visibility: "hidden" });
      fits.push(() => GOAT.fit(e, box[2] - box[0], max, min));
      line.set(e, { visibility: "visible" }, g.start).set(e, { visibility: "hidden" }, g.end);
    }
    const fit = () => fits.forEach((f) => f());
    fit();
    if (host.ownerDocument.fonts) host.ownerDocument.fonts.ready.then(fit);
    return line;
  }

  GOAT.visuals = { mount, format, captions, REVEAL, EASE };
})();
