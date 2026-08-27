import { getSupabase } from '../config/supabase.js'

export async function audit(
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  user?: string
): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase.from('audit_log').insert({
      user_email: user ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      summary,
    })
  } catch {
    // audit is best-effort; never block the main operation
  }
}
