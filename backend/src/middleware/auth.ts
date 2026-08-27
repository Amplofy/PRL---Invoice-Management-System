import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { getSupabase } from '../config/supabase.js'
import type { AuthUser } from '../types/index.js'

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

    const supabase = getSupabase()
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, role_id, roles(name)')
      .eq('id', payload.sub)
      .maybeSingle()

    const role = (profile as { roles?: { name?: string } } | null)?.roles?.name ?? 'viewer'

    ;(req as Request & { user: AuthUser }).user = {
      id: payload.sub,
      role,
      email: payload.email,
      fullName: profile?.full_name,
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
