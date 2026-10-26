import { CalendarDays, Check, CircleDot, FileText, GitPullRequest, Video, Presentation, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { LogoMark, LogoWordmark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'

type Tool = 'issues' | 'docs' | 'diagrams' | 'meetings'

const TOOLS: { id: Tool; label: string; icon: LucideIcon }[] = [
  { id: 'issues', label: 'Issues & sprints', icon: CircleDot },
  { id: 'docs', label: 'Docs', icon: FileText },
  { id: 'diagrams', label: 'Whiteboards', icon: Presentation },
  { id: 'meetings', label: 'Meetings', icon: Video },
]

/** How long each tool stays in the showcase before the next one, unless someone picks one. */
const TOUR_MS = 6000

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The sign-in pages' frame (/login, /admin-login): on wide screens a showcase of what DevDock is
 * on the left, drawn in plain markup over a faint grid (no images, nothing to download), and the
 * sign-in column on the right; on phones the column with a strip of the tools above it.
 * Lazy-loaded with the pages, so signed-in users never download it.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Showcase />

      <main className="flex min-h-svh flex-col">
        <div className="flex h-16 items-center justify-between px-6">
          <span className="flex items-center gap-2.5 lg:invisible">
            <LogoMark className="h-7" />
            <LogoWordmark className="h-5" />
          </span>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-10">
          <div className="w-full max-w-[22rem] animate-in duration-500 fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
            <MobileStrip />
            <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 px-6 py-5 text-xs text-muted-foreground">
          <span>© DevDock</span>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy policy
          </Link>
        </footer>
      </main>
    </div>
  )
}

/** Phones only: the tools in one line, so the page still says what DevDock is. */
function MobileStrip() {
  return (
    <div className="mb-8 flex flex-wrap gap-1.5 lg:hidden">
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <span key={id} className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          {label.split(' ')[0]}
        </span>
      ))}
    </div>
  )
}

