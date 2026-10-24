// Mermaid flowcharts and ER diagrams → a plain graph: boxes, groups and links, no positions
// (layout.ts places them). Written for what people actually paste, which is mostly what a
// chatbot wrote: quoted labels, <br/>, chains (A --> B --> C), A & B --> C, classDef and
// style lines, comments. Anything it can't read is skipped and reported, never fatal, so
// one odd line doesn't lose the rest of the diagram. No imports: Deno tests run it as is.

export type Shape =
  | 'rectangle'
  | 'rounded'
  | 'ellipse'
  | 'diamond'
  | 'cylinder'
  | 'parallelogram'
  | 'hexagon'
  | 'triangle'
  | 'document'
  | 'cloud'
  | 'text'
export type Color = 'default' | 'blue' | 'teal' | 'green' | 'amber' | 'orange' | 'red' | 'pink' | 'violet'
export type Direction = 'TB' | 'BT' | 'LR' | 'RL'
export type Style = { fill?: Color | 'none'; stroke?: Color; dashed?: boolean; bold?: boolean }

export type GraphNode = {
  id: string
  label: string
  shape: Shape
  /** The group (subgraph) it sits in. */
  parent?: string
  style: Style
  /** ER entities: their attributes as table rows (`name type PK FK`). */
  columns?: string[]
}
export type GraphGroup = { id: string; label: string; parent?: string; style: Style }
export type GraphEdge = {
  /** A node id, or a group id (Mermaid lets links point at a subgraph). */
  from: string
  to: string
  label: string
  dashed: boolean
  arrows: 'none' | 'end' | 'both'
  color?: Color
  /** `~~~`: shapes the layout but isn't drawn. */
  hidden: boolean
}
export type MermaidGraph = {
  kind: 'flowchart' | 'er'
  direction: Direction
  nodes: GraphNode[]
  groups: GraphGroup[]
  edges: GraphEdge[]
}
/** A line that wasn't understood (1-based within the code, header = 1). */
export type Skipped = { line: number; text: string }
export type ParseResult =
  | { ok: true; graph: MermaidGraph; skipped: Skipped[] }
  | { ok: false; error: string; skipped: Skipped[] }

export const LIMITS = { nodes: 300, edges: 600, label: 300 }

// ------------------------------------------------------------ labels

const NAMED_ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', apos: "'", hash: '#' }

/** Mermaid's `#quot;` / `#35;` and HTML's `&amp;` / `&#39;`. */
function decodeEntities(s: string) {
  return s.replace(/[#&](#?)(x[\da-f]+|\d+|[a-z]+);/gi, (match, _hash: string, body: string) => {
    if (/^\d+$/.test(body)) return safeCodePoint(Number(body), match)
    if (/^x[\da-f]+$/i.test(body)) return safeCodePoint(parseInt(body.slice(1), 16), match)
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}
const safeCodePoint = (n: number, fallback: string) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : fallback)

/** A label as text: quotes, markdown strings, <br/>, tags, entities and Font Awesome prefixes removed. */
export function cleanLabel(raw: string): string {
  let s = raw.trim()
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1)
  if (s.length >= 2 && s.startsWith('`') && s.endsWith('`')) {
    // A markdown string: keep the words, drop **bold** and _italic_ markers.
    s = s
      .slice(1, -1)
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(\*|_)(.+?)\1/g, '$2')
  }
  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
  s = decodeEntities(s).replace(/\bfa[bsrl]?:fa-[\w-]+\s*/g, '')
  return s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
    .slice(0, LIMITS.label)
}

// ------------------------------------------------------------ colors

