import { supabase } from './supabase'

export async function signedPhotoUrl(path: string) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from('attendance-photos')
    .createSignedUrl(path, 60 * 10)
  if (error) return null
  return data.signedUrl
}