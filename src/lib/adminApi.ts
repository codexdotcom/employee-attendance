import { supabase } from './supabase'

async function call(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('manage-employee', {
    body: payload,
  })
  if (error) {
    // Non-2xx responses land here; the JSON body carries our message.
    let msg = error.message
    try {
      const ctx = (error as any).context
      if (ctx?.json) {
        const parsed = await ctx.json()
        if (parsed?.error) msg = parsed.error
      }
    } catch { /* fall back to error.message */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export const adminApi = {
  createEmployee: (input: {
    full_name: string
    email: string
    staff_code: string
    department?: string
    phone?: string
    role?: 'ADMIN' | 'STAFF'
  }) => call({ action: 'create', ...input }) as Promise<{
    employee: any; email: string; password: string
  }>,

  resetPassword: (employee_id: string) =>
    call({ action: 'reset_password', employee_id }) as Promise<{
      email: string; password: string
    }>,
  deleteEmployee: (employee_id: string) =>
    call({ action: 'delete', employee_id }) as Promise<{
      deleted: true; full_name: string
    }>,
  setActive: (employee_id: string, is_active: boolean) =>
    call({ action: 'set_active', employee_id, is_active }),
}