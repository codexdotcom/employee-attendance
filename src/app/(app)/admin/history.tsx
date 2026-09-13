import { signedPhotoUrl } from '@/lib/photos'
import { supabase } from '@/lib/supabase'
import { c, r, sp, t } from '@/lib/theme'
import { AttendanceView } from '@/lib/types'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native'

const TONE = {
  PRESENT: c.accent,
  LATE: c.warn,
  FLAGGED: c.danger,
}

export default function History() {
  const { employeeId, name } = useLocalSearchParams<{ employeeId?: string; name?: string }>()
  const [rows, setRows] = useState<AttendanceView[]>([])
  const [loading, setLoading] = useState(true)
  const [photo, setPhoto] = useState<{ url: string; row: AttendanceView } | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)

  const load = useCallback(async () => {
    let q = supabase
      .from('attendance_view')
      .select('*')
      .order('scanned_at', { ascending: false })
      .limit(200)

    if (employeeId) q = q.eq('employee_id', employeeId)

    const { data, error } = await q
    if (error) console.warn(error.message)
    setRows((data as AttendanceView[]) ?? [])
    setLoading(false)
  }, [employeeId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function openPhoto(row: AttendanceView) {
    if (!row.photo_path) return
    setPhotoLoading(true)
    const url = await signedPhotoUrl(row.photo_path)
    setPhotoLoading(false)
    if (url) setPhoto({ url, row })
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={c.accent} /></View>
  }

  return (
    <View style={s.wrap}>
      {name ? (
        <View style={s.headerBlock}>
          <Text style={t.label}>Attendance</Text>
          <Text style={s.header}>{name}</Text>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={load} tintColor={c.inkSoft} />
        }
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>No records yet.</Text>}
        renderItem={({ item }) => {
          const tone = TONE[item.status] ?? c.line
          return (
            <Pressable
              style={({ pressed }) => [
                s.card,
                { borderLeftColor: tone },
                pressed && { backgroundColor: c.bg },
              ]}
              onPress={() => openPhoto(item)}
            >
              <View style={{ flex: 1 }}>
                {!employeeId && <Text style={s.name}>{item.full_name}</Text>}
                <View style={s.typeLine}>
                  <Text style={s.type}>
                    {item.type === 'CHECK_IN' ? 'Check in' : 'Check out'}
                  </Text>
                  {item.status !== 'PRESENT' && (
                    <Text style={[s.status, { color: tone }]}>{item.status}</Text>
                  )}
                </View>
                <Text style={s.meta}>
                  {new Date(item.scanned_at).toLocaleString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                  {item.distance_m != null && `   ${Math.round(item.distance_m)}m away`}
                </Text>
              </View>
              {item.photo_path
                ? <Text style={s.view}>Photo ›</Text>
                : <Text style={s.gone}>purged</Text>}
            </Pressable>
          )
        }}
      />

      {photoLoading && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <Modal visible={!!photo} transparent animationType="fade">
        <Pressable style={s.modal} onPress={() => setPhoto(null)}>
          {photo && (
            <>
              <Image source={{ uri: photo.url }} style={s.full} resizeMode="contain" />
              <View style={s.caption}>
                <Text style={s.capName}>{photo.row.full_name}</Text>
                <Text style={s.capMeta}>
                  {new Date(photo.row.scanned_at).toLocaleString('en-NG')}
                </Text>
                {photo.row.latitude != null && (
                  <Text style={s.capMeta}>
                    {photo.row.latitude.toFixed(5)}, {photo.row.longitude?.toFixed(5)}
                    {photo.row.accuracy_m != null && ` (±${Math.round(photo.row.accuracy_m)}m)`}
                  </Text>
                )}
              </View>
              <Text style={s.dismiss}>Tap anywhere to close</Text>
            </>
          )}
        </Pressable>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, backgroundColor: c.bg, justifyContent: 'center' },

  headerBlock: { paddingHorizontal: sp.lg, paddingTop: sp.md, paddingBottom: sp.xs },
  header: { ...t.title, marginTop: sp.xs },

  list: { padding: sp.md, gap: sp.sm, paddingBottom: sp.xl },

  card: {
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
  name: { fontSize: 15, fontWeight: '600', color: c.ink, marginBottom: 3 },
  typeLine: { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
  type: { fontSize: 14, fontWeight: '500', color: c.ink },
  status: { fontSize: 10, fontWeight: '700', letterSpacing: 0.9 },
  meta: { fontSize: 12, color: c.inkSoft, marginTop: 4 },
  view: { fontSize: 13, fontWeight: '600', color: c.accent },
  gone: { fontSize: 12, color: c.inkFaint },
  empty: { color: c.inkFaint, textAlign: 'center', marginTop: sp.xl, fontSize: 14 },

  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,17,15,0.4)',
    justifyContent: 'center',
  },

  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
    padding: sp.md,
  },
  full: { width: '100%', height: '64%' },
  caption: { marginTop: sp.md, gap: sp.xs },
  capName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  capMeta: { color: 'rgba(255,255,255,0.68)', fontSize: 13 },
  dismiss: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: sp.lg,
  },
})