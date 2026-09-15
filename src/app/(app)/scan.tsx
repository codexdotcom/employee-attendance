import { WebPhotoCapture } from '@/components/WebPhotoCapture'
import { WebQrScanner } from '@/components/WebQrScanner'
import { usePunchPermissions } from '@/hooks/usePunchPermissions'
import { alert } from '@/lib/alert'
import { submitPunch } from '@/lib/punch'
import { supabase } from '@/lib/supabase'
import { c, r, sp, t } from '@/lib/theme'
import { PunchType, StaffDirectoryEntry } from '@/lib/types'
import { useAuth } from '@/providers/AuthProvider'
import { useSync } from '@/providers/SyncProvider'
import { CameraView } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable, StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

const isWeb = Platform.OS === 'web'
const STAFF_CACHE = 'staff_directory_cache'
const PROXY_CACHE = 'allow_proxy'

function cacheGet(key: string) {
  try { return window.localStorage?.getItem(key) ?? null } catch { return null }
}
function cacheSet(key: string, value: string) {
  try { window.localStorage?.setItem(key, value) } catch { /* private mode */ }
}

type Step =
  | 'who' | 'choose' | 'photo' | 'review'
  | 'person' | 'personReview' | 'pick'
  | 'qr' | 'sending' | 'done'

