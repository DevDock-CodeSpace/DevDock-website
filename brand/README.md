# DevDock brand assets

| File | What |
|---|---|
| `source/devdock-lockup.png`, `source/devdock-mark.png`, `source/devdock-wordmark.png` | Original artwork (1254×1254, white background). **Source of truth; don't edit.** |
| `devdock-mark.png` | Icon, transparent background, cropped |
| `devdock-wordmark.png` | "DevDock" wordmark, transparent, for light backgrounds |
| `devdock-wordmark-dark.png` | Wordmark with the navy "Dev" recoloured light, for dark backgrounds |
| `devdock-lockup.png` | Icon + wordmark, transparent (light backgrounds only) |

These masters aren't loaded by the app. They're here for docs, slides and social cards.

**Used by the app** (generated, small):
- `src/assets/brand/*.webp`: rendered by `src/components/Logo.tsx` (`LogoMark`, `LogoWordmark`)
- `public/favicon-32.png`, `public/favicon-192.png`, `public/apple-touch-icon.png`: linked from `index.html`

## Regenerating

After replacing anything in `source/`:

```bash
python3 -m pip install pillow numpy   # one-time; not a project dependency
python3 brand/build.py
```

The script removes the white background (flood-fill from the edges, so white *inside* the icon stays; letter counters in the wordmark are cleared too), crops, recolours the dark wordmark, and exports every size above.

Brand colours (median of sampled pixels): navy `#12223C` (screen, "Dev"), blue `#0277F5` ("Dock", tray), cyan `#00E8E6` (code slash).
