// Mermaid import (src/features/diagrams/editor/mermaid/): finding code in a paste, parsing
// flowcharts and ER diagrams the way chatbots write them, and laying them out without
// overlaps. No browser.
//
//   npm run test:mermaid
import { findMermaid } from '../src/features/diagrams/editor/mermaid/detect.ts'
import { layoutGraph, mermaidToDiagram, type SavedDiagram } from '../src/features/diagrams/editor/mermaid/layout.ts'
import { cleanLabel, nearestColor, parseMermaid, type MermaidGraph } from '../src/features/diagrams/editor/mermaid/parse.ts'

function assertEquals<T>(actual: T, expected: T, message = '') {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${message ? message + ': ' : ''}expected ${b}, got ${a}`)
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function graphOf(code: string): MermaidGraph & { skipped: { line: number; text: string }[] } {
  const result = parseMermaid(code)
  if (!result.ok) throw new Error(`expected a graph, got: ${result.error}`)
  return { ...result.graph, skipped: result.skipped }
}
const node = (g: MermaidGraph, id: string) => {
  const n = g.nodes.find((x) => x.id === id)
  assert(n, `no node ${id} in ${g.nodes.map((x) => x.id).join(', ')}`)
  return n
}
const links = (g: MermaidGraph) => g.edges.map((e) => `${e.from}>${e.to}`)

// ------------------------------------------------------------ finding code in a paste

Deno.test('finds a fenced diagram inside a chatbot reply', () => {
  const reply = "Sure! Here's the flow:\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nLet me know if you want changes."
  assertEquals(findMermaid(reply), { importable: true, type: 'flowchart', code: 'flowchart TD\n  A --> B' })
})

Deno.test('finds bare code, with front matter, directives and comments before the header', () => {
  assertEquals(findMermaid('graph LR\nA-->B')?.type, 'flowchart')
  const withPreamble = '---\ntitle: Checkout\n---\n%%{init: {"theme": "dark"}}%%\n%% a comment\nflowchart LR\n  A --> B'
  assertEquals(findMermaid(withPreamble)?.code, 'flowchart LR\n  A --> B')
  assertEquals(findMermaid('erDiagram\n  A ||--o{ B : has')?.type, 'erDiagram')
})

Deno.test('finds code after a sentence, and stops at a closing fence', () => {
  const found = findMermaid('Here is the diagram:\nflowchart TD\n  A --> B\n```\nThanks')
  assertEquals(found?.code, 'flowchart TD\n  A --> B')
})

Deno.test('takes an unclosed ```mermaid fence and a fence without a language', () => {
  assertEquals(findMermaid('```mermaid\nflowchart TD\nA-->B')?.code, 'flowchart TD\nA-->B')
  assertEquals(findMermaid('```\ngraph TD\nA-->B\n```')?.code, 'graph TD\nA-->B')
})

Deno.test('ignores ordinary text and other code', () => {
  assertEquals(findMermaid('We should graph the results.\nThe flowchart is in Figma.'), null)
  assertEquals(findMermaid('graph theory is fun'), null)
  assertEquals(findMermaid('```js\nconst graph = 1\n```'), null)
  assertEquals(findMermaid(''), null)
  assertEquals(findMermaid('devdock-diagram/v1\n{"nodes":[]}'), null)
})

Deno.test('recognises other Mermaid types so it can say they are not supported', () => {
  const found = findMermaid('```mermaid\nsequenceDiagram\n  Alice->>Bob: Hi\n```')
  assertEquals(found?.importable, false)
  assertEquals(found?.type, 'sequenceDiagram')
  const parsed = parseMermaid(found!.code)
  assert(!parsed.ok && parsed.error.includes('sequenceDiagram'), 'explains the unsupported type')
})

// ------------------------------------------------------------ flowchart nodes