const NAMED_COLORS: Record<string, string> = {
  red: '#ff0000', darkred: '#8b0000', crimson: '#dc143c', tomato: '#ff6347', salmon: '#fa8072', coral: '#ff7f50',
  orange: '#ffa500', darkorange: '#ff8c00', gold: '#ffd700', yellow: '#ffff00', lightyellow: '#ffffe0', khaki: '#f0e68c',
  green: '#008000', lime: '#00ff00', lightgreen: '#90ee90', darkgreen: '#006400', olive: '#808000', palegreen: '#98fb98',
  teal: '#008080', cyan: '#00ffff', aqua: '#00ffff', turquoise: '#40e0d0', lightcyan: '#e0ffff',
  blue: '#0000ff', navy: '#000080', lightblue: '#add8e6', skyblue: '#87ceeb', steelblue: '#4682b4', royalblue: '#4169e1', dodgerblue: '#1e90ff',
  purple: '#800080', violet: '#ee82ee', indigo: '#4b0082', lavender: '#e6e6fa', plum: '#dda0dd', magenta: '#ff00ff', fuchsia: '#ff00ff',
  pink: '#ffc0cb', hotpink: '#ff69b4', lightpink: '#ffb6c1', deeppink: '#ff1493',
  white: '#ffffff', black: '#000000', gray: '#808080', grey: '#808080', silver: '#c0c0c0', lightgray: '#d3d3d3', lightgrey: '#d3d3d3',
  darkgray: '#a9a9a9', darkgrey: '#a9a9a9', whitesmoke: '#f5f5f5', gainsboro: '#dcdcdc', beige: '#f5f5dc', ivory: '#fffff0',
  brown: '#a52a2a', tan: '#d2b48c', chocolate: '#d2691e', wheat: '#f5deb3',
}

/** [h 0–360, s 0–1, l 0–1] of a CSS color, or null. */
function toHsl(value: string): [number, number, number] | null {
  let v = value.trim().toLowerCase()
  v = NAMED_COLORS[v] ?? v
  let r: number, g: number, b: number
  const hex = /^#([\da-f]{3,8})$/.exec(v)
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(v)
  const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/.exec(v)
  if (hsl) return [Number(hsl[1]) % 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100]
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    ;[r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  } else if (rgb) {
    ;[r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number)
  } else {
    return null
  }
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

/** The nearest DevDock color key to a CSS color. Grays, white and black are `default`. */
export function nearestColor(value: string): Color | null {
  const hsl = toHsl(value)
  if (!hsl) return null
  const [h, s, l] = hsl
  if (s < 0.18 || l > 0.96 || l < 0.08) return 'default'
  if (h < 12 || h >= 345) return 'red'
  if (h < 35) return 'orange'
  if (h < 65) return 'amber'
  if (h < 155) return 'green'
  if (h < 190) return 'teal'
  if (h < 250) return 'blue'
  if (h < 290) return 'violet'
  return 'pink'
}

/** Splits on `sep` outside quotes and brackets. */
function splitOutside(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = false
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '"') quote = !quote
    else if (!quote && '([{'.includes(c)) depth++
    else if (!quote && ')]}'.includes(c)) depth = Math.max(0, depth - 1)
    else if (!quote && depth === 0 && c === sep) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out
}

/** `fill:#f9f,stroke:#333,stroke-dasharray: 5 5` → a Style. Unknown properties are ignored. */
export function parseStyle(text: string): Style {
  const style: Style = {}
  for (const part of splitOutside(text.replace(/;\s*$/, ''), ',')) {
    const colon = part.indexOf(':')
    if (colon === -1) continue
    const key = part.slice(0, colon).trim().toLowerCase()
    const value = part.slice(colon + 1).trim().replace(/\s*!important$/, '')
    if (key === 'fill') {
      const color = /^(none|transparent)$/i.test(value) ? 'none' : nearestColor(value)
      if (color) style.fill = color
    } else if (key === 'stroke') {
      const color = nearestColor(value)
      if (color) style.stroke = color
    } else if (key === 'stroke-dasharray') {
      style.dashed = !/^(0|none)$/i.test(value)
    } else if (key === 'font-weight') {
      style.bold = /bold|[6-9]00/i.test(value)
    }
  }
  return style
}

// ------------------------------------------------------------ flowcharts

const ID_RE = /[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[-.](?=[\p{L}\p{N}_]))*/uy
const EDGE_ID_RE = /[\p{L}\p{N}_]+@(?=[-=.~<ox])/uy

/** Bracket openers, longest first, with their closers and the shape they draw. */
const BRACKETS: [string, string[], Shape][] = [
  ['(((', [')))'], 'ellipse'],
  ['((', ['))'], 'ellipse'],
  ['([', ['])'], 'rounded'],
  ['[[', [']]'], 'rectangle'],
  ['[(', [')]'], 'cylinder'],
  ['[/', ['/]', '\\]'], 'parallelogram'],
  ['[\\', ['\\]', '/]'], 'parallelogram'],
  ['{{', ['}}'], 'hexagon'],
  ['[', [']'], 'rectangle'],
  ['(', [')'], 'rounded'],
  ['{', ['}'], 'diamond'],
  ['>', [']'], 'rectangle'],
]

