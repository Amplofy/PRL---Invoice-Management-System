import { getSupabase } from '../config/supabase.js'
import { HttpError } from '../middleware/error.js'
import { audit } from './auditService.js'
import {
  ADMIN_ROLE_ID,
  assertCanChangeAdminSeat,
  assertCanDeactivateSelf,
  assertCanDeleteRole,
  assertCanDeleteUser,
  assertCanRenameRole,
  isSystemRole,
  mapDbError,
  normalizeEmail,
  normalizeFullName,
  normalizeRoleName,
  normalizeStatus,
  normalizeUsername,
  parsePermissionIds,
  uniqueUsername,
  usernameFromEmail,
  validatePassword,
  type DirectorySeat,
} from './usersService.js'

export type DirectoryUser = DirectorySeat & {
  username: string
  full_name: string
  email: string
  last_login: string | null
  created_at?: string
  can_sign_in?: boolean
  roles?: { name: string; color: string } | null
}

export type AuthContext = {
  role: string
  fullName?: string
  permissions: string[]
  status: string
  username?: string
  inactive: boolean
}

type Actor = { id?: string; email?: string }

function throwDb(error: { message?: string } | null, fallback: string): never {
  throw new HttpError(400, mapDbError(error?.message || fallback))
}

async function activeAdminCount(): Promise<number> {
  const supabase = getSupabase()
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', ADMIN_ROLE_ID)
    .eq('status', 'active')
  if (error) throw new HttpError(500, `Failed to count administrators: ${error.message}`)
  return count ?? 0
}

async function loadDirectory(id: string): Promise<DirectoryUser> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'User not found')
  return data as DirectoryUser
}

async function loadRole(id: string): Promise<{ id: string; name: string; description: string; color: string }> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('roles').select('*').eq('id', id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, 'Role not found')
  return data as { id: string; name: string; description: string; color: string }
}

async function permissionIdsExist(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const supabase = getSupabase()
  const { data, error } = await supabase.from('permissions').select('id').in('id', ids)
  if (error) throw new HttpError(500, error.message)
  const found = new Set((data ?? []).map((row) => row.id as string))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length) throw new HttpError(400, `Unknown permission: ${missing[0]}`)
}

async function replaceRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
  const supabase = getSupabase()
  const { error: delErr } = await supabase.from('role_permissions').delete().eq('role_id', roleId)
  if (delErr) throwDb(delErr, 'Failed to update role permissions')
  if (permissionIds.length === 0) return
  const { error } = await supabase.from('role_permissions').insert(
    permissionIds.map((permission_id) => ({ role_id: roleId, permission_id })),
  )
  if (error) throwDb(error, 'Failed to update role permissions')
}

async function allPermissionIds(): Promise<string[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('permissions').select('id')
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map((row) => row.id as string)
}

async function upsertProfile(opts: {
  id: string
  email: string
  fullName: string
  roleId: string | null
}): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('profiles').upsert({
    id: opts.id,
    email: opts.email,
    full_name: opts.fullName,
    role_id: opts.roleId,
    updated_at: new Date().toISOString(),
  })
  if (error) throwDb(error, 'Failed to save profile')
}

export async function listDirectoryUsers(): Promise<DirectoryUser[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('users')
    .select('*, roles(name, color)')
    .order('full_name')
  if (error) throw new HttpError(500, `Failed to load users: ${error.message}`)
  return ((data ?? []) as DirectoryUser[]).map((row) => ({
    ...row,
    can_sign_in: Boolean(row.auth_id),
  }))
}

export async function createDirectoryUser(body: Record<string, unknown>, actor?: string): Promise<DirectoryUser> {
  const username = normalizeUsername(body.username)
  const fullName = normalizeFullName(body.full_name)
  const email = normalizeEmail(body.email)
  const status = normalizeStatus(body.status)
  const roleId = body.role_id ? String(body.role_id) : null
  if (!roleId) throw new HttpError(400, 'Role is required')
  const password = validatePassword(body.password, true) as string

  const supabase = getSupabase()
  const { data: role } = await supabase.from('roles').select('id').eq('id', roleId).maybeSingle()
  if (!role) throw new HttpError(400, 'Role not found')

  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, username },
  })
  if (authError || !created.user) {
    throw new HttpError(400, authError?.message || 'Failed to create login account')
  }
  const authId = created.user.id

  try {
    await upsertProfile({ id: authId, email, fullName, roleId })
    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        full_name: fullName,
        email,
        role_id: roleId,
        auth_id: authId,
        status,
      })
      .select('*, roles(name, color)')
      .single()
    if (error || !data) throwDb(error, 'Failed to create user')
    await audit('UserCreate', 'User', (data as DirectoryUser).id, `Created user ${username}`, actor)
    return { ...(data as DirectoryUser), can_sign_in: true }
  } catch (err) {
    await supabase.auth.admin.deleteUser(authId).catch(() => undefined)
    throw err
  }
}

