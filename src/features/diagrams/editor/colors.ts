import type { ColorKey, FillKey, LineStyle, TextSize } from './model'

// Diagram colors are stored as keys and drawn with Tailwind classes, so the
// same diagram looks right in light and dark mode. `default` uses the theme
// tokens; the rest are soft fills with a saturated line.

type Classes = Record<ColorKey, string>

/** SVG fill of a shape body. */
export const fillClass: Record<FillKey, string> = {
  none: 'fill-transparent',
  default: 'fill-card',
  blue: 'fill-blue-50 dark:fill-blue-950',
  teal: 'fill-teal-50 dark:fill-teal-950',
  green: 'fill-green-50 dark:fill-green-950',
  amber: 'fill-amber-50 dark:fill-amber-950',
  orange: 'fill-orange-50 dark:fill-orange-950',
  red: 'fill-red-50 dark:fill-red-950',
  pink: 'fill-pink-50 dark:fill-pink-950',
  violet: 'fill-violet-50 dark:fill-violet-950',
}

/** Background (HTML) version of fillClass, for icon tiles and swatches. */
export const bgClass: Record<FillKey, string> = {
  none: 'bg-transparent',
  default: 'bg-card',
  blue: 'bg-blue-50 dark:bg-blue-950',
  teal: 'bg-teal-50 dark:bg-teal-950',
  green: 'bg-green-50 dark:bg-green-950',
  amber: 'bg-amber-50 dark:bg-amber-950',
  orange: 'bg-orange-50 dark:bg-orange-950',
  red: 'bg-red-50 dark:bg-red-950',
  pink: 'bg-pink-50 dark:bg-pink-950',
  violet: 'bg-violet-50 dark:bg-violet-950',
}

/** SVG stroke of a shape border or connector. */
export const strokeClass: Classes = {
  default: 'stroke-foreground/60',
  blue: 'stroke-blue-500',
  teal: 'stroke-teal-500',
  green: 'stroke-green-500',
  amber: 'stroke-amber-500',
  orange: 'stroke-orange-500',
  red: 'stroke-red-500',
  pink: 'stroke-pink-500',
  violet: 'stroke-violet-500',
}

/** Arrowhead fill, matching strokeClass. */
export const markerClass: Classes = {
  default: 'fill-foreground/60',
  blue: 'fill-blue-500',
  teal: 'fill-teal-500',
  green: 'fill-green-500',
  amber: 'fill-amber-500',
  orange: 'fill-orange-500',
  red: 'fill-red-500',
  pink: 'fill-pink-500',
  violet: 'fill-violet-500',
}

/** HTML border (icon tiles), matching strokeClass. */
export const borderClass: Classes = {
  default: 'border-foreground/60',
  blue: 'border-blue-500',
  teal: 'border-teal-500',
  green: 'border-green-500',
  amber: 'border-amber-500',
  orange: 'border-orange-500',
  red: 'border-red-500',
  pink: 'border-pink-500',
  violet: 'border-violet-500',
}

/** Icon glyph color. */
export const iconClass: Classes = {
  default: 'text-foreground/80',
  blue: 'text-blue-600 dark:text-blue-400',
  teal: 'text-teal-600 dark:text-teal-400',
  green: 'text-green-600 dark:text-green-400',
  amber: 'text-amber-600 dark:text-amber-400',
  orange: 'text-orange-600 dark:text-orange-400',
  red: 'text-red-600 dark:text-red-400',
  pink: 'text-pink-600 dark:text-pink-400',
  violet: 'text-violet-600 dark:text-violet-400',
}

/** Solid swatch for the color pickers. */
export const swatchClass: Classes = {
  default: 'bg-foreground/70',
  blue: 'bg-blue-500',
  teal: 'bg-teal-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  violet: 'bg-violet-500',
}

export const COLOR_KEYS: ColorKey[] = ['default', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'violet']
export const FILL_KEYS: FillKey[] = ['none', ...COLOR_KEYS]

export const colorNames: Record<FillKey, string> = {
  none: 'None',
  default: 'Default',
  blue: 'Blue',
  teal: 'Teal',
  green: 'Green',
  amber: 'Amber',
  orange: 'Orange',
  red: 'Red',
  pink: 'Pink',
  violet: 'Violet',
}

export const textClass: Record<TextSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-lg',
}

/** SVG dash pattern for a line style (null = no stroke drawn). */
export function dashArray(line: LineStyle): string | undefined {
  return line === 'dashed' ? '6 4' : undefined
}
