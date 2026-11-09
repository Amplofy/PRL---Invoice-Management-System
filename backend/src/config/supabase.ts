import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { env } from './env.js'

let _client: SupabaseClient | null = null
let _anon: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  }
  return _client
}

export function getAnonSupabase(): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null
  if (!_anon) {
    _anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return _anon
}
