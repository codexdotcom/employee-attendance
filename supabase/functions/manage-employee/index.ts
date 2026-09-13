import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function makePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not signed in.' }, 401)

  // Caller-scoped client: RLS applies, so is_admin() reflects the real user.
  const caller = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: isAdmin, error: adminErr } = await caller.rpc('is_admin')
  if (adminErr) return json({ error: 'Could not verify permissions.' }, 500)
  if (!isAdmin) return json({ error: 'Admins only.' }, 403)

  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const action = body?.action

  // ---------- CREATE ----------
  if (action === 'create') {
    const fullName = String(body.full_name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const staffCode = String(body.staff_code ?? '').trim()
    const department = body.department ? String(body.department).trim() : null
    const phone = body.phone ? String(body.phone).trim() : null
    const role = body.role === 'ADMIN' ? 'ADMIN' : 'STAFF'

    if (!fullName || !email || !staffCode) {
      return json({ error: 'Name, email and staff code are required.' }, 400)
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: 'That email address is not valid.' }, 400)
    }

    const password = makePassword()

    // Employee row first: the on_auth_user_created trigger links by email.
    const { data: emp, error: empErr } = await admin
      .from('employees')
      .insert({
        full_name: fullName,
        email,
        staff_code: staffCode,
        department,
        phone,
        role,
      })
      .select()
      .single()

    if (empErr) {
      const dup = empErr.code === '23505'
      return json({
        error: dup
          ? 'That email or staff code is already registered.'
          : empErr.message,
      }, dup ? 409 : 500)
    }

    const { error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (authErr) {
      // Roll back so a retry isn't blocked by a half-created record.
      await admin.from('employees').delete().eq('id', emp.id)
      return json({ error: `Could not create login: ${authErr.message}` }, 500)
    }

    return json({ employee: emp, email, password })
  }

  // ---------- RESET PASSWORD ----------
  if (action === 'reset_password') {
    const employeeId = String(body.employee_id ?? '')
    const { data: emp } = await admin
      .from('employees')
      .select('id, auth_user_id, email, full_name')
      .eq('id', employeeId)
      .single()

    if (!emp?.auth_user_id) return json({ error: 'No login exists for that employee.' }, 404)

    const password = makePassword()
    const { error } = await admin.auth.admin.updateUserById(emp.auth_user_id, { password })
    if (error) return json({ error: error.message }, 500)

    return json({ email: emp.email, password })
  }

  // ---------- DEACTIVATE / REACTIVATE ----------
  if (action === 'set_active') {
    const employeeId = String(body.employee_id ?? '')
    const isActive = body.is_active === true

    const { data: emp, error } = await admin
      .from('employees')
      .update({ is_active: isActive })
      .eq('id', employeeId)
      .select()
      .single()

    if (error) return json({ error: error.message }, 500)

    // Kill live sessions immediately on deactivation.
    if (!isActive && emp.auth_user_id) {
      await admin.auth.admin.signOut(emp.auth_user_id, 'global')
    }
    return json({ employee: emp })
  }
  // ---------- DELETE (permanent) ----------
  if (action === 'delete') {
    const employeeId = String(body.employee_id ?? '')

    const { data: emp } = await admin
      .from('employees')
      .select('id, auth_user_id, full_name')
      .eq('id', employeeId)
      .single()

    if (!emp) return json({ error: 'Employee not found.' }, 404)

    // Don't let an admin delete their own account out from under themselves.
    const { data: me } = await caller.auth.getUser()
    if (me?.user?.id && emp.auth_user_id === me.user.id) {
      return json({ error: 'You cannot delete your own account.' }, 400)
    }

    // 1. Photos. Files live in a folder named after the employee id.
    const { data: files } = await admin.storage
      .from('attendance-photos')
      .list(emp.id, { limit: 1000 })

    if (files?.length) {
      const paths = files.map((f) => `${emp.id}/${f.name}`)
      await admin.storage.from('attendance-photos').remove(paths)
    }

    // 2. Auth login.
    if (emp.auth_user_id) {
      await admin.auth.admin.deleteUser(emp.auth_user_id)
    }

    // 3. Employee row. attendance_records cascade on this delete.
    const { error } = await admin.from('employees').delete().eq('id', emp.id)
    if (error) return json({ error: error.message }, 500)

    return json({ deleted: true, full_name: emp.full_name })
  }
  return json({ error: 'Unknown action.' }, 400)
})