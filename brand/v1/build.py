"""Regenerate DevDock brand assets from the originals in brand/source/.

Run from the repo root:  python3 brand/build.py   (needs: pip install pillow numpy)
Writes: brand/*.png (transparent masters), src/assets/brand/*.webp, public/favicon-*.png, public/apple-touch-icon.png
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'brand' / 'source'
MASTERS = ROOT / 'brand'
WEB = ROOT / 'src' / 'assets' / 'brand'
PUBLIC = ROOT / 'public'

def remove_background(path, enclosed_too=False):
    """enclosed_too: also clear white not connected to the edge (letter counters in text)."""
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    h, w, _ = rgb.shape
    near_white = (rgb.min(axis=2) >= 232)
    # Flood-fill near-white from every border pixel -> background region only.
    mask = Image.fromarray((near_white * 255).astype(np.uint8)).copy()  # copy: floodfill can't write to numpy-backed memory
    for x in range(0, w, 8):
        for y in (0, h - 1):
            if mask.getpixel((x, y)) == 255: ImageDraw.floodfill(mask, (x, y), 128)
    for y in range(0, h, 8):
        for x in (0, w - 1):
            if mask.getpixel((x, y)) == 255: ImageDraw.floodfill(mask, (x, y), 128)
    bg = np.asarray(mask) == 128
    if enclosed_too:
        bg = bg | near_white
    # Anti-aliased rim: pixels within 3px of the background get color-to-alpha against white.
    near_bg = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
    band = near_bg & ~bg
    alpha = np.ones((h, w))
    alpha[bg] = 0
    a_band = ((255 - rgb[band]).max(axis=1) / 255).clip(0, 1)
    alpha[band] = a_band
    out = rgb.copy()
    safe = np.maximum(a_band, 1e-6)[:, None]
    out[band] = ((rgb[band] - 255 * (1 - safe)) / safe).clip(0, 255)
    out[bg] = 0
    rgba = np.dstack([out, alpha * 255]).round().astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    return img.crop(img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox())

def recolor_navy(img, to=(241, 245, 249)):
    a = np.asarray(img).copy()
    r, g, b, al = (a[..., i].astype(int) for i in range(4))
    navy = (al > 0) & (r < 110) & (g < 120) & (b < 150) & (b - r < 90)  # dark navy, not the bright blue
    a[navy, 0], a[navy, 1], a[navy, 2] = to
    return Image.fromarray(a, 'RGBA')

def fit_width(img, width):
    return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)

def square_icon(mark, size, pad=0.08, bg=None):
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    inner = round(size * (1 - 2 * pad))
    m = mark.copy(); m.thumbnail((inner, inner), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas

mark = remove_background(SRC / 'devdock-mark.png')
wordmark = remove_background(SRC / 'devdock-wordmark.png', enclosed_too=True)
lockup = remove_background(SRC / 'devdock-lockup.png')
print('cropped sizes: mark', mark.size, 'wordmark', wordmark.size, 'lockup', lockup.size)

# Transparent masters (for future use: docs, social cards, etc.)
mark.save(MASTERS / 'devdock-mark.png', optimize=True)
wordmark.save(MASTERS / 'devdock-wordmark.png', optimize=True)
recolor_navy(wordmark).save(MASTERS / 'devdock-wordmark-dark.png', optimize=True)
lockup.save(MASTERS / 'devdock-lockup.png', optimize=True)

# Web sizes (WebP with alpha): mark shown at <=64px CSS -> 192px covers 3x screens.
fit_width(mark, 192).save(WEB / 'devdock-mark.webp', quality=92, method=6)
fit_width(wordmark, 480).save(WEB / 'devdock-wordmark.webp', quality=92, method=6)
fit_width(recolor_navy(wordmark), 480).save(WEB / 'devdock-wordmark-dark.webp', quality=92, method=6)

# Favicons
square_icon(mark, 32, pad=0.02).save(PUBLIC / 'favicon-32.png', optimize=True)
square_icon(mark, 192, pad=0.04).save(PUBLIC / 'favicon-192.png', optimize=True)
square_icon(mark, 180, pad=0.12, bg=(255, 255, 255, 255)).convert('RGB').save(PUBLIC / 'apple-touch-icon.png', optimize=True)
