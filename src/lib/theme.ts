export const c = {
  bg: '#0f172a',
  surface: '#1e293b',
  ink: '#ffffff',
  inkSoft: '#94a3b8',
  inkFaint: '#64748b',
  line: '#334155',
  lineStrong: '#475569',
  accent: '#2563eb',
  accentInk: '#ffffff',
  danger: '#f87171',
  warn: '#fbbf24',
  warnBg: '#78350f',
  okBg: '#14532d',
  dangerBg: '#450a0a',
}

export const t = {
  display: { fontSize: 28, fontWeight: '700' as const, color: c.ink },
  title: { fontSize: 21, fontWeight: '700' as const, color: c.ink },
  body: { fontSize: 15, color: c.ink },
  label: {
    fontSize: 11, fontWeight: '700' as const, color: c.inkFaint,
    letterSpacing: 1, textTransform: 'uppercase' as const,
  },
  meta: { fontSize: 13, color: c.inkSoft },
}

export const sp = { xs: 4, sm: 8, md: 16, lg: 24, xl: 36 }
export const r = { sm: 8, md: 12, lg: 16 }