import { useEffect } from 'react'
import { startRealtimeSync } from '@/lib/realtime'

/** Keeps cached data live while the app shell is mounted (see lib/realtime). */
export function useRealtimeSync() {
  useEffect(() => startRealtimeSync(), [])
}
