# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["pillow>=10.4", "numpy>=1.26"]
# ///
"""Doodle Notes · Гар зураас.

The footage exactly as filmed, with thin hand-drawn marker lines that draw themselves on:
a circle round the product, a line under the price, arrows, stars, hearts and short handwritten notes.
Usage: uv run render.py plan.json
"""
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import goatcut as g  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

NAME = "doodle-notes"
GRADE = ""            # none: the colour stays exactly as filmed, that is the whole look
STROKE = 9            # marker width in px
DRAW = 0.4            # seconds for a stroke or a note to draw itself on
BOIL = 10             # lines are redrawn with a tiny wobble this many times a second
SS = 2                # strokes are drawn at 2x and shrunk, for smooth edges
COLORS = {"white": (255, 255, 255, 255), "black": (17, 17, 17, 255)}
NOTE, LINE = "Caveat[wght].ttf", "ShantellSans[BNCE,INFM,SPAC,wght].ttf"
W, H = g.W, g.H


# ---------------------------------------------------------------- shapes (screen px, lists of strokes)

def dense(pts, step=6):
    """Split long straight segments so the hand wobble can bend them."""
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.dist(a, b) / step))
        out += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(1, n + 1)]
    return out


def wobble(pts, rng, amp):
    """Hand tremor: a slow, smooth sideways drift along the stroke."""
    p = [rng.uniform(0, 6.3) for _ in range(4)]
    out, s = [], 0.0
    for i, (x, y) in enumerate(pts):
        s += math.dist(pts[i - 1], (x, y)) if i else 0
        out.append((x + amp * (math.sin(s / 41 + p[0]) + 0.5 * math.sin(s / 17 + p[1])),
                    y + amp * (math.sin(s / 37 + p[2]) + 0.5 * math.sin(s / 15 + p[3]))))
    return out


def circle(d, rng):
    x0, y0, x1, y1 = d["box"]
    cx, cy = (x0 + x1) / 2 * W, (y0 + y1) / 2 * H
    rx, ry = (x1 - x0) / 2 * W * 1.08 + 22, (y1 - y0) / 2 * H * 1.08 + 22
    a0, tilt = math.radians(rng.uniform(-125, -95)), math.radians(rng.uniform(-7, 7))
    n = int(max(rx, ry) / 3) + 60
    pts = []
    for k in range(n + 1):
        u = k / n
        a = a0 + u * math.radians(385)  # runs past its start and ends a little wider, like a quick pen ring
        x, y = rx * (1 + 0.07 * u) * math.cos(a), ry * (1 + 0.07 * u) * math.sin(a)
        pts.append((cx + x * math.cos(tilt) - y * math.sin(tilt), cy + x * math.sin(tilt) + y * math.cos(tilt)))
    return [pts]


def underline(d, rng):
    (ax, ay), (bx, by) = (d["from"][0] * W, d["from"][1] * H), (d["to"][0] * W, d["to"][1] * H)
    n = max(8, int(math.dist((ax, ay), (bx, by)) / 6))
    ph = rng.uniform(0, 6.3)
    return [[(ax + (bx - ax) * k / n, ay + (by - ay) * k / n + 5 * math.sin(math.pi * 2 * k / n + ph))
             for k in range(n + 1)]]


def arrow(d, rng):
    (ax, ay), (bx, by) = (d["from"][0] * W, d["from"][1] * H), (d["to"][0] * W, d["to"][1] * H)
    ln = math.dist((ax, ay), (bx, by)) or 1
    nx, ny = -(by - ay) / ln, (bx - ax) / ln
    if ny > 0:  # bow the shaft upwards, the way a hand swings an arrow
        nx, ny = -nx, -ny
    c = ((ax + bx) / 2 + nx * 0.18 * ln, (ay + by) / 2 + ny * 0.18 * ln)
    n = max(10, int(ln / 6))
    shaft = [((1 - u) ** 2 * ax + 2 * (1 - u) * u * c[0] + u * u * bx,
              (1 - u) ** 2 * ay + 2 * (1 - u) * u * c[1] + u * u * by) for u in (k / n for k in range(n + 1))]
    back = math.atan2(c[1] - by, c[0] - bx)
    h = g.clamp(0.22 * ln, 34, 70)
    barb = [(bx + h * math.cos(back + s), by + h * math.sin(back + s)) for s in (0.5, -0.5)]
    return [shaft, dense([barb[0], (bx, by), barb[1]])]


