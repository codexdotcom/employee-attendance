import { c, r, sp, t } from '@/lib/theme'
import { useAuth } from '@/providers/AuthProvider'
import { useState } from 'react'
import {
    ActivityIndicator, KeyboardAvoidingView, Platform,
    Pressable, StyleSheet,
    Text, TextInput,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SignIn() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit() {
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      await signIn(email, password)
    } catch (e: any) {
      const msg = String(e?.message ?? '')
      setError(
        msg.includes('Invalid login')
          ? 'Email or password is incorrect.'
          : msg || 'Could not sign in. Check your connection.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.wrap}
      >
        <View style={s.mark}>
          <Text style={s.markText}>RJ</Text>
        </View>

        <Text style={s.title}>Realjoy School</Text>
        <Text style={s.sub}>Staff attendance</Text>

        <View style={s.form}>
          <Text style={t.label}>Email</Text>
          <TextInput
            style={s.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={[t.label, { marginTop: sp.md }]}>Password</Text>
          <TextInput
            style={s.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={onSubmit}
          />
        </View>

        {error && (
          <View style={s.errBox}>
            <Text style={s.errText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [s.button, (busy || pressed) && { opacity: 0.85 }]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy
            ? <ActivityIndicator color={c.accentInk} />
            : <Text style={s.buttonText}>Sign in</Text>}
        </Pressable>

        <Text style={s.help}>
          No account? Ask the school administrator to register you.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: sp.lg },
  mark: {
    width: 56, height: 56, borderRadius: r.md,
    backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center',
    marginBottom: sp.lg,
  },
  markText: { color: c.accentInk, fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },
  title: { ...t.display },
  sub: { ...t.meta, marginTop: sp.xs, marginBottom: sp.xl },
  form: { gap: sp.sm },
  input: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.lineStrong,
    borderRadius: r.md,
    paddingHorizontal: sp.md,
    paddingVertical: 13,
    fontSize: 16,
    color: c.ink,
    marginTop: sp.xs,
  },
  errBox: {
    backgroundColor: c.dangerBg, borderRadius: r.sm,
    padding: sp.sm + 2, marginTop: sp.md,
  },
  errText: { color: c.danger, fontSize: 14 },
  button: {
    backgroundColor: c.accent, borderRadius: r.md,
    paddingVertical: 16, alignItems: 'center', marginTop: sp.lg,
  },
  buttonText: { color: c.accentInk, fontSize: 16, fontWeight: '700' },
  help: { color: c.inkFaint, fontSize: 13, textAlign: 'center', marginTop: sp.lg },
})