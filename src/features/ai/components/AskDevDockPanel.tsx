import { useMutation } from '@tanstack/react-query'
import { ArrowUp, CircleAlert, Loader2, SquarePen } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentTeam } from '@/features/teams/hooks'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { AI_MESSAGE_MAX, askDevDock, cancelAiAction, confirmAiAction, type AiConfirmation, type AiHistoryTurn, type AiResponse } from '../api'
import { pageContext } from '../page-context'

type ActionState = 'waiting' | 'working' | 'done' | 'cancelled' | 'failed'

type Turn =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'assistant'; text: string }
  | { id: number; kind: 'error'; text: string }
  | { id: number; kind: 'action'; action: AiConfirmation; state: ActionState }

type NewTurn = Turn extends infer T ? (T extends Turn ? Omit<T, 'id'> : never) : never

/** Recent turns the function reads for follow-ups ("assign it to Sree"). It bounds them again. */
const HISTORY_TURNS = 12

function toHistory(turns: Turn[]): AiHistoryTurn[] {
  return turns
    .flatMap((turn): AiHistoryTurn[] => {
      if (turn.kind === 'user') return [{ role: 'user', text: turn.text }]
      if (turn.kind === 'assistant') return [{ role: 'assistant', text: turn.text }]
      if (turn.kind === 'action') {
        const outcome = turn.state === 'done' ? 'The user confirmed it.' : turn.state === 'cancelled' ? 'The user cancelled it.' : 'Waiting for the user to confirm.'
        return [{ role: 'assistant', text: `${turn.action.preview.title}: “${turn.action.preview.body ?? ''}” ${outcome}` }]
      }
      return []
    })
    .slice(-HISTORY_TURNS)
}

const EXAMPLES = ['Show me my open issues', 'What meetings do I have today?', 'Create an issue called Fix login redirect']

/** The Ask DevDock side panel. Lazy-loaded by AskDevDockButton; default export for `lazy()`. */
export default function AskDevDockPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { team } = useCurrentTeam()
  const location = useLocation()
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const nextId = useRef(1)
  const end = useRef<HTMLDivElement>(null)

  const add = (turn: NewTurn) => {
    const id = nextId.current++
    setTurns((current) => [...current, { ...turn, id }])
  }

  const show = (response: AiResponse) => {
    if (response.type === 'confirmation') add({ kind: 'action', action: response, state: 'waiting' })
    else add({ kind: response.type === 'error' ? 'error' : 'assistant', text: response.message })
  }

  const ask = useMutation({
    mutationFn: ({ message, history }: { message: string; history: AiHistoryTurn[] }) =>
      // The page is read when the question is sent, so "this" means what is open now.
      askDevDock({ message, teamId: team.id, page: pageContext(location.pathname, location.search), history }),
    onSuccess: show,
    onError: (error) => add({ kind: 'error', text: errorMessage(error) }),
  })

  const setAction = (id: number, state: ActionState) =>
    setTurns((current) => current.map((turn) => (turn.id === id && turn.kind === 'action' ? { ...turn, state } : turn)))

  const confirm = useMutation({
    mutationFn: ({ turn, edits }: { turn: Extract<Turn, { kind: 'action' }>; edits?: Record<string, string> }) =>
      confirmAiAction({ pendingActionId: turn.action.pendingActionId, teamId: team.id, edits }),
    onMutate: ({ turn }) => setAction(turn.id, 'working'),
    onSuccess: (response, { turn }) => {
      setAction(turn.id, response.type === 'error' ? 'failed' : 'done')
      show(response)
    },
    onError: (error, { turn }) => {
      // Nothing is known to have run; the card stays so the person can try again.
      setAction(turn.id, 'waiting')
      add({ kind: 'error', text: errorMessage(error) })
    },
  })

  const cancel = useMutation({
    mutationFn: (turn: Extract<Turn, { kind: 'action' }>) => cancelAiAction({ pendingActionId: turn.action.pendingActionId, teamId: team.id }),
    onMutate: (turn) => setAction(turn.id, 'cancelled'),
    // Cancelled on screen either way; a pending action that isn't confirmed expires on its own.
    onError: () => undefined,
  })

  const busy = ask.isPending || confirm.isPending
  const send = (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    // The turns so far; the new message travels separately.
    const history = toHistory(turns)
    add({ kind: 'user', text: message })
    setDraft('')
    ask.mutate({ message, history })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send(draft)
  }

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns, ask.isPending])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="flex-row items-center justify-between border-b py-3 pr-12">
          <div>
            <SheetTitle className="text-sm">Ask DevDock</SheetTitle>
            <SheetDescription className="text-xs">Issues, meetings and messages in {team.name}.</SheetDescription>
          </div>
          {turns.length > 0 && (
            <Button variant="ghost" size="xs" className="text-muted-foreground" disabled={busy} onClick={() => setTurns([])}>
              <SquarePen />
              New chat
            </Button>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
          {turns.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Ask in your own words. For example:</p>
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => send(example)}
                >
                  {example}
                </button>
              ))}
              <p className="mt-2 text-xs text-muted-foreground">
                Your request and the DevDock details needed to answer it are sent to an AI model. It can only do what you
                are allowed to do, and it asks before sending a message.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {turns.map((turn) => (
                <li key={turn.id}>
                  {turn.kind === 'user' && <p className="ml-auto w-fit max-w-[85%] rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{turn.text}</p>}
                  {turn.kind === 'assistant' && <p className="text-sm leading-relaxed whitespace-pre-wrap">{turn.text}</p>}
                  {turn.kind === 'error' && (
                    <p className="flex gap-2 text-sm text-muted-foreground" role="alert">
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                      {turn.text}
                    </p>
                  )}
                  {turn.kind === 'action' && (
                    <ActionCard
                      turn={turn}
                      disabled={busy}
                      onConfirm={(edits) => confirm.mutate({ turn, edits })}
                      onCancel={() => cancel.mutate(turn)}
                    />
                  )}
                </li>
              ))}
              {ask.isPending && (
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Working on it…
                </li>
              )}
            </ol>
          )}
          <div ref={end} />
        </div>

        <form
          className="border-t p-3"
          onSubmit={(event) => {
            event.preventDefault()
            send(draft)
          }}
        >
          <div className="flex items-end gap-2 rounded-md border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring">
            <Textarea
              autoFocus
              rows={1}
              value={draft}
              maxLength={AI_MESSAGE_MAX}
              placeholder="Ask DevDock…"
              aria-label="Ask DevDock"
              className="max-h-40 min-h-8 resize-none border-0 bg-transparent px-1.5 py-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <Button type="submit" size="icon-sm" aria-label="Send request" disabled={busy || !draft.trim()}>
              <ArrowUp />
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

