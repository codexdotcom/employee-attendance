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

export type AttendanceRecord = {
  id: string
  employee_id: string
  location_id: string | null
  type: PunchType
  scanned_at: string
  work_date: string
  photo_path: string
  latitude: number | null
  longitude: number | null
  accuracy_m: number | null
  distance_m: number | null
  status: AttendanceStatus
  notes: string | null
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
  latitude: number | null
  longitude: number | null
  distance_m: number | null
  accuracy_m: number | null
  notes: string | null
  location_name: string | null
}

export type RosterRow = {
  employee_id: string
  full_name: string
  staff_code: string
  department: string | null
  check_in: string | null
  check_out: string | null
  status: 'PRESENT' | 'LATE' | 'ABSENT'
}