Deno.test('every bracket form becomes the nearest DevDock shape', () => {
  const g = graphOf(`flowchart TD
    a[Rect]
    b(Rounded)
    c([Stadium])
    d[[Subroutine]]
    e[(Database)]
    f((Circle))
    g(((Double)))
    h>Flag]
    i{Decision}
    j{{Hexagon}}
    k[/Lean right/]
    l[\\Lean left\\]
    m[/Trapezoid\\]
    n[\\Inverted/]`)
  const shapes = Object.fromEntries(g.nodes.map((n) => [n.id, [n.shape, n.label]]))
  assertEquals(shapes, {
    a: ['rectangle', 'Rect'],
    b: ['rounded', 'Rounded'],
    c: ['rounded', 'Stadium'],
    d: ['rectangle', 'Subroutine'],
    e: ['cylinder', 'Database'],
    f: ['ellipse', 'Circle'],
    g: ['ellipse', 'Double'],
    h: ['rectangle', 'Flag'],
    i: ['diamond', 'Decision'],
    j: ['hexagon', 'Hexagon'],
    k: ['parallelogram', 'Lean right'],
    l: ['parallelogram', 'Lean left'],
    m: ['parallelogram', 'Trapezoid'],
    n: ['parallelogram', 'Inverted'],
  })
})

Deno.test('the @{ shape } syntax, with aliases and unknown names', () => {
  const g = graphOf(`flowchart LR
    A@{ shape: cyl, label: "Orders DB" }
    B@{ shape: diamond }
    C@{ shape: doc, label: "Report" }
    D@{ shape: something-new, label: "New" }`)
  assertEquals(
    g.nodes.map((n) => [n.shape, n.label]),
    [
      ['cylinder', 'Orders DB'],
      ['diamond', 'B'],
      ['document', 'Report'],
      ['rectangle', 'New'],
    ],
  )
})

Deno.test('a node without brackets is a rectangle labelled with its id; the last definition wins', () => {
  const g = graphOf('flowchart TD\n  Start --> Stop\n  Start[Begin here]')
  assertEquals([node(g, 'Start').label, node(g, 'Start').shape], ['Begin here', 'rectangle'])
  assertEquals([node(g, 'Stop').label, node(g, 'Stop').shape], ['Stop', 'rectangle'])
})

Deno.test('ids may contain hyphens, dots and non-English letters', () => {
  const g = graphOf('flowchart LR\n  user-service[Users] --> api.gateway --> über[Über]\n  node-1-->node-2')
  assertEquals(links(g), ['user-service>api.gateway', 'api.gateway>über', 'node-1>node-2'])
})

Deno.test('labels: quotes, brackets inside quotes, <br>, entities, markdown and icons', () => {
  const g = graphOf(`flowchart TD
    A["Login (OAuth 2.0)"] --> B["Uses [brackets] and {braces}"]
    C[Line one<br/>Line two<br>three] --> D["Say #quot;hi#quot; &amp; wave #35;1"]
    E["\`**Bold** and _italic_\`"] --> F[fa:fa-user Customer]
    G(Unquoted (nested) parens) --> H["Literal\\nnewline"]`)
  assertEquals(node(g, 'A').label, 'Login (OAuth 2.0)')
  assertEquals(node(g, 'B').label, 'Uses [brackets] and {braces}')
  assertEquals(node(g, 'C').label, 'Line one\nLine two\nthree')
  assertEquals(node(g, 'D').label, 'Say "hi" & wave #1')
  assertEquals(node(g, 'E').label, 'Bold and italic')
  assertEquals(node(g, 'F').label, 'Customer')
  assertEquals(node(g, 'G').label, 'Unquoted (nested) parens')
  assertEquals(node(g, 'H').label, 'Literal\nnewline')
})

Deno.test('cleanLabel strips tags and trims each line', () => {
  assertEquals(cleanLabel('  <b>Bold</b>   text  '), 'Bold text')
  assertEquals(cleanLabel('"quoted"'), 'quoted')
  assertEquals(cleanLabel('#9829; love'), '♥ love')
  assertEquals(cleanLabel('x'.repeat(400)).length, 300)
})

// ------------------------------------------------------------ flowchart links

