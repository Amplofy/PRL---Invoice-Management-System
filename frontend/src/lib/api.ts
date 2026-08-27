import { getSessionToken, isDemoMode } from './supabase'
import { mockRequest } from './mockApi'

export class ApiError extends Error {
  status: number
  detail?: unknown

  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  if (isDemoMode()) {
    return mockRequest<T>(options.method ?? 'GET', path, options.body)
  }
  const token = await getSessionToken()
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const message =
      (data as { error?: string })?.error ??
      (data as { message?: string })?.message ??
      `Request failed (${res.status})`
    throw new ApiError(message, res.status, data)
  }
  return data as T
}

export const apiGet = <T>(path: string) => request<T>(path, { method: 'GET' })
export const apiPost = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body })
export const apiPut = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body })
export const apiPatch = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body })
export const apiDelete = <T>(path: string) => request<T>(path, { method: 'DELETE' })

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  if (isDemoMode()) {
    return mockRequest<T>('POST', path, formData)
  }
  const token = await getSessionToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  })

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const message =
      (data as { error?: string })?.error ??
      (data as { message?: string })?.message ??
      `Request failed (${res.status})`
    throw new ApiError(message, res.status, data)
  }
  return data as T
}
