import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Lock, KeyRound } from 'lucide-react'
import { apiGet, apiPost } from './api'
import { currentFiscalYear, fiscalOf, isClosedDate, isClosedFiscalYear } from './fiscal'
import { LOCKED_FY_MESSAGE, normalizeUnlockPassword } from './fyCrypto'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { Field } from '../components/ui/Field'

const SESSION_KEY = 'prl-fy-unlocked'

export interface FyLockStatus {
  passwordSet: boolean
  unlocked: boolean
  currentFy: string
}

interface GuardRequest {
  fy: string
  resolve: (ok: boolean) => void
}

interface FyLockContextValue {
  status: FyLockStatus
  unlocked: boolean
  guardWrite: (...dates: Array<string | null | undefined>) => Promise<boolean>
  guardFy: (fy: string) => Promise<boolean>
  relock: () => Promise<void>
  refreshStatus: () => Promise<void>
}

const FyLockContext = createContext<FyLockContextValue | null>(null)

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

function firstClosedFy(dates: Array<string | null | undefined>): string | null {
  for (const d of dates) {
    const info = fiscalOf(d)
    if (info && isClosedFiscalYear(info.fy)) return info.fy
  }
  return null
}

export function FyLockProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<FyLockStatus>({
    passwordSet: false,
    unlocked: sessionUnlocked(),
    currentFy: currentFiscalYear(),
  })
  const [pending, setPending] = useState<GuardRequest | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const queue = useRef<GuardRequest[]>([])

  const refreshStatus = useCallback(async () => {
    try {
      const s = await apiGet<FyLockStatus>('/api/fy-lock')
      setStatus({
        passwordSet: Boolean(s.passwordSet),
        unlocked: Boolean(s.unlocked) || sessionUnlocked(),
        currentFy: s.currentFy || currentFiscalYear(),
      })
    } catch {
      setStatus((prev) => ({ ...prev, unlocked: sessionUnlocked() }))
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (pending) void refreshStatus()
  }, [pending, refreshStatus])

  const finish = useCallback((ok: boolean) => {
    setPending((cur) => {
      if (cur) cur.resolve(ok)
      const next = queue.current.shift() ?? null
      if (next) {
        setPassword('')
        setError('')
        return next
      }
      setPassword('')
      setError('')
      return null
    })
  }, [])

  const prompt = useCallback((fy: string): Promise<boolean> => {
    if (sessionUnlocked()) return Promise.resolve(true)
    return new Promise((resolve) => {
      const req: GuardRequest = { fy, resolve }
      setPending((cur) => {
        if (cur) {
          queue.current.push(req)
          return cur
        }
        setPassword('')
        setError('')
        return req
      })
    })
  }, [])

  const guardFy = useCallback(
    async (fy: string) => {
      if (!fy || !isClosedFiscalYear(fy)) return true
      if (sessionUnlocked()) return true
      return prompt(fy)
    },
    [prompt],
  )

  const guardWrite = useCallback(
    async (...dates: Array<string | null | undefined>) => {
      const fy = firstClosedFy(dates)
      if (!fy) return true
      if (sessionUnlocked()) return true
      return prompt(fy)
    },
    [prompt],
  )

  const relock = useCallback(async () => {
    writeSession(false)
    try {
      await apiPost('/api/fy-lock/lock', {})
    } catch {
      /* tolerate */
    }
    setStatus((s) => ({ ...s, unlocked: false }))
  }, [])

  const submit = async () => {
    const pw = normalizeUnlockPassword(password)
    if (!pw) {
      setError('Enter the unlock password')
      return
    }
    setBusy(true)
    setError('')
    try {
      await apiPost('/api/fy-lock/unlock', { password: pw })
      writeSession(true)
      setStatus((s) => ({ ...s, unlocked: true }))
      finish(true)
    } catch (e) {
      setError((e as Error).message || 'Unlock failed')
    } finally {
      setBusy(false)
    }
  }

  const value = useMemo<FyLockContextValue>(
    () => ({
      status,
      unlocked: status.unlocked || sessionUnlocked(),
      guardWrite,
      guardFy,
      relock,
      refreshStatus,
    }),
    [status, guardWrite, guardFy, relock, refreshStatus],
  )

  return (
    <FyLockContext.Provider value={value}>
      {children}
      <Modal
        open={Boolean(pending)}
        onClose={() => finish(false)}
        title={
          <span className="inline-flex items-center gap-2">
            <Lock size={16} /> Closed fiscal year
          </span>
        }
        maxWidth="28rem"
        footer={
          <>
            <Button variant="ghost" onClick={() => finish(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={busy}>
              <KeyRound size={15} /> {busy ? 'Unlocking…' : 'Unlock session'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-dim)]">
          {pending ? (
            <>
              {pending.fy} is closed. {LOCKED_FY_MESSAGE}
            </>
          ) : null}
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Administrator unlock password" error={error || undefined}>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
          </Field>
          <p className="text-xs text-[var(--text-muted)]">
            Set or change this password in Administration → Company rules. Unlock lasts for this browser tab.
          </p>
        </div>
      </Modal>
    </FyLockContext.Provider>
  )
}

export function useFyLock(): FyLockContextValue {
  const ctx = useContext(FyLockContext)
  if (!ctx) throw new Error('useFyLock must be used within FyLockProvider')
  return ctx
}

export function recordIsClosed(dateStr: string | null | undefined): boolean {
  return isClosedDate(dateStr)
}