Deno.test('link types: arrows, open, dotted, thick, both ends, circle and cross ends, invisible', () => {
  const g = graphOf(`flowchart LR
    A --> B
    B --- C
    C -.-> D
    D -.- E
    E ==> F
    F <--> G
    G --o H
    H --x I
    I ~~~ J
    J ----> K
    K <-.-> L
    L <-- M`)
  const kinds = g.edges.map((e) => `${e.from}${e.to}:${e.arrows}${e.dashed ? ',dashed' : ''}${e.hidden ? ',hidden' : ''}`)
  assertEquals(kinds, [
    'AB:end',
    'BC:none',
    'CD:end,dashed',
    'DE:none,dashed',
    'EF:end',
    'FG:both',
    'GH:end',
    'HI:end',
    'IJ:none,hidden',
    'JK:end',
    'KL:both,dashed',
    'ML:end',
  ])
})

Deno.test('link labels in pipes and inline, quoted or not', () => {
  const g = graphOf(`flowchart TD
    A -->|Yes| B
    A --> |"No, retry"| C
    A -- Maybe later --> D
    A -. optional .-> E
    A == "Must (always)" ==> F
    A---|plain|G
    A-->|Yes|H`)
  assertEquals(
    g.edges.map((e) => [e.to, e.label, e.dashed]),
    [
      ['B', 'Yes', false],
      ['C', 'No, retry', false],
      ['D', 'Maybe later', false],
      ['E', 'optional', true],
      ['F', 'Must (always)', false],
      ['G', 'plain', false],
      ['H', 'Yes', false],
    ],
  )
})

Deno.test('chains, & groups, semicolons and edge ids', () => {
  const g = graphOf('flowchart LR\n  A --> B --> C\n  D & E --> F & G\n  H-->I; I-->J;\n  K e1@--> L')
  assertEquals(links(g), ['A>B', 'B>C', 'D>F', 'D>G', 'E>F', 'E>G', 'H>I', 'I>J', 'K>L'])
})

Deno.test('nodes can be defined inline in a link, with spaces before brackets', () => {
  const g = graphOf('graph TD\n  A[Start] --> B{OK?}\n  B -->|yes| C (Done)')
  assertEquals([node(g, 'C').shape, node(g, 'C').label], ['rounded', 'Done'])
})

// ------------------------------------------------------------ subgraphs

Deno.test('subgraph titles in every form, and nodes belong where first mentioned', () => {
  const g = graphOf(`flowchart TB
    subgraph one [First group]
      a1 --> a2
    end
    subgraph "Second group"
      b1
    end
    subgraph three
      c1
    end
    subgraph Fourth group with spaces
      d1
    end
    subgraph five["Fifth"]
      a2
    end
    a1 --> b1`)
  assertEquals(
    g.groups.map((gr) => [gr.id, gr.label]),
    [
      ['one', 'First group'],
      ['Second group', 'Second group'],
      ['three', 'three'],
      ['Fourth group with spaces', 'Fourth group with spaces'],
      ['five', 'Fifth'],
    ],
  )
  assertEquals(node(g, 'a2').parent, 'one')
  assertEquals(node(g, 'b1').parent, 'Second group')
})

Deno.test('nested subgraphs, links to subgraphs, and an unclosed subgraph', () => {
  const g = graphOf(`flowchart LR
    subgraph cloud [Cloud]
      subgraph k8s [Kubernetes]
        api --> worker
      end
      db[(DB)]
    end
    client --> cloud
    k8s --> db
    subgraph open
      x`)
  assertEquals(g.groups.find((gr) => gr.id === 'k8s')?.parent, 'cloud')
  assertEquals(node(g, 'api').parent, 'k8s')
  assertEquals(node(g, 'db').parent, 'cloud')
  assertEquals(node(g, 'client').parent, undefined)
  assertEquals(node(g, 'x').parent, 'open')
  assert(!g.nodes.some((n) => n.id === 'cloud' || n.id === 'k8s'), 'subgraph ids are not also shapes')
  assertEquals(links(g).slice(1), ['client>cloud', 'k8s>db'])
})

