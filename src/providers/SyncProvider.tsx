import { flushOne } from '@/lib/punch'
import { dequeue, readQueue, updateQueued } from '@/lib/queue'
import NetInfo from '@react-native-community/netinfo'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { AppState } from 'react-native'

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

// Permanent failures: retrying will never succeed, so drop the item
// rather than letting it block the queue forever.
const TERMINAL = [
  'ALREADY_RECORDED',
  'INVALID_QR',
  'TOO_OLD',
  'SUBJECT_NOT_FOUND',
  'BAD_TYPE',
  'OUT_OF_RANGE',
  'PROXY_DISABLED',
  'OFFLINE_DISABLED',
]

export function SyncProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    setPending((await readQueue()).length)
  }, [])

  const flush = useCallback(async () => {
    if (syncing) return
    const items = await readQueue()
    if (!items.length) return

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
            // Network still down. Stop and retry on the next trigger.
            break
          }
        }
      }
    } finally {
      await refresh()
      setSyncing(false)
    }
  }, [syncing, refresh])

  useEffect(() => {
    refresh()

    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) flush()
    })

    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') flush()
    })

    const timer = setInterval(flush, 60_000)

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