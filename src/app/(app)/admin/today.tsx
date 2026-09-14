import { supabase } from '@/lib/supabase'
import { c, r, sp, t } from '@/lib/theme'
import { RosterRow } from '@/lib/types'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'

function time(iso: string | null) {
  if (!iso) return 'not yet'
  return new Date(iso).toLocaleTimeString('en-NG', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const TONE: Record<string, string> = {
  PRESENT: '#4ade80',
  LATE: c.warn,
  ABSENT: c.danger,
}

export default function Today() {
  const router = useRouter()
  const [rows, setRows] = useState<RosterRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('daily_roster', { p_date: null })
    if (error) console.warn(error.message)
    setRows((data as RosterRow[]) ?? [])
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const present = rows.filter((x) => x.status !== 'ABSENT').length
  const late = rows.filter((x) => x.status === 'LATE').length

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={c.accent} /></View>
  }

  const dateLabel = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={t.label}>{dateLabel}</Text>
      </View>

      <View style={s.stats}>
        <Stat label="Present" value={`${present}/${rows.length}`} />
        <Stat label="Late" value={String(late)} tone={late > 0 ? c.warn : undefined} />
        <Stat
          label="Absent"
          value={String(rows.length - present)}
          tone={rows.length - present > 0 ? c.danger : undefined}
        />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(i) => i.employee_id}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={load} tintColor="#fff" />
        }
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>No active staff.</Text>}
        renderItem={({ item }) => {
          const tone = TONE[item.status] ?? c.line
          return (
            <Pressable
              style={({ pressed }) => [
                s.row,
                { borderLeftColor: tone },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() =>
                router.push({
                  pathname: '/(app)/admin/history',
                  params: { employeeId: item.employee_id, name: item.full_name },
                })
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.full_name}</Text>
                <Text style={s.meta}>
                  {item.staff_code}
                  {item.department ? `   ${item.department}` : ''}
                </Text>
                {item.status === 'ABSENT' ? (
                  <Text style={s.absent}>No check in recorded</Text>
                ) : (
                  <Text style={s.times}>
                    In {time(item.check_in)}    Out {time(item.check_out)}
                  </Text>
                )}
                {item.proxy_in && (
                  <Text style={s.proxyFlag}>Logged by someone else</Text>
                )}
              </View>
              <Text style={[s.status, { color: tone }]}>{item.status}</Text>
            </Pressable>
          )
        }}
      />
    </View>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, backgroundColor: c.bg, justifyContent: 'center' },

  head: { paddingHorizontal: sp.md, paddingTop: sp.md },
  stats: { flexDirection: 'row', padding: sp.md, gap: sp.sm + 2 },
  stat: {
    flex: 1,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: r.md,
    paddingVertical: sp.md,
    alignItems: 'center',
  },
  statValue: { color: c.ink, fontSize: 22, fontWeight: '700' },
  statLabel: { color: c.inkSoft, fontSize: 12, marginTop: 3 },

  list: { paddingHorizontal: sp.md, gap: sp.sm, paddingBottom: sp.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderLeftWidth: 3,
    borderRadius: r.md,
    padding: sp.md,
    gap: sp.sm,
  },
  name: { color: c.ink, fontSize: 15, fontWeight: '600' },
  meta: { color: c.inkFaint, fontSize: 12, marginTop: 2 },
  times: { color: c.inkSoft, fontSize: 13, marginTop: 5 },
  absent: { color: c.inkFaint, fontSize: 13, marginTop: 5, fontStyle: 'italic' },
  proxyFlag: { color: c.warn, fontSize: 11, fontWeight: '600', marginTop: 4 },
  status: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9 },

  empty: { color: c.inkFaint, textAlign: 'center', marginTop: sp.xl, fontSize: 14 },
})