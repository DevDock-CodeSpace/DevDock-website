import { cn } from '@/lib/utils'

// Paper-like document typography, applied to the editor root (.ProseMirror).
// Kept as Tailwind classes here rather than global CSS (see CLAUDE.md).
export const docContentClass = cn(
  'min-h-[40vh] text-[17px] leading-[1.7] text-foreground caret-foreground outline-none',
  '[&>*]:my-3 [&>*:first-child]:mt-0',

  // Headings (relative: the collapse toggle sits in the gutter)
  '[&_h1]:relative [&_h1]:mt-10 [&_h1]:mb-3 [&_h1]:text-[1.9em] [&_h1]:leading-tight [&_h1]:font-semibold [&_h1]:tracking-tight',
  '[&_h2]:relative [&_h2]:mt-9 [&_h2]:mb-2 [&_h2]:text-[1.5em] [&_h2]:leading-snug [&_h2]:font-semibold [&_h2]:tracking-tight',
  '[&_h3]:relative [&_h3]:mt-7 [&_h3]:mb-1.5 [&_h3]:text-[1.2em] [&_h3]:leading-snug [&_h3]:font-semibold',

  // Lists: disc → square → circle, like Paper
  '[&_ul]:list-disc [&_ul]:pl-7 [&_ol]:list-decimal [&_ol]:pl-7 [&_li]:my-1 [&_li>p]:my-0',
  '[&_ul_ul]:list-[square] [&_ul_ul]:pl-10 [&_ul_ul_ul]:list-[circle] [&_ol_ol]:list-[lower-alpha]',
  '[&_li]:pl-1 [&_li::marker]:text-foreground',

  // Checklists (TipTap v3 task items: <li data-checked><label><input/></label><div>…</div></li>)
  '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0.5',
  '[&_li[data-checked]]:flex [&_li[data-checked]]:items-start [&_li[data-checked]]:gap-2.5 [&_li[data-checked]]:pl-0',
  '[&_li[data-checked]>label]:mt-[0.32em] [&_li[data-checked]>label]:select-none [&_li[data-checked]>div]:min-w-0 [&_li[data-checked]>div]:flex-1',
  '[&_li[data-checked]_input]:size-4 [&_li[data-checked]_input]:cursor-pointer [&_li[data-checked]_input]:accent-brand',
  '[&_li[data-checked=true]>div]:text-muted-foreground [&_li[data-checked=true]>div]:line-through',

  // Quote, divider, links
  '[&_blockquote]:border-l-[3px] [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
  '[&_hr]:my-8 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border [&_hr.ProseMirror-selectednode]:border-brand',
  '[&_a]:cursor-pointer [&_a]:text-brand [&_a]:underline [&_a]:decoration-brand/40 [&_a]:underline-offset-2',

  // Highlight: warm yellow on light, Paper's muted rose on dark
  '[&_mark]:rounded-[2px] [&_mark]:bg-[oklch(0.92_0.1_90)] [&_mark]:px-0.5 [&_mark]:text-inherit',
  'dark:[&_mark]:bg-[oklch(0.5_0.05_25)]',

  // Inline code
  '[&_:not(pre)>code]:rounded-[3px] [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.86em]',
  'dark:[&_:not(pre)>code]:bg-[oklch(0.38_0.01_270)]',

  // Code blocks (square-ish, hairline border, Geist Mono) + highlight.js tokens
  '[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-[3px] [&_pre]:border [&_pre]:bg-muted/50 [&_pre]:px-4 [&_pre]:py-3',
  '[&_pre]:font-mono [&_pre]:text-[0.84em] [&_pre]:leading-relaxed [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  'dark:[&_pre]:bg-[oklch(0.2_0_0)]',
  '[&_.hljs-keyword]:text-sky-700 [&_.hljs-built_in]:text-sky-700 [&_.hljs-selector-tag]:text-sky-700 [&_.hljs-attr]:text-sky-700',
  'dark:[&_.hljs-keyword]:text-sky-300 dark:[&_.hljs-built_in]:text-sky-300 dark:[&_.hljs-selector-tag]:text-sky-300 dark:[&_.hljs-attr]:text-sky-300',
  '[&_.hljs-string]:text-emerald-700 [&_.hljs-regexp]:text-emerald-700 dark:[&_.hljs-string]:text-emerald-300 dark:[&_.hljs-regexp]:text-emerald-300',
  '[&_.hljs-number]:text-orange-700 [&_.hljs-literal]:text-orange-700 dark:[&_.hljs-number]:text-orange-300 dark:[&_.hljs-literal]:text-orange-300',
  '[&_.hljs-title]:text-violet-700 [&_.hljs-section]:text-violet-700 dark:[&_.hljs-title]:text-violet-300 dark:[&_.hljs-section]:text-violet-300',
  '[&_.hljs-type]:text-teal-700 dark:[&_.hljs-type]:text-teal-300 [&_.hljs-meta]:text-muted-foreground',
  '[&_.hljs-comment]:text-muted-foreground [&_.hljs-comment]:italic',

  // Placeholders (empty doc / empty line with the cursor)
  '[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0',
  '[&_.is-empty]:before:text-muted-foreground/60 [&_.is-empty]:before:content-[attr(data-placeholder)]',

  // Drop cursor + text selection
  '[&_.ProseMirror-selectednode]:outline-none',
)