def star(d, rng):
    cx, cy = d["at"][0] * W, d["at"][1] * H
    r = d.get("size", 0.08) * W / 2
    return [dense([(cx + r * math.cos(a), cy + r * math.sin(a))
                   for a in (math.radians(-90 + k * 144) for k in range(6))])]


def sparkle(d, rng):
    cx, cy = d["at"][0] * W, d["at"][1] * H
    r = d.get("size", 0.06) * W / 2
    return [dense([(cx, cy - r), (cx, cy + r)]), dense([(cx - r, cy), (cx + r, cy)])]


def heart(d, rng):
    cx, cy = d["at"][0] * W, d["at"][1] * H
    r = d.get("size", 0.1) * W / 2 / 16
    ts = [k / 90 * (2 * math.pi + 0.25) for k in range(91)]
    return [[(cx + r * 16 * math.sin(t) ** 3,
              cy - r * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)))
             for t in ts]]


SHAPES = {"circle": (circle, "box"), "underline": (underline, "from", "to"), "arrow": (arrow, "from", "to"),
          "star": (star, "at"), "sparkle": (sparkle, "at"), "heart": (heart, "at")}


# ---------------------------------------------------------------- drawing

def stroke_sprite(strokes, frac, color):
    """The first `frac` of the strokes' length, drawn with round ends. Returns (sprite, x, y)."""
    xs = [p[0] for s in strokes for p in s]
    ys = [p[1] for s in strokes for p in s]
    x0, y0 = int(min(xs)) - STROKE, int(min(ys)) - STROKE
    w, h = int(max(xs)) + STROKE - x0 + 1, int(max(ys)) + STROKE - y0 + 1
    m = Image.new("L", (w * SS, h * SS), 0)
    dr = ImageDraw.Draw(m)
    left = frac * sum(math.dist(a, b) for s in strokes for a, b in zip(s, s[1:]))
    for s in strokes:
        if left <= 0:
            break
        vis = [s[0]]
        for a, b in zip(s, s[1:]):
            seg = math.dist(a, b)
            if seg >= left:
                vis.append((a[0] + (b[0] - a[0]) * left / seg, a[1] + (b[1] - a[1]) * left / seg))
                left = 0
                break
            vis.append(b)
            left -= seg
        q = [((x - x0) * SS, (y - y0) * SS) for x, y in vis]
        if len(q) > 1:
            dr.line(q, fill=255, width=STROKE * SS, joint="curve")
        r = STROKE * SS / 2
        for x, y in (q[0], q[-1]):
            dr.ellipse((x - r, y - r, x + r, y + r), fill=255)
    sprite = Image.new("RGBA", (w, h), color)
    sprite.putalpha(m.resize((w, h), Image.LANCZOS))
    return sprite, x0, y0


