import { supabase } from '@/lib/supabase'
import { c, r, sp, t } from '@/lib/theme'
import { AppSettings } from '@/lib/types'
import { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text, TextInput,
    View,
} from 'react-native'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [late, setLate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('*')
      .single()
      .then(({ data, error }) => {
        if (error) setErr(error.message)
        const st = data as AppSettings
        setSettings(st)
        setLate(st?.late_cutoff?.slice(0, 5) ?? '07:45')
      })
  }, [])

  async function save(patch: Partial<AppSettings>) {
    setBusy(true)
    setErr(null)
    const { data, error } = await supabase
      .from('app_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select()
      .single()
    setBusy(false)
    if (error) {
      setErr(error.message)
      return false
    }
    setSettings(data as AppSettings)
    return true
  }

  async function saveLate() {
    if (!TIME_RE.test(late)) {
      setErr('Enter the time as HH:MM in 24 hour format, for example 07:45.')
      return
    }
    const ok = await save({ late_cutoff: late })
    if (ok) Alert.alert('Saved', `Check-ins after ${late} are marked late.`)
  }

  async function purgeNow() {
    Alert.alert(
      'Delete old photos now?',
      `Photos older than ${settings?.photo_retention_weeks} weeks will be removed. Attendance records are kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true)
            const { data, error } = await supabase.rpc('purge_old_photos')
            setBusy(false)
            if (error) Alert.alert('Failed', error.message)
            else Alert.alert('Done', `${data ?? 0} records had photos removed.`)
          },
        },
      ]
    )
  }

  if (!settings) {
    return <View style={s.center}><ActivityIndicator color={c.accent} /></View>
  }

  return (
    <ScrollView style={s.wrap} contentContainerStyle={s.scroll}>
      <Text style={t.label}>Late cutoff</Text>
      <View style={s.card}>
        <Text style={s.rowLabel}>
          Check-ins after this time are marked late. Uses Lagos time.
        </Text>
        <View style={s.timeRow}>
          <TextInput
            style={s.timeInput}
            value={late}
            onChangeText={setLate}
            placeholder="07:45"
            placeholderTextColor={c.inkFaint}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
          <Pressable style={s.saveBtn} onPress={saveLate} disabled={busy}>
            <Text style={s.saveText}>Save</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[t.label, s.section]}>Features</Text>
      <View style={s.card}>
        <Toggle
          title="Allow recording for others"
          sub="Staff can photograph a colleague and log attendance on their behalf. Every such record shows who logged it."
          value={settings.allow_proxy}
          disabled={busy}
          onChange={(v) => save({ allow_proxy: v })}
        />
        <View style={s.divider} />
        <Toggle
          title="Allow offline recording"
          sub="Punches taken without internet are stored on the phone and sent later, using the phone's clock."
          value={settings.allow_offline}
          disabled={busy}
          onChange={(v) => save({ allow_offline: v })}
        />
      </View>

      <Text style={[t.label, s.section]}>Photo storage</Text>
      <View style={s.card}>
        <Text style={s.rowLabel}>
          Photos are deleted automatically after {settings.photo_retention_weeks} weeks,
          every Sunday at 02:00. Attendance records themselves are never deleted.
        </Text>
        <Pressable style={s.linkBtn} onPress={purgeNow} disabled={busy}>
          <Text style={s.linkText}>Run cleanup now</Text>
        </Pressable>
      </View>

      {err && (
        <View style={s.errBox}>
          <Text style={s.errText}>{err}</Text>
        </View>
      )}
    </ScrollView>
  )
}

function Toggle({
  title, sub, value, onChange, disabled,
}: {
  title: string
  sub: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <View style={s.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleTitle}>{title}</Text>
        <Text style={s.toggleSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: c.accent, false: c.lineStrong }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, backgroundColor: c.bg, justifyContent: 'center' },
  scroll: { padding: sp.lg, paddingBottom: sp.xl },
  section: { marginTop: sp.lg },
  card: {
    backgroundColor: c.surface, borderRadius: r.lg,
    borderWidth: 1, borderColor: c.line,
    padding: sp.md, marginTop: sp.sm,
  },
  rowLabel: { color: c.inkSoft, fontSize: 13, lineHeight: 19 },
  timeRow: { flexDirection: 'row', gap: sp.sm, marginTop: sp.md, alignItems: 'center' },
  timeInput: {
    flex: 1, backgroundColor: c.bg, borderRadius: r.sm,
    paddingHorizontal: sp.md, paddingVertical: 12,
    color: c.ink, fontSize: 18, letterSpacing: 1,
  },
  saveBtn: {
    backgroundColor: c.accent, borderRadius: r.sm,
    paddingHorizontal: sp.lg, paddingVertical: 13,
  },
  saveText: { color: c.accentInk, fontWeight: '700', fontSize: 14 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: sp.md, paddingVertical: sp.xs },
  toggleTitle: { color: c.ink, fontSize: 15, fontWeight: '600' },
  toggleSub: { color: c.inkSoft, fontSize: 12, lineHeight: 18, marginTop: 3 },
  divider: { height: 1, backgroundColor: c.line, marginVertical: sp.md },

  linkBtn: { marginTop: sp.md, paddingVertical: sp.sm },
  linkText: { color: c.accent, fontSize: 14, fontWeight: '600' },

  errBox: { backgroundColor: c.dangerBg, borderRadius: r.sm, padding: sp.sm + 4, marginTop: sp.md },
  errText: { color: c.danger, fontSize: 14 },
})