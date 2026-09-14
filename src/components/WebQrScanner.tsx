import { BrowserQRCodeReader } from '@zxing/browser'
import { useEffect, useRef, useState } from 'react'

export function WebQrScanner({
  onScan,
  active,
}: {
  onScan: (text: string) => void
  active: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!active) return
    let controls: { stop: () => void } | null = null
    const reader = new BrowserQRCodeReader()

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result && !firedRef.current) {
          firedRef.current = true
          onScan(result.getText())
        }
      })
      .then((c) => { controls = c })
      .catch(() => {
        setError('Could not open the camera. Check browser permissions.')
      })

    return () => {
      controls?.stop()
      firedRef.current = false
    }
  }, [active, onScan])

  if (error) {
    return (
      <div style={{ color: '#f87171', padding: 24, textAlign: 'center' }}>
        {error}
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      muted
      playsInline
    />
  )
}