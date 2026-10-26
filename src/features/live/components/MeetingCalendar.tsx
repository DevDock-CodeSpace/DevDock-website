import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LiveSession } from '../api'
import {
  groupByDay,
  isSameDay,
  layoutDay,
  MINUTES_PER_DAY,
  monthWeeks,
  shiftCursor,
  startOfDay,
  weekDays,
  type CalendarMode,
} from '../calendarView'
import { toDateKey } from '../recurrence'
import { formatTime, sessionStatus } from '../time'

type MeetingCalendarProps = {
  sessions: LiveSession[]
  now: number
  cursor: Date
  mode: CalendarMode
  onNavigate: (next: { date?: Date; mode?: CalendarMode }) => void
  href: (session: LiveSession) => string
  /** Present only for people who may schedule here: clicking a day or time slot calls it. */
  onCreate?: (start: Date) => void
}

const HOUR_PX = 48
/** Below this the calendar stops shrinking and the page scrolls instead (a very short window). */
const MIN_HEIGHT = 420
/** A meeting chip's height in the month grid (text-[11px] + padding + the 2 px gap). */
const CHIP_PX = 20
/** The day number's row at the top of a month cell, with the cell's padding. */
const DAY_HEAD_PX = 30

/**
 * The calendar fills the window below it exactly, like Teams: no page scroll. It takes the window's
 * height below its own top, minus the bottom padding of the boxes it sits in (the page area's), and
 * measures again on every resize.
 */
function useFitToWindow(ref: RefObject<HTMLDivElement | null>) {
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      let below = 0
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node)
        below += parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth)
      }
      const page = document.scrollingElement ?? document.documentElement
      const top = el.getBoundingClientRect().top + page.scrollTop
      setHeight(Math.max(MIN_HEIGHT, Math.floor(window.innerHeight - top - below)))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [ref])
  return height
}

/** How many meeting chips fit in one month cell, from the grid's measured height. */
function useChipsPerCell(ref: RefObject<HTMLDivElement | null>, rows: number) {
  const [fit, setFit] = useState(3)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setFit(Math.max(1, Math.floor((el.clientHeight / rows - DAY_HEAD_PX) / CHIP_PX)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, rows])
  return fit
}
const FIRST_VISIBLE_HOUR = 7
const hours = Array.from({ length: 24 }, (_, h) => h)
const weekdayHeader = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const hourLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })

/** Month and week calendar of meetings (Google Calendar style). */
export function MeetingCalendar({ sessions, now, cursor, mode, onNavigate, href, onCreate }: MeetingCalendarProps) {
  const byDay = useMemo(() => groupByDay(sessions), [sessions])
  const days = weekDays(cursor)
  const title =
    mode === 'month'
      ? monthTitle.format(cursor)
      : `${shortDate.format(days[0])} – ${shortDate.format(days[6])}, ${days[6].getFullYear()}`

  const box = useRef<HTMLDivElement>(null)
  const height = useFitToWindow(box)

  return (
    <div ref={box} className="flex flex-col gap-3" style={height ? { height } : undefined}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onNavigate({ date: startOfDay(new Date(now)) })}>
          Today
        </Button>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={mode === 'month' ? 'Previous month' : 'Previous week'}
            onClick={() => onNavigate({ date: shiftCursor(cursor, mode, -1) })}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={mode === 'month' ? 'Next month' : 'Next week'}
            onClick={() => onNavigate({ date: shiftCursor(cursor, mode, 1) })}
          >
            <ChevronRight />
          </Button>
        </div>
        <h2 className="text-sm font-semibold" aria-live="polite">
          {title}
        </h2>
        <div role="group" aria-label="Calendar range" className="ml-auto flex rounded-md border p-0.5">
          {(['month', 'week'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => onNavigate({ mode: value })}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                mode === value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {mode === 'month' ? (
        <MonthGrid cursor={cursor} byDay={byDay} now={now} href={href} onCreate={onCreate} onNavigate={onNavigate} />
      ) : (
        <WeekGrid days={days} byDay={byDay} now={now} href={href} onCreate={onCreate} />
      )}
    </div>
  )
}

type GridProps = {
  byDay: Map<string, LiveSession[]>
  now: number
  href: (session: LiveSession) => string
  onCreate?: (start: Date) => void
}

/** Default start for a click on a whole day: 10:00, or the next full hour when the day is today. */
function dayStart(day: Date, now: number): Date {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10)
  if (isSameDay(day, new Date(now))) {
    const next = new Date(now)
    next.setMinutes(0, 0, 0)
    next.setHours(next.getHours() + 1)
    if (isSameDay(next, day)) return next
  }
  return start
}