export default function Scan() {
  const { employee } = useAuth()
  const { refresh } = useSync()
  const router = useRouter()
  const perms = usePunchPermissions()
  const cameraRef = useRef<CameraView>(null)
  const scanLock = useRef(false)

  // Revoked on unmount only. Revoking when photo state changes would kill
  // the first photo the moment the second is taken, which breaks the proxy flow.
  const blobUrls = useRef<string[]>([])

  const [step, setStep] = useState<Step>('who')
  const [proxy, setProxy] = useState(false)
  const [allowProxy, setAllowProxy] = useState(true)
  const [type, setType] = useState<PunchType>('CHECK_IN')
  const [photo, setPhoto] = useState<string | null>(null)
  const [personPhoto, setPersonPhoto] = useState<string | null>(null)
  const [subject, setSubject] = useState<StaffDirectoryEntry | null>(null)
  const [staff, setStaff] = useState<StaffDirectoryEntry[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffStale, setStaffStale] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [camReady, setCamReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [queued, setQueued] = useState(false)

  // Cached so the flow still works offline, where the settings fetch fails.
  useEffect(() => {
    const cached = cacheGet(PROXY_CACHE)
    if (cached !== null) setAllowProxy(cached === 'true')

    supabase
      .from('app_settings')
      .select('allow_proxy')
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) return
        const v = data.allow_proxy ?? true
        setAllowProxy(v)
        cacheSet(PROXY_CACHE, String(v))
      })
  }, [])

  useEffect(() => {
    return () => {
      if (isWeb) {
        blobUrls.current.forEach((u) => {
          try { URL.revokeObjectURL(u) } catch { /* already gone */ }
        })
        blobUrls.current = []
      }
    }
  }, [])

  function trackBlob(uri: string) {
    if (isWeb && uri.startsWith('blob:')) blobUrls.current.push(uri)
  }

  async function beginFor(isProxy: boolean) {
    setProxy(isProxy)
    setError(null)

    // On web the browser prompts for camera and location on first use,
    // so there is nothing to request up front.
    if (!isWeb) {
      const g = await perms.requestAll()
      if (!g.camera) {
        alert('Camera needed', 'Enable camera access in Settings to log attendance.')
        return
      }
      if (!g.location) {
        alert('Location needed', 'Location confirms you are on school premises.')
        return
      }
    }
    setStep('choose')
  }

  function chooseType(v: PunchType) {
    setType(v)
    setCamReady(false)
    setStep('photo')
  }

  async function capture(target: 'env' | 'person') {
    if (!camReady || capturing) return
    setCapturing(true)
    try {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 0.6 })
      if (shot?.uri) {
        if (target === 'env') {
          setPhoto(shot.uri)
          setStep('review')
        } else {
          setPersonPhoto(shot.uri)
          setStep('personReview')
        }
      }
    } catch {
      alert('Camera', 'Could not take the photo. Try again.')
    } finally {
      setCapturing(false)
    }
  }

  // The staff list is cached so proxy punches still work with no connection.
  async function openPicker() {
    setStep('pick')
    setStaffStale(false)

    const cached = cacheGet(STAFF_CACHE)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as StaffDirectoryEntry[]
        setStaff(parsed.filter((x) => x.id !== employee?.id))
      } catch { /* corrupt cache, ignore */ }
    }

    setStaffLoading(!cached)
    const { data, error: err } = await supabase
      .from('staff_directory')
      .select('*')
      .order('full_name')
    setStaffLoading(false)

    if (err || !data) {
      if (!cached) alert('Could not load staff', 'Connect to the internet and try again.')
      else setStaffStale(true)
      return
    }

    cacheSet(STAFF_CACHE, JSON.stringify(data))
    setStaff((data as StaffDirectoryEntry[]).filter((x) => x.id !== employee?.id))
  }

  const onScan = useCallback(async ({ data }: { data: string }) => {
    if (scanLock.current || !photo || !employee) return
    if (proxy && (!subject || !personPhoto)) return
    scanLock.current = true
    setStep('sending')
    setError(null)

    try {
      const res = await submitPunch({
        qrSecret: data.trim(),
        type,
        photoUri: photo,
        subjectPhotoUri: proxy ? personPhoto : null,
        subjectId: proxy ? subject!.id : null,
        subjectName: proxy ? subject!.full_name : null,
        employeeId: employee.id,
      })
      setQueued(res.queued)
      await refresh()
      setStep('done')
    } catch (e: any) {
      setError(e.message)
      setStep('qr')
      setTimeout(() => { scanLock.current = false }, 1500)
    }
  }, [photo, personPhoto, subject, employee, type, proxy, refresh])

  if ((!isWeb && !perms.ready) || !employee) {
    return <View style={s.center}><ActivityIndicator color={c.accent} /></View>
  }

  // ---------- who is this for ----------
  if (step === 'who') {
    return (
      <View style={s.pad}>
        <Text style={s.h1}>Who is this for?</Text>
        <Pressable
          style={({ pressed }) => [s.choice, s.choicePrimary, pressed && { opacity: 0.85 }]}
          onPress={() => beginFor(false)}
        >
          <Text style={s.choiceTitleLight}>Myself</Text>
          <Text style={s.choiceSubLight}>{employee.full_name}</Text>
        </Pressable>

        {allowProxy && (
          <Pressable
            style={({ pressed }) => [s.choice, s.choiceAlt, pressed && { opacity: 0.85 }]}
            onPress={() => beginFor(true)}
          >
            <Text style={s.choiceTitle}>Someone else</Text>
            <Text style={s.choiceSub}>
              You will photograph them and select their name. The record shows it was
              logged by you.
            </Text>
          </Pressable>
        )}
      </View>
    )
  }

  // ---------- check in or out ----------
  if (step === 'choose') {
    return (
      <View style={s.pad}>
        {proxy && <Text style={s.tag}>Recording for someone else</Text>}
        <Text style={s.h1}>What are you recording?</Text>
        <Pressable
          style={({ pressed }) => [s.choice, s.choicePrimary, pressed && { opacity: 0.85 }]}
          onPress={() => chooseType('CHECK_IN')}
        >
          <Text style={s.choiceTitleLight}>Check in</Text>
          <Text style={s.choiceSubLight}>Arriving at school</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.choice, s.choiceAlt, pressed && { opacity: 0.85 }]}
          onPress={() => chooseType('CHECK_OUT')}
        >
          <Text style={s.choiceTitle}>Check out</Text>
          <Text style={s.choiceSub}>Leaving for the day</Text>
        </Pressable>
      </View>
    )
  }

  // ---------- environment photo ----------
  if (step === 'photo') {
    if (isWeb) {
      return (
        <View style={s.pad}>
          <Text style={t.label}>Step 1 of {proxy ? 3 : 2}</Text>
          <Text style={s.h1}>Photograph where you are standing</Text>
          <WebPhotoCapture
            onCapture={(uri) => { trackBlob(uri); setPhoto(uri); setStep('review') }}
          />
        </View>
      )
    }
    return (
      <View style={s.camWrap}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
          onCameraReady={() => setCamReady(true)}
        />
        <View style={s.overlay} pointerEvents="box-none">
          <Text style={s.hint}>
            {camReady ? 'Step 1: photograph where you are standing' : 'Preparing camera'}
          </Text>
          <Shutter disabled={!camReady || capturing} onPress={() => capture('env')} />
        </View>
      </View>
    )
  }

  if (step === 'review' && photo) {
    const next = () => {
      if (proxy) { setCamReady(false); setStep('person') }
      else setStep('qr')
    }
    const retake = () => { setPhoto(null); setCamReady(false); setStep('photo') }

    if (isWeb) {
      return (
        <View style={s.wrap}>
          <Image source={{ uri: photo }} style={s.webPreview} resizeMode="contain" />
          <View style={s.webBar}>
            <Pressable style={s.webRetake} onPress={retake}>
              <Text style={s.webRetakeText}>Retake</Text>
            </Pressable>
            <Pressable style={s.webNext} onPress={next}>
              <Text style={s.confirmText}>
                {proxy ? 'Next: photograph them' : 'Use this photo'}
              </Text>
            </Pressable>
          </View>
        </View>
      )
    }
    return (
      <View style={s.camWrap}>
        <Image source={{ uri: photo }} style={{ flex: 1 }} resizeMode="cover" />
        <View style={s.reviewBar}>
          <Pressable style={s.retake} onPress={retake}>
            <Text style={s.retakeText}>Retake</Text>
          </Pressable>
          <Pressable style={s.confirm} onPress={next}>
            <Text style={s.confirmText}>
              {proxy ? 'Next: photograph them' : 'Use this photo'}
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // ---------- person photo ----------
  if (step === 'person') {
    if (isWeb) {
      return (
        <View style={s.pad}>
          <Text style={t.label}>Step 2 of 3</Text>
          <Text style={s.h1}>Photograph the person</Text>
          <WebPhotoCapture
            onCapture={(uri) => {
              trackBlob(uri)
              setPersonPhoto(uri)
              setStep('personReview')
            }}
          />
        </View>
      )
    }
    return (
      <View style={s.camWrap}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
          onCameraReady={() => setCamReady(true)}
        />
        <View style={s.overlay} pointerEvents="box-none">
          <Text style={s.hint}>
            {camReady ? 'Step 2: photograph the person' : 'Preparing camera'}
          </Text>
          <Shutter disabled={!camReady || capturing} onPress={() => capture('person')} />
        </View>
      </View>
    )
  }

  if (step === 'personReview' && personPhoto) {
    const retake = () => { setPersonPhoto(null); setCamReady(false); setStep('person') }

    if (isWeb) {
      return (
        <View style={s.wrap}>
          <Image source={{ uri: personPhoto }} style={s.webPreview} resizeMode="contain" />
          <View style={s.webBar}>
            <Pressable style={s.webRetake} onPress={retake}>
              <Text style={s.webRetakeText}>Retake</Text>
            </Pressable>
            <Pressable style={s.webNext} onPress={openPicker}>
              <Text style={s.confirmText}>Next: select name</Text>
            </Pressable>
          </View>
        </View>
      )
    }
    return (
      <View style={s.camWrap}>
        <Image source={{ uri: personPhoto }} style={{ flex: 1 }} resizeMode="cover" />
        <View style={s.reviewBar}>
          <Pressable style={s.retake} onPress={retake}>
            <Text style={s.retakeText}>Retake</Text>
          </Pressable>
          <Pressable style={s.confirm} onPress={openPicker}>
            <Text style={s.confirmText}>Next: select name</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // ---------- pick the person ----------
  if (step === 'pick') {
    const filtered = staff.filter((x) =>
      `${x.full_name} ${x.staff_code}`.toLowerCase().includes(search.toLowerCase())
    )
    return (
      <View style={s.wrap}>
        <View style={s.searchWrap}>
          <Text style={s.h1}>Who is this for?</Text>
          {staffStale && (
            <Text style={s.staleNote}>
              Showing the last saved staff list. Recent changes may be missing.
            </Text>
          )}
          <TextInput
            style={s.search}
            placeholder="Search name or staff code"
            placeholderTextColor={c.inkFaint}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
        </View>
        {staffLoading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: sp.lg }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: sp.md, gap: sp.sm }}
            ListEmptyComponent={<Text style={s.empty}>No matching staff.</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [s.pickRow, pressed && { opacity: 0.8 }]}
                onPress={() => { setSubject(item); setStep('qr') }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.pickName}>{item.full_name}</Text>
                  <Text style={s.pickMeta}>
                    {item.staff_code}
                    {item.department ? `   ${item.department}` : ''}
                  </Text>
                </View>
                <Text style={s.chevron}>›</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    )
  }

  // ---------- qr ----------
  if (step === 'qr') {
    if (isWeb) {
      return (
        <View style={s.wrap}>
          <View style={s.webScanner}>
            <WebQrScanner active onScan={(text) => onScan({ data: text })} />
          </View>
          <View style={s.webScanFoot}>
            {error ? (
              <View style={s.webErrBox}>
                <Text style={s.webErrText}>{error}</Text>
              </View>
            ) : (
              <Text style={s.webHint}>
                {subject
                  ? `Final step: scan the code for ${subject.full_name}`
                  : 'Hold the attendance code in view of the camera'}
              </Text>
            )}
          </View>
        </View>
      )
    }
    return (
      <View style={s.camWrap}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        />
        <View style={s.frame} pointerEvents="none" />
        <View style={s.overlay} pointerEvents="none">
          {error ? (
            <Text style={s.errBanner}>{error}</Text>
          ) : (
            <Text style={s.hint}>
              {subject
                ? `Final step: scan the code for ${subject.full_name}`
                : 'Point at the attendance code'}
            </Text>
          )}
        </View>
      </View>
    )
  }

  if (step === 'sending') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={s.sendText}>Recording attendance</Text>
      </View>
    )
  }

  // ---------- done ----------
  return (
    <View style={s.donePad}>
      <View style={s.doneMain}>
        <View style={[s.tick, queued && s.tickQueued]}>
          <Text style={[s.tickText, queued && { color: c.warn }]}>
            {queued ? '↑' : '✓'}
          </Text>
        </View>
        <Text style={s.doneTitle}>
          {queued
            ? 'Saved on this device'
            : type === 'CHECK_IN' ? 'Checked in' : 'Checked out'}
        </Text>
        <Text style={s.doneSub}>
          {subject ? `${subject.full_name}   ` : ''}
          {new Date().toLocaleTimeString('en-NG', {
            hour: '2-digit', minute: '2-digit', hour12: false,
          })}
        </Text>
        {queued && (
          <Text style={s.doneNote}>
            No internet connection. This will be sent automatically when you are back
            online. Open the app once you have a connection so it can finish.
          </Text>
        )}
      </View>
      <Pressable style={s.doneBtn} onPress={() => router.replace('/(app)')}>
        <Text style={s.doneBtnText}>Done</Text>
      </Pressable>
    </View>
  )
}

