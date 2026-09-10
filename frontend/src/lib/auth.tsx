import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, isDemoMode, exitDemo } from './supabase'
import { apiGet, ApiError } from './api'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: string
  permissions: string[]
  username?: string | null
  status?: string
}

type MeResponse = {
  id: string
  email: string
  name: string | null
  role: string
  permissions: string[]
  username?: string | null
  status?: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  demo: boolean
  refresh: () => Promise<AuthUser | null>
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
        setDemo(true)
        const me = await apiGet<MeResponse>('/api/me')
        const next: AuthUser = {
          id: me.id,
          email: me.email,
          name: me.name,
          role: me.role,
          permissions: me.permissions ?? [],
          username: me.username,
          status: me.status,
        }
        setUser(next)
        return next
      }
      setDemo(false)
      if (!supabase) {
        setUser(null)
        return null
      }
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (!session) {
        setUser(null)
        return null
      }
      const me = await apiGet<MeResponse>('/api/me')
      const next: AuthUser = {
        id: me.id,
        email: me.email || session.user.email || '',
        name: me.name,
        role: me.role,
        permissions: me.permissions ?? [],
        username: me.username,
        status: me.status,
      }
      setUser(next)
      return next
    } catch (err) {
      setUser(null)
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await supabase?.auth.signOut()
      }
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => undefined)
    const { data: sub } = supabase?.auth.onAuthStateChange(() => {
      refresh().catch(() => undefined)
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

export function isFinanceOfficial(role: string | null | undefined): boolean {
  return isAdmin(role) || role === 'finance'
}

export function hasPermission(user: AuthUser | null | undefined, code: string): boolean {
  if (!user) return false
  if (isAdmin(user.role)) return true
  return (user.permissions ?? []).includes(code)
}

export function hasAnyPermission(user: AuthUser | null | undefined, codes: string[]): boolean {
  return codes.some((code) => hasPermission(user, code))
}