Deno.test('a stray end is reported, the rest still imports', () => {
  const g = graphOf('flowchart TD\n  A --> B\n  end\n  B --> C')
  assertEquals(links(g), ['A>B', 'B>C'])
  assertEquals(g.skipped, [{ line: 3, text: 'end' }])
})

// ------------------------------------------------------------ styles

Deno.test('classDef, class, :::, style and the default class map to DevDock colors', () => {
  const g = graphOf(`flowchart TD
    classDef default fill:#f0f0f0,stroke:#999
    classDef danger fill:#ffcccc,stroke:#cc0000,stroke-width:2px
    classDef ok fill:#d4edda,stroke-dasharray: 5 5
    A --> B:::danger --> C
    class C ok
    style A fill:#cce5ff,stroke:#004085,font-weight:bold
    D[Plain]`)
  assertEquals(node(g, 'A').style, { fill: 'blue', stroke: 'blue', bold: true })
  assertEquals(node(g, 'B').style, { fill: 'red', stroke: 'red' })
  assertEquals(node(g, 'C').style, { fill: 'green', stroke: 'default', dashed: true })
  assertEquals(node(g, 'D').style, { fill: 'default', stroke: 'default' })
})

Deno.test('linkStyle colors links by position; styles on subgraphs apply', () => {
  const g = graphOf(`flowchart LR
    A --> B
    B --> C
    subgraph S [Group]
      C
    end
    linkStyle 1 stroke:#ff0000,stroke-dasharray:3
    style S fill:none,stroke:#6f42c1,stroke-dasharray: 4`)
  assertEquals([g.edges[0].color, g.edges[0].dashed], [undefined, false])
  assertEquals([g.edges[1].color, g.edges[1].dashed], ['red', true])
  assertEquals(g.groups[0].style, { fill: 'none', stroke: 'violet', dashed: true })
})

Deno.test('nearestColor buckets hues and keeps grays neutral', () => {
  const cases: [string, string | null][] = [
    ['#f00', 'red'], ['#ff8800', 'orange'], ['#ffd700', 'amber'], ['yellow', 'amber'], ['#2e7d32', 'green'],
    ['#20c997', 'teal'], ['#1e90ff', 'blue'], ['rgb(0, 0, 255)', 'blue'], ['#6f42c1', 'violet'], ['hotpink', 'pink'],
    ['#fff', 'default'], ['#000000', 'default'], ['#999', 'default'], ['hsl(120, 60%, 40%)', 'green'], ['nonsense', null],
  ]
  for (const [input, expected] of cases) assertEquals(nearestColor(input), expected, input)
})

// ------------------------------------------------------------ comments, directives, junk

Deno.test('comments, click, accessibility and direction lines are ignored without complaint', () => {
  const g = graphOf(`flowchart TD
    %% a comment
    accTitle: Checkout flow
    accDescr {
      A long description
      over lines
    }
    A --> B %% trailing comment
    click A "https://example.com" "Open"
    subgraph S
      direction LR
      C
    end`)
  assertEquals(links(g), ['A>B'])
  assertEquals(g.skipped, [])
})

Deno.test('lines that are not Mermaid are skipped and listed with their line numbers', () => {
  const g = graphOf('flowchart TD\n  A --> B\n  This is an explanation, not code.\n  B --> C\n  D --> ((')
  assertEquals(links(g), ['A>B', 'B>C'])
  assertEquals(
    g.skipped.map((s) => s.line),
    [3, 5],
  )
})

Deno.test('errors: nothing to import, unsupported types, too large', () => {
  const empty = parseMermaid('flowchart TD\n  %% nothing')
  assert(!empty.ok && /No shapes/.test(empty.error), 'empty flowchart')
  const gantt = parseMermaid('gantt\n  title A')
  assert(!gantt.ok && /gantt/.test(gantt.error), 'gantt')
  const many = 'flowchart TD\n' + Array.from({ length: 320 }, (_, i) => `  n${i} --> n${i + 1}`).join('\n')
  const big = parseMermaid(many)
  assert(!big.ok && /up to 300/.test(big.error), 'too many shapes')
})

