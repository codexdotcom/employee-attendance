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

const TONE: Record<string, string> = {
  PRESENT: '#4ade80',
  LATE: c.warn,
  FLAGGED: c.danger,
}

export default function History() {
  const { employeeId, name } = useLocalSearchParams<{ employeeId?: string; name?: string }>()
  const [rows, setRows] = useState<AttendanceView[]>([])
  const [loading, setLoading] = useState(true)
  const [photo, setPhoto] = useState<{ url: string; row: AttendanceView; isPerson: boolean } | null>(null)
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

  // Prefer the photo of the person when one exists, since that is the one
  // worth checking on a proxy record.
  async function openPhoto(row: AttendanceView) {
    const isPerson = !!row.subject_photo_path
    const path = row.subject_photo_path || row.photo_path
    if (!path) return
    setPhotoLoading(true)
    const url = await signedPhotoUrl(path)
    setPhotoLoading(false)
    if (url) setPhoto({ url, row, isPerson })
  }

  async function swapPhoto() {
    if (!photo) return
    const other = photo.isPerson ? photo.row.photo_path : photo.row.subject_photo_path
    if (!other) return
    setPhotoLoading(true)
    const url = await signedPhotoUrl(other)
    setPhotoLoading(false)
    if (url) setPhoto({ url, row: photo.row, isPerson: !photo.isPerson })
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={c.accent} /></View>
  }

  const hasBoth = !!photo?.row.subject_photo_path && !!photo?.row.photo_path

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
          <RefreshControl refreshing={false} onRefresh={load} tintColor="#fff" />
        }
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>No records yet.</Text>}
        renderItem={({ item }) => {
          const tone = TONE[item.status] ?? c.line
          const hasPhoto = !!(item.photo_path || item.subject_photo_path)
          return (
            <Pressable
              style={({ pressed }) => [
                s.card,
                { borderLeftColor: tone },
                pressed && { opacity: 0.85 },
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

                {(item.is_proxy || item.is_offline) && (
                  <View style={s.flags}>
                    {item.is_proxy && (
                      <Text style={s.flag}>
                        Logged by {item.recorded_by_name ?? 'another staff member'}
                      </Text>
                    )}
                    {item.is_offline && (
                      <Text style={s.flag}>Recorded offline, device time</Text>
                    )}
                  </View>
                )}
              </View>

              {hasPhoto
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

      <Modal visible={!!photo} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
        <View style={s.modal}>
          {photo && (
            <>
              <Pressable style={s.imageArea} onPress={() => setPhoto(null)}>
                <Image source={{ uri: photo.url }} style={s.full} resizeMode="contain" />
              </Pressable>

              <View style={s.caption}>
                <Text style={s.capLabel}>
                  {photo.isPerson ? 'Photo of the person' : 'Photo of the surroundings'}
                </Text>
                <Text style={s.capName}>{photo.row.full_name}</Text>
                <Text style={s.capMeta}>
                  {new Date(photo.row.scanned_at).toLocaleString('en-NG')}
                </Text>
                {photo.row.recorded_by_name && (
                  <Text style={s.capWarn}>
                    Logged by {photo.row.recorded_by_name}
                  </Text>
                )}
                {photo.row.is_offline && (
                  <Text style={s.capWarn}>
                    Recorded offline, time taken from the device
                  </Text>
                )}
                {photo.row.latitude != null && (
                  <Text style={s.capMeta}>
                    {photo.row.latitude.toFixed(5)}, {photo.row.longitude?.toFixed(5)}
                    {photo.row.accuracy_m != null && ` (±${Math.round(photo.row.accuracy_m)}m)`}
                  </Text>
                )}

                {hasBoth && (
                  <Pressable style={s.swap} onPress={swapPhoto}>
                    <Text style={s.swapText}>
                      {photo.isPerson ? 'View surroundings' : 'View the person'}
                    </Text>
                  </Pressable>
                )}
              </View>

              <Pressable onPress={() => setPhoto(null)}>
                <Text style={s.dismiss}>Close</Text>
              </Pressable>
            </>
          )}
        </View>
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
  flags: { marginTop: 5, gap: 2 },
  flag: { color: c.warn, fontSize: 11, fontWeight: '600' },
  view: { fontSize: 13, fontWeight: '600', color: c.accent },
  gone: { fontSize: 12, color: c.inkFaint },
  empty: { color: c.inkFaint, textAlign: 'center', marginTop: sp.xl, fontSize: 14 },

  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
  },

  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    padding: sp.md,
  },
  imageArea: { height: '58%' },
  full: { width: '100%', height: '100%' },
  caption: { marginTop: sp.md, gap: sp.xs },
  capLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  capName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  capMeta: { color: 'rgba(255,255,255,0.68)', fontSize: 13 },
  capWarn: { color: c.warn, fontSize: 13, fontWeight: '600' },
  swap: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: r.sm,
    paddingHorizontal: sp.md,
    paddingVertical: 8,
    marginTop: sp.sm,
  },
  swapText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  dismiss: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: sp.lg,
    paddingVertical: sp.sm,
  },
})