/** The left half on wide screens: what DevDock is, shown rather than told. */
function Showcase() {
  const [tool, setTool] = useState<Tool>('issues')
  const [paused, setPaused] = useState(reducedMotion)

  // A slow tour of the tools; stops for good once someone picks one, and while hovered.
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setTool((t) => TOOLS[(TOOLS.findIndex((x) => x.id === t) + 1) % TOOLS.length].id), TOUR_MS)
    return () => clearInterval(id)
  }, [paused])
  const [hovered, setHovered] = useState(false)

  return (
    <aside className="relative hidden overflow-hidden border-r bg-muted/30 lg:flex lg:flex-col">
      {/* A faint grid that fades out towards the edges, and a soft brand glow behind the preview. */}
      <div
        aria-hidden
        className="absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_45%,black,transparent)] opacity-70"
      />
      <div aria-hidden className="absolute top-1/2 left-1/2 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/15 blur-3xl" />

      <div className="relative flex h-16 items-center gap-2.5 px-10">
        <LogoMark className="h-7" />
        <LogoWordmark className="h-5" />
      </div>

      <div className="relative flex flex-1 flex-col justify-center gap-10 px-10 xl:px-16">
        <div className="max-w-lg animate-in duration-700 fade-in slide-in-from-bottom-3 motion-reduce:animate-none">
          <h2 className="text-4xl leading-[1.1] font-semibold tracking-tight xl:text-5xl">
            Learn, plan and build software, together.
          </h2>
          <p className="mt-4 max-w-md text-base text-muted-foreground">
            Learn the material, plan the sprint, ship the code: one workspace for all of it.
          </p>
        </div>
        <div
          className="w-full max-w-lg animate-in delay-150 duration-700 fill-mode-both fade-in slide-in-from-bottom-4 motion-reduce:animate-none"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <Preview tool={tool} />
        </div>
      </div>

      <div role="tablist" aria-label="DevDock tools" className="relative flex flex-wrap gap-1 px-8 pb-7 xl:px-14">
        {TOOLS.map(({ id, label, icon: Icon }) => {
          const active = id === tool
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTool(id)
                setPaused(true)
              }}
              className={cn(
                'relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className={cn('size-3.5', active && 'text-brand')} />
              {label}
              {/* The active tool's underline fills while the tour waits on it. */}
              <span className="absolute inset-x-2 -bottom-0.5 h-px overflow-hidden">
                {active && <TourProgress key={`${id}-${paused || hovered}`} running={!paused && !hovered} />}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

/** The active tool's underline, filling while the tour waits on it (full when the tour is stopped). */
function TourProgress({ running }: { running: boolean }) {
  const [filled, setFilled] = useState(!running)
  useEffect(() => {
    if (!running) return
    const id = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(id)
  }, [running])
  return (
    <span
      className="block h-full origin-left bg-brand"
      style={{ transform: `scaleX(${filled ? 1 : 0})`, transition: running ? `transform ${TOUR_MS}ms linear` : undefined }}
    />
  )
}

/** A small picture of the app for the tool in view. Decorative. */
function Preview({ tool }: { tool: Tool }) {
  const title = { issues: 'Website application · Sprint 3', docs: 'Architecture', diagrams: 'System overview', meetings: 'Meetings' }[tool]
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border bg-background/80 shadow-xl shadow-black/5 backdrop-blur">
      <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
        <span className="size-2 rounded-full bg-muted-foreground/25" />
        <span className="size-2 rounded-full bg-muted-foreground/25" />
        <span className="size-2 rounded-full bg-muted-foreground/25" />
        <span className="ml-3 font-mono text-[11px] text-muted-foreground">{title}</span>
      </div>
      <div key={tool} className="h-[13.5rem] animate-in duration-300 fade-in motion-reduce:animate-none">
        {tool === 'issues' && <IssuesPanel />}
        {tool === 'docs' && <DocsPanel />}
        {tool === 'diagrams' && <DiagramPanel />}
        {tool === 'meetings' && <MeetingsPanel />}
      </div>
    </div>
  )
}

const STAGES = [
  { label: 'In progress', dot: 'border-amber-500 border-r-transparent', pr: 'dock/web-12-add-the-sign-in-flow' },
  { label: 'In review', dot: 'border-violet-500 bg-violet-500/30', pr: 'PR #42 opened' },
  { label: 'Done', dot: 'border-emerald-500 bg-emerald-500', pr: 'PR #42 merged into main' },
]

/** WEB-12 walks from In progress to Done as its pull request moves, like the GitHub link does. */
function IssuesPanel() {
  const [stage, setStage] = useState(() => (reducedMotion() ? 2 : 0))
  useEffect(() => {
    if (reducedMotion()) return
    const id = setInterval(() => setStage((s) => Math.min(s + 1, 2)), 1700)
    return () => clearInterval(id)
  }, [])
  const s = STAGES[stage]
  return (
    <div className="text-sm">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <span className="font-mono text-xs text-muted-foreground">WEB-12</span>
        <span className="min-w-0 flex-1 truncate font-medium">Add the sign-in flow</span>
        <span className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs text-muted-foreground transition-all">
          {stage === 2 ? (
            <Check className="size-3 text-emerald-500" />
          ) : (
            <span className={cn('size-2 rounded-full border-[1.5px] transition-colors', s.dot)} />
          )}
          {s.label}
        </span>
      </div>
      <div className="flex items-center gap-2 border-b px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
        <GitPullRequest className={cn('size-3.5', stage === 2 ? 'text-violet-500' : 'text-emerald-500')} />
        <span key={stage} className="animate-in duration-300 fade-in slide-in-from-left-1">
          {s.pr}
        </span>
      </div>
      {(
        [
          ['WEB-14', 'Remember me on the sign-in page', 'border-muted-foreground/50', 'Ana'],
          ['WEB-9', 'Group invite codes', 'border-emerald-500 bg-emerald-500', 'Sam'],
          ['WEB-15', 'Dark mode for whiteboards', 'border-muted-foreground/50', 'Lee'],
        ] as const
      ).map(([key, name, dot, who]) => (
        <div key={key} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
          <span className={cn('size-2 rounded-full border-[1.5px]', dot)} />
          <span className="w-12 font-mono text-xs text-muted-foreground">{key}</span>
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium">{who[0]}</span>
        </div>
      ))}
    </div>
  )
}

/** A doc mid-sentence, with someone's cursor in it. */
function DocsPanel() {
  return (
    <div className="space-y-3 px-5 py-4">
      <div className="text-lg font-semibold tracking-tight">System overview</div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The browser talks straight to Supabase. Every read and write is checked by row level security, so there is no
        app server in between.
      </p>
      <div className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-[11px] leading-relaxed">
        <span className="text-violet-500">select</span> * <span className="text-violet-500">from</span> issues
        <br />
        <span className="text-violet-500">where</span> workspace_id = <span className="text-emerald-600 dark:text-emerald-400">$1</span>;
      </div>
      <p className="pt-2 text-sm text-muted-foreground">
        Sign-in uses Google
        <span className="relative ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-brand">
          <span className="absolute -top-4 left-0 rounded-sm bg-brand px-1 text-[9px] leading-tight text-brand-foreground">Ana</span>
        </span>
      </p>
    </div>
  )
}

/** Browser → API → Postgres, with the connectors drawing themselves. */
function DiagramPanel() {
  const [drawn, setDrawn] = useState(reducedMotion)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const line = (delay: number) => ({
    strokeDasharray: 1,
    strokeDashoffset: drawn ? 0 : 1,
    transition: `stroke-dashoffset 600ms ease-out ${delay}ms`,
  })
  return (
    <div className="flex h-full items-center px-4">
      <svg viewBox="0 0 420 120" className="h-auto w-full" role="presentation">
        <defs>
          <marker id="auth-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>
        <g className="text-[11px]">
          <rect x="4" y="42" width="104" height="36" rx="8" className="fill-brand/10 stroke-brand" />
          <text x="56" y="64" textAnchor="middle" className="fill-foreground">Browser</text>
          <path d="M110 60 H158" pathLength={1} style={line(200)} className="stroke-muted-foreground" markerEnd="url(#auth-arrow)" />
          <rect x="160" y="42" width="104" height="36" rx="4" className="fill-background stroke-foreground/40" />
          <text x="212" y="64" textAnchor="middle" className="fill-foreground">API</text>
          <path d="M266 60 H314" pathLength={1} style={line(700)} className="stroke-muted-foreground" markerEnd="url(#auth-arrow)" />
          <path d="M316 46 a52 8 0 0 1 100 0 v28 a52 8 0 0 1 -100 0 z" className="fill-teal-500/10 stroke-teal-500" />
          <ellipse cx="366" cy="46" rx="50" ry="8" className="fill-none stroke-teal-500" />
          <text x="366" y="68" textAnchor="middle" className="fill-foreground">Postgres</text>
          <text x="212" y="108" textAnchor="middle" className="fill-muted-foreground text-[10px]">checked by row level security</text>
        </g>
      </svg>
    </div>
  )
}

/** Today's meetings, one about to start. */
function MeetingsPanel() {
  return (
    <div className="text-sm">
      {(
        [
          ['10:00', 'Sprint 3 planning', 'Website application', true],
          ['14:30', 'Office hours', 'Intro to databases', false],
          ['16:00', 'Design review: sign-in', 'Website application', false],
        ] as const
      ).map(([time, name, where, soon]) => (
        <div key={name} className="flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0">
          <span className="w-11 font-mono text-xs text-muted-foreground">{time}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{name}</div>
            <div className="truncate text-xs text-muted-foreground">{where}</div>
          </div>
          {soon ? (
            <span className="flex items-center gap-1.5 rounded-md bg-brand px-2 py-1 text-xs text-brand-foreground">
              <Video className="size-3" />
              Join
            </span>
          ) : (
            <CalendarDays className="size-4 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  )
}
