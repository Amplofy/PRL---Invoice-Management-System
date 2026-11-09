export const LOCKOUT_LIMIT = 5
export const LOCKOUT_MS = 15 * 60 * 1000

export type LockoutState = {
  failures: number
  locked: boolean
  remainingMs: number
  remainingAttempts: number
}

type Entry = {
  failures: number
  lockedUntil: number | null
}

const store = new Map<string, Entry>()

export function normalizeLoginEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

export function lockoutMessage(remainingMs: number): string {
  const mins = Math.max(1, Math.ceil(remainingMs / 60_000))
  return `Too many failed sign-in attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`
}

function read(email: string, now: number): Entry {
  const current = store.get(email)
  if (!current) return { failures: 0, lockedUntil: null }
  if (current.lockedUntil && current.lockedUntil <= now) {
    const reset = { failures: 0, lockedUntil: null }
    store.set(email, reset)
    return reset
  }
  return current
}

function toState(entry: Entry, now: number): LockoutState {
  const remainingMs = entry.lockedUntil ? Math.max(0, entry.lockedUntil - now) : 0
  const locked = remainingMs > 0
  return {
    failures: entry.failures,
    locked,
    remainingMs,
    remainingAttempts: locked ? 0 : Math.max(0, LOCKOUT_LIMIT - entry.failures),
  }
}

export function lockoutStatus(email: string, now = Date.now()): LockoutState {
  const key = normalizeLoginEmail(email)
  if (!key) return { failures: 0, locked: false, remainingMs: 0, remainingAttempts: LOCKOUT_LIMIT }
  return toState(read(key, now), now)
}

export function recordLoginFailure(email: string, now = Date.now()): LockoutState {
  const key = normalizeLoginEmail(email)
  if (!key) return { failures: 0, locked: false, remainingMs: 0, remainingAttempts: LOCKOUT_LIMIT }
  const current = read(key, now)
  if (current.lockedUntil && current.lockedUntil > now) return toState(current, now)
  const failures = current.failures + 1
  const next: Entry = {
    failures,
    lockedUntil: failures >= LOCKOUT_LIMIT ? now + LOCKOUT_MS : null,
  }
  store.set(key, next)
  return toState(next, now)
}

export function recordLoginSuccess(email: string): void {
  const key = normalizeLoginEmail(email)
  if (!key) return
  store.delete(key)
}

export function resetLockoutStore(): void {
  store.clear()
}
