import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, useUserIdentity } from '@/features/auth/hooks'
import { joinEditing, type EditingRoom } from '@/lib/presence'

/** Someone counts as typing until they've been quiet for this long. */
const TYPING_IDLE_MS = 8000

/**
 * For a text that several people can edit: the names of others typing in it
 * right now, and `markTyping()` to call on every local edit. Only people who
 * can edit join (`enabled`).
 */
export function useOthersTyping(topic: string, enabled: boolean) {
  const { user } = useAuth()
  const { name } = useUserIdentity()
  const [others, setOthers] = useState<string[]>([])
  const room = useRef<EditingRoom | null>(null)
  const idle = useRef<number | undefined>(undefined)
  const latestName = useRef(name)
  useEffect(() => {
    latestName.current = name
  })

  useEffect(() => {
    if (!enabled) return
    let attempts = 0
    let start: number | undefined
    const join = () => {
      try {
        room.current = joinEditing(topic, { userId: user.id, name: () => latestName.current }, setOthers)
      } catch (error) {
        console.error('[presence] Could not join', error)
        return
      }
      if (!room.current && ++attempts < 20) start = window.setTimeout(join, 300)
    }
    // Joining a moment later skips StrictMode's throwaway first mount.
    start = window.setTimeout(join, 150)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(idle.current)
      room.current?.leave()
      room.current = null
    }
  }, [topic, enabled, user.id])

  const markTyping = useCallback(() => {
    room.current?.setTyping(true)
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => room.current?.setTyping(false), TYPING_IDLE_MS)
  }, [])

  return { others, markTyping }
}