function MonthGrid({
  cursor,
  byDay,
  now,
  href,
  onCreate,
  onNavigate,
}: GridProps & { cursor: Date; onNavigate: MeetingCalendarProps['onNavigate'] }) {
  const weeks = monthWeeks(cursor)
  const today = new Date(now)
  const header = weekDays(cursor)
  const rows = useRef<HTMLDivElement>(null)
  const fit = useChipsPerCell(rows, weeks.length)

  return (
    <div className="min-h-0 flex-1 overflow-x-auto">
      <div className="flex h-full min-w-[640px] flex-col border-t border-l">
        <div className="grid shrink-0 grid-cols-7">
          {header.map((d) => (
            <div key={d.getDay()} className="border-r border-b px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {weekdayHeader.format(d)}
            </div>
          ))}
        </div>
        {/* The weeks share whatever height is left, equally (5 or 6 rows). */}
        <div ref={rows} className="grid min-h-0 flex-1" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((week) => (
          <div key={toDateKey(week[0])} className="grid min-h-0 grid-cols-7">
            {week.map((day) => {
              const list = byDay.get(toDateKey(day)) ?? []
              const outside = day.getMonth() !== cursor.getMonth()
              const isToday = isSameDay(day, today)
              // As many as fit; when some don't, the last line says how many more.
              const shown = list.length > fit ? list.slice(0, Math.max(0, fit - 1)) : list
              return (
                <div
                  key={toDateKey(day)}
                  onClick={onCreate ? () => onCreate(dayStart(day, now)) : undefined}
                  className={cn(
                    'min-h-0 space-y-0.5 overflow-hidden border-r border-b p-1',
                    outside && 'bg-muted/30',
                    onCreate && 'cursor-pointer hover:bg-muted/40',
                  )}
                >
                  <div className="flex justify-end">
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full font-mono text-[11px]',
                        isToday ? 'bg-brand text-white' : outside ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  {shown.map((session) => (
                    <MonthChip key={session.id} session={session} now={now} href={href(session)} />
                  ))}
                  {list.length > shown.length && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onNavigate({ date: day, mode: 'week' })
                      }}
                      className="w-full rounded px-1.5 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      +{list.length - shown.length} more
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        </div>
      </div>
    </div>
  )
}

const chipTone = (status: ReturnType<typeof sessionStatus>) =>
  status === 'live'
    ? 'border-destructive bg-destructive/10 text-destructive'
    : status === 'ended'
      ? 'border-border bg-muted/60 text-muted-foreground'
      : 'border-brand bg-brand/10 text-foreground'

function MonthChip({ session, now, href }: { session: LiveSession; now: number; href: string }) {
  const status = sessionStatus(session, now)
  return (
    <Link
      to={href}
      onClick={(e) => e.stopPropagation()}
      title={session.title}
      className={cn(
        'flex items-center gap-1.5 truncate rounded-sm border-l-2 px-1.5 py-0.5 text-[11px] leading-tight hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring',
        chipTone(status),
      )}
    >
      <span className="shrink-0 font-mono">{formatTime(session.starts_at)}</span>
      <span className="truncate">{session.title}</span>
    </Link>
  )
}

function WeekGrid({ days, byDay, now, href, onCreate }: GridProps & { days: Date[] }) {
  const scroller = useRef<HTMLDivElement>(null)
  const today = new Date(now)
  const nowMinutes = today.getHours() * 60 + today.getMinutes()

  // Open scrolled to the morning instead of midnight: once, as soon as the grid has its height
  // (it's sized to the window after the first render, and scrolling before that does nothing).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (el.clientHeight === 0 || el.scrollHeight <= el.clientHeight) return
      el.scrollTo({ top: FIRST_VISIBLE_HOUR * HOUR_PX })
      observer.disconnect()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto border">
      <div className="min-w-[720px]">
        <div className="sticky top-0 z-20 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b bg-background">
          <div />
          {days.map((day) => (
            <div key={toDateKey(day)} className="flex items-center justify-center gap-1.5 border-l py-1.5 text-xs">
              <span className="text-muted-foreground">{weekdayHeader.format(day)}</span>
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full font-mono',
                  isSameDay(day, today) && 'bg-brand text-white',
                )}
              >
                {day.getDate()}
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
          <div>
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX }} className="pr-2 text-right font-mono text-[10px] text-muted-foreground">
                <span className="relative -top-1.5">{h === 0 ? '' : hourLabel.format(new Date(2024, 0, 1, h))}</span>
              </div>
            ))}
          </div>
          {days.map((day) => (
            <DayColumn
              key={toDateKey(day)}
              day={day}
              sessions={byDay.get(toDateKey(day)) ?? []}
              now={now}
              nowMinutes={isSameDay(day, today) ? nowMinutes : null}
              href={href}
              onCreate={onCreate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  day,
  sessions,
  now,
  nowMinutes,
  href,
  onCreate,
}: {
  day: Date
  sessions: LiveSession[]
  now: number
  nowMinutes: number | null
  href: (session: LiveSession) => string
  onCreate?: (start: Date) => void
}) {
  const placed = useMemo(() => layoutDay(sessions), [sessions])
  const height = (HOUR_PX * MINUTES_PER_DAY) / 60

  return (
    <div
      className="relative border-l"
      style={{ height }}
      onClick={
        onCreate
          ? (event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              const minutes = Math.floor(((event.clientY - rect.top) / HOUR_PX) * 2) * 30
              onCreate(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes))
            }
          : undefined
      }
    >
      {hours.map((h) => (
        <div key={h} style={{ height: HOUR_PX }} className="border-b" />
      ))}
      {placed.map(({ session, top, height: length, column, columns }) => {
        const status = sessionStatus(session, now)
        return (
          <Link
            key={session.id}
            to={href(session)}
            onClick={(e) => e.stopPropagation()}
            title={session.title}
            className={cn(
              'absolute z-10 overflow-hidden rounded-sm border-l-2 px-1.5 py-0.5 text-[11px] leading-tight hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring',
              chipTone(status),
            )}
            style={{
              top: (top / 60) * HOUR_PX,
              height: Math.max(18, (length / 60) * HOUR_PX - 2),
              left: `calc(${(column / columns) * 100}% + 2px)`,
              width: `calc(${100 / columns}% - 4px)`,
            }}
          >
            <span className="block truncate font-medium">{session.title}</span>
            <span className="block truncate font-mono text-[10px] opacity-80">{formatTime(session.starts_at)}</span>
          </Link>
        )
      })}
      {nowMinutes !== null && (
        <div className="pointer-events-none absolute right-0 left-0 z-20 h-px bg-destructive" style={{ top: (nowMinutes / 60) * HOUR_PX }}>
          <span className="absolute -top-[3px] -left-1 size-[7px] rounded-full bg-destructive" />
        </div>
      )}
    </div>
  )
}
