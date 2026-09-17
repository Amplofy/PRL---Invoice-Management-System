import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Plus, Pencil, ShieldCheck, Users as UsersIcon, Trash2, Lock, KeyRound } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
import { todayCalendarYmd } from '../lib/calendarDate'
import { useAuth, hasPermission } from '../lib/auth'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import Tabs, { useTab } from '../components/ui/Tabs'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { Field } from '../components/ui/Field'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import DataToolbar from '../components/ui/DataToolbar'
import ColumnsButton from '../components/ui/ColumnsButton'
import AdvancedFilter from '../components/ui/AdvancedFilter'
import SummaryCards from '../components/ui/SummaryCards'
import { sortRows, type SortDirection } from '../lib/export'
import { downloadTableWorkbook } from '../lib/analysisWorkbook'
import { useColumnVisibility } from '../lib/columns'
import { applyFilters, type FilterColumnDef, type FilterLogic, type FilterState } from '../lib/filters'
import SortableTh from '../components/ui/SortableTh'

interface Role {
  id: string
  name: string
  color: string | null
  description: string | null
  role_permissions?: Array<{ permission_id: string }>
}
interface User {
  id: string
  username: string
  full_name: string | null
  email: string | null
  status: string | null
  role_id: string | null
  auth_id?: string | null
  last_login?: string | null
  can_sign_in?: boolean
  roles: Role | null
}
interface Permission {
  id: string
  code?: string
  name: string | null
  category: string | null
}

const USER_COLUMN_DEFS = [
  { key: 'username', label: 'Username' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'login', label: 'Sign-in' },
  { key: 'last_login', label: 'Last login' },
]

const USER_DEFAULT_COLUMNS = ['username', 'full_name', 'email', 'role', 'status', 'login']

const USER_FILTER_COLUMNS: FilterColumnDef[] = [
  { key: 'username', label: 'Username', type: 'text' },
  { key: 'full_name', label: 'Full Name', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'role', label: 'Role', type: 'select' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ] },
]

const ROLE_COLORS = ['#60a5fa', '#34d399', '#f472b6', '#94a3b8', '#fbbf24', '#22d3ee', '#fb7185', '#a78bfa']

function permissionCode(p: Permission): string {
  return p.code || p.id
}

