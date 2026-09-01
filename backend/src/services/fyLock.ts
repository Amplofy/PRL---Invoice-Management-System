import { pbkdf2 as pbkdf2Cb, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { getSetting, upsertSetting } from './settingsService.js'

const pbkdf2 = promisify(pbkdf2Cb)
const ITERATIONS = 100_000
const KEY_LEN = 32
const UNLOCK_MS = 8 * 60 * 60 * 1000
const FAIL_WINDOW_MS = 30_000
const SETTING_KEY = 'fy_lock_password'

export const LOCKED_FY_MESSAGE =
  'This fiscal year is closed. Unlock it with the administrator password to edit or delete.'

const unlockUntil = new Map<string, number>()
const failState = new Map<string, { count: number; blockedUntil: number }>()

function fiscalStartYear(d: Date): number {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
}

export function fyStartYear(fy: string): number | null {
  const n = Number(String(fy).replace(/^FY/i, ''))
  if (!Number.isFinite(n) || n < 1) return null
  return n >= 100 ? n : 2000 + n
}

export function fiscalYearOfDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return `FY${String(fiscalStartYear(d)).slice(2)}`
}

export function isClosedFiscalYear(fy: string, d = new Date()): boolean {
  const y = fyStartYear(fy)
  if (y == null) return false
  return y < fiscalStartYear(d)
}

export function fiscalBoundsIso(fy: string): { start: string; end: string } | null {
  const startYear = fyStartYear(fy)
  if (startYear == null) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start: `${startYear}-07-01`,
    end: `${startYear + 1}-06-30`,
  }
}

export function normalizeUnlockPassword(raw: string): string {
  return raw.normalize('NFKC').trim()
}

export async function hashFyPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await pbkdf2(password, salt, ITERATIONS, KEY_LEN, 'sha256')
  return `v1$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyFyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  const actual = await pbkdf2(password, salt, ITERATIONS, expected.length, 'sha256')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function isSessionUnlocked(userKey: string): boolean {
  return Date.now() < (unlockUntil.get(userKey) ?? 0)
}

export function markUnlocked(userKey: string): void {
  unlockUntil.set(userKey, Date.now() + UNLOCK_MS)
}

export function markLocked(userKey: string): void {
  unlockUntil.delete(userKey)
}

export function isUnlockBlocked(userKey: string): string | null {
  const cur = failState.get(userKey)
  if (cur && Date.now() < cur.blockedUntil) return 'Too many attempts. Try again in a moment.'
  return null
}

export function noteUnlockFailure(userKey: string): string | null {
  const now = Date.now()
  const cur = failState.get(userKey) ?? { count: 0, blockedUntil: 0 }
  if (now < cur.blockedUntil) return 'Too many attempts. Try again in a moment.'
  cur.count += 1
  if (cur.count >= 5) {
    cur.count = 0
    cur.blockedUntil = now + FAIL_WINDOW_MS
    failState.set(userKey, cur)
    return 'Too many attempts. Try again in a moment.'
  }
  failState.set(userKey, cur)
  return null
}

export function clearUnlockFailures(userKey: string): void {
  failState.delete(userKey)
}

export async function getPasswordHash(): Promise<string | null> {
  const value = await getSetting(SETTING_KEY)
  return value && value.length > 0 ? value : null
}

export async function setPasswordHash(hash: string): Promise<void> {
  await upsertSetting(SETTING_KEY, hash)
}

export function closedFyOf(dateStr: string | null | undefined): string | null {
  const fy = fiscalYearOfDate(dateStr)
  if (!fy || !isClosedFiscalYear(fy)) return null
  return fy
}

/** Returns the closed FY label when the write must be blocked. */
export function writeBlocked(userKey: string, dateStr: string | null | undefined): string | null {
  const fy = closedFyOf(dateStr)
  if (!fy) return null
  if (isSessionUnlocked(userKey)) return null
  return fy
}

export function writeBlockedFy(userKey: string, fy: string): boolean {
  if (!fy || !isClosedFiscalYear(fy)) return false
  return !isSessionUnlocked(userKey)
}
