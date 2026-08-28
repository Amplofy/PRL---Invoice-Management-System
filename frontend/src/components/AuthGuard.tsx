import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseEnabled, isDemoMode } from '../lib/supabase'
import { useAuth, isAdmin } from '../lib/auth'
import Button from './ui/Button'
import BrandLogo from './BrandLogo'

interface AuthGuardProps {
  children: ReactNode
  adminOnly?: boolean
}

export default function AuthGuard({ children, adminOnly = false }: AuthGuardProps) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!user) navigate('/login', { replace: true })
    else if (adminOnly && !isAdmin(user.role)) navigate('/control-tower', { replace: true })
  }, [user, loading, adminOnly, navigate])

  if (!supabaseEnabled && !isDemoMode()) {
    return (
      <div className="glass mx-auto mt-24 max-w-lg p-8 text-center">
        <div className="text-lg font-bold">Backend preview mode</div>
        <p className="mt-2 text-sm text-[var(--text-dim)]">
          This frontend requires a live Supabase project. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> in <code>frontend/.env</code>, then restart the dev server.
        </p>
        <div className="mt-4">
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    )
  }

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="boot-emblem">
          <div className="boot-ring" />
          <div className="boot-logo"><BrandLogo size={56} /></div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