// ------------------------------------------------------------ ER diagrams

Deno.test('ER: entities with attributes become table rows; relationships carry cardinality', () => {
  const g = graphOf(`erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
    CUSTOMER {
        string name
        string custNumber PK "the id"
        int age
    }
    ORDER {
        int orderNumber PK
        string customerId FK
        varchar(255) note
        int id PK, FK
    }
    PRODUCT["Product item"] { }`)
  assertEquals(node(g, 'CUSTOMER').columns, ['name string', 'custNumber string PK', 'age int'])
  assertEquals(node(g, 'ORDER').columns, ['orderNumber int PK', 'customerId string FK', 'note varchar(255)', 'id int PK FK'])
  assertEquals(node(g, 'LINE-ITEM').columns, [])
  assertEquals(node(g, 'PRODUCT').label, 'Product item')
  assertEquals(
    g.edges.map((e) => [e.from, e.to, e.label, e.dashed, e.arrows]),
    [
      ['CUSTOMER', 'ORDER', 'places (1 : 0..N)', false, 'none'],
      ['ORDER', 'LINE-ITEM', 'contains (1 : 1..N)', false, 'none'],
      ['CUSTOMER', 'DELIVERY-ADDRESS', 'uses (1..N : 1..N)', true, 'none'],
    ],
  )
  assertEquals(g.skipped, [])
})

Deno.test('ER: word cardinalities, quoted names, no label, one-line blocks, direction', () => {
  const g = graphOf(`erDiagram
    direction LR
    CAR 1 to zero or more NAMED-DRIVER : allows
    PERSON only one optionally to one or more "Bank Account" : owns
    A ||--|| B
    TAG { string name }`)
  assertEquals(g.direction, 'LR')
  assertEquals(
    g.edges.map((e) => [e.from, e.to, e.label, e.dashed]),
    [
      ['CAR', 'NAMED-DRIVER', 'allows (1 : 0..N)', false],
      ['PERSON', 'Bank Account', 'owns (1 : 1..N)', true],
      ['A', 'B', '1 : 1', false],
    ],
  )
  assertEquals(node(g, 'TAG').columns, ['name string'])
})

Deno.test('ER: a bad line is skipped, the rest imports', () => {
  const g = graphOf('erDiagram\n  USER ||--o{ POST : writes\n  USER >< POST\n  POST {\n    int id PK\n    ???\n  }')
  assertEquals(links(g), ['USER>POST'])
  assertEquals(
    g.skipped.map((s) => s.text),
    ['USER >< POST', '???'],
  )
})

// ------------------------------------------------------------ layout

type Rect = { x: number; y: number; w: number; h: number; id: string; parent?: string; label: string }

/** Absolute rectangles of a saved diagram (tables' height estimated like the layout does). */
function rects(d: SavedDiagram): Rect[] {
  const byId = new Map(d.nodes.map((n) => [n.id, n]))
  const abs = (id: string): { x: number; y: number } => {
    const n = byId.get(id)!
    if (!n.parentId) return n.position
    const p = abs(n.parentId)
    return { x: p.x + n.position.x, y: p.y + n.position.y }
  }
  return d.nodes.map((n) => {
    const rows = n.data.body ? n.data.body.split('\n') : ['']
    const twoKeys = rows.filter((r) => /\bPK\b/.test(r) && /\bFK\b/.test(r)).length
    return {
      ...abs(n.id),
      w: n.width,
      h: n.height ?? 34 + rows.length * 25 + twoKeys * 13,
      id: n.id,
      parent: n.parentId,
      label: n.data.label,
    }
  })
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

/** The geometry every import must have: valid references, children inside parents, siblings apart. */
function checkLayout(d: SavedDiagram, name: string) {
  const ids = new Set(d.nodes.map((n) => n.id))
  assertEquals(ids.size, d.nodes.length, `${name}: unique ids`)
  const order = d.nodes.map((n) => n.id)
  for (const n of d.nodes) {
    if (n.parentId) {
      assert(ids.has(n.parentId), `${name}: parent exists`)
      assert(order.indexOf(n.parentId) < order.indexOf(n.id), `${name}: parents come first`)
    }
    assert(n.width > 0 && (n.height === undefined || n.height > 0), `${name}: positive size`)
  }
  for (const e of d.edges) {
    assert(ids.has(e.source) && ids.has(e.target), `${name}: edge ends exist`)
    assert(['t', 'r', 'b', 'l'].includes(e.sourceHandle) && ['t', 'r', 'b', 'l'].includes(e.targetHandle), `${name}: handles`)
  }
  const all = rects(d)
  assertEquals(Math.min(...all.map((r) => r.x)), 0, `${name}: starts at x 0`)
  assertEquals(Math.min(...all.map((r) => r.y)), 0, `${name}: starts at y 0`)
  const byId = new Map(all.map((r) => [r.id, r]))
  for (const r of all) if (r.parent) assert(inside(r, byId.get(r.parent)!), `${name}: "${r.label}" sits inside its container`)
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [a, b] = [all[i], all[j]]
      if (a.parent !== b.parent) continue
      assert(!overlaps(a, b), `${name}: "${a.label}" and "${b.label}" overlap`)
    }
  }
}

