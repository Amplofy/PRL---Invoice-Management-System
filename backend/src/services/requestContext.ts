import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextFunction, Request, Response } from 'express'

type RequestContext = {
  actor?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

export function withRequestContext() {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    storage.run({}, () => next())
  }
}

export function runWithActor<T>(actor: string | undefined, fn: () => T): T {
  return storage.run({ actor: actor?.trim() || undefined }, fn)
}

export function bindActor(actor: string | undefined): void {
  const store = storage.getStore()
  if (!store) return
  store.actor = actor?.trim() || undefined
}

export function currentActor(): string | undefined {
  const value = storage.getStore()?.actor?.trim()
  return value || undefined
}