const stateLabel: Partial<Record<ActionState, string>> = { done: 'Done', cancelled: 'Cancelled', failed: 'Not done' }

/** A prepared action waiting for a yes: what will happen, with Send, Edit and Cancel. */
function ActionCard({
  turn,
  disabled,
  onConfirm,
  onCancel,
}: {
  turn: Extract<Turn, { kind: 'action' }>
  disabled: boolean
  onConfirm: (edits?: Record<string, string>) => void
  onCancel: () => void
}) {
  const { action, state } = turn
  // Tools mark at most the main text as editable; the card edits that one field.
  const field = action.editable[0]
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(field?.value ?? action.preview.body ?? '')
  const [now] = useState(Date.now)
  const expired = state === 'waiting' && Date.parse(action.expiresAt) <= now
  const waiting = state === 'waiting' && !expired
  const changed = field !== undefined && text !== field.value

  return (
    <div className="flex flex-col gap-2">
      {action.message && <p className="text-sm leading-relaxed whitespace-pre-wrap">{action.message}</p>}
      <div className={cn('rounded-md border', !waiting && state !== 'working' && 'opacity-70')}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">{action.preview.title}</p>
          {(stateLabel[state] || expired) && <span className="font-mono text-[11px] text-muted-foreground">{expired ? 'Expired' : stateLabel[state]}</span>}
        </div>
        <div className="flex flex-col gap-2 px-3 py-2.5">
          {action.preview.fields?.map((item) => (
            <p key={item.label} className="text-xs text-muted-foreground">
              {item.label}: <span className="text-foreground">{item.value}</span>
            </p>
          ))}
          {editing && waiting && field ? (
            <Textarea
              autoFocus
              value={text}
              maxLength={field.maxLength}
              aria-label={field.label}
              className="min-h-20 text-sm"
              onChange={(event) => setText(event.target.value)}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap">{text}</p>
          )}
        </div>
        {(waiting || state === 'working') && (
          <div className="flex items-center gap-1.5 border-t px-3 py-2">
            <Button size="sm" disabled={disabled || !text.trim()} onClick={() => onConfirm(changed ? { [field.name]: text } : undefined)}>
              {state === 'working' && <Loader2 className="animate-spin" />}
              {action.preview.confirmLabel}
            </Button>
            {field && !editing && (
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={disabled} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
