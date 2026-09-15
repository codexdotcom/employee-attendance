import { Credentials, CredentialsModal } from '@/components/CredentialsModal'
import { adminApi } from '@/lib/adminApi'
import { alert } from '@/lib/alert'
import { supabase } from '@/lib/supabase'
import { c, r, sp, t } from '@/lib/theme'
import { Employee } from '@/lib/types'
import { useAuth } from '@/providers/AuthProvider'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList, Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'

export default function Employees() {
  const router = useRouter()
  const { employee: me } = useAuth()
  const [rows, setRows] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creds, setCreds] = useState<Credentials>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('is_active', { ascending: false })
      .order('full_name')
    if (error) alert('Error', error.message)
    setRows((data as Employee[]) ?? [])
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  function onReset(emp: Employee) {
    alert(
      'Reset password?',
      `A new password will be generated for ${emp.full_name}. Their current one stops working immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            setBusyId(emp.id)
            try {
              const res = await adminApi.resetPassword(emp.id)
              setCreds({
                email: res.email,
                password: res.password,
                name: emp.full_name,
                isReset: true,
              })
            } catch (e: any) {
              alert('Failed', e.message)
            } finally {
              setBusyId(null)
            }
          },
        },
      ]
    )
  }

  function onToggle(emp: Employee) {
    const turningOff = emp.is_active
    alert(
      turningOff ? `Disable ${emp.full_name}?` : `Enable ${emp.full_name}?`,
      turningOff
        ? 'They will be signed out and unable to log attendance. All their records are kept.'
        : 'They will be able to sign in and log attendance again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: turningOff ? 'Disable' : 'Enable',
          style: turningOff ? 'destructive' : 'default',
          onPress: async () => {
            setBusyId(emp.id)
            try {
              await adminApi.setActive(emp.id, !emp.is_active)
              await load()
            } catch (e: any) {
              alert('Failed', e.message)
            } finally {
              setBusyId(null)
            }
          },
        },
      ]
    )
  }

  function onDelete(emp: Employee) {
    alert(
      `Delete ${emp.full_name}?`,
      'This permanently removes their login, every attendance record, and every photo. It cannot be undone.\n\nTo simply stop them signing in, use Disable instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: async () => {
            setBusyId(emp.id)
            try {
              await adminApi.deleteEmployee(emp.id)
              await load()
            } catch (e: any) {
              alert('Could not delete', e.message)
            } finally {
              setBusyId(null)
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={c.accent} /></View>
  }

  const activeCount = rows.filter((x) => x.is_active).length

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View>
          <Text style={t.label}>Staff</Text>
          <Text style={s.count}>
            {activeCount} active
            {rows.length > activeCount ? `, ${rows.length - activeCount} disabled` : ''}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [s.add, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(app)/admin/new-employee')}
        >
          <Text style={s.addText}>Add staff</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={load} tintColor="#fff" />
        }
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>No staff yet.</Text>}
        renderItem={({ item }) => {
          const isMe = item.id === me?.id
          const working = busyId === item.id

          return (
            <View style={[s.card, !item.is_active && s.cardOff]}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>
                    {item.full_name}
                    {isMe && <Text style={s.you}>  you</Text>}
                  </Text>
                  <Text style={s.meta}>
                    {item.staff_code}
                    {item.department ? `   ${item.department}` : ''}
                    {item.role === 'ADMIN' ? '   Administrator' : ''}
                  </Text>
                  <Text style={s.email} numberOfLines={1}>{item.email}</Text>
                  {!item.auth_user_id && (
                    <Text style={s.warn}>No login linked to this record</Text>
                  )}
                  {!item.is_active && <Text style={s.disabled}>Disabled</Text>}
                </View>
                {working && <ActivityIndicator color={c.inkSoft} />}
              </View>

              <View style={s.actions}>
                <Pressable style={s.action} disabled={working} onPress={() => onReset(item)}>
                  <Text style={s.actionText}>Reset password</Text>
                </Pressable>

                <Pressable
                  style={s.action}
                  disabled={working || isMe}
                  onPress={() => onToggle(item)}
                >
                  <Text style={[
                    s.actionText,
                    item.is_active && { color: c.warn },
                    isMe && { color: c.inkFaint },
                  ]}>
                    {item.is_active ? 'Disable' : 'Enable'}
                  </Text>
                </Pressable>

                <Pressable
                  style={[s.action, s.actionLast]}
                  disabled={working || isMe}
                  onPress={() => onDelete(item)}
                >
                  <Text style={[s.actionText, { color: isMe ? c.inkFaint : c.danger }]}>
                    Delete
                  </Text>
                </Pressable>
              </View>
            </View>
          )
        }}
      />

      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, backgroundColor: c.bg, justifyContent: 'center' },

  head: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: sp.md, paddingTop: sp.md, paddingBottom: sp.sm,
  },
  count: { ...t.meta, marginTop: sp.xs, fontSize: 14 },
  add: { backgroundColor: c.accent, paddingHorizontal: sp.md, paddingVertical: 10, borderRadius: r.md },
  addText: { color: c.accentInk, fontWeight: '700', fontSize: 14 },

  list: { padding: sp.md, gap: sp.sm + 2, paddingBottom: sp.xl },

  card: {
    backgroundColor: c.surface, borderRadius: r.lg,
    borderWidth: 1, borderColor: c.line, overflow: 'hidden',
  },
  cardOff: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', padding: sp.md, gap: sp.sm },
  name: { color: c.ink, fontSize: 16, fontWeight: '600' },
  you: { color: c.inkFaint, fontSize: 11, fontWeight: '700' },
  meta: { color: c.inkSoft, fontSize: 13, marginTop: 3 },
  email: { color: c.inkFaint, fontSize: 12, marginTop: 2 },
  warn: { color: c.warn, fontSize: 12, marginTop: 6 },
  disabled: { color: c.inkFaint, fontSize: 12, fontWeight: '600', marginTop: 6 },

  actions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.line },
  action: {
    flex: 1, paddingVertical: 13, alignItems: 'center',
    borderRightWidth: 1, borderRightColor: c.line,
  },
  actionLast: { borderRightWidth: 0 },
  actionText: { color: c.accent, fontSize: 13, fontWeight: '600' },

  empty: { color: c.inkFaint, textAlign: 'center', marginTop: sp.xl, fontSize: 14 },
})