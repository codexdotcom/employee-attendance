import AsyncStorage from '@react-native-async-storage/async-storage'
import { Directory, File, Paths } from 'expo-file-system'
import { QueuedPunch } from './types'

const KEY = 'punch_queue_v1'
const DIR_NAME = 'pending_punches'

function queueDir() {
  const dir = new Directory(Paths.document, DIR_NAME)
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

/**
 * Photos taken by the camera live in the cache directory, which the OS may
 * clear at any time. A queued punch could sit there for hours, so copy the
 * image somewhere durable before we promise to send it later.
 */
export async function persistPhoto(cacheUri: string, label: string) {
  const dir = queueDir()
  const name = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const src = new File(cacheUri)
  const dest = new File(dir, name)
  src.copy(dest)
  return dest.uri
}

export async function removePersisted(uri?: string | null) {
  if (!uri) return
  try {
    const f = new File(uri)
    if (f.exists) f.delete()
  } catch {
    /* already gone */
  }
}

export async function readQueue(): Promise<QueuedPunch[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as QueuedPunch[]) : []
  } catch {
    return []
  }
}

async function writeQueue(items: QueuedPunch[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items))
}

export async function enqueue(item: QueuedPunch) {
  const items = await readQueue()
  items.push(item)
  await writeQueue(items)
}

export async function dequeue(id: string) {
  const items = await readQueue()
  const found = items.find((i) => i.id === id)
  await writeQueue(items.filter((i) => i.id !== id))
  if (found) {
    await removePersisted(found.photoUri)
    await removePersisted(found.subjectPhotoUri)
  }
}

export async function updateQueued(id: string, patch: Partial<QueuedPunch>) {
  const items = await readQueue()
  await writeQueue(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))
}

export async function queueCount() {
  return (await readQueue()).length
}