import { Router } from 'express'
import type { Request } from 'express'
import { authRequired, requireRole } from '../middleware/auth.js'
import type { AuthUser } from '../types/index.js'
import {
  clearUnlockFailures,
  getPasswordHash,
  hashFyPassword,
  isSessionUnlocked,
  isUnlockBlocked,
  markLocked,
  markUnlocked,
  normalizeUnlockPassword,
  noteUnlockFailure,
  setPasswordHash,
  verifyFyPassword,
} from '../services/fyLock.js'

export const fyLockRouter = Router()

function userKey(req: Request): string {
  const user = (req as Request & { user?: AuthUser }).user
  return user?.id || user?.email || 'anon'
}

function currentFyLabel(): string {
  const d = new Date()
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
  return `FY${String(y).slice(2)}`
}

fyLockRouter.get('/', authRequired, async (req, res, next) => {
  try {
    const hash = await getPasswordHash()
    res.json({
      passwordSet: Boolean(hash),
      unlocked: isSessionUnlocked(userKey(req)),
      currentFy: currentFyLabel(),
    })
  } catch (err) {
    next(err)
  }
})

fyLockRouter.post('/password', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const password = normalizeUnlockPassword(String(req.body?.password ?? ''))
    const currentPassword = normalizeUnlockPassword(String(req.body?.currentPassword ?? ''))
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' })
      return
    }
    if (password.length > 128) {
      res.status(400).json({ error: 'Password is too long' })
      return
    }
    const existing = await getPasswordHash()
    if (existing) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Current password is required' })
        return
      }
      if (!(await verifyFyPassword(currentPassword, existing))) {
        res.status(403).json({ error: 'Current password is incorrect' })
        return
      }
    }
    await setPasswordHash(await hashFyPassword(password))
    markLocked(userKey(req))
    res.json({ ok: true, passwordSet: true })
  } catch (err) {
    next(err)
  }
})

fyLockRouter.post('/unlock', authRequired, async (req, res, next) => {
  try {
    const key = userKey(req)
    const password = normalizeUnlockPassword(String(req.body?.password ?? ''))
    const stored = await getPasswordHash()
    if (!stored) {
      res.status(400).json({ error: 'No unlock password has been set. Ask an administrator to set one.' })
      return
    }
    const blocked = isUnlockBlocked(key)
    if (blocked) {
      res.status(429).json({ error: blocked })
      return
    }
    if (!(await verifyFyPassword(password, stored))) {
      res.status(403).json({ error: noteUnlockFailure(key) || 'Incorrect password' })
      return
    }
    clearUnlockFailures(key)
    markUnlocked(key)
    res.json({ ok: true, unlocked: true })
  } catch (err) {
    next(err)
  }
})

fyLockRouter.post('/lock', authRequired, async (req, res) => {
  markLocked(userKey(req))
  res.json({ ok: true, unlocked: false })
})
