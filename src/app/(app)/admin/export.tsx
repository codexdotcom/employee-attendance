import { alert } from '@/lib/alert'
import { exportCsv } from '@/lib/export'
import { c, r, sp, t } from '@/lib/theme'
import { useState } from 'react'
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native'

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export default function Export() {
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [from, setFrom] = useState(iso(monthStart))
  const [to, setTo] = useState(iso(today))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function preset(kind: 'month' | 'lastMonth' | 'week') {
    const now = new Date()
    if (kind === 'month') {
      setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1)))
      setTo(iso(now))
    } else if (kind === 'lastMonth') {
      setFrom(iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
      setTo(iso(new Date(now.getFullYear(), now.getMonth(), 0)))
    } else {
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      setFrom(iso(start))
      setTo(iso(now))
    }
    setErr(null)
    setDone(null)
  }

  async function run() {
    setErr(null)
    setDone(null)
    setBusy(true)
    try {
      const n = await exportCsv(from, to)
      setDone(`${n} ${n === 1 ? 'record' : 'records'} exported.`)
      alert('Exported', `${n} records included.`)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={s.wrap}>
      <Text style={s.lead}>
        Exports every attendance record in the range as a spreadsheet file.
      </Text>

      <View style={s.presets}>
        <Preset label="This month" onPress={() => preset('month')} />
        <Preset label="Last month" onPress={() => preset('lastMonth')} />
        <Preset label="Last 7 days" onPress={() => preset('week')} />
      </View>

      <View style={s.card}>
        <View style={[s.field, s.divider]}>
          <Text style={t.label}>From</Text>
          <TextInput
            style={s.input}
            value={from}
            onChangeText={setFrom}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={c.inkFaint}
            autoCorrect={false}
            maxLength={10}
          />
        </View>
        <View style={s.field}>
          <Text style={t.label}>To</Text>
          <TextInput
            style={s.input}
            value={to}
            onChangeText={setTo}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={c.inkFaint}
            autoCorrect={false}
            maxLength={10}
          />
        </View>
      </View>

      {err && (
        <View style={s.errBox}>
          <Text style={s.errText}>{err}</Text>
        </View>
      )}

      {done && (
        <View style={s.okBox}>
          <Text style={s.okText}>{done}</Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [s.btn, (busy || pressed) && { opacity: 0.8 }]}
        onPress={run}
        disabled={busy}
      >
        {busy
          ? <ActivityIndicator color={c.accentInk} />
          : <Text style={s.btnText}>Export CSV</Text>}
      </Pressable>

      <Text style={s.note}>
        Opens the share sheet so you can send it to email or WhatsApp, or save it
        to your phone. In a browser it downloads directly.
      </Text>
    </View>
  )
}

function Preset({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [s.preset, pressed && { opacity: 0.8 }]}
      onPress={onPress}
    >
      <Text style={s.presetText}>{label}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg, padding: sp.lg },
  lead: { ...t.meta, lineHeight: 19, marginBottom: sp.md },

  presets: { flexDirection: 'row', gap: sp.sm, marginBottom: sp.md },
  preset: {
    flex: 1, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.line, borderRadius: r.sm,
    paddingVertical: 10, alignItems: 'center',
  },
  presetText: { color: c.accent, fontSize: 12, fontWeight: '600' },

  card: {
    backgroundColor: c.surface, borderRadius: r.lg,
    borderWidth: 1, borderColor: c.line, overflow: 'hidden',
  },
  field: { paddingHorizontal: sp.md, paddingTop: sp.md, paddingBottom: sp.sm + 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  input: { color: c.ink, fontSize: 17, letterSpacing: 0.5, paddingTop: 6, paddingBottom: 2 },

  errBox: { backgroundColor: c.dangerBg, borderRadius: r.sm, padding: sp.sm + 4, marginTop: sp.md },
  errText: { color: c.danger, fontSize: 14, lineHeight: 19 },
  okBox: { backgroundColor: c.okBg, borderRadius: r.sm, padding: sp.sm + 4, marginTop: sp.md },
  okText: { color: '#4ade80', fontSize: 14 },

  btn: {
    backgroundColor: c.accent, borderRadius: r.md,
    paddingVertical: 16, alignItems: 'center', marginTop: sp.lg,
  },
  btnText: { color: c.accentInk, fontSize: 16, fontWeight: '700' },
  note: { color: c.inkFaint, fontSize: 12, marginTop: sp.md, lineHeight: 18 },
})