export async function updateDirectoryUser(
  id: string,
  body: Record<string, unknown>,
  actor: Actor,
  actorLabel?: string,
): Promise<DirectoryUser> {
  const current = await loadDirectory(id)
  const username = body.username !== undefined ? normalizeUsername(body.username) : current.username
  const fullName = body.full_name !== undefined ? normalizeFullName(body.full_name) : current.full_name
  const email = body.email !== undefined ? normalizeEmail(body.email) : current.email
  const status = body.status !== undefined ? normalizeStatus(body.status) : normalizeStatus(current.status)
  const roleId = body.role_id !== undefined ? (body.role_id ? String(body.role_id) : null) : current.role_id
  if (!roleId) throw new HttpError(400, 'Role is required')
  const password = validatePassword(body.password, false)

  const admins = await activeAdminCount()
  assertCanDeactivateSelf({ actor, target: current, nextStatus: status })
  assertCanChangeAdminSeat({
    target: current,
    nextRoleId: roleId,
    nextStatus: status,
    activeAdminCount: admins,
  })

  const supabase = getSupabase()
  const { data: role } = await supabase.from('roles').select('id').eq('id', roleId).maybeSingle()
  if (!role) throw new HttpError(400, 'Role not found')

  let authId = current.auth_id
  if (!authId && password) {
    const { data: created, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, username },
    })
    if (authError || !created.user) {
      throw new HttpError(400, authError?.message || 'Failed to create login account')
    }
    authId = created.user.id
  } else if (authId) {
    const patch: { email?: string; password?: string; ban_duration?: string } = {}
    if (email !== current.email) patch.email = email
    if (password) patch.password = password
    if (Object.keys(patch).length) {
      const { error } = await supabase.auth.admin.updateUserById(authId, patch)
      if (error) throw new HttpError(400, error.message)
    }
  }

  if (authId) {
    await upsertProfile({ id: authId, email, fullName, roleId })
  }

  const { data, error } = await supabase
    .from('users')
    .update({
      username,
      full_name: fullName,
      email,
      role_id: roleId,
      status,
      auth_id: authId,
    })
    .eq('id', id)
    .select('*, roles(name, color)')
    .single()
  if (error || !data) throwDb(error, 'Failed to update user')

  await audit('UserUpdate', 'User', id, `Updated user ${username}`, actorLabel)
  const row = data as DirectoryUser
  return { ...row, can_sign_in: Boolean(row.auth_id) }
}

export async function deleteDirectoryUser(id: string, actor: Actor, actorLabel?: string): Promise<void> {
  const current = await loadDirectory(id)
  const admins = await activeAdminCount()
  assertCanDeleteUser({ actor, target: current, activeAdminCount: admins })

  const supabase = getSupabase()
  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) throwDb(error, 'Failed to delete user')

  if (current.auth_id) {
    const { error: authError } = await supabase.auth.admin.deleteUser(current.auth_id)
    if (authError) throw new HttpError(400, authError.message)
  }
  await audit('UserDelete', 'User', id, `Deleted user ${current.username}`, actorLabel)
}

export async function createCustomRole(body: Record<string, unknown>, actor?: string) {
  const name = normalizeRoleName(body.name)
  const description = String(body.description ?? '').trim()
  const color = String(body.color ?? '#60a5fa').trim() || '#60a5fa'
  const permissionIds = parsePermissionIds(body.permission_ids)
  if (isSystemRole('', name)) throw new HttpError(400, 'That role name is reserved')
  await permissionIdsExist(permissionIds)

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('roles')
    .insert({ name, description, color })
    .select('*')
    .single()
  if (error || !data) throwDb(error, 'Failed to create role')

  await replaceRolePermissions(data.id as string, permissionIds)
  await audit('RoleCreate', 'Role', data.id as string, `Created role ${name}`, actor)
  return {
    ...data,
    role_permissions: permissionIds.map((permission_id) => ({ permission_id })),
  }
}

