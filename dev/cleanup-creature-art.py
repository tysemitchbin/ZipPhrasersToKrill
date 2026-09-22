#!/usr/bin/env python3
"""
Turn generated creature art into web-ready transparent PNGs.

    pip install pillow numpy
    python3 cleanup-creature-art.py            # reads ./raw, writes ./out
    python3 cleanup-creature-art.py in/ out/   # or name the folders yourself

Image generators can't emit an alpha channel. Asked for a "transparent
background" they do one of two things, and this handles both:

  * paint a flat solid colour behind the creature, or
  * literally DRAW the grey-and-white transparency checkerboard as pixels.

Either way the background is found the same way: sample the border ring of
the image, take the colours that dominate it (two of them, for a
checkerboard), then flood-fill inward from the edges across anything close
to those colours. Flood-filling from the edge rather than keying the whole
image globally is what stops a white-bodied unicorn losing its body to a
white background.

Then: erode a pixel to kill the blend fringe (a light halo is very visible
against this site's near-black background), feather the alpha, square up,
pad and resize - consistently, so 36 creatures render at matching sizes in
the barn.
"""

import argparse
import re
import sys
from collections import deque
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageFilter
except ImportError:
    sys.exit("needs pillow and numpy:  pip install pillow numpy")


# Output names are the creature's slug, since that's what the site looks for.
# These two came out of the generator misspelled and are corrected on the way
# through, rather than leaving two creatures silently without art.
ALIASES = {
    "axlotl": "axolotl",
    "mandarin-fish": "mandarinfish",
}


def out_name(stem):
    slug = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return ALIASES.get(slug, slug)


