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
