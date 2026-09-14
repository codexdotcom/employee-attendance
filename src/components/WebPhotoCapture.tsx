import { useRef } from 'react'

export function WebPhotoCapture({
  onCapture,
}: {
  onCapture: (uri: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onCapture(URL.createObjectURL(file))
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          background: '#2563eb', color: '#fff', border: 'none',
          borderRadius: 12, padding: '16px 32px',
          fontSize: 16, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Take photo
      </button>
    </div>
  )
}