export async function updateCustomRole(id: string, body: Record<string, unknown>, actor?: string) {
  const current = await loadRole(id)
  const nextName = body.name !== undefined ? normalizeRoleName(body.name) : current.name
  assertCanRenameRole({ roleId: id, currentName: current.name, nextName })
  const description = body.description !== undefined ? String(body.description ?? '').trim() : current.description
  const color = body.color !== undefined ? String(body.color ?? '').trim() || current.color : current.color

  let permissionIds: string[] | null = null
  if (body.permission_ids !== undefined) {
    permissionIds = parsePermissionIds(body.permission_ids)
    await permissionIdsExist(permissionIds)
    if (id === ADMIN_ROLE_ID) permissionIds = await allPermissionIds()
  } else if (id === ADMIN_ROLE_ID) {
    permissionIds = await allPermissionIds()
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('roles')
    .update({ name: nextName, description, color })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) throwDb(error, 'Failed to update role')

  if (permissionIds) await replaceRolePermissions(id, permissionIds)
  await audit('RoleUpdate', 'Role', id, `Updated role ${nextName}`, actor)

  const { data: rp } = await supabase.from('role_permissions').select('permission_id').eq('role_id', id)
  return { ...data, role_permissions: rp ?? [] }
}

export async function deleteCustomRole(id: string, actor?: string): Promise<void> {
  const current = await loadRole(id)
  const supabase = getSupabase()
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', id)
  if (error) throw new HttpError(500, error.message)
  assertCanDeleteRole({ roleId: id, name: current.name, assignedUsers: count ?? 0 })

  const { error: delErr } = await supabase.from('roles').delete().eq('id', id)
  if (delErr) throwDb(delErr, 'Failed to delete role')
  await audit('RoleDelete', 'Role', id, `Deleted role ${current.name}`, actor)
}

export async function loadAuthContext(authId: string, email?: string): Promise<AuthContext> {
  const supabase = getSupabase()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role_id, roles(name)')
    .eq('id', authId)
    .maybeSingle()

  let directory: DirectoryUser | null = null
  const byAuth = await supabase.from('users').select('*').eq('auth_id', authId).maybeSingle()
  directory = (byAuth.data as DirectoryUser | null) ?? null

  if (!directory && email) {
    const byEmail = await supabase.from('users').select('*').eq('email', email.toLowerCase()).maybeSingle()
    directory = (byEmail.data as DirectoryUser | null) ?? null
    if (directory && !directory.auth_id) {
      await supabase.from('users').update({ auth_id: authId }).eq('id', directory.id)
      directory = { ...directory, auth_id: authId }
    }
  }

  if (directory && !(profile as { role_id?: string | null } | null)?.role_id && directory.role_id) {
    await upsertProfile({
      id: authId,
      email: directory.email,
      fullName: directory.full_name || (profile as { full_name?: string } | null)?.full_name || directory.username,
      roleId: directory.role_id,
    }).catch(() => undefined)
  }

  const roleId = (profile as { role_id?: string | null } | null)?.role_id ?? directory?.role_id ?? null
  const fullName = (profile as { full_name?: string } | null)?.full_name || directory?.full_name
  const roleName =
    (profile as { roles?: { name?: string } } | null)?.roles?.name ??
    (directory?.role_id === ADMIN_ROLE_ID ? 'admin' : undefined)

  let role = roleName ?? 'viewer'
  if (!roleName && roleId) {
    const { data: roleRow } = await supabase.from('roles').select('name').eq('id', roleId).maybeSingle()
    role = roleRow?.name ?? 'viewer'
  }

  if (!directory && (profile || email)) {
    const taken = new Set<string>()
    const { data: existing } = await supabase.from('users').select('username')
    for (const row of existing ?? []) taken.add(String(row.username))
    const emailValue = (profile as { email?: string } | null)?.email || email || `${authId}@local`
    const username = uniqueUsername(usernameFromEmail(emailValue), taken)
    const { data: inserted } = await supabase
      .from('users')
      .insert({
        username,
        full_name: fullName || username,
        email: emailValue.toLowerCase(),
        role_id: roleId,
        auth_id: authId,
        status: 'active',
      })
      .select('*')
      .maybeSingle()
    directory = (inserted as DirectoryUser | null) ?? directory
  }

  if (directory && !profile && directory.auth_id) {
    await upsertProfile({
      id: directory.auth_id,
      email: directory.email,
      fullName: directory.full_name,
      roleId: directory.role_id,
    }).catch(() => undefined)
  }

  let permissions: string[] = []
  if (roleId) {
    const { data: rps } = await supabase.from('role_permissions').select('permission_id').eq('role_id', roleId)
    permissions = (rps ?? []).map((row) => row.permission_id as string)
  }

  if (directory?.id) {
    const last = directory.last_login ? new Date(directory.last_login).getTime() : 0
    if (!last || Date.now() - last > 5 * 60 * 1000) {
      void supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', directory.id)
    }
  }

  const status = directory?.status ?? 'active'
  return {
    role,
    fullName,
    permissions,
    status,
    username: directory?.username,
    inactive: status === 'inactive',
  }
}
