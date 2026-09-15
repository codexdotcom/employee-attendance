import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { Platform } from 'react-native'
import { getFix } from './location'
import { enqueue, persistPhoto, removePersisted } from './queue'
import { supabase } from './supabase'
import { PunchType, QueuedPunch } from './types'
import { getPhoto } from './webStore'

const BUCKET = 'attendance-photos'
const isWeb = Platform.OS === 'web'

export async function compress(uri: string) {
  const context = ImageManipulator.manipulate(uri).resize({ width: 1024 })
  const image = await context.renderAsync()
  const out = await image.saveAsync({ compress: 0.5, format: SaveFormat.JPEG })
  return out.uri
}

/**
 * A web photo uri is either a fresh blob: URL from the file input, or an
 * idb: key pointing at a queued photo in IndexedDB. Blob URLs die on reload,
 * which is why queued photos are moved to IndexedDB in queue.ts.
 */
async function blobFromUri(uri: string): Promise<Blob> {
  if (uri.startsWith('idb:')) {
    const blob = await getPhoto(uri)
    if (!blob) throw new Error('PHOTO_EXPIRED')
    return blob
  }
  try {
    const res = await fetch(uri)
    return await res.blob()
  } catch {
    throw new Error('PHOTO_EXPIRED')
  }
}

/**
 * Shrink with a canvas. expo-image-manipulator is native-only, and phone
 * cameras hand back 3-5MB files that would fill the storage tier fast.
 */
async function compressWeb(uri: string): Promise<Blob> {
  const blob = await blobFromUri(uri)
  try {
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, 1024 / bitmap.width)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((out) => resolve(out ?? blob), 'image/jpeg', 0.5)
    })
  } catch {
    // Canvas failed. Upload the original rather than losing the punch.
    return blob
  }
}

async function upload(localUri: string, employeeId: string, tag: string) {
  const path = `${employeeId}/${tag}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.jpg`

  let body: Uint8Array | Blob

  if (isWeb) {
    body = await compressWeb(localUri)
  } else {
    const compressed = await compress(localUri)
    const file = new File(compressed)
    body = await file.bytes()
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: false })

  if (error) throw new Error(`UPLOAD_FAILED: ${error.message}`)
  return path
}

const MESSAGES: Record<string, string> = {
  INVALID_QR: 'That code is not recognised. Scan the official attendance code.',
  ALREADY_RECORDED: 'This has already been recorded today.',
  NOT_AN_ACTIVE_EMPLOYEE: 'Your account is not active. Contact the administrator.',
  SUBJECT_NOT_FOUND: 'That staff member is not active.',
  SUBJECT_PHOTO_REQUIRED: 'A photo of the person is required.',
  PROXY_DISABLED: 'Recording for someone else has been turned off by the administrator.',
  OFFLINE_DISABLED: 'Offline recording has been turned off by the administrator.',
  TOO_OLD: 'This punch is more than a week old and can no longer be submitted.',
  CLOCK_AHEAD: 'Your phone clock appears to be wrong. Correct it and try again.',
  PHOTO_EXPIRED: 'The photo is no longer available. Please take it again.',
  BAD_TYPE: 'Something went wrong. Please try again.',
}

export function friendlyError(raw: string) {
  for (const key of Object.keys(MESSAGES)) {
    if (raw.includes(key)) return MESSAGES[key]
  }
  const range = raw.match(/OUT_OF_RANGE:(\d+)/)
  if (range) {
    return `You appear to be about ${range[1]}m from the school. Move closer and try again.`
  }
  if (raw.includes('UPLOAD_FAILED')) {
    return 'The photo could not be uploaded. Check your connection and try again.'
  }
  return raw || 'Could not record attendance.'
}

function isNetworkError(e: any) {
  const m = String(e?.message ?? '').toLowerCase()
  // A dead photo is a local failure, never a network one. Checking it first
  // stops an expired blob URL from being misread as "offline" and queued.
  if (m.includes('photo_expired')) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return (
    m.includes('network') ||
    m.includes('timeout') ||
    m.includes('load failed') ||
    m.includes('failed to fetch') ||
    m.includes('connection')
  )
}

