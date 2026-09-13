import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { supabase } from './supabase'
import { AttendanceView } from './types'

function esc(v: unknown) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCsv(fromDate: string, toDate: string) {
  const { data, error } = await supabase
    .from('attendance_view')
    .select('*')
    .gte('work_date', fromDate)
    .lte('work_date', toDate)
    .order('work_date')
    .order('full_name')

  if (error) throw new Error(error.message)
  const rows = (data as AttendanceView[]) ?? []
  if (!rows.length) throw new Error('No records in that range.')

  const header = [
    'Date', 'Staff Code', 'Name', 'Department',
    'Type', 'Time', 'Status', 'Distance (m)',
  ]

  const lines = rows.map((r) => [
    r.work_date,
    r.staff_code,
    r.full_name,
    r.department ?? '',
    r.type === 'CHECK_IN' ? 'Check in' : 'Check out',
    new Date(r.scanned_at).toLocaleTimeString('en-NG', { hour12: false }),
    r.status,
    r.distance_m != null ? Math.round(r.distance_m) : '',
  ].map(esc).join(','))

  const csv = [header.join(','), ...lines].join('\n')
  const file = new File(Paths.cache, `attendance-${fromDate}-to-${toDate}.csv`)
  file.write(csv)

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' })
  }
  return rows.length
}