def stacked(text, font, gap, **kw):
    """Centred multi-line sprite, one text_sprite per line (core text_sprite crashes on centred multi-line text)."""
    rows = [g.text_sprite(ln, font, **kw) for ln in text.split("\n")]
    w = max(r.width for r in rows)
    out = Image.new("RGBA", (w, sum(r.height for r in rows) + gap * (len(rows) - 1)), (0, 0, 0, 0))
    y = 0
    for r in rows:
        out.alpha_composite(r, ((w - r.width) // 2, y))
        y += r.height + gap
    return out


def point(v, what):
    if not (isinstance(v, (list, tuple)) and len(v) == 2 and all(isinstance(n, (int, float)) for n in v)):
        g.die(f"{what} must be two numbers [x, y] between 0 and 1, e.g. [0.5, 0.4]")
    return v


def check(i, d):
    shape = d.get("shape")
    if shape not in SHAPES:
        g.die(f'doodle {i + 1}: shape must be one of {", ".join(SHAPES)}')
    for key in SHAPES[shape][1:]:
        if key not in d:
            g.die(f'doodle {i + 1} ({shape}) needs "{key}"')
    if shape == "circle":
        b = d["box"]
        if not (isinstance(b, list) and len(b) == 4 and b[0] < b[2] and b[1] < b[3]):
            g.die(f"doodle {i + 1}: box must be [left, top, right, bottom] between 0 and 1, left < right, top < bottom")
    for key in ("from", "to", "at"):
        if key in d:
            point(d[key], f"doodle {i + 1} {key}")


def ink(name, what):
    if name not in COLORS:
        g.die(f'{what} must be one of {", ".join(COLORS)}')
    return COLORS[name]


def setup(ctx):
    default = ctx.opt("color", "white")
    ink(default, "look.color")
    for item in ctx.texts():
        if item.get("role") not in ("note", "line"):
            g.die(f'text role "{item.get("role")}" is not used by this look: use "note" or "line"')

    doodles = [dict(d) for d in ctx.plan.get("doodles", [])]
    for i, d in enumerate(doodles):
        check(i, d)
    # Each key line gets its own line underneath, drawn just after the words finish.
    ctx.lines = []
    for item in ctx.texts("line"):
        f = ctx.fit(item["text"], LINE, 840, 66, 36, axes={"wght": 700})
        color = ink(item.get("color", default), "line color")
        s = g.text_sprite(item["text"], f, fill=color, align="left")
        y = g.clamp(item.get("y", 0.575) * H, g.SAFE[1], g.SAFE[3] - s.height - 44)
        ctx.lines.append((item, s, g.SAFE[0], y))
        doodles.append({"shape": "underline", "from": [(g.SAFE[0] - 4) / W, (y + s.height + 26) / H],
                        "to": [(g.SAFE[0] + s.width + 14) / W, (y + s.height + 22) / H],
                        "start": item.get("start", 0) + DRAW * 0.8, "end": item.get("end", ctx.dur),
                        "color": item.get("color", default)})
    ctx.notes = []
    for item in ctx.texts("note"):
        f = ctx.fit(item["text"], NOTE, 760, 88, 44, axes={"wght": 700})
        at = point(item.get("at", [0.42, 0.19]), "note at")
        color = ink(item.get("color", default), "note color")
        ctx.notes.append((item, stacked(item["text"], f, 6, fill=color), at[0] * W, at[1] * H))

    seed = ctx.plan.get("seed", 21)
    ctx.doodles = []
    for i, d in enumerate(doodles):
        base = [wobble(dense(s, 6), random.Random(seed * 997 + i), 2.5)
                for s in SHAPES[d["shape"]][0](d, random.Random(seed * 991 + i))]
        # four boiled copies, each re-wobbled by a pixel or two, cycled at BOIL frames a second
        boils = []
        for v in range(4):
            r = random.Random(seed * 983 + i * 7 + v)
            dx, dy = r.uniform(-1.5, 1.5), r.uniform(-1.5, 1.5)
            boils.append([[(x + dx, y + dy) for x, y in wobble(s, r, 1.2)] for s in base])
        ctx.doodles.append({"start": d.get("start", 0), "end": d.get("end", ctx.dur), "boils": boils,
                            "color": ink(d.get("color", default), f"doodle {i + 1} color")})


def SFX(ctx):
    # a quiet marker scratch while each line or word draws itself on
    items = ctx.doodles + [x[0] for x in ctx.notes + ctx.lines]
    return [{"sound": "marker", "at": x.get("start", 0), "dur": DRAW, "volume": 0.8} for x in items]


def wipe(sprite, frac):
    """Left part of a word sprite, as if written left to right."""
    if frac >= 1:
        return sprite
    out = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
    w = int(sprite.width * frac)
    if w > 0:
        out.paste(sprite.crop((0, 0, w, sprite.height)), (0, 0))
    return out


def frame(img, t, ctx):
    canvas = img.convert("RGBA")
    v = int(t * BOIL) % 4
    steps = int(DRAW * g.FPS)
    for i, d in enumerate(ctx.doodles):
        if not d["start"] <= t < d["end"]:
            continue
        k = min(steps, int((t - d["start"]) / DRAW * steps) + 1)
        s, x, y = ctx.cache(("d", i, v, k), lambda: stroke_sprite(d["boils"][v], k / steps, d["color"]))
        g.paste(canvas, s, x, y, g.fade(t, d, 0, 0.25))
    for i, (item, sprite, x, y) in enumerate(ctx.notes):
        if item.get("start", 0) <= t < item.get("end", ctx.dur):
            k = min(steps, int((t - item.get("start", 0)) / DRAW * steps) + 1)
            s = ctx.cache(("n", i, k), lambda: wipe(sprite, k / steps).rotate(4, Image.BICUBIC, expand=True))
            g.paste(canvas, s, x, y, g.fade(t, item, 0, 0.25), anchor="mm")
    for i, (item, sprite, x, y) in enumerate(ctx.lines):
        if item.get("start", 0) <= t < item.get("end", ctx.dur):
            k = min(steps, int((t - item.get("start", 0)) / DRAW * steps) + 1)
            s = ctx.cache(("l", i, k), lambda: wipe(sprite, k / steps))
            g.paste(canvas, s, x, y, g.fade(t, item, 0, 0.25))
    return canvas


if __name__ == "__main__":
    g.run(sys.modules[__name__])