/** Diagrams the way ChatGPT, Claude and Gemini typically write them. */
const SAMPLES: Record<string, string> = {
  'login flow (chatbot style)': `\`\`\`mermaid
flowchart TD
    A([User opens app]) --> B{Has session?}
    B -->|Yes| C[Show dashboard]
    B -->|No| D[Show login page]
    D --> E[/Enter email and password/]
    E --> F{Valid credentials?}
    F -->|No| G[Show error message]
    G --> D
    F -->|Yes| H[(Create session)]
    H --> C
    C --> I([Done])
\`\`\``,
  'architecture with subgraphs': `flowchart LR
    subgraph Client["Client Layer"]
        Web["Web App (React)"]
        Mobile["Mobile App"]
    end
    subgraph Edge["Edge"]
        CDN[CDN]
        GW[API Gateway]
    end
    subgraph Services["Microservices"]
        direction TB
        Auth[Auth Service]
        Orders[Order Service]
        Pay[Payment Service]
    end
    subgraph Data["Data Layer"]
        PG[(PostgreSQL)]
        Redis[(Redis Cache)]
        S3[(Object Storage)]
    end
    Web --> CDN
    Mobile --> GW
    CDN --> GW
    GW --> Auth & Orders & Pay
    Orders --> PG
    Pay --> PG
    Auth --> Redis
    Orders -.-> S3
    classDef svc fill:#e3f2fd,stroke:#1565c0
    class Auth,Orders,Pay svc`,
  'CI pipeline with styles': `graph LR
    A[Push to branch] --> B[Run lint]
    B --> C[Run tests]
    C --> D{All green?}
    D -- yes --> E[Build image]
    D -- no --> F[Notify author]
    E --> G[Deploy to staging]
    G --> H{Manual approval}
    H -->|approved| I[Deploy to prod]
    H -->|rejected| F
    style I fill:#c8e6c9,stroke:#2e7d32
    style F fill:#ffcdd2,stroke:#c62828`,
  'nested groups and links to groups': `flowchart TB
    user((User)) --> lb
    subgraph aws [AWS]
        lb[Load balancer]
        subgraph vpc [VPC]
            subgraph pub [Public subnet]
                web1[Web 1]
                web2[Web 2]
            end
            subgraph priv [Private subnet]
                app[App server]
                db[(RDS)]
            end
        end
    end
    lb --> web1 & web2
    web1 & web2 --> app
    app --> db
    pub --> priv
    empty_group_ref --> aws
    subgraph lonely [Nothing inside]
    end`,
  'long labels and cycles': `flowchart TD
    start["A student submits an assignment through the course portal before the deadline"] --> check{"Is the submission complete and in the right format?"}
    check -->|"No, something is missing"| back["Send it back to the student with comments"]
    back --> start
    check -->|Yes| grade["Instructor grades it"]
    grade --> publish["Publish the grade"]
    publish --> start`,
  'school ER diagram': `erDiagram
    STUDENT ||--o{ ENROLLMENT : has
    COURSE ||--o{ ENROLLMENT : includes
    INSTRUCTOR ||--|{ COURSE : teaches
    COURSE ||--o{ ASSIGNMENT : contains
    ASSIGNMENT ||--o{ SUBMISSION : receives
    STUDENT ||--o{ SUBMISSION : makes
    STUDENT {
        uuid id PK
        string full_name
        string email
        timestamp created_at
    }
    COURSE {
        uuid id PK
        uuid instructor_id FK
        string title
        text description
    }
    ENROLLMENT {
        uuid student_id PK, FK
        uuid course_id PK, FK
        date enrolled_on
    }
    INSTRUCTOR {
        uuid id PK
        string name
    }
    ASSIGNMENT {
        uuid id PK
        uuid course_id FK
        string title
        timestamp due_at
    }
    SUBMISSION {
        uuid id PK
        uuid assignment_id FK
        uuid student_id FK
        int score
    }`,
  'bottom-up and right-left': `flowchart BT
    a --> b --> c
    a --> c
    subgraph g [Group]
      d --> e
    end
    c --> g`,
  'right to left': `flowchart RL
    x[Input] --> y[Transform] --> z[Output]`,
}

