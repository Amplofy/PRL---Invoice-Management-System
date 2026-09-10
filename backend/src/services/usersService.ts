export const ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000001'

export const SYSTEM_ROLE_IDS = new Set([
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000006',
])

export const SYSTEM_ROLE_NAMES = new Set([
  'admin',
  'approver',
  'processor',
  'viewer',
  'auditor',
  'finance',
])

export class UserValidationError extends Error {
  status = 400
  constructor(message: string) {
    super(message)
    this.name = 'UserValidationError'
  }
}

export type DirectorySeat = {
  id: string
  role_id: string | null
  status: string | null
  auth_id?: string | null
  email?: string | null
}

export function normalizeUsername(raw: unknown): string {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value.length < 3) throw new UserValidationError('Username must be at least 3 characters')
  if (value.length > 40) throw new UserValidationError('Username must be at most 40 characters')
  if (!/^[a-z0-9._-]+$/.test(value)) {
    throw new UserValidationError('Username may contain letters, numbers, dots, hyphens and underscores')
  }
  return value
}

export function normalizeEmail(raw: unknown): string {
  const value = String(raw ?? '').trim().toLowerCase()
  if (!value) throw new UserValidationError('Email is required')
  if (value.length > 120) throw new UserValidationError('Email is too long')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new UserValidationError('Enter a valid email address')
  }
  return value
}

export function normalizeFullName(raw: unknown): string {
  const value = String(raw ?? '').trim()
  if (!value) throw new UserValidationError('Full name is required')
  if (value.length > 120) throw new UserValidationError('Full name is too long')
  return value
}

export function normalizeStatus(raw: unknown, fallback = 'active'): 'active' | 'inactive' {
  const value = String(raw ?? fallback).trim().toLowerCase()
  if (value !== 'active' && value !== 'inactive') {
    throw new UserValidationError('Status must be active or inactive')
  }
  return value
}

export function validatePassword(raw: unknown, required: boolean): string | undefined {
  const value = String(raw ?? '')
  if (!value) {
    if (required) throw new UserValidationError('Password is required')
    return undefined
  }
  if (value.length < 8) throw new UserValidationError('Password must be at least 8 characters')
  if (value.length > 72) throw new UserValidationError('Password is too long')
  return value
}

export function normalizeRoleName(raw: unknown): string {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value.length < 2) throw new UserValidationError('Role name must be at least 2 characters')
  if (value.length > 32) throw new UserValidationError('Role name must be at most 32 characters')
  if (!/^[a-z][a-z0-9_-]*$/.test(value)) {
    throw new UserValidationError('Role name must start with a letter and use letters, numbers, hyphens or underscores')
  }
  return value
}

export function parsePermissionIds(raw: unknown): string[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) throw new UserValidationError('permission_ids must be an array')
  return [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))]
}

export function isSystemRole(id: string, name?: string | null): boolean {
  if (SYSTEM_ROLE_IDS.has(id)) return true
  return SYSTEM_ROLE_NAMES.has((name ?? '').toLowerCase())
}

export function isAdminSeat(row: DirectorySeat, adminRoleId = ADMIN_ROLE_ID): boolean {
  return row.role_id === adminRoleId && row.status === 'active'
}

export function isSelfUser(
  actor: { id?: string; email?: string },
  target: { auth_id?: string | null; email?: string | null },
): boolean {
  if (actor.id && target.auth_id && actor.id === target.auth_id) return true
  if (actor.email && target.email && actor.email.toLowerCase() === target.email.toLowerCase()) return true
  return false
}

export function assertCanChangeAdminSeat(opts: {
  target: DirectorySeat
  nextRoleId: string | null
  nextStatus: string
  activeAdminCount: number
  adminRoleId?: string
}): void {
  const adminRoleId = opts.adminRoleId ?? ADMIN_ROLE_ID
  const wasAdmin = isAdminSeat(opts.target, adminRoleId)
  const willBeAdmin = opts.nextRoleId === adminRoleId && opts.nextStatus === 'active'
  if (wasAdmin && !willBeAdmin && opts.activeAdminCount <= 1) {
    throw new UserValidationError('Cannot remove the last active administrator')
  }
}

export function assertCanDeleteUser(opts: {
  actor: { id?: string; email?: string }
  target: DirectorySeat
  activeAdminCount: number
}): void {
  if (isSelfUser(opts.actor, opts.target)) {
    throw new UserValidationError('You cannot delete your own account')
  }
  if (isAdminSeat(opts.target) && opts.activeAdminCount <= 1) {
    throw new UserValidationError('Cannot delete the last active administrator')
  }
}

export function assertCanDeactivateSelf(opts: {
  actor: { id?: string; email?: string }
  target: DirectorySeat
  nextStatus: string
}): void {
  if (opts.nextStatus === 'inactive' && isSelfUser(opts.actor, opts.target)) {
    throw new UserValidationError('You cannot deactivate your own account')
  }
}

export function assertCanDeleteRole(opts: { roleId: string; name?: string | null; assignedUsers: number }): void {
  if (isSystemRole(opts.roleId, opts.name)) {
    throw new UserValidationError('System roles cannot be deleted')
  }
  if (opts.assignedUsers > 0) {
    throw new UserValidationError('Cannot delete a role that is still assigned to users')
  }
}

export function assertCanRenameRole(opts: { roleId: string; currentName: string; nextName: string }): void {
  if (isSystemRole(opts.roleId, opts.currentName) && opts.nextName !== opts.currentName.toLowerCase()) {
    throw new UserValidationError('System role names cannot be changed')
  }
}

export function usernameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'user'
  const cleaned = local.toLowerCase().replace(/[^a-z0-9._-]+/g, '.') || 'user'
  return cleaned.replace(/^\.+|\.+$/g, '').slice(0, 40) || 'user'
}

export function uniqueUsername(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base.slice(0, 36)}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base.slice(0, 24)}-${Date.now().toString(36)}`
}

export function mapDbError(message: string): string {
  if (message.includes('users_username')) return 'Username already exists'
  if (message.includes('users_email')) return 'Email already exists'
  if (message.includes('roles_name')) return 'Role name already exists'
  return message
}