function formatLastLogin(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never'
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isSelfRow(user: User, meId?: string, meEmail?: string): boolean {
  if (meId && user.auth_id && meId === user.auth_id) return true
  if (meEmail && user.email && meEmail.toLowerCase() === user.email.toLowerCase()) return true
  return false
}

export default function UsersPage() {
  const [tab, setTab] = useTab('users')
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const col = useColumnVisibility(
    'prl-eoms-cols-users',
    USER_COLUMN_DEFS.map((c) => c.key),
    USER_DEFAULT_COLUMNS,
  )
  const [editing, setEditing] = useState<User | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [creatingRole, setCreatingRole] = useState(false)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterState[]>([])
  const [filterLogic, setFilterLogic] = useState<FilterLogic>('and')
  const [sortBy, setSortBy] = useState('username')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const onSort = (key: string, dir: SortDirection) => {
    setSortBy(key)
    setSortDir(dir)
  }
  const toast = useToast()
  const { user: me } = useAuth()
  const canManageUsers = hasPermission(me, 'users.manage')
  const canManageRoles = hasPermission(me, 'roles.manage')

  const load = useCallback(async () => {
    try {
      const [u, r, p] = await Promise.all([
        apiGet<{ users: User[] }>('/api/users'),
        apiGet<{ roles: Role[] }>('/api/roles'),
        apiGet<{ permissions: Permission[] }>('/api/permissions'),
      ])
      setUsers(u.users)
      setRoles(r.roles)
      setPermissions(p.permissions)
    } catch (e) {
      toast.error('Failed to load users', (e as Error).message)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const remove = async (u: User) => {
    if (isSelfRow(u, me?.id, me?.email)) {
      toast.error('You cannot delete your own account')
      return
    }
    if (!window.confirm(`Delete user ${u.username}? Their login will be removed.`)) return
    try {
      await apiDelete(`/api/users/${u.id}`)
      toast.success('User deleted')
      load()
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
    }
  }

  const removeRole = async (r: Role) => {
    if (!window.confirm(`Delete role ${r.name}?`)) return
    try {
      await apiDelete(`/api/roles/${r.id}`)
      toast.success('Role deleted')
      load()
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
    }
  }

  const rolePermCount = (role: Role) => role.role_permissions?.length ?? 0

  const filterColumns = useMemo<FilterColumnDef[]>(
    () =>
      USER_FILTER_COLUMNS.map((c) =>
        c.key === 'role'
          ? { ...c, options: roles.map((r) => ({ value: r.name, label: r.name })) }
          : c,
      ),
    [roles],
  )

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase()
    const searched = q
      ? users.filter((u) =>
          `${u.username} ${u.full_name ?? ''} ${u.email ?? ''} ${u.roles?.name ?? ''}`.toLowerCase().includes(q),
        )
      : users
    return applyFilters(searched, filters, filterColumns, (u, key) => {
      if (key === 'role') return u.roles?.name ?? null
      return (u as unknown as Record<string, string | null>)[key] ?? null
    }, filterLogic)
  }, [users, search, filters, filterColumns, filterLogic])

  const activeCount = useMemo(() => filteredUsers.filter((u) => u.status === 'active').length, [filteredUsers])
  const linkedCount = useMemo(() => filteredUsers.filter((u) => u.can_sign_in || u.auth_id).length, [filteredUsers])

  const sortedUsers = useMemo(
    () =>
      sortRows(
        filteredUsers,
        sortBy || null,
        sortDir,
        (row, key) =>
          key === 'username'
            ? String(row.username ?? '')
            : key === 'full_name'
              ? String(row.full_name ?? '')
              : key === 'email'
                ? String(row.email ?? '')
              : key === 'role'
                ? String(row.roles?.name ?? '')
              : key === 'login'
                ? (row.can_sign_in || row.auth_id ? '1' : '0')
              : key === 'last_login'
                ? String(row.last_login ?? '')
                : String(row.status ?? ''),
      ),
    [filteredUsers, sortBy, sortDir],
  )

  const exportUsers = async () => {
    try {
      await downloadTableWorkbook({
        filename: `users-${todayCalendarYmd()}.xlsx`,
        title: 'User directory',
        subtitle: 'All user columns in the current filter',
        grandTotal: false,
        groupBy: 'Role',
        filters: [{ label: 'Rows', value: String(sortedUsers.length) }],
        columns: [
          { key: 'Username', header: 'Username', width: 16 },
          { key: 'Full name', header: 'Full name', width: 22 },
          { key: 'Email', header: 'Email', width: 28 },
          { key: 'Role', header: 'Role', width: 16 },
          { key: 'Status', header: 'Status', width: 12 },
          { key: 'Sign-in', header: 'Sign-in', width: 16 },
          { key: 'Last login', header: 'Last login', width: 22 },
        ],
        rows: sortedUsers.map((u) => ({
          Username: u.username,
          'Full name': u.full_name ?? '',
          Email: u.email ?? '',
          Role: u.roles?.name ?? '',
          Status: u.status ?? '',
          'Sign-in': u.can_sign_in || u.auth_id ? 'linked' : 'directory only',
          'Last login': formatLastLogin(u.last_login),
        })),
      })
    } catch (e) {
      toast.error('Export failed', (e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users & Roles"
        description="Create logins, assign roles, and save the permission matrix. New users can sign in immediately."
        actions={
          tab === 'roles'
            ? canManageRoles
              ? (
                <Button variant="primary" onClick={() => setCreatingRole(true)}>
                  <Plus size={16} /> New Role
                </Button>
              )
              : undefined
            : canManageUsers
              ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus size={16} /> New User
                </Button>
              )
              : undefined
        }
      />

      <Tabs
        tabs={[
          { id: 'users', label: 'Users' },
          { id: 'roles', label: 'Roles & Permissions' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'users' && (
        <>
          <SummaryCards
            items={[
              {
                label: 'Users Shown',
                value: String(filteredUsers.length),
                sub: `of ${users.length} total`,
                icon: <UsersIcon size={16} />,
                tone: 'primary',
              },
              {
                label: 'Active',
                value: String(activeCount),
                sub: `${linkedCount} can sign in`,
                icon: <ShieldCheck size={16} />,
                tone: 'ok',
              },
              {
                label: 'Roles',
                value: String(roles.length),
                sub: 'defined in system',
                icon: <Lock size={16} />,
                tone: 'purple',
              },
            ]}
          />
          <DataToolbar
            search={{ value: search, onChange: setSearch, placeholder: 'Search users…' }}
            filterBar={<AdvancedFilter columns={filterColumns} filters={filters} onChange={setFilters} logic={filterLogic} onLogicChange={setFilterLogic} />}
            sort={{
              columns: [
                { key: 'username', label: 'Username' },
                { key: 'full_name', label: 'Full name' },
                { key: 'email', label: 'Email' },
                { key: 'status', label: 'Status' },
                { key: 'last_login', label: 'Last login' },
              ],
              value: sortBy,
              direction: sortDir,
              onValueChange: setSortBy,
              onDirectionChange: setSortDir,
            }}
            onExport={() => { void exportUsers() }}
            exportLabel="Export Excel"
            resultsCount={sortedUsers.length}
          >
            <ColumnsButton
              columns={USER_COLUMN_DEFS}
              isVisible={col.show}
              onToggle={col.toggle}
              onReset={col.reset}
              hiddenCount={col.hiddenCount}
            />
          </DataToolbar>
          <GlassCard className="overflow-hidden">
            <div className="table-scroll">
              <table className="data-table">
              <thead>
                <tr>
                  {col.show('username') && <SortableTh label="Username" columnKey="username" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                  {col.show('full_name') && <SortableTh label="Full Name" columnKey="full_name" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                  {col.show('email') && <SortableTh label="Email" columnKey="email" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                  {col.show('role') && <SortableTh label="Role" columnKey="role" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                  {col.show('status') && <SortableTh label="Status" columnKey="status" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                  {col.show('login') && <SortableTh label="Sign-in" columnKey="login" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                  {col.show('last_login') && <SortableTh label="Last login" columnKey="last_login" sortKey={sortBy} direction={sortDir} onSort={onSort} />}
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => {
                  const self = isSelfRow(u, me?.id, me?.email)
                  const linked = Boolean(u.can_sign_in || u.auth_id)
                  return (
                  <tr key={u.id}>
                    {col.show('username') && <td className="font-semibold">{u.username}</td>}
                    {col.show('full_name') && <td>{u.full_name ?? '—'}</td>}
                    {col.show('email') && <td className="text-xs">{u.email ?? '—'}</td>}
                    {col.show('role') && (
                      <td>
                        <span className="badge badge-purple">{u.roles?.name ?? '—'}</span>
                      </td>
                    )}
                    {col.show('status') && (
                      <td>
                        <StatusBadge tone={u.status === 'active' ? 'ok' : 'neutral'}>{u.status ?? '—'}</StatusBadge>
                      </td>
                    )}
                    {col.show('login') && (
                      <td>
                        <StatusBadge tone={linked ? 'ok' : 'warn'}>{linked ? 'Can sign in' : 'Directory only'}</StatusBadge>
                      </td>
                    )}
                    {col.show('last_login') && (
                      <td className="text-xs text-[var(--text-muted)]">{formatLastLogin(u.last_login)}</td>
                    )}
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)} disabled={!canManageUsers}>
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title={self ? 'You cannot delete your own account' : 'Delete user'}
                          onClick={() => remove(u)}
                          disabled={!canManageUsers || self}
                        >
                          <Trash2 size={14} className="text-[var(--danger)]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {sortedUsers.length === 0 && <EmptyState title={search ? 'No matching users' : 'No users yet'} />}
          </GlassCard>
        </>
      )}

      {tab === 'roles' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {roles.map((r) => (
            <GlassCard key={r.id} className="p-5">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)]"
                  style={{ background: r.color ? `${r.color}22` : 'var(--surface)' }}
                >
                  <ShieldCheck size={18} style={{ color: r.color || 'var(--accent)' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-bold">{r.name}</div>
                    {r.id.startsWith('00000000-0000-0000-0000-00000000000') && (
                      <span className="badge badge-info px-1.5! py-0! text-[0.6rem]">system</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-[var(--text-muted)]">{r.description ?? 'Role'}</div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-dim)]">
                <Lock size={14} />
                {rolePermCount(r)} permissions
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {permissions.filter((p) => r.role_permissions?.some((x) => x.permission_id === p.id)).slice(0, 8).map((p) => (
                  <span key={p.id} className="chip cursor-default! text-[0.65rem]! max-w-[11rem] truncate">{permissionCode(p)}</span>
                ))}
              </div>
              {canManageRoles && (
                <div className="mt-4 flex justify-end gap-1.5">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingRole(r)}>
                    <Pencil size={14} /> Edit
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeRole(r)} title="Delete role">
                    <Trash2 size={14} className="text-[var(--danger)]" />
                  </button>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <UserFormModal
          open
          user={editing}
          roles={roles}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            load()
          }}
        />
      )}

      {(creatingRole || editingRole) && (
        <RoleFormModal
          open
          role={editingRole}
          permissions={permissions}
          onClose={() => {
            setCreatingRole(false)
            setEditingRole(null)
          }}
          onSaved={() => {
            setCreatingRole(false)
            setEditingRole(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function UserFormModal({
  open,
  user,
  roles,
  onClose,
  onSaved,
}: {
  open: boolean
  user: User | null
  roles: Role[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const { user: me } = useAuth()
  const self = user ? isSelfRow(user, me?.id, me?.email) : false

  useEffect(() => {
    if (!open) return
    setForm({
      username: user?.username ?? '',
      full_name: user?.full_name ?? '',
      email: user?.email ?? '',
      role_id: user?.role_id ?? '',
      status: user?.status ?? 'active',
      password: '',
    })
  }, [open, user])

  const set = (k: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.username.trim()) {
      toast.error('Username is required')
      return
    }
    if (!form.full_name.trim()) {
      toast.error('Full name is required')
      return
    }
    if (!form.email.trim()) {
      toast.error('Email is required')
      return
    }
    if (!form.role_id) {
      toast.error('Role is required')
      return
    }
    if (!user && form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (user && form.password && form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        username: form.username.trim(),
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        role_id: form.role_id,
        status: form.status || 'active',
      }
      if (form.password) body.password = form.password
      if (user) {
        await apiPut(`/api/users/${user.id}`, body)
        toast.success(form.password && !user.auth_id ? 'Login created' : 'User updated')
      } else {
        await apiPost('/api/users', body)
        toast.success('User created — they can sign in now')
      }
      onSaved()
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user ? `Edit user ${user.username}` : 'New user'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save user'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Username" required><input className="input" value={form.username} onChange={set('username')} autoComplete="off" /></Field>
        <Field label="Full Name" required><input className="input" value={form.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email" required hint="Used as the sign-in email">
          <input type="email" className="input" value={form.email} onChange={set('email')} autoComplete="off" />
        </Field>
        <Field label="Role" required>
          <select className="input" value={form.role_id} onChange={set('role_id')}>
            <option value="">Select a role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={set('status')} disabled={self}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field
          label={user ? 'New password' : 'Password'}
          required={!user}
          hint={user ? (user.auth_id ? 'Leave blank to keep the current password' : 'Set a password to enable sign-in') : 'They can sign in immediately'}
        >
          <input type="password" className="input" value={form.password} onChange={set('password')} autoComplete="new-password" placeholder={user ? '••••••••' : ''} />
        </Field>
      </div>
      {user && !user.auth_id && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-dim)]">
          <KeyRound size={14} className="mt-0.5 shrink-0" />
          This row is directory-only. Saving a password creates a real login for this email.
        </div>
      )}
    </Modal>
  )
}

function RoleFormModal({
  open,
  role,
  permissions,
  onClose,
  onSaved,
}: {
  open: boolean
  role: Role | null
  permissions: Permission[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(ROLE_COLORS[0])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const system = Boolean(role && role.id.startsWith('00000000-0000-0000-0000-00000000000'))
  const adminRole = role?.name === 'admin' || role?.id === '00000000-0000-0000-0000-000000000001'

  useEffect(() => {
    if (!open) return
    setName(role?.name ?? '')
    setDescription(role?.description ?? '')
    setColor(role?.color || ROLE_COLORS[0])
    setSelected(new Set(role?.role_permissions?.map((x) => x.permission_id) ?? []))
  }, [open, role])

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of permissions) {
      const cat = p.category || 'General'
      const list = map.get(cat) ?? []
      list.push(p)
      map.set(cat, list)
    }
    return [...map.entries()]
  }, [permissions])

  const toggle = (id: string) => {
    if (adminRole) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCategory = (items: Permission[]) => {
    if (adminRole) return
    setSelected((prev) => {
      const next = new Set(prev)
      const allOn = items.every((p) => next.has(p.id))
      for (const p of items) {
        if (allOn) next.delete(p.id)
        else next.add(p.id)
      }
      return next
    })
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Role name is required')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        color,
        permission_ids: adminRole ? permissions.map((p) => p.id) : [...selected],
      }
      if (role) {
        await apiPut(`/api/roles/${role.id}`, body)
        toast.success('Role updated')
      } else {
        await apiPost('/api/roles', body)
        toast.success('Role created')
      }
      onSaved()
    } catch (e) {
      toast.error('Save failed', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={role ? `Edit role ${role.name}` : 'New role'}
      maxWidth="48rem"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save role'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={system} />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2 pt-1">
            {ROLE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="h-7 w-7 rounded-full border-2"
                style={{ background: c, borderColor: color === c ? 'var(--text)' : 'transparent' }}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="mt-5 space-y-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-dim)]">Permissions</div>
        {adminRole && (
          <div className="text-xs text-[var(--text-muted)]">Admin always has every permission.</div>
        )}
        {grouped.map(([category, items]) => (
          <div key={category} className="rounded-xl border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">{category}</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleCategory(items)} disabled={adminRole}>
                Toggle all
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((p) => {
                const on = adminRole || selected.has(p.id)
                return (
                  <label key={p.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-hover)]">
                    <input type="checkbox" className="mt-0.5" checked={on} disabled={adminRole} onChange={() => toggle(p.id)} />
                    <span>
                      <span className="font-medium">{p.name || permissionCode(p)}</span>
                      <span className="ml-2 text-[0.7rem] text-[var(--text-muted)]">{permissionCode(p)}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
