import { flushOne } from '@/lib/punch'
import { dequeue, readQueue, updateQueued } from '@/lib/queue'
import NetInfo from '@react-native-community/netinfo'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { AppState, Platform } from 'react-native'

type SyncState = {
  pending: number
  syncing: boolean
  refresh: () => Promise<void>
  flush: () => Promise<void>
}

const SyncContext = createContext<SyncState>({
  pending: 0,
  syncing: false,
  refresh: async () => {},
  flush: async () => {},
})

// Permanent failures. Retrying will never succeed, so drop the item rather
// than letting it block the queue forever.
const TERMINAL = [
  'ALREADY_RECORDED',
  'INVALID_QR',
  'TOO_OLD',
  'SUBJECT_NOT_FOUND',
  'BAD_TYPE',
  'OUT_OF_RANGE',
  'PROXY_DISABLED',
  'OFFLINE_DISABLED',
  'PHOTO_EXPIRED',
]

export function SyncProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  // A ref, not state: flush is called from event listeners that captured an
  // older closure, and a stale `syncing` value would let two flushes overlap.
  const running = useRef(false)

  const refresh = useCallback(async () => {
    setPending((await readQueue()).length)
  }, [])

  const flush = useCallback(async () => {
    if (running.current) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    const items = await readQueue()
    if (!items.length) return

    running.current = true
    setSyncing(true)
    try {
      for (const item of items) {
        try {
          await flushOne(item)
          await dequeue(item.id)
        } catch (e: any) {
          const msg = String(e?.message ?? '')
          if (TERMINAL.some((k) => msg.includes(k))) {
            await dequeue(item.id)
          } else {
            await updateQueued(item.id, {
              attempts: item.attempts + 1,
              lastError: msg,
            })
            // Still offline or the server is unreachable. Stop and retry later.
            break
          }
        }
        await refresh()
      }
    } finally {
      await refresh()
      running.current = false
      setSyncing(false)
    }
  }, [refresh])

  useEffect(() => {
    refresh()
    flush()

    const timer = setInterval(flush, 60_000)

    if (Platform.OS === 'web') {
      // NetInfo's reachability check is unreliable in browsers. The native
      // online/focus events are what actually fire when a phone reconnects.
      const onBack = () => flush()
      window.addEventListener('online', onBack)
      window.addEventListener('focus', onBack)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') flush()
      })
      return () => {
        window.removeEventListener('online', onBack)
        window.removeEventListener('focus', onBack)
        clearInterval(timer)
      }
    }

    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) flush()
    })
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') flush()
    })

    return () => {
      unsub()
      appSub.remove()
      clearInterval(timer)
    }
  }, [flush, refresh])

  return (
    <SyncContext.Provider value={{ pending, syncing, refresh, flush }}>
      {children}
    </SyncContext.Provider>
  )
}

export const useSync = () => useContext(SyncContext)