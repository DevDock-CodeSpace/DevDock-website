#!/bin/sh
# Renders the favicons from the logo files in brand/ (the app loads those directly). Needs rsvg-convert (brew install librsvg).
# Run from the repo root: sh brand/build.sh
set -e
cd "$(dirname "$0")/.."

# square <mark.svg> <size> <padding> <background or none> <out>: the mark centred on a square canvas.
square() {
  inner=$(sed -e '1d' -e '$d' "$1")
  side=$(( $2 - 2 * $3 ))
  fill=""
  [ "$4" != none ] && fill="<rect width=\"$2\" height=\"$2\" fill=\"$4\"/>"
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" viewBox="0 0 %s %s">%s<svg x="%s" y="%s" width="%s" height="%s" viewBox="12 38 256 221">%s</svg></svg>\n' \
    "$2" "$2" "$2" "$2" "$fill" "$3" "$3" "$side" "$side" "$inner" > "$5.svg"
}

# Browser tab: the flat mark (gradients turn to mud at 16-32 px).
square brand/devdock-mark-flat.svg 32 0 none public/favicon
# Android / large tab icons keep the gradients.
square brand/devdock-mark.svg 192 8 none /tmp/devdock-192
rsvg-convert /tmp/devdock-192.svg -o public/favicon-192.png
# iOS home screen: an opaque square with room around the mark.
square brand/devdock-mark.svg 180 22 '#ffffff' /tmp/devdock-touch
rsvg-convert /tmp/devdock-touch.svg -o public/apple-touch-icon.png
rm -f /tmp/devdock-192.svg /tmp/devdock-touch.svg

echo "Favicons written to public/."
