# Calsko brand assets (October 2026)

The product was renamed from DevDock to Calsko on 2026-10-29. The DevDock logos are kept: [`v2/`](v2/) (the "D" with three dots, the last one the app used) and [`v1/`](v1/) (the laptop with `</>`).

| File | What |
|---|---|
| `source/calsko-app-icon.svg`, `source/calsko-wordmark-black.svg`, `source/calsko-wordmark-white.svg` | The artwork as delivered. **Source of truth; don't edit.** |
| `calsko-mark.svg` | The icon's mark alone (no white square), near-black `#090909`, the canvas cropped to the drawing |
| `calsko-mark-dark.svg` | The same in near-white `#F4F4F5`, for dark mode |
| `calsko-wordmark.svg` | "calsko" in `#090909`, cropped to the letters |
| `calsko-wordmark-dark.svg` | The same in `#F4F4F5`, for dark mode |

**Used by the app:**
- The four files above: imported straight from this folder by `src/components/Logo.tsx` (`LogoMark`, `LogoWordmark`; each switches to its dark version in dark mode)
- `public/favicon.svg` (the delivered app icon: the mark on a white rounded square, readable on light and dark tabs), `public/favicon-192.png`, `public/apple-touch-icon.png` (the mark on opaque white): generated, linked from `index.html`

## Regenerating

After changing any of the files above:

```bash
brew install librsvg   # one-time, for rsvg-convert; not a project dependency
sh brand/build.sh
```

Changes to the logo SVGs themselves need no build step.
