import { supabase } from '@/lib/supabase'
import { Slot, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, AppState, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '../providers/AuthProvider'

function Gate() {
  const { session, employee, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()
useEffect(() => {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  })
  supabase.auth.startAutoRefresh()
  return () => {
    sub.remove()
    supabase.auth.stopAutoRefresh()
  }
}, [])
  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === '(auth)'
    const authorised = !!session && !!employee

    if (!authorised && !inAuthGroup) {
      router.replace('/(auth)/sign-in')
    } else if (authorised && inAuthGroup) {
      router.replace('/(app)')
    }
  }, [session, employee, loading, segments])

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return <Slot />
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  )
}