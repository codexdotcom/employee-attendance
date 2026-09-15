const DB_NAME = 'realjoy-punch-photos'
const STORE = 'photos'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

/** Store a blob URL's contents durably. Returns an idb: key to use as the uri. */
export async function putPhoto(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl)
  const blob = await res.blob()
  const key = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await tx('readwrite', (s) => s.put(blob, key))
  return `idb:${key}`
}

export async function getPhoto(uri: string): Promise<Blob | null> {
  if (!uri.startsWith('idb:')) return null
  const key = uri.slice(4)
  const blob = await tx<Blob | undefined>('readonly', (s) => s.get(key))
  return blob ?? null
}

export async function deletePhoto(uri?: string | null) {
  if (!uri?.startsWith('idb:')) return
  try {
    await tx('readwrite', (s) => s.delete(uri.slice(4)))
  } catch { /* already gone */ }
}