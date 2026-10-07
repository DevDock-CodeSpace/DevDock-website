// Fails when the first load of the app gets heavier than agreed. Run after a build: `npm run build && npm run perf`.
//
// "First load" is what index.html makes the browser download before anything shows: the entry script, the
// chunks it preloads and the stylesheet. Everything else (the editors, diagrams, video) loads only when opened.
// Budgets are in gzipped kilobytes, with a little headroom over today's numbers. Raising one is a decision to
// make with the owner, not a way to get a build through (see .claude/skills/devdock-performance/SKILL.md).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_JS_KB = 345
const BUDGET_CSS_KB = 30
/** Libraries that must stay out of the first load (each is lazy-loaded by the screen that needs it). */
const HEAVY = [
  ['the docs/chat editor (ProseMirror / TipTap)', /ProseMirror/],
  ['the diagram editor (React Flow)', /react-flow__/],
  ['the video call (Jitsi)', /JitsiMeetExternalAPI/],
  ['code highlighting (highlight.js)', /hljs/],
]

const dist = 'dist'
if (!existsSync(join(dist, 'index.html'))) {
  console.error('No dist/index.html. Run `npm run build` first.')
  process.exit(2)
}
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const refs = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1])
const gzKb = (file) => gzipSync(readFileSync(join(dist, file))).length / 1024

let js = 0
let css = 0
const problems = []
console.log('First load (gzipped):')
for (const file of refs) {
  const kb = gzKb(file)
  const isCss = file.endsWith('.css')
  if (isCss) css += kb
  else js += kb
  console.log(`  ${kb.toFixed(1).padStart(7)} KB  ${file.replace('assets/', '')}`)
  if (!isCss) {
    const text = readFileSync(join(dist, file), 'utf8')
    for (const [name, pattern] of HEAVY) if (pattern.test(text)) problems.push(`${name} is in the first load (${file}). Lazy-load it behind the screen that needs it.`)
  }
}
console.log(`  ${js.toFixed(1).padStart(7)} KB  JavaScript  (budget ${BUDGET_JS_KB})`)
console.log(`  ${css.toFixed(1).padStart(7)} KB  CSS         (budget ${BUDGET_CSS_KB})`)
if (js > BUDGET_JS_KB) problems.push(`First-load JavaScript is ${js.toFixed(0)} KB gzipped, over the ${BUDGET_JS_KB} KB budget.`)
if (css > BUDGET_CSS_KB) problems.push(`First-load CSS is ${css.toFixed(0)} KB gzipped, over the ${BUDGET_CSS_KB} KB budget.`)

if (problems.length > 0) {
  console.error('\nPerformance check failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\nDo not just raise the budget. Find what grew (lazy-load it, drop a dependency, split the route) or ask the owner first.')
  process.exit(1)
}
console.log('\nOK: the first load is within budget and the heavy editors are still lazy.')
