import { alert } from '@/lib/alert'
import { supabase } from '@/lib/supabase'
import { c, r, sp, t } from '@/lib/theme'
import { useAuth } from '@/providers/AuthProvider'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView, Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text, TextInput,
  View,
} from 'react-native'

export default function ChangePassword() {
  const router = useRouter()
  const { employee } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setErr(null)

    if (!employee) {
      setErr('Your account could not be loaded. Sign out and back in.')
      return
    }
    if (!current || !next || !confirm) {
      setErr('Fill in all three fields.')
      return
    }
    if (next.length < 8) {
      setErr('Your new password must be at least 8 characters.')
      return
    }
    if (next !== confirm) {
      setErr('The two new passwords do not match.')
      return
    }
    if (next === current) {
      setErr('Your new password must be different from the current one.')
      return
    }

    setBusy(true)
    try {
      // Re-authenticate first, so a borrowed unlocked phone cannot be used
      // to change someone's password.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: employee.email,
        password: current,
      })
      if (signInErr) {
        setErr('Your current password is incorrect.')
        return
      }

      const { error } = await supabase.auth.updateUser({ password: next })
      if (error) {
        setErr(error.message)
        return
      }

      setCurrent('')
      setNext('')
      setConfirm('')

      alert(
        'Password changed',
        'Use your new password the next time you sign in.',
        [{ text: 'Done', onPress: () => router.back() }]
      )
    } catch (e: any) {
      setErr(e?.message ?? 'Could not change your password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={s.wrap}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.lead}>
            Choose something only you know. At least 8 characters.
          </Text>

          <View style={s.card}>
            <Field label="Current password" value={current} onChangeText={setCurrent} />
            <Field label="New password" value={next} onChangeText={setNext} />
            <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} last />
          </View>

          {err && (
            <View style={s.errBox}>
              <Text style={s.errText}>{err}</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [s.btn, (busy || pressed) && { opacity: 0.8 }]}
            onPress={submit}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color={c.accentInk} />
              : <Text style={s.btnText}>Change password</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function Field({
  label, last, ...rest
}: { label: string; last?: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={[s.field, !last && s.divider]}>
      <Text style={t.label}>{label}</Text>
      <TextInput
        style={s.input}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        {...rest}
      />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: sp.lg, paddingBottom: sp.xl },
  lead: { ...t.meta, marginBottom: sp.md, lineHeight: 19 },
  card: {
    backgroundColor: c.surface, borderRadius: r.lg,
    borderWidth: 1, borderColor: c.line, overflow: 'hidden',
  },
  field: { paddingHorizontal: sp.md, paddingTop: sp.md, paddingBottom: sp.sm + 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  input: { color: c.ink, fontSize: 16, paddingTop: 6, paddingBottom: 2 },
  errBox: { backgroundColor: c.dangerBg, borderRadius: r.sm, padding: sp.sm + 4, marginTop: sp.md },
  errText: { color: c.danger, fontSize: 14, lineHeight: 19 },
  btn: {
    backgroundColor: c.accent, borderRadius: r.md,
    paddingVertical: 16, alignItems: 'center', marginTop: sp.lg,
  },
  btnText: { color: c.accentInk, fontSize: 16, fontWeight: '700' },
})