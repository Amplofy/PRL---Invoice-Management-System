import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { supabase, isDemoMode } from './supabase'
import { isAdmin, useAuth } from './auth'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'

const SESSION_KEY = 'prl-eoms-master'
const DEMO_PASSWORD = 'admin'

interface MasterAccessContextValue {
  unlocked: boolean
  canUnlock: boolean
  requestUnlock: () => void
  lock: () => void
}

const MasterAccessContext = createContext<MasterAccessContextValue | null>(null)

function sessionUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function writeSession(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(SESSION_KEY, '1')
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export function MasterAccessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const canUnlock = isAdmin(user?.role)
  const [unlocked, setUnlocked] = useState(() => sessionUnlocked())
  const [promptOpen, setPromptOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const demo = isDemoMode()

  useEffect(() => {
    if (!canUnlock && unlocked) {
      setUnlocked(false)
      writeSession(false)
    }
  }, [canUnlock, unlocked])

  const lock = useCallback(() => {
    setUnlocked(false)
    writeSession(false)
    setPromptOpen(false)
    setPassword('')
    setError('')
  }, [])

  const requestUnlock = useCallback(() => {
    if (!canUnlock) return
    if (unlocked) {
      lock()
      return
    }
    setError('')
    setPassword('')
    setPromptOpen(true)
  }, [canUnlock, unlocked, lock])

  const submit = async () => {
    if (!password.trim()) {
      setError('Enter your password')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (demo) {
        if (password !== DEMO_PASSWORD) {
          setError('Password incorrect')
          return
        }
      } else {
        if (!supabase || !user?.email) {
          setError('Sign-in is not available')
          return
        }
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password,
        })
        if (authError) {
          setError('Password incorrect')
          return
        }
      }
      setUnlocked(true)
      writeSession(true)
      setPromptOpen(false)
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  const value = useMemo<MasterAccessContextValue>(
    () => ({ unlocked: canUnlock && unlocked, canUnlock, requestUnlock, lock }),
    [canUnlock, unlocked, requestUnlock, lock],
  )

  return (
    <MasterAccessContext.Provider value={value}>
      {children}
      <Modal
        open={promptOpen}
        onClose={() => { if (!busy) setPromptOpen(false) }}
        title="Enable master access"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPromptOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={() => void submit()} disabled={busy}>
              <ShieldCheck size={15} /> {busy ? 'Checking…' : 'Unlock'}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-[var(--text-dim)]">
          Master access lets you override auto-generated fields and select closed or expired contracts. Confirm with your password.
        </p>
        <Field label="Password" error={error || undefined}>
          <input
            className={`input ${error ? 'invalid' : ''}`}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
          />
        </Field>
        {demo && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">Demo password: {DEMO_PASSWORD}</p>
        )}
      </Modal>
    </MasterAccessContext.Provider>
  )
}

export function useMasterAccess(): MasterAccessContextValue {
  const ctx = useContext(MasterAccessContext)
  if (!ctx) throw new Error('useMasterAccess must be used within MasterAccessProvider')
  return ctx
}

export function MasterAccessButton() {
  const { canUnlock, unlocked, requestUnlock } = useMasterAccess()
  if (!canUnlock) return null
  return (
    <button
      type="button"
      className={`btn btn-sm ${unlocked ? 'btn-warn' : 'btn-ghost'}`}
      onClick={requestUnlock}
      title={unlocked ? 'Turn off master access' : 'Enable master access'}
      aria-pressed={unlocked}
    >
      <KeyRound size={14} />
      <span className="hidden sm:inline">{unlocked ? 'Master on' : 'Master access'}</span>
    </button>
  )
}
