# DevDock brand assets (version 2, October 2026)

The logo is a "D" with three dots beside it: people gathered at a dock. The previous logo (the laptop with `</>`) is kept in [`v1/`](v1/), with its own README and the files the app used to load (`v1/app/`).

| File | What |
|---|---|
| `source/dev-dock-icon.svg`, `source/dev-dock-wordmark.svg` | The artwork as delivered. **Source of truth; don't edit.** |
| `devdock-mark.svg` | The icon the website uses: the D slimmed (halfway between the original and a 41-unit even stroke: arms about 45 and 43 thick, curve about 57, was 49, 45 and 72; same height, a slightly narrower curve) and its arms shortened by 9 units on the left so it opens towards the dots instead of looking like a magnet, the big dot moved a little away from the D's lower arm (they nearly touched, and merged at small sizes), and the canvas cropped to the drawing |
| `devdock-mark-flat.svg` | Solid colours and slightly wider gaps between the dots, for the browser tab and other sizes under ~32 px, where gradients turn to mud |
| `devdock-wordmark.svg` | "Dev Dock" for light backgrounds, cropped to the letters. "Dock" uses the icon's own blue (`#087CF9`, was `#096CF7`) so the two match side by side |
| `devdock-wordmark-dark.svg` | The same with "Dev" in near-white (`#F1F4F9`), for dark backgrounds |

**Used by the app:**
- `devdock-mark.svg`, `devdock-wordmark.svg`, `devdock-wordmark-dark.svg`: imported straight from this folder by `src/components/Logo.tsx` (`LogoMark`, `LogoWordmark`; the wordmark switches to the dark version in dark mode)
- `public/favicon.svg` (the flat mark on a square), `public/favicon-192.png` (fallback for browsers without SVG favicons), `public/apple-touch-icon.png` (on white, as iOS wants): generated, linked from `index.html`

## Regenerating

After changing any of the files above:

```bash
brew install librsvg   # one-time, for rsvg-convert; not a project dependency
sh brand/build.sh
```

It renders the three favicons, each centred on a square canvas. Changes to the logo SVGs themselves need no build step.

Colours: blue `#087CF9` (the D, "Dock"), navy `#061733` ("Dev" on light), teal `#02D0C4` → `#00BDBD`, purple `#8A56FC` → `#5334EC`, violet to sky `#7246F7` → `#01A9FA` (the big dot).
