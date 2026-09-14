import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { Platform } from 'react-native'
import { getFix } from './location'
import { enqueue, persistPhoto, removePersisted } from './queue'
import { supabase } from './supabase'
import { PunchType, QueuedPunch } from './types'

const BUCKET = 'attendance-photos'

export async function compress(uri: string) {
  const context = ImageManipulator.manipulate(uri).resize({ width: 1024 })
  const image = await context.renderAsync()
  const out = await image.saveAsync({ compress: 0.5, format: SaveFormat.JPEG })
  return out.uri
}

async function upload(localUri: string, employeeId: string, tag: string) {
  const compressed = await compress(localUri)
  const file = new File(compressed)
  const bytes = await file.bytes()
  const path = `${employeeId}/${tag}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.jpg`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })

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
  if (raw.includes('UPLOAD_FAILED')) return 'The photo could not be uploaded.'
  return raw || 'Could not record attendance.'
}

function isNetworkError(e: any) {
  const m = String(e?.message ?? '').toLowerCase()
  return (
    m.includes('network') ||
    m.includes('fetch') ||
    m.includes('timeout') ||
    m.includes('failed to load') ||
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
 * Attempts to send immediately. On a network failure the punch is stored
 * locally with the device clock and flushed by SyncProvider once online.
 * Any server-side rejection (bad QR, out of range, duplicate) is surfaced
 * straight away rather than queued, since retrying will not change it.
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
}

/** Used by SyncProvider. Throws only on network failure, so the item stays queued. */
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
