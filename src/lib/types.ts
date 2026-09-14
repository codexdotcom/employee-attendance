export type Role = 'ADMIN' | 'STAFF'
export type PunchType = 'CHECK_IN' | 'CHECK_OUT'
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'FLAGGED'

export type Employee = {
  id: string
  auth_user_id: string | null
  full_name: string
  email: string
  phone: string | null
  staff_code: string
  department: string | null
  role: Role
  is_active: boolean
  created_at: string
}

export type StaffDirectoryEntry = {
  id: string
  full_name: string
  staff_code: string
  department: string | null
}

export type AppSettings = {
  late_cutoff: string
  checkout_earliest: string
  allow_proxy: boolean
  allow_offline: boolean
  photo_retention_weeks: number
  updated_at: string
}

export type AttendanceView = {
  id: string
  employee_id: string
  full_name: string
  staff_code: string
  department: string | null
  type: PunchType
  status: AttendanceStatus
  scanned_at: string
  work_date: string
  photo_path: string
  subject_photo_path: string | null
  latitude: number | null
  longitude: number | null
  distance_m: number | null
  accuracy_m: number | null
  is_offline: boolean
  is_proxy: boolean
  notes: string | null
  location_name: string | null
  recorded_by_name: string | null
}

export type RosterRow = {
  employee_id: string
  full_name: string
  staff_code: string
  department: string | null
  check_in: string | null
  check_out: string | null
  status: 'PRESENT' | 'LATE' | 'ABSENT'
  proxy_in: boolean
}

export type QueuedPunch = {
  id: string
  qrSecret: string
  type: PunchType
  photoUri: string
  subjectPhotoUri: string | null
  subjectId: string | null
  subjectName: string | null
  employeeId: string
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  clientTime: string
  attempts: number
  lastError: string | null
}