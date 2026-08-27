import { createClient } from '@supabase/supabase-js'

const DEMO_KEY = 'prl-eoms-demo'

export function isDemoMode(): boolean {
  try {
    return sessionStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function enterDemo(): void {
  try {
    sessionStorage.setItem(DEMO_KEY, '1')
  } catch {
    // ignore storage errors
  }
}

export function exitDemo(): void {
  try {
    sessionStorage.removeItem(DEMO_KEY)
  } catch {
    // ignore storage errors
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = supabaseEnabled
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null

export async function getSessionToken(): Promise<string | null> {
  if (isDemoMode()) return 'demo-token'
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}
