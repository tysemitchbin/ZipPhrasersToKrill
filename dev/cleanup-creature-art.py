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
    # "python -m pip" rather than a bare "pip": with more than one Python
    # installed, a bare pip often installs into a different one than the
    # interpreter running this, and the import fails again after installing.
    sys.exit("This needs two libraries. Install them with:\n\n"
             f"    {sys.executable} -m pip install pillow numpy\n")


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
    keep = sorted((b for b, n in buckets.items() if n / total >= min_share),
                  key=lambda b: -buckets[b])          # most common first
    # bucket -> representative colour at the bucket's centre
    return [np.array([c * quant + quant // 2 for c in b], dtype=np.int16) for b in keep]





def checker_square_size(rgb, colours, band, default=8, lo=6, hi=48):
    """Roughly how big the drawn checkerboard's squares are, in pixels.

    Run lengths along several lines around the edge - one line alone reads
    whatever it happens to cross. This only sets the window the pattern test
    looks through, and that window has to span a square: at any smaller
    scale the middle of a white square and the middle of white fur are
    identical. The threshold, not the window, is what protects the creature.
    """
    if len(colours) < 2:
        return default

    lines = [rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1],
             rgb[2], rgb[-3], rgb[:, 2], rgb[:, -3]]
    runs = []
    for line in lines:
        edge = line.astype(np.int16)
        distances = np.stack([np.abs(edge - c).max(axis=1) for c in colours])
        idx = distances.argmin(axis=0)
        run = 1
        for i in range(1, len(idx)):
            if idx[i] == idx[i - 1]:
                run += 1
            else:
                runs.append(run)
                run = 1
        runs.append(run)

    runs = [r for r in runs if r >= 3]          # noise flips aren't squares
    if not runs:
        return default
    return int(np.clip(np.median(runs), lo, hi))


def box_mean(a, radius):
    """Mean of each pixel's neighbourhood, via an integral image."""
    h, w = a.shape
    padded = np.pad(a.astype(np.float64), radius, mode="edge")
    ii = np.zeros((padded.shape[0] + 1, padded.shape[1] + 1))
    ii[1:, 1:] = padded.cumsum(0).cumsum(1)
    size = 2 * radius + 1
    total = (ii[size:size + h, size:size + w] - ii[0:h, size:size + w]
             - ii[size:size + h, 0:w] + ii[0:h, 0:w])
    return total / (size * size)


def local_texture(rgb, radius):
    """How much each pixel's neighbourhood varies in brightness.

    Only used to decide whether the background is a drawn checkerboard or a
    flat field, by reading it at the image edge. It is deliberately NOT used
    to decide individual pixels: compression noise in flat white fur reaches
    the same level as a low-contrast checkerboard, so as a per-pixel test it
    eats white creatures.
    """
    gray = rgb.mean(axis=2)
    mean = box_mean(gray, radius)
    mean_sq = box_mean(gray * gray, radius)
    return np.sqrt(np.clip(mean_sq - mean * mean, 0, None))


def alternation(rgb, colours, band, radius):
    """How strongly a pixel's surroundings alternate between two different
    background colours.

    This is what separates a checker square from white fur, and it holds
    even when the checkerboard's two colours are 24 apart - too close for
    any colour threshold, and indistinguishable from noise by brightness.
    Every pixel is assigned to whichever background colour it is NEAREST,
    then we ask what share of its neighbourhood each colour holds. A
    checkerboard splits roughly half and half; flat fur is all one colour,
    so its second share falls away.

    The window spans a whole square, because at any smaller scale the middle
    of a white square and the middle of white fur look identical. That makes
    the threshold the thing protecting the creature: fur within a window of
    real background scores something, so the bar has to sit well above what
    a boundary can reach and below the ~0.5 of a true checkerboard.
    """
    if len(colours) < 2:
        return np.zeros(rgb.shape[:2])

    # Split by actual pixel brightness, at the midpoint between the two
    # commonest edge tones - NOT by which quantised colour bucket a pixel
    # landed in. A tone lying near a bucket boundary gets split across two
    # buckets and half of it then counts as the other tone: the phoenix's
    # white squares sit at 240, straddle a boundary, and its background
    # scored 0.00 in the middle of a plainly checkered corner.
    tones = sorted(float(c.mean()) for c in colours[:2])
    midpoint = (tones[0] + tones[1]) / 2
    gray = rgb.mean(axis=2)

    light = band & (gray >= midpoint)
    dark = band & (gray < midpoint)
    return np.minimum(box_mean(light.astype(np.float64), radius),
                      box_mean(dark.astype(np.float64), radius))


def border_texture(texture, ring=3):
    """The texture reading along the image edge, which is always background.

    Measuring it rather than assuming it is what tells a drawn checkerboard
    from a flat colour field - including a flat field that compression noise
    has split into several near-identical colours, which used to be misread
    as a checkerboard and made the whole image survive the key.
    """
    edges = np.concatenate([
        texture[:ring].ravel(), texture[-ring:].ravel(),
        texture[:, :ring].ravel(), texture[:, -ring:].ravel(),
    ])
    return float(np.median(edges))


def background_mask(rgb, colours, tol, alternates):
    """True where a pixel is background: it matches a background colour,
    it has background's texture (unless the background is flat), and it is
    reachable from the image edge without crossing the creature."""
    h, w, _ = rgb.shape
    img = rgb.astype(np.int16)

    close = np.zeros((h, w), dtype=bool)
    for c in colours:
        close |= (np.abs(img - c).max(axis=2) <= tol)
    if alternates is not None:
        close &= alternates

    # flood fill inward from every edge pixel that is background
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


def resolve_enclosed(close, mask, alternates, flat):
    """Deal with background-coloured regions the edge flood-fill couldn't
    reach - a gap inside a coiled tail, say.

    Judged per region rather than blanket-removed, because a pale creature
    is background-coloured too. A flat background appears nowhere on the
    art, so anything matching it is background; against a checkerboard, a
    real gap shows the checker's texture and white fur does not.
    """
    h, w = mask.shape
    candidates = close & ~mask
    if not candidates.any():
        return mask, 0, 0

    seen = np.zeros((h, w), dtype=bool)
    punched = ambiguous = 0

    for sy, sx in zip(*np.nonzero(candidates)):
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

        cy = np.array([c[0] for c in component])
        cx = np.array([c[1] for c in component])
        # Nearly every pixel must read as checkerboard, not just a majority.
        # A pale region enclosed by the creature's outline picks up some
        # reading around its rim, and at a simple majority that was enough to
        # punch a hole through the unicorn's flank.
        background = flat or bool(alternates[cy, cx].mean() > 0.9)

        if background:
            mask[cy, cx] = True
            punched += len(component)
        elif len(component) < h * w * 0.03:
            ambiguous += len(component)

    return mask, punched, ambiguous


def drop_specks(opaque, band, min_frac=0.0005, remnant_frac=0.02, remnant_purity=0.85):
    """Discard islands that aren't part of the creature.

    Two kinds. Tiny ones - a few pixels of compression noise in a corner -
    matter because the crop squares up to whatever alpha reaches, so one
    speck halves the creature in the output frame.

    The other kind is a scrap of background the key didn't quite take: the
    middle of a large checker square, which alternates too weakly at its
    centre to be caught. Those are identified by being detached from the
    creature, small, and made almost entirely of background colour - which
    is what separates them from a detached piece of ART, like a puff of
    smoke, that is kept.
    """
    h, w = opaque.shape
    min_area = max(int(h * w * min_frac), 24)
    remnant_area = int(h * w * remnant_frac)
    seen = np.zeros((h, w), dtype=bool)
    components = []

    for sy, sx in zip(*np.nonzero(opaque)):
        if seen[sy, sx]:
            continue
        component, q = [], deque([(sy, sx)])
        seen[sy, sx] = True
        while q:
            y, x = q.popleft()
            component.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and opaque[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        components.append(component)

    if not components:
        return opaque
    biggest = max(range(len(components)), key=lambda i: len(components[i]))

    keep = np.zeros((h, w), dtype=bool)
    for i, component in enumerate(components):
        cy = np.array([c[0] for c in component])
        cx = np.array([c[1] for c in component])
        if len(component) < min_area:
            continue
        if (i != biggest and len(component) < remnant_area
                and band[cy, cx].mean() >= remnant_purity):
            continue                      # background the key left behind
        keep[cy, cx] = True
    return keep


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

# How half-and-half a neighbourhood must be to count as checkerboard rather
# than flat fur. A true checkerboard sits near 0.5; fur reaches a fraction of
# that only right against the background it touches.
ALT_THRESHOLD = 0.30

# How wide the pattern test looks, in source pixels. It has to span a whole
# square - at any smaller scale the middle of a white square and the middle of
# white fur are identical - and measured across this art, 40 clears the
# threshold on every background while the threshold still keeps the creatures
# whole. Fitting it per image was tried and was less reliable than a constant.
ALT_WINDOW = 40


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

    # Is the background a drawn checkerboard or a flat colour field? Measured
    # at the image edge, which is background by definition, rather than
    # inferred from how many colour buckets turned up - compression noise
    # splits one flat colour into several, and a checkerboard's two colours
    # can be closer together than that noise.
    band = np.zeros(rgb.shape[:2], dtype=bool)
    for c in colours:
        band |= (np.abs(rgb.astype(np.int16) - c).max(axis=2) <= tolerance)

    radius = checker_square_size(rgb, colours, band)
    flat = border_texture(local_texture(rgb, radius)) < 6.0

    alternates = None
    if not flat:
        alternates = alternation(rgb, colours, band, ALT_WINDOW) >= ALT_THRESHOLD

    mask, close = background_mask(rgb, colours, tolerance, alternates)
    mask, punched, ambiguous = resolve_enclosed(close, mask, alternates, flat)
    share = mask.mean()
    if share < 0.02:
        return f"only {share:.1%} of the image keyed as background - check it by eye"

    mask = ~drop_specks(~mask, band)
    alpha = to_alpha(rgb, mask, args.erode, args.feather)
    img = Image.fromarray(despill(rgb, alpha), mode="RGB").convert("RGBA")
    img.putalpha(alpha)
    out = square_and_resize(img, args.size, args.pad)
    if out is None:
        return "everything keyed out - nothing left"

    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst)

    kind = "flat" if flat else f"checker~{radius}px"
    note = f"ok  {share:.0%} removed, {kind}"
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
