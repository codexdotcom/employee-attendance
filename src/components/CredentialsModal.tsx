import { c, r, sp, t } from '@/lib/theme'
import * as Clipboard from 'expo-clipboard'
import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

export type Credentials = {
  email: string
  password: string
  name?: string
  isReset?: boolean
} | null

export function CredentialsModal({
  creds,
  onClose,
}: {
  creds: Credentials
  onClose: () => void
}) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(value: string, key: string) {
    await Clipboard.setStringAsync(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 1800)
  }

  if (!creds) return null

  const both =
    `Realjoy School Attendance\n` +
    `Email: ${creds.email}\n` +
    `Password: ${creds.password}`

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.title}>
            {creds.isReset ? 'Password reset' : 'Account created'}
          </Text>
          {creds.name && <Text style={s.sub}>{creds.name}</Text>}

          <Field
            label="Email"
            value={creds.email}
            copied={copied === 'email'}
            onCopy={() => copy(creds.email, 'email')}
          />
          <Field
            label="Password"
            value={creds.password}
            mono
            copied={copied === 'pw'}
            onCopy={() => copy(creds.password, 'pw')}
          />

          <Pressable style={s.primary} onPress={() => copy(both, 'both')}>
            <Text style={s.primaryText}>
              {copied === 'both' ? 'Copied to clipboard' : 'Copy both'}
            </Text>
          </Pressable>

          <Text style={s.warn}>
            This password is not stored anywhere. Send it to the staff member
            before closing this window.
          </Text>

          <Pressable style={s.close} onPress={onClose}>
            <Text style={s.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

function Field({
  label, value, onCopy, copied, mono,
}: {
  label: string
  value: string
  onCopy: () => void
  copied: boolean
  mono?: boolean
}) {
  return (
    <View style={s.field}>
      <Text style={t.label}>{label}</Text>
      <View style={s.fieldRow}>
        <Text
          selectable
          style={[s.value, mono && s.mono]}
          numberOfLines={1}
        >
          {value}
        </Text>
        <Pressable style={s.copyBtn} onPress={onCopy} hitSlop={8}>
          <Text style={s.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: sp.lg,
  },
  sheet: {
    backgroundColor: c.surface,
    borderRadius: r.lg,
    padding: sp.lg,
    gap: sp.sm,
  },
  title: { ...t.title },
  sub: { ...t.meta, marginBottom: sp.sm },

  field: { marginTop: sp.sm },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bg,
    borderRadius: r.sm,
    paddingLeft: sp.md,
    paddingRight: sp.sm,
    paddingVertical: 12,
    marginTop: sp.xs,
    gap: sp.sm,
  },
  value: { flex: 1, color: c.ink, fontSize: 15 },
  mono: {
    fontFamily: 'monospace',
    fontSize: 17,
    letterSpacing: 1,
  },
  copyBtn: {
    paddingHorizontal: sp.sm + 2,
    paddingVertical: 6,
    borderRadius: r.sm,
    backgroundColor: c.surface,
  },
  copyText: { color: c.accent, fontSize: 13, fontWeight: '700' },

  primary: {
    backgroundColor: c.accent,
    borderRadius: r.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: sp.md,
  },
  primaryText: { color: c.accentInk, fontSize: 15, fontWeight: '700' },

  warn: { color: c.warn, fontSize: 12, lineHeight: 18, marginTop: sp.sm },

  close: { alignItems: 'center', paddingVertical: sp.md, marginTop: sp.xs },
  closeText: { color: c.inkSoft, fontSize: 15, fontWeight: '600' },
})