import { usePunchPermissions } from '@/hooks/usePunchPermissions'
import { submitPunch } from '@/lib/punch'
import { c, r, sp, t } from '@/lib/theme'
import { PunchType } from '@/lib/types'
import { useAuth } from '@/providers/AuthProvider'
import { CameraView } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native'

type Step = 'choose' | 'photo' | 'review' | 'qr' | 'sending' | 'done'

export default function Scan() {
  const { employee } = useAuth()
  const router = useRouter()
  const perms = usePunchPermissions()
  const cameraRef = useRef<CameraView>(null)
  const scanLock = useRef(false)

  const [step, setStep] = useState<Step>('choose')
  const [type, setType] = useState<PunchType>('CHECK_IN')
  const [photo, setPhoto] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [camReady, setCamReady] = useState(false)
  const [capturing, setCapturing] = useState(false)

  async function start(t2: PunchType) {
    setType(t2)
    setError(null)
    const g = await perms.requestAll()
    if (!g.camera) {
      Alert.alert('Camera needed', 'Enable camera access in Settings to log attendance.')
      return
    }
    if (!g.location) {
      Alert.alert('Location needed', 'Location confirms you are on school premises. Enable it in Settings.')
      return
    }
    setCamReady(false)
    setStep('photo')
  }

  async function capture() {
    if (!camReady || capturing) return
    setCapturing(true)
    try {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 0.6 })
      if (shot?.uri) {
        setPhoto(shot.uri)
        setStep('review')
      }
    } catch {
      Alert.alert('Camera', 'Could not take the photo. Try again.')
    } finally {
      setCapturing(false)
    }
  }

  const onScan = useCallback(async ({ data }: { data: string }) => {
    if (scanLock.current || !photo || !employee) return
    scanLock.current = true
    setStep('sending')
    setError(null)
    try {
      await submitPunch({ qrSecret: data.trim(), type, photoUri: photo, employeeId: employee.id })
      setStep('done')
    } catch (e: any) {
      setError(e.message)
      setStep('qr')
      setTimeout(() => { scanLock.current = false }, 1500)
    }
  }, [photo, employee, type])

  if (!perms.ready || !employee) {
    return <View style={s.center}><ActivityIndicator color={c.accent} /></View>
  }

  if (step === 'choose') {
    return (
      <View style={s.pad}>
        <Text style={s.h1}>What are you recording?</Text>
        <Pressable
          style={({ pressed }) => [s.choice, s.choiceIn, pressed && { opacity: 0.85 }]}
          onPress={() => start('CHECK_IN')}
        >
          <Text style={s.choiceTitleLight}>Check in</Text>
          <Text style={s.choiceSubLight}>Arriving at school</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.choice, s.choiceOut, pressed && { backgroundColor: c.bg }]}
          onPress={() => start('CHECK_OUT')}
        >
          <Text style={s.choiceTitle}>Check out</Text>
          <Text style={s.choiceSub}>Leaving for the day</Text>
        </Pressable>
      </View>
    )
  }

  if (step === 'photo') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
          onCameraReady={() => setCamReady(true)}
        />
        <View style={s.overlay}>
          <Text style={s.hint}>
            {camReady ? 'Photograph where you are standing' : 'Preparing camera'}
          </Text>
          <Pressable
            style={[s.shutter, (!camReady || capturing) && { opacity: 0.4 }]}
            onPress={capture}
            disabled={!camReady || capturing}
          >
            <View style={s.shutterInner} />
          </Pressable>
        </View>
      </View>
    )
  }

  if (step === 'review' && photo) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Image source={{ uri: photo }} style={{ flex: 1 }} resizeMode="cover" />
        <View style={s.reviewBar}>
          <Pressable
            style={s.retake}
            onPress={() => { setPhoto(null); setCamReady(false); setStep('photo') }}
          >
            <Text style={s.retakeText}>Retake</Text>
          </Pressable>
          <Pressable style={s.confirm} onPress={() => setStep('qr')}>
            <Text style={s.confirmText}>Use this photo</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (step === 'qr') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        />
        <View style={s.frame} pointerEvents="none" />
        <View style={s.overlay}>
          {error
            ? <Text style={s.errBanner}>{error}</Text>
            : <Text style={s.hint}>Point at the attendance code</Text>}
        </View>
      </View>
    )
  }

  if (step === 'sending') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={s.sendText}>Recording your attendance</Text>
      </View>
    )
  }

  return (
    <View style={s.donePad}>
      <View style={s.doneMain}>
        <View style={s.tick}><Text style={s.tickText}>✓</Text></View>
        <Text style={s.doneTitle}>
          {type === 'CHECK_IN' ? 'Checked in' : 'Checked out'}
        </Text>
        <Text style={s.doneSub}>
          {new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </Text>
      </View>
      <Pressable style={s.doneBtn} onPress={() => router.replace('/(app)')}>
        <Text style={s.doneBtnText}>Done</Text>
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center', gap: sp.md, padding: sp.lg },
  pad: { flex: 1, backgroundColor: c.bg, padding: sp.lg, gap: sp.md, justifyContent: 'center' },
  h1: { ...t.title, marginBottom: sp.sm },

  choice: { borderRadius: r.lg, padding: sp.lg },
  choiceIn: { backgroundColor: c.accent },
  choiceOut: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.lineStrong },
  choiceTitleLight: { fontSize: 19, fontWeight: '700', color: c.accentInk },
  choiceSubLight: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: sp.xs },
  choiceTitle: { fontSize: 19, fontWeight: '700', color: c.ink },
  choiceSub: { fontSize: 13, color: c.inkSoft, marginTop: sp.xs },

  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: 44, gap: sp.md + 2 },
  hint: { color: '#fff', fontSize: 15, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: sp.md, paddingVertical: sp.sm, borderRadius: r.sm },
  errBanner: { color: '#fff', fontSize: 14, backgroundColor: 'rgba(163,53,43,0.94)', padding: sp.sm + 4, borderRadius: r.sm, marginHorizontal: sp.lg, textAlign: 'center', lineHeight: 20 },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  frame: { position: 'absolute', top: '26%', left: '14%', width: '72%', height: 260, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', borderRadius: r.lg },

  reviewBar: { flexDirection: 'row', gap: sp.sm + 2, padding: sp.md, backgroundColor: '#000' },
  retake: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', borderRadius: r.md, paddingVertical: 15, alignItems: 'center' },
  retakeText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  confirm: { flex: 2, backgroundColor: c.accent, borderRadius: r.md, paddingVertical: 15, alignItems: 'center' },
  confirmText: { color: c.accentInk, fontWeight: '700', fontSize: 15 },

  sendText: { ...t.meta },

  donePad: { flex: 1, backgroundColor: c.bg, padding: sp.lg },
  doneMain: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: sp.sm },
  tick: { width: 76, height: 76, borderRadius: 38, backgroundColor: c.okBg, justifyContent: 'center', alignItems: 'center', marginBottom: sp.sm },
  tickText: { color: c.accent, fontSize: 38, fontWeight: '700' },
  doneTitle: { ...t.display },
  doneSub: { ...t.meta, fontSize: 16 },
  doneBtn: { backgroundColor: c.accent, borderRadius: r.md, paddingVertical: 16, alignItems: 'center' },
  doneBtnText: { color: c.accentInk, fontSize: 16, fontWeight: '700' },
})