Deno.test('the layout check itself catches overlaps and shapes outside their container', () => {
  const shape = (id: string, x: number, y: number, parentId?: string) => ({
    id,
    type: 'shape' as const,
    position: { x, y },
    width: 100,
    height: 50,
    ...(parentId ? { parentId } : {}),
    data: { label: id, fill: 'default' as const, stroke: 'default' as const, line: 'solid' as const, text: 'md' as const, bold: false },
  })
  const throws = (d: SavedDiagram) => {
    try {
      checkLayout(d, 'bad')
    } catch {
      return true
    }
    return false
  }
  assert(throws({ nodes: [shape('a', 0, 0), shape('b', 50, 20)], edges: [] }), 'overlap is caught')
  const box = { ...shape('box', 0, 0), type: 'container' as const, width: 120, height: 80 }
  assert(throws({ nodes: [box, shape('c', 60, 10, 'box')], edges: [] }), 'outside its container is caught')
  assert(!throws({ nodes: [shape('a', 0, 0), shape('b', 200, 0)], edges: [] }), 'apart is fine')
})

Deno.test('realistic diagrams lay out with no overlaps and valid references', () => {
  for (const [name, text] of Object.entries(SAMPLES)) {
    const found = findMermaid(text)
    assert(found?.importable, `${name}: found`)
    const result = mermaidToDiagram(found.code)
    assert(result.ok, `${name}: ${result.ok ? '' : result.error}`)
    assertEquals(result.skipped, [], `${name}: nothing skipped`)
    checkLayout(result.diagram, name)
  }
})

Deno.test('layout: what each Mermaid element becomes in the saved format', () => {
  const result = mermaidToDiagram(found(SAMPLES['architecture with subgraphs']))
  assert(result.ok, 'imports')
  const { nodes, edges } = result.diagram
  assertEquals(result.counts, { shapes: 10, groups: 4, connectors: 10 })
  const containers = nodes.filter((n) => n.type === 'container')
  assertEquals(containers.map((c) => c.data.label).sort(), ['Client Layer', 'Data Layer', 'Edge', 'Microservices'])
  const auth = nodes.find((n) => n.data.label === 'Auth Service')!
  assertEquals([auth.type, auth.data.shape, auth.data.fill, auth.data.stroke], ['shape', 'rectangle', 'blue', 'blue'])
  assertEquals(nodes.find((n) => n.id === auth.parentId)?.data.label, 'Microservices')
  const pg = nodes.find((n) => n.data.label === 'PostgreSQL')!
  assertEquals(pg.data.shape, 'cylinder')
  const dashed = edges.filter((e) => e.data.line === 'dashed')
  assertEquals(dashed.length, 1)
  // Left to right: links between separate shapes leave by the right side.
  const web = nodes.find((n) => n.data.label === 'Web App (React)')!
  const cdn = nodes.find((n) => n.data.label === 'CDN')!
  const webToCdn = edges.find((e) => e.source === web.id && e.target === cdn.id)!
  assertEquals([webToCdn.sourceHandle, webToCdn.targetHandle], ['r', 'l'])
})

