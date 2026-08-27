import 'dotenv/config'

export type Env = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  SUPABASE_JWT_SECRET: string
  SUPABASE_ANON_KEY: string
  RESEND_API_KEY: string
  EMAIL_FROM: string
  CORS_ORIGIN: string
  PORT: number
}

function required(name: string): string {
  const v = process.env[name]
  if (process.env.NODE_ENV === 'test') return ''
  if (!v) throw new Error(`Missing required environment variable: ${name}`)
  return v
}

export const env: Env = {
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  SUPABASE_JWT_SECRET: required('SUPABASE_JWT_SECRET'),
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'PRL Finance <noreply@prl-eoms.com>',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  PORT: Number(process.env.PORT || 3001),
}
