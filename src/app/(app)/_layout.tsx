import { c } from '@/lib/theme'
import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.ink,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="scan" options={{ title: 'Log Attendance' }} />
      <Stack.Screen name="change-password" options={{ title: 'Change Password' }} />
      <Stack.Screen name="admin/today" options={{ title: 'Today' }} />
      <Stack.Screen name="admin/history" options={{ title: 'Records' }} />
      <Stack.Screen name="admin/employees" options={{ title: 'Staff' }} />
      <Stack.Screen name="admin/new-employee" options={{ title: 'Add Staff' }} />
      <Stack.Screen name="admin/export" options={{ title: 'Export' }} />
      <Stack.Screen name="admin/settings" options={{ title: 'Settings' }} />
    </Stack>
  )
}