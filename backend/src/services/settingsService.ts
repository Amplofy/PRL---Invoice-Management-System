import { getSupabase } from '../config/supabase.js'

export async function getSetting(key: string): Promise<string | null> {
  const supabase = getSupabase()
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  return (data as { value?: string } | null)?.value ?? null
}

export async function getSettingsMap(): Promise<Record<string, string>> {
  const supabase = getSupabase()
  const { data } = await supabase.from('app_settings').select('key, value')
  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[(row as { key: string }).key] = (row as { value: string }).value
  }
  return map
}

export async function upsertSetting(key: string, value: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}