def background_colours(rgb, ring=2, min_share=0.08, quant=24):
    """Colours that dominate the outer `ring` pixels of the image.

    Quantised into coarse buckets so the generator's noise doesn't split one
    background into fifty near-identical colours. A checkerboard yields two
    buckets, a flat background one.
    """
    h, w, _ = rgb.shape
    border = np.concatenate([
        rgb[:ring, :, :].reshape(-1, 3),
        rgb[-ring:, :, :].reshape(-1, 3),
        rgb[:, :ring, :].reshape(-1, 3),
        rgb[:, -ring:, :].reshape(-1, 3),
    ])
    buckets = {}
    for px in (border // quant):
        buckets[tuple(px)] = buckets.get(tuple(px), 0) + 1
    total = len(border)
    keep = [b for b, n in buckets.items() if n / total >= min_share]
    # bucket -> representative colour at the bucket's centre
    return [np.array([c * quant + quant // 2 for c in b], dtype=np.int16) for b in keep]


def background_mask(rgb, colours, tol):
    """True where a pixel is background: close to one of `colours` AND
    reachable from the image edge without crossing the creature."""
    h, w, _ = rgb.shape
    img = rgb.astype(np.int16)

    close = np.zeros((h, w), dtype=bool)
    for c in colours:
        close |= (np.abs(img - c).max(axis=2) <= tol)

    # flood fill inward from every edge pixel that is background-coloured
    mask = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not mask[y, x]:
                mask[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not mask[y, x]:
                mask[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not mask[ny, nx]:
                mask[ny, nx] = True
                q.append((ny, nx))

    return mask, close


def resolve_enclosed(close, mask, rgb, colours, tol):
    """Deal with background-coloured regions the edge flood-fill couldn't
    reach - a gap inside a coiled tail, say.

    The catch is that a pale creature's body is also "background-coloured"
    when the generator drew a white checkerboard. So each enclosed region is
    judged, not blanket-removed:

      * flat background  -> anything enclosed and matching it IS background
        (the prompt asks for a chroma colour that appears nowhere in the art)
      * checkerboard     -> a real gap shows BOTH checker colours; a region
        with only one is far more likely to be white fur, so it's left alone,
        and only flagged when it's small enough to plausibly be a gap
    """
    h, w = mask.shape
    candidates = close & ~mask
    if not candidates.any():
        return mask, 0, 0

    per_colour = [np.abs(rgb.astype(np.int16) - c).max(axis=2) <= tol for c in colours]
    seen = np.zeros((h, w), dtype=bool)
    punched = ambiguous = 0

    ys, xs = np.nonzero(candidates)
    for sy, sx in zip(ys, xs):
        if seen[sy, sx]:
            continue
        component, q = [], deque([(sy, sx)])
        seen[sy, sx] = True
        while q:
            y, x = q.popleft()
            component.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and candidates[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))

        cy = np.array([p[0] for p in component])
        cx = np.array([p[1] for p in component])
        if len(colours) == 1:
            background = True
        else:
            background = sum(bool(m[cy, cx].any()) for m in per_colour) >= 2

        if background:
            mask[cy, cx] = True
            punched += len(component)
        elif len(component) < h * w * 0.03:
            ambiguous += len(component)

    return mask, punched, ambiguous


def to_alpha(rgb, mask, erode, feather):
    """Background mask -> a clean alpha channel."""
    alpha = Image.fromarray(np.where(mask, 0, 255).astype(np.uint8), mode="L")
    # Eat the anti-aliased fringe where art blended into the background -
    # otherwise every creature wears a pale halo on a dark page.
    for _ in range(erode):
        alpha = alpha.filter(ImageFilter.MinFilter(3))
    if feather:
        alpha = alpha.filter(ImageFilter.GaussianBlur(feather))
    return alpha


def despill(rgb, alpha, passes=3):
    """Push the creature's own colours outward into the fringe.

    Edge pixels are a blend of art and background, so keying them leaves a
    rim of the background colour - a magenta or grey halo that's glaringly
    obvious against this site's near-black page. Repainting the fringe with
    the nearest solid art colour removes it; alpha still does the shaping,
    so nothing changes visually except the colour hiding under the blend.
    """
    out = rgb.astype(np.float32).copy()
    known = np.array(alpha) >= 250
    for _ in range(passes):
        total = np.zeros_like(out)
        count = np.zeros(known.shape, dtype=np.float32)
        for axis, shift in ((0, 1), (0, -1), (1, 1), (1, -1)):
            total += np.roll(np.where(known[..., None], out, 0), shift, axis=axis)
            count += np.roll(known.astype(np.float32), shift, axis=axis)
        fill = (count > 0) & ~known
        out[fill] = (total[fill] / count[fill, None])
        known |= fill
    return out.astype(np.uint8)


def square_and_resize(img, size, pad_pct):
    """Crop to the creature, centre it in a square, pad, resize.

    Done identically for every file so the set renders at a consistent
    visual size - a tightly-cropped creature next to a loosely-cropped one
    is the most common way a sticker set looks wrong.
    """
    bbox = img.getbbox()  # uses alpha
    if bbox is None:
        return None
    img = img.crop(bbox)
    w, h = img.size
    side = max(w, h)
    side = int(round(side * (1 + pad_pct / 100.0)))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


LOSSY = (".jpg", ".jpeg", ".jfif")


def process(src, dst, args):
    img = Image.open(src).convert("RGBA")
    rgb = np.array(img)[:, :, :3]

    # JPEG (and .jfif, which is just a JPEG) rings along the hard outlines
    # this art is full of, scattering background pixels well off their true
    # colour. They need a looser key than a clean PNG.
    tolerance = args.tolerance
    if tolerance is None:
        tolerance = 50 if src.suffix.lower() in LOSSY else 28

    colours = background_colours(rgb)
    if not colours:
        return f"no dominant border colour - is it cropped to the creature already?"

    mask, close = background_mask(rgb, colours, tolerance)
    mask, punched, ambiguous = resolve_enclosed(close, mask, rgb, colours, tolerance)
    share = mask.mean()
    if share < 0.02:
        return f"only {share:.1%} of the image keyed as background - check it by eye"

    alpha = to_alpha(rgb, mask, args.erode, args.feather)
    img = Image.fromarray(despill(rgb, alpha), mode="RGB").convert("RGBA")
    img.putalpha(alpha)
    out = square_and_resize(img, args.size, args.pad)
    if out is None:
        return "everything keyed out - nothing left"

    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst)

    note = f"ok  {share:.0%} removed, {len(colours)} bg colour(s)"
    if punched:
        note += f", {punched}px enclosed gap"
    if ambiguous > rgb.shape[0] * rgb.shape[1] * 0.002:
        note += f"  [!] {ambiguous}px kept that matches the background - if " \
                "that's a gap, not the creature, raise --tolerance or edit by hand"
    return note


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("src", type=Path, nargs="?", default=Path("raw"),
                   help="folder of generated images, or one file (default: raw)")
    p.add_argument("dst", type=Path, nargs="?", default=Path("out"),
                   help="output folder (default: out)")
    p.add_argument("--size", type=int, default=128, help="output px, square (default 128)")
    p.add_argument("--pad", type=float, default=6, help="%% breathing room (default 6)")
    p.add_argument("--tolerance", type=int, default=None,
                   help="how far a pixel can stray from the background colour "
                        "(default: 28 for png, 50 for lossy jpg/jfif)")
    p.add_argument("--erode", type=int, default=1,
                   help="px of fringe to eat (default 1, raise if you see a halo)")
    p.add_argument("--feather", type=float, default=0.5,
                   help="alpha blur for smooth edges (default 0.5)")
    args = p.parse_args()

    # Run with no arguments and it just works, as long as the images are in a
    # folder called "raw" next to the script - typing paths in a terminal is
    # the step most likely to go wrong, so don't require it.
    if not args.src.exists():
        args.src.mkdir(parents=True, exist_ok=True)
        sys.exit(f"Made an empty folder called '{args.src}'.\n"
                 f"Put the creature images in it, then run this again.")

    files = [args.src] if args.src.is_file() else sorted(
        f for f in args.src.iterdir()
        if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".jfif", ".webp", ".bmp"))
    if not files:
        sys.exit(f"No images found in '{args.src}'. Expected .png, .jpg, .jfif or .webp files.")

    print(f"Cleaning up {len(files)} images from '{args.src}'...\n")

    width = max(len(f.name) for f in files)
    problems = 0
    for f in files:
        name = out_name(f.stem)
        result = process(f, args.dst / (name + ".png"), args)
        if name != f.stem:
            result += f"  -> saved as {name}.png"
        if not result.startswith("ok"):
            problems += 1
        print(f"{f.name:<{width}}  {result}")

    print(f"\n{len(files) - problems} of {len(files)} written to '{args.dst.resolve()}'")
    if problems:
        print("Re-run the failures with a higher --tolerance, or crop the "
              "background by hand if the generator drew a scene.")


if __name__ == "__main__":
    main()