/** Mermaid's newer `A@{ shape: … }` names (and their aliases) → the nearest DevDock shape. */
const SHAPE_NAMES: Record<string, Shape> = {}
const shapeAliases: [Shape, string][] = [
  ['rectangle', 'rect rectangle proc process subproc subprocess subroutine fr-rect framed-rectangle div-rect div-proc divided-rectangle divided-process lin-rect lin-proc lined-rectangle lined-process shaded-process win-pane internal-storage window-pane notch-rect card notched-rectangle tag-rect tag-proc tagged-rectangle tagged-process odd flag bolt com-link lightning-bolt delay half-rounded-rectangle curv-trap curved-trapezoid display bow-rect stored-data bow-tie-rectangle notch-pent loop-limit notched-pentagon fork join hourglass collate'],
  ['rounded', 'rounded event stadium pill terminal'],
  ['ellipse', 'circle circ sm-circ small-circle start dbl-circ double-circle fr-circ framed-circle stop f-circ filled-circle junction cross-circ crossed-circle summary'],
  ['diamond', 'diam diamond decision question'],
  ['hexagon', 'hex hexagon prepare'],
  ['cylinder', 'cyl cylinder db database h-cyl horizontal-cylinder das direct-access-storage lin-cyl lined-cylinder disk'],
  ['parallelogram', 'lean-r lean-right in-out lean-l lean-left out-in trap-b trapezoid-bottom priority trap-t trapezoid-top manual inv-trapezoid trapezoid sl-rect sloped-rectangle manual-input'],
  ['document', 'doc document docs documents st-doc stacked-document lin-doc lined-document tag-doc tagged-document st-rect stacked-rectangle processes procs'],
  ['cloud', 'cloud'],
  ['triangle', 'tri triangle extract flip-tri flipped-triangle manual-file'],
  ['text', 'text comment brace brace-l brace-r braces'],
]
for (const [shape, names] of shapeAliases) for (const name of names.split(' ')) SHAPE_NAMES[name] = shape

type NodeRef = { id: string; shape?: Shape; label?: string; classes: string[] }
type Link = { label: string; dashed: boolean; start: boolean; end: boolean; hidden: boolean }

/** A small cursor over one statement. */
class Cursor {
  i = 0
  readonly s: string
  constructor(s: string) {
    this.s = s
  }
  get done() {
    return this.i >= this.s.length
  }
  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++
  }
  sticky(re: RegExp): RegExpExecArray | null {
    re.lastIndex = this.i
    const m = re.exec(this.s)
    if (m) this.i = re.lastIndex
    return m
  }
  startsWith(text: string) {
    return this.s.startsWith(text, this.i)
  }
  /** A "quoted string" at the cursor (no escapes in Mermaid; #quot; is the escape). */
  quoted(): string | null {
    if (this.s[this.i] !== '"') return null
    const end = this.s.indexOf('"', this.i + 1)
    if (end === -1) return null
    const text = this.s.slice(this.i, end + 1)
    this.i = end + 1
    return text
  }
}

/** A node's bracketed text: `[Text]`, `{"Quoted"}`, `[/Lean/]`. Unquoted text may nest the same bracket. */
function readBracket(c: Cursor): { shape: Shape; label: string } | null {
  const start = c.i
  for (const [open, closers, shape] of BRACKETS) {
    if (!c.startsWith(open)) continue
    c.i += open.length
    const textStart = c.i
    c.ws()
    const quoted = c.quoted()
    if (quoted !== null) {
      c.ws()
      const closer = closers.find((close) => c.startsWith(close))
      if (closer) {
        c.i += closer.length
        return { shape, label: cleanLabel(quoted) }
      }
      c.i = textStart
    }
    // Unquoted: up to the first closer, counting nested pairs of a one-character bracket.
    const nest = open.length === 1 && open !== '>' ? open : null
    const pair = nest ? { '[': ']', '(': ')', '{': '}' }[nest] : null
    let depth = 0
    for (let j = textStart; j < c.s.length; j++) {
      if (nest && c.s[j] === nest) depth++
      else if (depth > 0 && c.s[j] === pair) {
        depth--
        continue
      }
      const closer = depth === 0 ? closers.find((close) => c.s.startsWith(close, j)) : undefined
      if (closer) {
        c.i = j + closer.length
        return { shape, label: cleanLabel(c.s.slice(textStart, j)) }
      }
    }
    c.i = start
    return null
  }
  return null
}

