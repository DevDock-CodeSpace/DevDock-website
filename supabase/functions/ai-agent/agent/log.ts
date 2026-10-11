// One JSON line per event, so a request can be followed by its id in the
// function logs. Callers pass names, counts, durations and codes only: never
// tokens, keys, tool arguments or message text.

type Field = string | number | boolean | null | undefined

export function logEvent(requestId: string, event: string, fields: Record<string, Field> = {}) {
  console.log(JSON.stringify({ at: 'ai-agent', requestId, event, ...fields }))
}