export type PunchInput = {
  qrSecret: string
  type: PunchType
  photoUri: string
  subjectPhotoUri?: string | null
  subjectId?: string | null
  subjectName?: string | null
  employeeId: string
}

export type PunchResult = { queued: boolean }

/**
 * Sends immediately. On a network failure the punch is stored locally with
 * the device clock and flushed by SyncProvider once online. Server-side
 * rejections (bad QR, out of range, duplicate) surface straight away, since
 * retrying will not change the outcome.
 */
export async function submitPunch(args: PunchInput): Promise<PunchResult> {
  let fix = null
  try {
    fix = await getFix()
  } catch (e: any) {
    if (e?.message === 'LOCATION_OFF') {
      throw new Error('Turn on location services and try again.')
    }
  }

  const clientTime = new Date().toISOString()

  // Offline before we even start. Queue without burning a failed upload.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return queuePunch(args, fix, clientTime)
  }

  try {
    const photoPath = await upload(args.photoUri, args.employeeId, 'env')
    let subjectPath: string | null = null
    if (args.subjectPhotoUri) {
      subjectPath = await upload(args.subjectPhotoUri, args.employeeId, 'person')
    }

    const { error } = await supabase.rpc('record_attendance', {
      p_qr_secret: args.qrSecret,
      p_type: args.type,
      p_photo_path: photoPath,
      p_lat: fix?.latitude ?? null,
      p_lng: fix?.longitude ?? null,
      p_accuracy: fix?.accuracy ?? null,
      p_device: { platform: Platform.OS, version: String(Platform.Version) },
      p_subject_id: args.subjectId ?? null,
      p_subject_photo: subjectPath,
      p_client_time: null,
    })

    if (error) {
      await supabase.storage
        .from(BUCKET)
        .remove([photoPath, ...(subjectPath ? [subjectPath] : [])])
        .catch(() => {})
      throw new Error(error.message)
    }

    return { queued: false }
  } catch (e: any) {
    if (!isNetworkError(e)) {
      throw new Error(friendlyError(String(e?.message ?? '')))
    }
    return queuePunch(args, fix, clientTime)
  }
}

async function queuePunch(
  args: PunchInput,
  fix: { latitude: number; longitude: number; accuracy: number | null } | null,
  clientTime: string
): Promise<PunchResult> {
  const photoUri = await persistPhoto(args.photoUri, 'env')
  const subjectPhotoUri = args.subjectPhotoUri
    ? await persistPhoto(args.subjectPhotoUri, 'person')
    : null

  const item: QueuedPunch = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    qrSecret: args.qrSecret,
    type: args.type,
    photoUri,
    subjectPhotoUri,
    subjectId: args.subjectId ?? null,
    subjectName: args.subjectName ?? null,
    employeeId: args.employeeId,
    latitude: fix?.latitude ?? null,
    longitude: fix?.longitude ?? null,
    accuracy: fix?.accuracy ?? null,
    clientTime,
    attempts: 0,
    lastError: null,
  }
  await enqueue(item)
  return { queued: true }
}

/** Used by SyncProvider. Throws on network failure so the item stays queued. */
export async function flushOne(item: QueuedPunch) {
  const photoPath = await upload(item.photoUri, item.employeeId, 'env')
  let subjectPath: string | null = null
  if (item.subjectPhotoUri) {
    subjectPath = await upload(item.subjectPhotoUri, item.employeeId, 'person')
  }

  const { error } = await supabase.rpc('record_attendance', {
    p_qr_secret: item.qrSecret,
    p_type: item.type,
    p_photo_path: photoPath,
    p_lat: item.latitude,
    p_lng: item.longitude,
    p_accuracy: item.accuracy,
    p_device: { platform: Platform.OS, version: String(Platform.Version), queued: true },
    p_subject_id: item.subjectId,
    p_subject_photo: subjectPath,
    p_client_time: item.clientTime,
  })

  if (error) {
    await supabase.storage
      .from(BUCKET)
      .remove([photoPath, ...(subjectPath ? [subjectPath] : [])])
      .catch(() => {})
    throw new Error(error.message)
  }
}

export { removePersisted }
