import { supabase } from '@/lib/supabase'
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
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-NG', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const TONE = {
  PRESENT: { bg: '#14532d', fg: '#4ade80' },
  LATE:    { bg: '#78350f', fg: '#fbbf24' },
  ABSENT:  { bg: '#450a0a', fg: '#f87171' },
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

  const present = rows.filter(r => r.status !== 'ABSENT').length
  const late = rows.filter(r => r.status === 'LATE').length

  if (loading) return <View style={s.center}><ActivityIndicator /></View>

  return (
    <View style={s.wrap}>
      <View style={s.stats}>
        <Stat label="Present" value={`${present}/${rows.length}`} />
        <Stat label="Late" value={String(late)} />
        <Stat label="Absent" value={String(rows.length - present)} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(i) => i.employee_id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor="#fff" />}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => {
          const tone = TONE[item.status]
          return (
            <Pressable
              style={s.row}
              onPress={() => router.push({
                pathname: '/(app)/admin/history',
                params: { employeeId: item.employee_id, name: item.full_name },
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.full_name}</Text>
                <Text style={s.meta}>
                  In {time(item.check_in)} · Out {time(item.check_out)}
                </Text>
              </View>
              <View style={[s.pill, { backgroundColor: tone.bg }]}>
                <Text style={[s.pillText, { color: tone.fg }]}>{item.status}</Text>
              </View>
            </Pressable>
          )
        }}
      />
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center' },
  stats: { flexDirection: 'row', padding: 16, gap: 10 },
  stat: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 14, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '700' },
  statLabel: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 12, padding: 14, gap: 10 },
  name: { color: '#fff', fontSize: 15, fontWeight: '600' },
  meta: { color: '#94a3b8', fontSize: 13, marginTop: 3 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: '700' },
})