const ITERATIONS = 100_000
const KEY_BITS = 256

export const LOCKED_FY_MESSAGE =
  'This fiscal year is closed. Unlock it with the administrator password to edit or delete.'

function toHex(buf: Uint8Array): string {
  let out = ''
  for (let i = 0; i < buf.length; i++) out += buf[i].toString(16).padStart(2, '0')
  return out
}

function fromHex(hex: string): Uint8Array {
  const len = Math.floor(hex.length / 2)
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS },
    key,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

export function normalizeUnlockPassword(raw: string): string {
  return raw.normalize('NFKC').trim()
}

export async function hashFyPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt)
  return `v1$${toHex(salt)}$${toHex(hash)}`
}

export async function verifyFyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) return false
  const actual = toHex(await derive(password, fromHex(parts[1])))
  const expected = parts[2]
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
