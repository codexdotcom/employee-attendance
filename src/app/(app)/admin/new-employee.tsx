import { Credentials, CredentialsModal } from '@/components/CredentialsModal'
import { adminApi } from '@/lib/adminApi'
import { c, r, sp, t } from '@/lib/theme'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text, TextInput,
  View,
} from 'react-native'

export default function NewEmployee() {
  const router = useRouter()
  const [f, setF] = useState({
    full_name: '', email: '', staff_code: '', department: '', phone: '',
  })
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [creds, setCreds] = useState<Credentials>(null)

  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }))

  async function submit() {
    setErr(null)
    if (!f.full_name.trim() || !f.email.trim() || !f.staff_code.trim()) {
      setErr('Name, email and staff code are required.')
      return
    }
    setBusy(true)
    try {
      const res = await adminApi.createEmployee({
        full_name: f.full_name.trim(),
        email: f.email.trim(),
        staff_code: f.staff_code.trim(),
        department: f.department.trim() || undefined,
        phone: f.phone.trim() || undefined,
        role: isAdmin ? 'ADMIN' : 'STAFF',
      })
      setCreds({
        email: res.email,
        password: res.password,
        name: f.full_name.trim(),
      })
    } catch (e: any) {
      setErr(e.message)
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
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.title}>Add staff member</Text>
          <Text style={s.lead}>
            A login is created automatically and the password is shown once.
          </Text>

          <View style={s.card}>
            <Field
              label="Full name"
              required
              value={f.full_name}
              onChangeText={set('full_name')}
              placeholder="Adaeze Okafor"
            />
            <Field
              label="Email"
              required
              value={f.email}
              onChangeText={set('email')}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="adaeze@example.com"
            />
            <Field
              label="Staff code"
              required
              value={f.staff_code}
              onChangeText={set('staff_code')}
              autoCapitalize="characters"
              placeholder="RJS-014"
            />
            <Field
              label="Department"
              value={f.department}
              onChangeText={set('department')}
              placeholder="Primary"
            />
            <Field
              label="Phone"
              value={f.phone}
              onChangeText={set('phone')}
              keyboardType="phone-pad"
              placeholder="0801 234 5678"
              last
            />
          </View>

          <Pressable style={s.check} onPress={() => setIsAdmin((v) => !v)}>
            <View style={[s.box, isAdmin && s.boxOn]}>
              {isAdmin && <Text style={s.boxTick}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.checkTitle}>Administrator</Text>
              <Text style={s.checkSub}>
                Can view all records, manage staff, and export data.
              </Text>
            </View>
          </Pressable>

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
              : <Text style={s.btnText}>Create account</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <CredentialsModal
        creds={creds}
        onClose={() => { setCreds(null); router.back() }}
      />
    </View>
  )
}

function Field({
  label, required, last, ...rest
}: {
  label: string
  required?: boolean
  last?: boolean
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={[s.field, !last && s.fieldDivider]}>
      <Text style={t.label}>
        {label}{required ? ' *' : ''}
      </Text>
      <TextInput
        style={s.input}
        placeholderTextColor={c.inkFaint}
        autoCorrect={false}
        {...rest}
      />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: sp.lg, paddingBottom: sp.xl },
  title: { ...t.title },
  lead: { ...t.meta, marginTop: sp.xs, marginBottom: sp.lg },

  card: {
    backgroundColor: c.surface,
    borderRadius: r.lg,
    borderWidth: 1,
    borderColor: c.line,
    overflow: 'hidden',
  },
  field: { paddingHorizontal: sp.md, paddingTop: sp.md, paddingBottom: sp.sm + 2 },
  fieldDivider: { borderBottomWidth: 1, borderBottomColor: c.line },
  input: {
    color: c.ink,
    fontSize: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },

  check: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: sp.sm + 2,
    backgroundColor: c.surface,
    borderRadius: r.lg,
    borderWidth: 1,
    borderColor: c.line,
    padding: sp.md,
    marginTop: sp.md,
  },
  box: {
    width: 22, height: 22, borderRadius: r.sm,
    borderWidth: 2, borderColor: c.lineStrong,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: c.accent, borderColor: c.accent },
  boxTick: { color: c.accentInk, fontSize: 13, fontWeight: '700', lineHeight: 16 },
  checkTitle: { color: c.ink, fontSize: 15, fontWeight: '600' },
  checkSub: { color: c.inkSoft, fontSize: 12, lineHeight: 17, marginTop: 2 },

  errBox: {
    backgroundColor: c.dangerBg,
    borderRadius: r.sm,
    padding: sp.sm + 4,
    marginTop: sp.md,
  },
  errText: { color: c.danger, fontSize: 14, lineHeight: 19 },

  btn: {
    backgroundColor: c.accent,
    borderRadius: r.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: sp.lg,
  },
  btnText: { color: c.accentInk, fontSize: 16, fontWeight: '700' },
})