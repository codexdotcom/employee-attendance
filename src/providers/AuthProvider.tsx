import { Session } from '@supabase/supabase-js'
import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Employee } from '../lib/types'

type AuthState = {
  session: Session | null
  employee: Employee | null
  loading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadEmployee(s: Session | null) {
    if (!s) {
      setEmployee(null)
      return
    }
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('auth_user_id', s.user.id)
      .maybeSingle()

    if (error) console.warn('loadEmployee', error.message)
    setEmployee((data as Employee) ?? null)
  }

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadEmployee(data.session)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!active) return
      setSession(s)
      await loadEmployee(s)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value: AuthState = {
    session,
    employee,
    loading,
    isAdmin: employee?.role === 'ADMIN',
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (error) throw error
    },
    signOut: async () => {
      await supabase.auth.signOut()
      setEmployee(null)
    },
    refresh: async () => {
      const { data } = await supabase.auth.getSession()
      await loadEmployee(data.session)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}