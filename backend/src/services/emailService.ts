import { Resend } from 'resend'
import { env } from '../config/env.js'
import type { EmailResult } from '../types/index.js'

let _resend: Resend | null = null

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null
  if (!_resend) _resend = new Resend(env.RESEND_API_KEY)
  return _resend
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<EmailResult> {
  const client = getResend()
  if (!client) {
    return { error: 'RESEND_API_KEY not configured' }
  }
  try {
    const { data, error } = await client.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    })
    if (error) return { error: error.message }
    return { id: data?.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Email send failed' }
  }
}

export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const value = data[key]
    return value == null ? '' : String(value)
  })
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\n/g, '<br/>')
}
