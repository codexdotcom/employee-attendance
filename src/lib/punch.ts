import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { Platform } from 'react-native'
import { getFix } from './location'
import { supabase } from './supabase'
import { PunchType } from './types'

const BUCKET = 'attendance-photos'

/**
 * Shrink to ~1024px wide and re-encode at 50% quality.
 * Keeps uploads around 150-250KB, which matters on Nigerian mobile data
 * and keeps the project inside Supabase's 1GB free storage tier for a while.
 */
export async function compress(uri: string) {
  const context = ImageManipulator.manipulate(uri).resize({ width: 1024 })
  const image = await context.renderAsync()
  const out = await image.saveAsync({ compress: 0.5, format: SaveFormat.JPEG })
  return out.uri
}

/**
 * Photos land in a folder named after the employee's id.
 * The storage RLS policy enforces that prefix, so nobody can write into
 * another employee's folder even with a valid session.
 */
async function upload(localUri: string, employeeId: string) {
  const file = new File(localUri)
  const bytes = await file.bytes()
  const path = `${employeeId}/${Date.now()}.jpg`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })

  if (error) throw new Error(`Photo upload failed: ${error.message}`)
  return path
}

const MESSAGES: Record<string, string> = {
  INVALID_QR: 'That QR code is not recognised. Scan the official code at reception.',
  ALREADY_RECORDED: 'You have already recorded this today.',
  NOT_AN_ACTIVE_EMPLOYEE: 'Your account is not active. Contact the administrator.',
  BAD_TYPE: 'Something went wrong. Please try again.',
}

export async function submitPunch(args: {
  qrSecret: string
  type: PunchType
  photoUri: string
  employeeId: string
}) {
  // Location is best-effort. If the device can't get a fix we still send the
  // punch with nulls; record_attendance only enforces the geofence when both
  // the location row and the reading have coordinates.
  let fix = null
  try {
    fix = await getFix()
  } catch (e: any) {
    if (e?.message === 'LOCATION_OFF') {
      throw new Error('Turn on location services and try again.')
    }
  }

  const compressed = await compress(args.photoUri)
  const photoPath = await upload(compressed, args.employeeId)

  const { data, error } = await supabase.rpc('record_attendance', {
    p_qr_secret: args.qrSecret,
    p_type: args.type,
    p_photo_path: photoPath,
    p_lat: fix?.latitude ?? null,
    p_lng: fix?.longitude ?? null,
    p_accuracy: fix?.accuracy ?? null,
    p_device: { platform: Platform.OS, version: String(Platform.Version) },
  })

  if (error) {
    // The row was never written, so the uploaded photo is an orphan. Remove it.
    // Best-effort: a failed cleanup shouldn't mask the real error.
    try {
      await supabase.storage.from(BUCKET).remove([photoPath])
    } catch { /* ignore */ }

    const msg = error.message ?? ''

    for (const key of Object.keys(MESSAGES)) {
      if (msg.includes(key)) throw new Error(MESSAGES[key])
    }

    const range = msg.match(/OUT_OF_RANGE:(\d+)/)
    if (range) {
      throw new Error(
        `You appear to be about ${range[1]}m from the school. Move closer and try again.`
      )
    }

    throw new Error(msg || 'Could not record attendance. Check your connection and try again.')
  }

  return data
}