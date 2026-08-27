import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { env } from './env.js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  }
  return _client
}
