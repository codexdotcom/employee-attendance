import { exportCsv } from '@/lib/export'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

function iso(d: Date) { return d.toISOString().slice(0, 10) }

export default function Export() {
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [from, setFrom] = useState(iso(monthStart))
  const [to, setTo] = useState(iso(today))
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const n = await exportCsv(from, to)
      Alert.alert('Exported', `${n} records.`)
    } catch (e: any) {
      Alert.alert('Export failed', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={s.wrap}>
      <Text style={s.label}>From</Text>
      <TextInput style={s.input} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" placeholderTextColor="#64748b" />
      <Text style={s.label}>To</Text>
      <TextInput style={s.input} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" placeholderTextColor="#64748b" />

      <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={run} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Export CSV</Text>}
      </Pressable>

      <Text style={s.note}>Opens the share sheet so you can send it to email or WhatsApp.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f172a', padding: 20, gap: 8 },
  label: { color: '#94a3b8', fontSize: 13, marginTop: 8 },
  input: { backgroundColor: '#1e293b', color: '#fff', borderRadius: 10, padding: 14, fontSize: 16 },
  btn: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  note: { color: '#64748b', fontSize: 12, marginTop: 12 },
})