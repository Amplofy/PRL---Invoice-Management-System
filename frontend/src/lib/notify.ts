export type AppEventType = 'ok' | 'warn' | 'err' | 'info'

export interface AppEvent {
  id: string
  type: AppEventType
  title: string
  message: string
  to?: string
  at: number
}

type Listener = (e: AppEvent) => void

const listeners = new Set<Listener>()
let seq = 0

export function subscribeAppEvents(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function emitAppEvent(type: AppEventType, title: string, message: string, to?: string): void {
  const event: AppEvent = {
    id: `evt-${Date.now()}-${seq++}`,
    type,
    title,
    message,
    to,
    at: Date.now(),
  }
  for (const fn of listeners) {
    try {
      fn(event)
    } catch {
      // listener errors must not break app actions
    }
  }
}

// ---- Domain event bus: cross-module real-time linkage -----------------------
// Any write in one module (approve invoice, change budget, add vendor, …)
// emits a domain signal so other pages can refresh their derived state.

export type DomainEntity =
  | 'invoice'
  | 'contract'
  | 'vendor'
  | 'budget'
  | 'costElement'
  | 'serviceMatrix'
  | 'setting'
  | 'followup'
  | 'paymentOrder'
  | 'user'
  | 'import'

export interface DomainEvent {
  entity: DomainEntity
  action: 'create' | 'update' | 'delete' | 'bulk'
  at: number
  id?: string
}

type DomainListener = (e: DomainEvent) => void
const domainListeners = new Set<DomainListener>()

export function subscribeDomain(fn: DomainListener): () => void {
  domainListeners.add(fn)
  return () => {
    domainListeners.delete(fn)
  }
}

export function emitDomain(entity: DomainEntity, action: DomainEvent['action'], id?: string): void {
  const e: DomainEvent = { entity, action, at: Date.now(), id }
  for (const fn of domainListeners) {
    try {
      fn(e)
    } catch {
      // a broken subscriber must not block the mutation
    }
  }
}
