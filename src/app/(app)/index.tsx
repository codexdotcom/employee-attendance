import { c, r, sp, t } from '@/lib/theme'
import { useAuth } from '@/providers/AuthProvider'
import { useSync } from '@/providers/SyncProvider'
import { useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function Home() {
  const { employee, isAdmin, signOut } = useAuth()
  const { pending, syncing, flush } = useSync()
  const router = useRouter()

  if (!employee) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ marginTop: sp.xl }} color={c.accent} />
      </SafeAreaView>
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = employee.full_name.split(' ')[0]

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <Text style={t.label}>Realjoy School</Text>
          <Text style={s.greeting}>{greeting}, {firstName}</Text>
          <Text style={s.sub}>
            {employee.staff_code}
            {employee.department ? `   ${employee.department}` : ''}
            {isAdmin ? '   Administrator' : ''}
          </Text>
        </View>

        {pending > 0 && (
          <Pressable style={s.banner} onPress={flush} disabled={syncing}>
            <View style={{ flex: 1 }}>
              <Text style={s.bannerTitle}>
                {pending} {pending === 1 ? 'punch' : 'punches'} waiting to send
              </Text>
              <Text style={s.bannerSub}>
                {syncing ? 'Sending now' : 'Tap to retry, or wait for a connection'}
              </Text>
            </View>
            {syncing && <ActivityIndicator color={c.warn} />}
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [s.action, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(app)/scan')}
        >
          <Text style={s.actionTitle}>Log attendance</Text>
          <Text style={s.actionSub}>For yourself or a colleague</Text>
        </Pressable>

        <View style={s.group}>
          <Text style={[t.label, s.groupLabel]}>Your account</Text>
          <Row
            label="My attendance history"
            onPress={() => router.push({
              pathname: '/(app)/admin/history',
              params: { employeeId: employee.id, name: 'My records' },
            })}
          />
          <Row
            label="Change password"
            onPress={() => router.push('/(app)/change-password')}
          />
        </View>

        {isAdmin && (
          <View style={s.group}>
            <Text style={[t.label, s.groupLabel]}>Administration</Text>
            <Row label="Today's attendance" onPress={() => router.push('/(app)/admin/today')} />
            <Row label="All records" onPress={() => router.push('/(app)/admin/history')} />
            <Row label="Manage staff" onPress={() => router.push('/(app)/admin/employees')} />
            <Row label="Export CSV" onPress={() => router.push('/(app)/admin/export')} />
            <Row label="Settings" onPress={() => router.push('/(app)/admin/settings')} />
          </View>
        )}

        <Pressable style={s.signOut} onPress={signOut}>
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && { backgroundColor: c.bg }]}
      onPress={onPress}
    >
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.chevron}>›</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: sp.lg, paddingBottom: sp.xl },
  header: { marginBottom: sp.lg },
  greeting: { ...t.display, marginTop: sp.sm },
  sub: { ...t.meta, marginTop: sp.xs },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: sp.sm,
    backgroundColor: c.warnBg, borderRadius: r.md,
    padding: sp.md, marginBottom: sp.md,
  },
  bannerTitle: { color: c.warn, fontSize: 14, fontWeight: '700' },
  bannerSub: { color: c.warn, fontSize: 12, marginTop: 2, opacity: 0.85 },

  action: { backgroundColor: c.accent, borderRadius: r.lg, padding: sp.lg, marginBottom: sp.lg },
  actionTitle: { fontSize: 19, fontWeight: '700', color: c.accentInk },
  actionSub: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: sp.xs },

  group: {
    backgroundColor: c.surface, borderRadius: r.lg,
    borderWidth: 1, borderColor: c.line,
    marginBottom: sp.md, overflow: 'hidden',
  },
  groupLabel: { paddingHorizontal: sp.md, paddingTop: sp.md, paddingBottom: sp.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: sp.md, paddingVertical: 15,
    borderTopWidth: 1, borderTopColor: c.line,
  },
  rowLabel: { fontSize: 15, color: c.ink, fontWeight: '500' },
  chevron: { fontSize: 22, color: c.inkFaint, lineHeight: 24 },

  signOut: { alignItems: 'center', paddingVertical: sp.md, marginTop: sp.sm },
  signOutText: { color: c.danger, fontSize: 15, fontWeight: '600' },
})