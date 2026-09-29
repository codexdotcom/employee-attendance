import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  onScan: (text: string) => void
  active: boolean
}

// Decode only the middle of the frame, at full sensor resolution.
// A 1920px frame scaled down to fit a decoder loses the fine modules of a
// distant QR; cropping keeps them at native pixel density instead.
const CROP_RATIO = 0.62

export function WebQrScanner({ onScan, active }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const rafRef = useRef<number | null>(null)
  const firedRef = useRef(false)
  const stoppedRef = useRef(false)

  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null)

  const fire = useCallback(
    (text: string) => {
      if (firedRef.current || !text) return
      firedRef.current = true
      // Haptic confirmation so the user knows to stop holding the phone still.
      try { navigator.vibrate?.(60) } catch { /* unsupported */ }
      onScan(text)
    },
    [onScan]
  )

  /**
   * Pick the main rear camera. facingMode: 'environment' alone is unreliable
   * on multi-camera Android phones: it frequently selects the ultra-wide,
   * which has the worst effective resolution of the three and is the single
   * biggest cause of "I have to get really close".
   */
  async function pickRearCamera(): Promise<MediaStreamConstraints> {
    const base: MediaTrackConstraints = {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
      // @ts-expect-error not in the TS lib yet, widely supported
      focusMode: { ideal: 'continuous' },
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cams = devices.filter((d) => d.kind === 'videoinput')

      // Labels are empty until permission is granted, so this only helps on
      // the second open. Harmless when it does not.
      const rear = cams.filter((d) => /back|rear|environment/i.test(d.label))
      const skipWide = rear.find((d) => !/wide|ultra|tele|depth/i.test(d.label))
      const chosen = skipWide ?? rear[0]

      if (chosen?.deviceId) {
        return { video: { ...base, deviceId: { exact: chosen.deviceId } }, audio: false }
      }
    } catch { /* fall through */ }

    return { video: { ...base, facingMode: { ideal: 'environment' } }, audio: false }
  }

  async function applyCapabilities(track: MediaStreamTrack) {
    trackRef.current = track
    const caps: any = track.getCapabilities?.() ?? {}

    if (caps.torch) setTorchAvailable(true)

    if (caps.zoom && typeof caps.zoom.max === 'number') {
      setZoomRange({ min: caps.zoom.min ?? 1, max: caps.zoom.max })
    }

    // Continuous autofocus is what stops the "blurry until you move" problem.
    const advanced: any[] = []
    if (caps.focusMode?.includes?.('continuous')) advanced.push({ focusMode: 'continuous' })
    if (caps.exposureMode?.includes?.('continuous')) advanced.push({ exposureMode: 'continuous' })
    if (advanced.length) {
      try { await track.applyConstraints({ advanced }) } catch { /* ignore */ }
    }
  }

  async function setTrackZoom(value: number) {
    const track = trackRef.current
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as any] })
      setZoom(value)
    } catch { /* ignore */ }
  }

  async function toggleTorch() {
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] })
      setTorchOn(next)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!active) return

    stoppedRef.current = false
    firedRef.current = false
    let zxingControls: { stop: () => void } | null = null

    async function start() {
      try {
        const constraints = await pickRearCamera()
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (stoppedRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return

        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        await video.play()

        const track = stream.getVideoTracks()[0]
        if (track) await applyCapabilities(track)

        setReady(true)

        // Fast path: the browser's own detector. Hardware-backed on Android
        // Chrome and roughly an order of magnitude quicker than ZXing.
        const Detector = (window as any).BarcodeDetector
        if (Detector) {
          let detector: any
          try {
            detector = new Detector({ formats: ['qr_code'] })
          } catch {
            detector = null
          }

          if (detector) {
            const loop = async () => {
              if (stoppedRef.current || firedRef.current) return
              try {
                const frame = cropFrame(video, canvasRef.current)
                if (frame) {
                  const found = await detector.detect(frame)
                  if (found?.length) {
                    fire(found[0].rawValue)
                    return
                  }
                }
              } catch { /* transient decode failure, keep going */ }
              rafRef.current = requestAnimationFrame(loop)
            }
            rafRef.current = requestAnimationFrame(loop)
            return
          }
        }

        // Fallback: ZXing, tuned for distance.
        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE])
        hints.set(DecodeHintType.TRY_HARDER, true)

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 80,
        })

        zxingControls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) fire(result.getText())
        })
      } catch (e: any) {
        const name = String(e?.name ?? '')
        if (name === 'NotAllowedError') {
          setError('Camera access was denied. Allow it in your browser settings and reload.')
        } else if (name === 'NotFoundError') {
          setError('No camera was found on this device.')
        } else {
          setError('Could not open the camera. Close other apps using it and try again.')
        }
      }
    }

    start()

    return () => {
      stoppedRef.current = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      zxingControls?.stop()
      if (trackRef.current && torchOn) {
        try { trackRef.current.applyConstraints({ advanced: [{ torch: false } as any] }) } catch {}
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      trackRef.current = null
      firedRef.current = false
    }
    // torchOn deliberately excluded: including it would restart the camera
    // every time the torch is toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fire])

  if (error) {
    return (
      <div style={styles.errorWrap}>
        <div style={styles.errorText}>{error}</div>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <video ref={videoRef} style={styles.video} muted playsInline />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div style={styles.frame} />

      {!ready && <div style={styles.status}>Starting camera</div>}

      {ready && (
        <div style={styles.controls}>
          {torchAvailable && (
            <button style={styles.btn} onClick={toggleTorch}>
              {torchOn ? 'Light off' : 'Light on'}
            </button>
          )}
          {zoomRange && zoomRange.max > zoomRange.min && (
            <div style={styles.zoomRow}>
              <button
                style={styles.btn}
                onClick={() => setTrackZoom(Math.max(zoomRange.min, zoom - 0.5))}
              >
                −
              </button>
              <span style={styles.zoomLabel}>{zoom.toFixed(1)}x</span>
              <button
                style={styles.btn}
                onClick={() => setTrackZoom(Math.min(zoomRange.max, zoom + 0.5))}
              >
                +
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Draw the centre of the video frame to a canvas at 1:1 pixel scale.
 * Decoding this instead of the full frame keeps the QR's modules at native
 * resolution, which is what lets a code be read from across a room.
 */
function cropFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement | null
): HTMLCanvasElement | null {
  if (!canvas) return null
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const size = Math.round(Math.min(vw, vh) * CROP_RATIO)
  const sx = Math.round((vw - size) / 2)
  const sy = Math.round((vh - size) / 2)

  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size
    canvas.height = size
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
  return canvas
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  frame: {
    position: 'absolute',
    top: '19%',
    left: '19%',
    width: '62%',
    height: '62%',
    border: '2px solid rgba(255,255,255,0.85)',
    borderRadius: 16,
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
    pointerEvents: 'none',
  },
  status: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  controls: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  zoomRow: { display: 'flex', alignItems: 'center', gap: 8 },
  zoomLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    minWidth: 34,
    textAlign: 'center',
  },
  btn: {
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  errorWrap: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    boxSizing: 'border-box',
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 1.5,
  },
}