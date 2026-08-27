import type { NextFunction, Request, Response } from 'express'

export class UnsupportedFormatError extends Error {
  status = 400
  constructor(message = 'Unsupported file format') {
    super(message)
    this.name = 'UnsupportedFormatError'
  }
}

export class NotFoundError extends Error {
  status = 404
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const e = err as { status?: number; message?: string }
  const status = e.status || 500
  const message = e.message || 'Internal server error'
  if (status >= 500) console.error('[error]', err)
  res.status(status).json({ error: message })
}
