import AsyncStorage from '@react-native-async-storage/async-storage'
import { Directory, File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import { QueuedPunch } from './types'
import { deletePhoto, putPhoto } from './webStore'

const KEY = 'punch_queue_v1'
const DIR_NAME = 'pending_punches'
const isWeb = Platform.OS === 'web'

function queueDir() {
  const dir = new Directory(Paths.document, DIR_NAME)
  if (!dir.exists) dir.create({ intermediates: true })
  return dir
}

/**
 * Camera output lives somewhere volatile: the OS cache on native, a blob URL
 * on web that dies on reload. A queued punch may sit for hours, so copy the
 * image somewhere durable before promising to send it later.
 */
export async function persistPhoto(uri: string, label: string) {
  if (isWeb) return putPhoto(uri)

  const dir = queueDir()
  const name = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const src = new File(uri)
  const dest = new File(dir, name)
  src.copy(dest)
  return dest.uri
}

export async function removePersisted(uri?: string | null) {
  if (!uri) return
  if (isWeb) return deletePhoto(uri)
  try {
    const f = new File(uri)
    if (f.exists) f.delete()
  } catch { /* already gone */ }
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