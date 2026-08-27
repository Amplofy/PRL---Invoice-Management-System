import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, isDemoMode, exitDemo } from './supabase'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  demo: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [demo, setDemo] = useState<boolean>(() => isDemoMode())

  const refresh = useCallback(async () => {
    try {
      if (isDemoMode()) {
        setUser({
          id: 'demo-admin-id',
          email: 'admin@prl.com.pk',
          name: 'PRL Admin (Demo)',
          role: 'admin',
        })
        setDemo(true)
        return
      }
      setDemo(false)
      if (!supabase) {
        setUser(null)
        return
      }
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (!session) {
        setUser(null)
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name, roles(name)')
        .eq('id', session.user.id)
        .single()
      const p = profile as unknown as {
        id: string
        email: string
        full_name: string | null
        roles: { name: string } | null
      } | null
      setUser({
        id: session.user.id,
        email: p?.email ?? session.user.email ?? '',
        name: p?.full_name ?? null,
        role: p?.roles?.name ?? 'viewer',
      })
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const { data: sub } = supabase?.auth.onAuthStateChange(() => {
      refresh()
    }) ?? { data: { subscription: { unsubscribe: () => {} } } }
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  const signOut = useCallback(async () => {
    exitDemo()
    await supabase?.auth.signOut()
    setUser(null)
    setDemo(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, demo, refresh, signOut }),
    [user, loading, demo, refresh, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'superadmin'
}
