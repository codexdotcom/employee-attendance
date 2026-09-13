import { c, r, sp, t } from '@/lib/theme'
import { useAuth } from '@/providers/AuthProvider'
import { useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function Home() {
  const { employee, isAdmin, signOut } = useAuth()
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
            {employee.department ? `  ·  ${employee.department}` : ''}
            {isAdmin ? '  ·  Administrator' : ''}
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [s.action, pressed && s.actionPressed]}
          onPress={() => router.push('/(app)/scan')}
        >
          <Text style={s.actionTitle}>Log attendance</Text>
          <Text style={s.actionSub}>Take a photo, then scan the code</Text>
        </Pressable>

        <View style={s.group}>
          <Text style={[t.label, s.groupLabel]}>Your records</Text>
          <Row
            label="My attendance history"
            onPress={() => router.push({
              pathname: '/(app)/admin/history',
              params: { employeeId: employee.id, name: 'My records' },
            })}
          />
        </View>

        {isAdmin && (
          <View style={s.group}>
            <Text style={[t.label, s.groupLabel]}>Administration</Text>
            <Row label="Today's attendance" onPress={() => router.push('/(app)/admin/today')} />
            <Row label="All records" onPress={() => router.push('/(app)/admin/history')} />
            <Row label="Manage staff" onPress={() => router.push('/(app)/admin/employees')} />
            <Row label="Export CSV" onPress={() => router.push('/(app)/admin/export')} last />
          </View>
        )}

        <Pressable style={s.signOut} onPress={signOut}>
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Row({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, last && s.rowLast, pressed && s.rowPressed]}
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

  action: {
    backgroundColor: c.accent,
    borderRadius: r.lg,
    padding: sp.lg,
    marginBottom: sp.lg,
  },
  actionPressed: { opacity: 0.85 },
  actionTitle: { fontSize: 19, fontWeight: '700', color: c.accentInk },
  actionSub: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: sp.xs },

  group: {
    backgroundColor: c.surface,
    borderRadius: r.lg,
    borderWidth: 1,
    borderColor: c.line,
    marginBottom: sp.md,
    overflow: 'hidden',
  },
  groupLabel: {
    paddingHorizontal: sp.md,
    paddingTop: sp.md,
    paddingBottom: sp.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp.md,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: c.line,
  },
  rowLast: {},
  rowPressed: { backgroundColor: c.bg },
  rowLabel: { fontSize: 15, color: c.ink, fontWeight: '500' },
  chevron: { fontSize: 22, color: c.inkFaint, lineHeight: 24 },

  signOut: { alignItems: 'center', paddingVertical: sp.md, marginTop: sp.sm },
  signOutText: { color: c.danger, fontSize: 15, fontWeight: '600' },
})