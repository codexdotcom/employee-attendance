import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import 'react-native-url-polyfill/auto'

// SecureStore caps values at 2048 bytes and Supabase sessions exceed that,
// so we split across numbered chunks and reassemble on read.
const CHUNK_SIZE = 1800

const SecureStoreAdapter = {
  getItem: async (key: string) => {
    const count = await SecureStore.getItemAsync(`${key}_count`)
    if (!count) return null
    const parts: string[] = []
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${key}_${i}`)
      if (part === null) return null
      parts.push(part)
    }
    return parts.join('')
  },
  setItem: async (key: string, value: string) => {
    const old = await SecureStore.getItemAsync(`${key}_count`)
    if (old) {
      for (let i = 0; i < Number(old); i++) {
        await SecureStore.deleteItemAsync(`${key}_${i}`)
      }
    }
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'g')) ?? []
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, chunks[i])
    }
    await SecureStore.setItemAsync(`${key}_count`, String(chunks.length))
  },
  removeItem: async (key: string) => {
    const count = await SecureStore.getItemAsync(`${key}_count`)
    if (count) {
      for (let i = 0; i < Number(count); i++) {
        await SecureStore.deleteItemAsync(`${key}_${i}`)
      }
    }
    await SecureStore.deleteItemAsync(`${key}_count`)
  },
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing Supabase env vars. Check .env.local and restart Expo with --clear.')
}

export const supabase = createClient(url, key, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})