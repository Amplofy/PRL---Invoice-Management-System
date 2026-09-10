import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import type { AuthUser } from '../types/index.js'
import { loadAuthContext } from '../services/usersAdmin.js'

type JwtPayload = {
  sub?: string
  email?: string
}

export async function authRequired(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing bearer token' })
      return
    }
    const token = header.slice(7)
    let payload: JwtPayload
    try {
      payload = jwt.verify(token, env.SUPABASE_JWT_SECRET) as JwtPayload
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    if (!payload.sub) {
      res.status(401).json({ error: 'Token missing subject' })
      return
    }

    const ctx = await loadAuthContext(payload.sub, payload.email)
    if (ctx.inactive) {
      res.status(403).json({ error: 'This account is inactive' })
      return
    }

    ;(req as Request & { user: AuthUser }).user = {
      id: payload.sub,
      role: ctx.role,
      email: payload.email,
      fullName: ctx.fullName,
      permissions: ctx.permissions,
      status: ctx.status,
      username: ctx.username,
    }
    next()
  } catch (err) {
    next(err)
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user: AuthUser }).user
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Forbidden: insufficient role' })
      return
    }
    next()
  }
}

export function requirePermission(...codes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user: AuthUser }).user
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (user.role === 'admin' || user.role === 'superadmin') {
      next()
      return
    }
    const perms = user.permissions ?? []
    if (codes.some((code) => perms.includes(code))) {
      next()
      return
    }
    res.status(403).json({ error: 'Forbidden: missing permission' })
  }
}