Deno.test('layout: ER entities become table blocks and links to subgraphs connect containers', () => {
  const er = mermaidToDiagram(found(SAMPLES['school ER diagram']))
  assert(er.ok, 'ER imports')
  const student = er.diagram.nodes.find((n) => n.data.label === 'STUDENT')!
  assertEquals([student.type, student.data.block, student.height], ['block', 'table', undefined])
  assertEquals(student.data.body, 'id uuid PK\nfull_name string\nemail string\ncreated_at timestamp')
  assert(er.diagram.edges.every((e) => e.data.arrows === 'none'), 'ER links have no arrowheads')

  const nested = mermaidToDiagram(found(SAMPLES['nested groups and links to groups']))
  assert(nested.ok, 'nested imports')
  const byLabel = (label: string) => nested.diagram.nodes.find((n) => n.data.label === label)!
  const toPriv = nested.diagram.edges.find((e) => e.source === byLabel('Public subnet').id)!
  assertEquals(toPriv.target, byLabel('Private subnet').id)
  assertEquals(byLabel('Nothing inside').type, 'container')
})

Deno.test('layout: long labels make bigger shapes; text never shrinks a shape below its default', () => {
  const g = graphOf('flowchart TD\n  a[Hi]\n  b["A much longer label that has to wrap over several lines to fit"]\n  c{Short}')
  const d = layoutGraph(g)
  const size = (label: string) => d.nodes.find((n) => n.data.label === label)!
  assertEquals([size('Hi').width, size('Hi').height], [120, 52])
  assert(size('A much longer label that has to wrap over several lines to fit').width > 120, 'wider')
  assert(size('A much longer label that has to wrap over several lines to fit').height! > 52, 'taller')
  assert(size('Short').width >= 140 && size('Short').height! >= 96, 'diamond keeps its default size')
})

function found(text: string) {
  const f = findMermaid(text)
  assert(f?.importable, 'found')
  return f.code
}

Deno.test('layout: a link back against the flow runs around the side (a ChatGPT login flow)', () => {
  const result = mermaidToDiagram(`flowchart TD
    A([Start]) --> B[Enter Credentials]
    B --> C{Valid Credentials?}
    C -->|Yes| D[Generate JWT]
    C -->|No| E[Show Error]
    E --> B
    D --> F[Open Dashboard]
    F --> G([End])`)
  assert(result.ok, 'imports')
  const { nodes, edges } = result.diagram
  const id = (label: string) => nodes.find((n) => n.data.label === label)!.id
  const retry = edges.find((e) => e.source === id('Show Error') && e.target === id('Enter Credentials'))!
  assert(retry.sourceHandle === retry.targetHandle && ['l', 'r'].includes(retry.sourceHandle), `retry loop leaves and enters by the same side, got ${retry.sourceHandle}→${retry.targetHandle}`)
  const forward = edges.find((e) => e.source === id('Enter Credentials') && e.target === id('Valid Credentials?'))!
  assertEquals([forward.sourceHandle, forward.targetHandle], ['b', 't'])
  // The decision wraps onto two lines instead of growing wide.
  const decision = nodes.find((n) => n.data.label === 'Valid Credentials?')!
  assert(decision.width <= 180, `decision is compact, got ${decision.width}`)

  const lr = mermaidToDiagram('flowchart LR\n  a --> b --> c\n  c --> a')
  assert(lr.ok, 'LR imports')
  const back = lr.diagram.edges[2]
  assert(back.sourceHandle === back.targetHandle && ['t', 'b'].includes(back.sourceHandle), 'left-to-right loop runs above or below')
})