/** `@{ shape: rounded, label: "Hi" }` after a node id. */
function readShapeData(c: Cursor): { shape?: Shape; label?: string } | null {
  if (!c.startsWith('@{')) return null
  let quote = false
  for (let j = c.i + 2; j < c.s.length; j++) {
    if (c.s[j] === '"') quote = !quote
    else if (!quote && c.s[j] === '}') {
      const body = c.s.slice(c.i + 2, j)
      c.i = j + 1
      const out: { shape?: Shape; label?: string } = {}
      for (const part of splitOutside(body, ',')) {
        const colon = part.indexOf(':')
        if (colon === -1) continue
        const key = part.slice(0, colon).trim()
        const value = part.slice(colon + 1).trim()
        if (key === 'shape') out.shape = SHAPE_NAMES[value.replace(/^"|"$/g, '').toLowerCase()] ?? 'rectangle'
        if (key === 'label') out.label = cleanLabel(value)
      }
      return out
    }
  }
  return null
}

function readNode(c: Cursor): NodeRef | null {
  c.ws()
  const id = c.sticky(ID_RE)?.[0]
  if (!id) return null
  const ref: NodeRef = { id, classes: [] }
  // Brackets usually touch the id; a space before [ ( { is tolerated.
  const save = c.i
  c.ws()
  // `>text]` (a flag) must touch the id: after a space, `>` belongs to something else.
  const bracket = c.i !== save && c.s[c.i] === '>' ? null : readBracket(c)
  if (bracket) Object.assign(ref, bracket)
  else c.i = save
  const data = readShapeData(c)
  if (data) {
    if (data.shape) ref.shape = data.shape
    if (data.label !== undefined) ref.label = data.label
    // `A@{ shape: … }` alone: the label is still the id.
    ref.shape ??= 'rectangle'
  }
  while (c.startsWith(':::')) {
    c.i += 3
    const cls = c.sticky(/[\w-]+/y)?.[0]
    if (!cls) return null
    ref.classes.push(cls)
  }
  return ref
}

function readNodeGroup(c: Cursor): NodeRef[] | null {
  const first = readNode(c)
  if (!first) return null
  const group = [first]
  for (;;) {
    const save = c.i
    c.ws()
    if (c.s[c.i] !== '&') {
      c.i = save
      return group
    }
    c.i++
    const next = readNode(c)
    if (!next) return null
    group.push(next)
  }
}