function Shutter({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[s.shutter, disabled && { opacity: 0.4 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={s.shutterInner} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  center: { flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center', gap: sp.md, padding: sp.lg },
  pad: { flex: 1, backgroundColor: c.bg, padding: sp.lg, gap: sp.md, justifyContent: 'center' },
  camWrap: { flex: 1, backgroundColor: '#000' },

  h1: { ...t.title, marginBottom: sp.sm },
  tag: { ...t.label, color: c.warn, marginBottom: sp.xs },

  choice: { borderRadius: r.lg, padding: sp.lg },
  choicePrimary: { backgroundColor: c.accent },
  choiceAlt: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
  choiceTitleLight: { fontSize: 19, fontWeight: '700', color: c.accentInk },
  choiceSubLight: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: sp.xs, lineHeight: 18 },
  choiceTitle: { fontSize: 19, fontWeight: '700', color: c.ink },
  choiceSub: { fontSize: 13, color: c.inkSoft, marginTop: sp.xs, lineHeight: 18 },

  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: 44, gap: sp.md + 2 },
  hint: { color: '#fff', fontSize: 15, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: sp.md, paddingVertical: sp.sm, borderRadius: r.sm, marginHorizontal: sp.lg, textAlign: 'center' },
  errBanner: { color: '#fff', fontSize: 14, backgroundColor: 'rgba(185,28,28,0.94)', padding: sp.sm + 4, borderRadius: r.sm, marginHorizontal: sp.lg, textAlign: 'center', lineHeight: 20 },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  frame: { position: 'absolute', top: '26%', left: '14%', width: '72%', height: 260, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', borderRadius: r.lg },

  reviewBar: { flexDirection: 'row', gap: sp.sm + 2, padding: sp.md, backgroundColor: '#000' },
  retake: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', borderRadius: r.md, paddingVertical: 15, alignItems: 'center' },
  retakeText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  confirm: { flex: 2, backgroundColor: c.accent, borderRadius: r.md, paddingVertical: 15, alignItems: 'center' },
  confirmText: { color: c.accentInk, fontWeight: '700', fontSize: 15 },

  webPreview: { flex: 1, margin: sp.md, borderRadius: r.md },
  webBar: { flexDirection: 'row', gap: sp.sm + 2, padding: sp.md },
  webRetake: { flex: 1, borderWidth: 1, borderColor: c.lineStrong, borderRadius: r.md, paddingVertical: 15, alignItems: 'center' },
  webRetakeText: { color: c.inkSoft, fontWeight: '600', fontSize: 15 },
  webNext: { flex: 2, backgroundColor: c.accent, borderRadius: r.md, paddingVertical: 15, alignItems: 'center' },

  webScanner: { flex: 1, margin: sp.md, borderRadius: r.md, overflow: 'hidden', backgroundColor: '#000' },
  webScanFoot: { padding: sp.md, paddingTop: 0 },
  webHint: { color: c.inkSoft, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  webErrBox: { backgroundColor: c.dangerBg, borderRadius: r.sm, padding: sp.sm + 4 },
  webErrText: { color: c.danger, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  searchWrap: { padding: sp.md, paddingBottom: sp.sm },
  staleNote: { color: c.warn, fontSize: 12, marginBottom: sp.sm, lineHeight: 17 },
  search: {
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.line,
    borderRadius: r.md, paddingHorizontal: sp.md, paddingVertical: 12,
    color: c.ink, fontSize: 16,
  },
  pickRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.line,
    borderRadius: r.md, padding: sp.md, gap: sp.sm,
  },
  pickName: { color: c.ink, fontSize: 15, fontWeight: '600' },
  pickMeta: { color: c.inkSoft, fontSize: 13, marginTop: 2 },
  chevron: { color: c.inkFaint, fontSize: 22 },
  empty: { color: c.inkFaint, textAlign: 'center', marginTop: sp.xl },

  sendText: { ...t.meta },

  donePad: { flex: 1, backgroundColor: c.bg, padding: sp.lg },
  doneMain: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: sp.sm },
  tick: { width: 76, height: 76, borderRadius: 38, backgroundColor: c.okBg, justifyContent: 'center', alignItems: 'center', marginBottom: sp.sm },
  tickQueued: { backgroundColor: c.warnBg },
  tickText: { color: '#4ade80', fontSize: 36, fontWeight: '700' },
  doneTitle: { ...t.display, textAlign: 'center' },
  doneSub: { ...t.meta, fontSize: 16 },
  doneNote: { ...t.meta, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: sp.md, paddingHorizontal: sp.md },
  doneBtn: { backgroundColor: c.accent, borderRadius: r.md, paddingVertical: 16, alignItems: 'center' },
  doneBtnText: { color: c.accentInk, fontSize: 16, fontWeight: '700' },
})