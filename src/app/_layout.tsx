import { supabase } from '@/lib/supabase'
import { c } from '@/lib/theme'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { SyncProvider } from '@/providers/SyncProvider'
import { Slot, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, AppState, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})

function Gate() {
  const { session, employee, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === '(auth)'
    const authorised = !!session && !!employee

    if (!authorised && !inAuthGroup) router.replace('/(auth)/sign-in')
    else if (authorised && inAuthGroup) router.replace('/(app)')
  }, [session, employee, loading, segments])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    )
  }

  return <Slot />
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SyncProvider>
          <Gate />
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}