#!/bin/sh
# Renders the favicons from the logo files in brand/ (the app loads those directly). Needs rsvg-convert (brew install librsvg).
# Run from the repo root: sh brand/build.sh
set -e
cd "$(dirname "$0")/.."

# Browser tab: the app icon as delivered (black mark on a white rounded square), which reads on light and dark tabs.
cp brand/source/calsko-app-icon.svg public/favicon.svg
# Android / large tab icons: the same, as a PNG fallback.
rsvg-convert -w 192 -h 192 brand/source/calsko-app-icon.svg -o public/favicon-192.png

# iOS home screen: an opaque white square with room around the mark (iOS rounds the corners itself).
inner=$(sed -e '1d' -e '$d' brand/calsko-mark.svg)
printf '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><rect width="180" height="180" fill="#ffffff"/><svg x="36" y="30" width="108" height="120" viewBox="184 118 655 788">%s</svg></svg>\n' "$inner" > /tmp/calsko-touch.svg
rsvg-convert /tmp/calsko-touch.svg -o public/apple-touch-icon.png
rm -f /tmp/calsko-touch.svg

echo "Favicons written to public/."
