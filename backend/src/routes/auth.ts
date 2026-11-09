import { Router } from 'express'
import { getAnonSupabase, getSupabase } from '../config/supabase.js'
import { HttpError } from '../middleware/error.js'
import {
  LOCKOUT_LIMIT,
  lockoutMessage,
  lockoutStatus,
  recordLoginFailure,
  recordLoginSuccess,
} from '../services/loginLockout.js'
import { loadAuthContext } from '../services/usersAdmin.js'

export const authRouter = Router()

authRouter.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' })
      return
    }

    const status = lockoutStatus(email)
    if (status.locked) {
      res.status(429).json({
        error: lockoutMessage(status.remainingMs),
        remainingMs: status.remainingMs,
        remainingAttempts: 0,
      })
      return
    }

    const anon = getAnonSupabase()
    if (!anon) {
      res.status(501).json({ error: 'Server login is not configured', code: 'LOGIN_FALLBACK' })
      return
    }

    const { data, error } = await anon.auth.signInWithPassword({ email, password })
    if (error || !data.session || !data.user) {
      const after = recordLoginFailure(email)
      if (after.locked) {
        res.status(429).json({
          error: lockoutMessage(after.remainingMs),
          remainingMs: after.remainingMs,
          remainingAttempts: 0,
        })
        return
      }
      res.status(401).json({
        error: 'Invalid email or password',
        remainingAttempts: after.remainingAttempts,
        remainingOf: LOCKOUT_LIMIT,
      })
      return
    }

    const ctx = await loadAuthContext(data.user.id, email)
    if (ctx.inactive) {
      await getSupabase().auth.admin.signOut(data.user.id, 'global').catch(() => undefined)
      throw new HttpError(403, 'This account is inactive')
    }

    recordLoginSuccess(email)
    res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
        expires_at: data.session.expires_at,
        token_type: data.session.token_type,
      },
    })
  } catch (err) {
    next(err)
  }
})