/** The closer of a `-- text -->` style link, by its opener. */
const TEXT_CLOSERS: Record<string, RegExp> = {
  '--': /(-{2,})(>|[ox](?=[\s|"]|$))?/g,
  '==': /(={2,})(>|[ox](?=[\s|"]|$))?/g,
  '-.': /(\.+-)(>|[ox](?=[\s|"]|$))?/g,
}

function readLink(c: Cursor): Link | null {
  c.ws()
  c.sticky(EDGE_ID_RE) // `e1@-->`: edge ids are only for styling, so they're dropped.
  const begin = c.i

  // `A -- text --> B`, `A == text ==> B`, `A -. text .-> B`
  const opener = c.sticky(/(<|[ox](?=[-=]))?(--|==|-\.)[ \t]+/y)
  if (opener) {
    const kind = opener[2]
    const textStart = c.i
    let textEnd = -1
    let closer: RegExpExecArray | null = null
    const quoted = c.quoted()
    if (quoted !== null) {
      c.ws()
      const re = new RegExp(TEXT_CLOSERS[kind].source, 'y')
      re.lastIndex = c.i
      closer = re.exec(c.s)
      textEnd = c.i
      if (closer) c.i = re.lastIndex
    } else {
      const re = new RegExp(TEXT_CLOSERS[kind].source, 'g')
      re.lastIndex = textStart
      closer = re.exec(c.s)
      if (closer) {
        textEnd = closer.index
        c.i = re.lastIndex
      }
    }
    if (closer) {
      const label = cleanLabel(quoted ?? c.s.slice(textStart, textEnd))
      return withPipeLabel(c, {
        label,
        dashed: kind === '-.',
        start: Boolean(opener[1]),
        end: Boolean(closer[2]),
        hidden: false,
      })
    }
    c.i = begin
  }

  // `-->`, `---`, `-.->`, `==>`, `<-->`, `--o`, `--x`, `~~~`
  const plain = c.sticky(/(<|[ox](?=[-=.]))?(-\.+-|-{2,}|={2,}|~{3,})(>|[ox](?=[\s|"]|$))?/y)
  if (!plain) return null
  return withPipeLabel(c, {
    label: '',
    dashed: plain[2].includes('.'),
    start: Boolean(plain[1]),
    end: Boolean(plain[3]),
    hidden: plain[2].startsWith('~'),
  })
}

/** `-->|text|`: the label between pipes after a link. */
function withPipeLabel(c: Cursor, link: Link): Link | null {
  const save = c.i
  c.ws()
  if (c.s[c.i] !== '|') {
    c.i = save
    return link
  }
  c.i++
  const quoted = c.quoted()
  const end = c.s.indexOf('|', c.i)
  if (end === -1) return null
  const label = quoted ?? c.s.slice(c.i, end)
  c.i = end + 1
  return { ...link, label: cleanLabel(label) }
}

/** One statement: a node, or nodes joined by links. Null unless the whole statement is understood. */
function readChain(text: string): { groups: NodeRef[][]; links: Link[] } | null {
  const c = new Cursor(text)
  const first = readNodeGroup(c)
  if (!first) return null
  const groups = [first]
  const links: Link[] = []
  for (;;) {
    c.ws()
    if (c.done) return { groups, links }
    const link = readLink(c)
    if (!link) return null
    const next = readNodeGroup(c)
    if (!next) return null
    links.push(link)
    groups.push(next)
  }
}

/** Statements on a line: `;` separates them, except inside quotes and brackets. */
function splitStatements(line: string): string[] {
  return splitOutside(line, ';')
    .map((s) => s.trim())
    .filter(Boolean)
}

type Line = { n: number; text: string }

/** The code's lines after the header, without blanks, comments and directives. */
function bodyLines(code: string): { header: Line | null; lines: Line[] } {
  const all = code.split(/\r?\n/).map((text, i) => ({ n: i + 1, text }))
  let i = 0
  // Front matter (`---` … `---`) before the header.
  while (i < all.length && all[i].text.trim() === '') i++
  if (all[i]?.text.trim() === '---') {
    const close = all.findIndex((l, j) => j > i && l.text.trim() === '---')
    if (close !== -1) i = close + 1
  }
  const meaningful = (l: Line) => l.text.trim() !== '' && !l.text.trim().startsWith('%%')
  while (i < all.length && !meaningful(all[i])) i++
  const header = all[i] ?? null
  const lines: Line[] = []
  let inDescription = false
  for (const line of all.slice(i + 1)) {
    // An `accDescr { … }` block (accessibility text) can span lines.
    if (inDescription) {
      if (line.text.includes('}')) inDescription = false
      continue
    }
    if (/^\s*accDescr\s*\{/.test(line.text)) {
      inDescription = !line.text.includes('}')
      continue
    }
    if (meaningful(line)) lines.push(line)
  }
  return { header, lines }
}

function parseFlowchart(header: Line, lines: Line[]): ParseResult {
  const dir = /\b(TB|TD|BT|LR|RL)\b/i.exec(header.text)?.[1]?.toUpperCase()
  const direction: Direction = !dir || dir === 'TD' ? 'TB' : (dir as Direction)
  const skipped: Skipped[] = []

  const nodes = new Map<string, GraphNode & { defined: boolean; classes: string[]; own: Style }>()
  const groups = new Map<string, GraphGroup & { classes: string[]; own: Style }>()
  const edges: (GraphEdge & { own: Style })[] = []
  const classDefs = new Map<string, Style>()
  /** linkStyle refers to links by their position, hidden ones included. */
  const linkStyles: { index: number | 'default'; style: Style }[] = []
  const stack: string[] = []
  let anonymous = 0

  const touch = (ref: NodeRef) => {
    let node = nodes.get(ref.id)
    if (!node) {
      node = { id: ref.id, label: ref.id, shape: 'rectangle', style: {}, defined: false, classes: [], own: {} }
      nodes.set(ref.id, node)
    }
    if (ref.shape) {
      node.shape = ref.shape
      node.label = ref.label ?? node.label
      node.defined = true
    }
    node.classes.push(...ref.classes)
    // A node belongs to the first subgraph it's mentioned in.
    const inside = stack[stack.length - 1]
    if (inside && node.parent === undefined && inside !== ref.id) node.parent = inside
    return node
  }

  const statement = (text: string) => {
    let m: RegExpExecArray | null
    if ((m = /^subgraph\b\s*(.*)$/.exec(text))) {
      const rest = m[1].trim()
      let id: string
      let label: string
      const titled = /^([\p{L}\p{N}_][\p{L}\p{N}_.-]*)\s*\[(.*)\]$/u.exec(rest)
      if (!rest) {
        id = `subgraph-${++anonymous}`
        label = ''
      } else if (titled) {
        id = titled[1]
        label = cleanLabel(titled[2])
      } else {
        label = cleanLabel(rest)
        id = rest.replace(/^"|"$/g, '')
      }
      const parent = stack[stack.length - 1]
      if (!groups.has(id)) groups.set(id, { id, label, parent, style: {}, classes: [], own: {} })
      stack.push(id)
      return true
    }
    if (text === 'end') {
      if (stack.length === 0) return false
      stack.pop()
      return true
    }
    if (/^direction\s+(TB|TD|BT|LR|RL)$/i.test(text)) return true // a subgraph's own direction: the layout uses one
    if ((m = /^classDef\s+(\S+)\s+(.+)$/.exec(text))) {
      const style = parseStyle(m[2])
      for (const name of m[1].split(',')) classDefs.set(name.trim(), style)
      return true
    }
    if ((m = /^class\s+(.+?)\s+([\w-]+)$/.exec(text))) {
      for (const id of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        const target = groups.get(id) ?? nodes.get(id) ?? touch({ id, classes: [] })
        target.classes.push(m[2])
      }
      return true
    }
    if ((m = /^style\s+(\S+)\s+(.+)$/.exec(text))) {
      const target = groups.get(m[1]) ?? nodes.get(m[1]) ?? touch({ id: m[1], classes: [] })
      Object.assign(target.own, parseStyle(m[2]))
      return true
    }
    if ((m = /^linkStyle\s+(default|[\d,\s]+?)\s+(\S.*)$/.exec(text))) {
      const style = parseStyle(m[2])
      if (m[1] === 'default') linkStyles.push({ index: 'default', style })
      else for (const i of m[1].split(',')) linkStyles.push({ index: Number(i.trim()), style })
      return true
    }
    // Interactions and accessibility text don't draw anything.
    if (/^(click|callback|href|accTitle|accDescr|title)\b/.test(text)) return true

    const chain = readChain(text)
    if (!chain) return false
    const refs = chain.groups.map((group) => group.map(touch))
    chain.links.forEach((link, i) => {
      for (const a of refs[i]) {
        for (const b of refs[i + 1]) {
          // `A <-- B` is drawn as B --> A.
          const reverse = link.start && !link.end
          edges.push({
            from: reverse ? b.id : a.id,
            to: reverse ? a.id : b.id,
            label: link.label,
            dashed: link.dashed,
            arrows: link.start && link.end ? 'both' : link.start || link.end ? 'end' : 'none',
            hidden: link.hidden,
            own: {},
          })
        }
      }
    })
    return true
  }

  for (const line of lines) {
    // A comment after code (`A --> B %% why`).
    const text = line.text.trim().replace(/\s%%(?!\{).*$/, '')
    for (const part of splitStatements(text)) if (!statement(part)) skipped.push({ line: line.n, text: part })
  }

  // A node id that names a subgraph, and was never given a shape, is the subgraph.
  for (const [id, node] of nodes) {
    if (groups.has(id) && !node.defined) {
      const group = groups.get(id)!
      group.classes.push(...node.classes)
      Object.assign(group.own, node.own)
      nodes.delete(id)
    }
  }
  for (const node of nodes.values()) if (node.parent && !groups.has(node.parent)) delete node.parent

  const resolve = (classes: string[], own: Style): Style => ({
    ...classDefs.get('default'),
    ...Object.assign({}, ...classes.map((c) => classDefs.get(c) ?? {})),
    ...own,
  })
  edges.forEach((edge, i) => {
    const style = Object.assign(
      {},
      ...linkStyles.filter((s) => s.index === 'default' || s.index === i).map((s) => s.style),
    ) as Style
    if (style.stroke && style.stroke !== 'default') edge.color = style.stroke
    if (style.dashed) edge.dashed = true
  })

  const graph: MermaidGraph = {
    kind: 'flowchart',
    direction,
    nodes: [...nodes.values()].map(({ defined: _d, classes, own, ...node }) => ({ ...node, style: resolve(classes, own) })),
    groups: [...groups.values()].map(({ classes, own, ...group }) => ({ ...group, style: resolve(classes, own) })),
    edges: edges.map(({ own: _own, ...edge }) => edge),
  }
  return finish(graph, skipped)
}

// ------------------------------------------------------------ ER diagrams

const ENTITY = String.raw`("[^"]+"|[\p{L}\p{N}_][\p{L}\p{N}_*-]*)(?:\s*\[\s*("[^"]*"|[^\]]*)\s*\])?`
const LEFT_CARD: Record<string, string> = { '||': '1', '|o': '0..1', 'o|': '0..1', '}|': '1..N', '|}': '1..N', '}o': '0..N', 'o}': '0..N' }
const RIGHT_CARD: Record<string, string> = { '||': '1', 'o|': '0..1', '|o': '0..1', '|{': '1..N', '{|': '1..N', 'o{': '0..N', '{o': '0..N' }
const WORD_CARD: Record<string, string> = {
  'only one': '1', '1': '1', 'one or zero': '0..1', 'zero or one': '0..1',
  'one or more': '1..N', 'one or many': '1..N', 'many(1)': '1..N', '1+': '1..N',
  'zero or more': '0..N', 'zero or many': '0..N', 'many(0)': '0..N', '0+': '0..N',
}
const WORDS = Object.keys(WORD_CARD)
  .map((w) => w.replace(/[()+]/g, '\\$&'))
  .join('|')
const RELATION_SYMBOLS = new RegExp(String.raw`^${ENTITY}\s*([|}o][|}o])(--|\.\.)([|{o][|{o])\s*${ENTITY}\s*(?::\s*(.*))?$`, 'u')
const RELATION_WORDS = new RegExp(String.raw`^${ENTITY}\s+(${WORDS})\s+(to|optionally to)\s+(${WORDS})\s+${ENTITY}\s*(?::\s*(.*))?$`, 'iu')
const ENTITY_OPEN = new RegExp(String.raw`^${ENTITY}\s*\{\s*(.*)$`, 'u')
const ENTITY_ALONE = new RegExp(String.raw`^${ENTITY}$`, 'u')

/** `type name PK, FK "comment"` → a table row, `name type PK FK`. */
function attributeRow(line: string): string | null {
  const text = line.replace(/"[^"]*"\s*$/, '').trim()
  const [type, name, ...rest] = text.split(/\s+/)
  if (!type || !name) return null
  const keys = rest
    .join(' ')
    .split(/[\s,]+/)
    .filter((k) => /^(PK|FK|UK)$/i.test(k))
    .map((k) => k.toUpperCase())
  return [name, type, ...keys].join(' ')
}

function parseEr(lines: Line[]): ParseResult {
  const skipped: Skipped[] = []
  let direction: Direction = 'TB'
  const nodes = new Map<string, GraphNode & { classes: string[]; own: Style }>()
  const edges: GraphEdge[] = []
  const classDefs = new Map<string, Style>()

  const entity = (rawId: string, alias?: string) => {
    const id = rawId.replace(/^"|"$/g, '')
    let node = nodes.get(id)
    if (!node) {
      node = { id, label: id, shape: 'rectangle', style: {}, columns: [], classes: [], own: {} }
      nodes.set(id, node)
    }
    if (alias !== undefined && cleanLabel(alias)) node.label = cleanLabel(alias)
    return node
  }

  let open: (GraphNode & { columns?: string[] }) | null = null
  for (const line of lines) {
    let text = line.text.trim().replace(/\s%%(?!\{).*$/, '')
    let m: RegExpExecArray | null
    if (open) {
      if (text.startsWith('}')) {
        open = null
        continue
      }
      const closes = text.endsWith('}')
      if (closes) text = text.slice(0, -1).trim()
      if (text) {
        const row = attributeRow(text)
        if (row) open.columns!.push(row)
        else skipped.push({ line: line.n, text })
      }
      if (closes) open = null
      continue
    }
    if ((m = /^direction\s+(TB|TD|BT|LR|RL)$/i.exec(text))) {
      const d = m[1].toUpperCase()
      direction = d === 'TD' ? 'TB' : (d as Direction)
      continue
    }
    if (/^(accTitle|accDescr|title)\b/.test(text)) continue
    if ((m = /^classDef\s+(\S+)\s+(.+)$/.exec(text))) {
      const style = parseStyle(m[2])
      for (const name of m[1].split(',')) classDefs.set(name.trim(), style)
      continue
    }
    if ((m = /^class\s+(.+?)\s+([\w-]+)$/.exec(text))) {
      for (const id of m[1].split(',').map((s) => s.trim()).filter(Boolean)) entity(id).classes.push(m[2])
      continue
    }
    if ((m = /^style\s+(\S+)\s+(.+)$/.exec(text))) {
      Object.assign(entity(m[1]).own, parseStyle(m[2]))
      continue
    }
    if ((m = RELATION_SYMBOLS.exec(text))) {
      const [, a, aliasA, left, line_, right, b, aliasB, label] = m
      const from = entity(a, aliasA)
      const to = entity(b, aliasB)
      const leftCard = LEFT_CARD[left]
      const rightCard = RIGHT_CARD[right]
      if (!leftCard || !rightCard) {
        skipped.push({ line: line.n, text })
        continue
      }
      edges.push(relation(from.id, to.id, label, leftCard, rightCard, line_ === '..'))
      continue
    }
    if ((m = RELATION_WORDS.exec(text))) {
      const [, a, aliasA, left, kind, right, b, aliasB, label] = m
      const from = entity(a, aliasA)
      const to = entity(b, aliasB)
      edges.push(
        relation(from.id, to.id, label, WORD_CARD[left.toLowerCase()], WORD_CARD[right.toLowerCase()], /optionally/i.test(kind)),
      )
      continue
    }
    if ((m = ENTITY_OPEN.exec(text))) {
      const node = entity(m[1], m[2])
      const rest = m[3].trim()
      if (rest === '}' || rest.endsWith('}')) {
        const inner = rest.slice(0, -1).trim()
        if (inner) {
          const row = attributeRow(inner)
          if (row) node.columns!.push(row)
        }
      } else {
        open = node
        if (rest) {
          const row = attributeRow(rest)
          if (row) node.columns!.push(row)
        }
      }
      continue
    }
    if ((m = ENTITY_ALONE.exec(text))) {
      entity(m[1], m[2])
      continue
    }
    skipped.push({ line: line.n, text })
  }

  const graph: MermaidGraph = {
    kind: 'er',
    direction,
    nodes: [...nodes.values()].map(({ classes, own, ...node }) => ({
      ...node,
      style: { ...classDefs.get('default'), ...Object.assign({}, ...classes.map((c) => classDefs.get(c) ?? {})), ...own },
    })),
    groups: [],
    edges,
  }
  return finish(graph, skipped)
}

function relation(from: string, to: string, label: string | undefined, left: string, right: string, dashed: boolean): GraphEdge {
  const text = cleanLabel(label ?? '')
  return {
    from,
    to,
    label: text ? `${text} (${left} : ${right})` : `${left} : ${right}`,
    dashed,
    arrows: 'none',
    hidden: false,
  }
}

// ------------------------------------------------------------ entry

function finish(graph: MermaidGraph, skipped: Skipped[]): ParseResult {
  if (graph.nodes.length === 0 && graph.groups.length === 0) {
    return { ok: false, error: 'No shapes were found in this Mermaid code.', skipped }
  }
  if (graph.nodes.length + graph.groups.length > LIMITS.nodes) {
    return {
      ok: false,
      error: `This diagram has ${graph.nodes.length + graph.groups.length} shapes; up to ${LIMITS.nodes} can be imported at once.`,
      skipped,
    }
  }
  if (graph.edges.length > LIMITS.edges) {
    return { ok: false, error: `This diagram has ${graph.edges.length} links; up to ${LIMITS.edges} can be imported at once.`, skipped }
  }
  return { ok: true, graph, skipped }
}

/** Mermaid code (starting at its header; front matter and `%%` lines may come first) → a graph. */
export function parseMermaid(code: string): ParseResult {
  if (code.length > 200_000) return { ok: false, error: 'This is too much text to import at once.', skipped: [] }
  const { header, lines } = bodyLines(code)
  if (!header) return { ok: false, error: 'There is no Mermaid code here.', skipped: [] }
  const first = header.text.trim()
  if (/^(flowchart|graph|flowchart-elk)\b/i.test(first)) return parseFlowchart(header, lines)
  if (/^erDiagram\b/.test(first)) return parseEr(lines)
  const type = first.split(/\s/, 1)[0]
  return {
    ok: false,
    error: `“${type}” diagrams can't be imported yet. DevDock imports Mermaid flowcharts and ER diagrams.`,
    skipped: [],
  }
}
