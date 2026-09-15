import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import { AttendanceView } from './types'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function esc(v: unknown) {
  const str = v == null ? '' : String(v)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export async function exportCsv(fromDate: string, toDate: string) {
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
    throw new Error('Enter both dates as YYYY-MM-DD.')
  }
  if (fromDate > toDate) {
    throw new Error('The start date must come before the end date.')
  }

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
    'Date',
    'Staff Code',
    'Name',
    'Department',
    'Type',
    'Time',
    'Status',
    'Distance (m)',
    'Logged By',
    'Offline',
  ]

  const lines = rows.map((row) =>
    [
      row.work_date,
      row.staff_code,
      row.full_name,
      row.department ?? '',
      row.type === 'CHECK_IN' ? 'Check in' : 'Check out',
      new Date(row.scanned_at).toLocaleTimeString('en-NG', { hour12: false }),
      row.status,
      row.distance_m != null ? Math.round(row.distance_m) : '',
      row.is_proxy ? row.recorded_by_name ?? 'another staff member' : 'self',
      row.is_offline ? 'yes' : '',
    ]
      .map(esc)
      .join(',')
  )

  // Excel needs a BOM to read accented names correctly from a UTF-8 CSV.
  const csv = '\uFEFF' + [header.join(','), ...lines].join('\r\n')
  const filename = `attendance-${fromDate}-to-${toDate}.csv`

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return rows.length
  }

  const file = new File(Paths.cache, filename)
  if (file.exists) file.delete()
  file.write(csv)

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Attendance export',
    })
  }

  return rows.length
}