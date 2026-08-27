import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, ShieldCheck, Users as UsersIcon, Trash2 } from 'lucide-react'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api'
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
import { downloadCSV, sortRows, type SortDirection } from '../lib/export'

interface Role {
  id: string
  name: string
  color: string | null
  description: string | null
}
interface User {
  id: string
  username: string
  full_name: string | null
  email: string | null
  status: string | null
  role_id: string | null
  roles: Role | null
}
interface Permission {
  id: string
  code: string
  name: string | null
  category: string | null
}

export default function UsersPage() {
  const [tab, setTab] = useTab('users')
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [editing, setEditing] = useState<User | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('username')
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const toast = useToast()

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
    if (!window.confirm(`Delete user ${u.username}?`)) return
    try {
      await apiDelete(`/api/users/${u.id}`)
      toast.success('User deleted')
      load()
    } catch (e) {
      toast.error('Delete failed', (e as Error).message)
    }
  }

  const rolePermCount = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId)
    const perms = (role as unknown as { role_permissions?: Array<{ permission_id: string }> }).role_permissions
    return perms?.length ?? 0
  }

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter((u) =>
      `${u.username} ${u.full_name ?? ''} ${u.email ?? ''} ${u.roles?.name ?? ''}`.toLowerCase().includes(q),
    )
  }, [users, search])

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
                : String(row.status ?? ''),
      ),
    [filteredUsers, sortBy, sortDir],
  )

  const exportUsers = () =>
    downloadCSV(
      `users-${new Date().toISOString().slice(0, 10)}.csv`,
      sortedUsers.map((u) => ({
        username: u.username,
        full_name: u.full_name ?? '',
        email: u.email ?? '',
        role: u.roles?.name ?? '',
        status: u.status ?? '',
      })),
    )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users & Roles"
        description="Manage users, assign roles and review permission coverage."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New User
          </Button>
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
          <DataToolbar
            search={{ value: search, onChange: setSearch, placeholder: 'Search users…' }}
            sort={{
              columns: [
                { key: 'username', label: 'Username' },
                { key: 'full_name', label: 'Full name' },
                { key: 'email', label: 'Email' },
                { key: 'status', label: 'Status' },
              ],
              value: sortBy,
              direction: sortDir,
              onValueChange: setSortBy,
              onDirectionChange: setSortDir,
            }}
            onExport={exportUsers}
            exportLabel="Export CSV"
            resultsCount={sortedUsers.length}
          />
          <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="font-semibold">{u.username}</td>
                    <td>{u.full_name ?? '—'}</td>
                    <td className="text-xs">{u.email ?? '—'}</td>
                    <td>
                      <span className="badge badge-purple">{u.roles?.name ?? '—'}</span>
                    </td>
                    <td>
                      <StatusBadge tone={u.status === 'active' ? 'ok' : 'neutral'}>{u.status ?? '—'}</StatusBadge>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={() => setEditing(u)}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-ghost !px-2.5 !py-1.5" title="Delete user" onClick={() => remove(u)}>
                          <Trash2 size={14} className="text-[var(--danger)]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                  <ShieldCheck size={18} className="text-[var(--accent)]" />
                </div>
                <div>
                  <div className="text-sm font-bold">{r.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">{r.description ?? 'Role'}</div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-dim)]">
                <UsersIcon size={14} />
                {rolePermCount(r.id)} permissions
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(permissions.filter((p) => {
                  const rp = (r as unknown as { role_permissions?: Array<{ permission_id: string }> }).role_permissions
                  return rp?.some((x) => x.permission_id === p.id)
                })).slice(0, 8).map((p) => (
                  <span key={p.id} className="chip !cursor-default !text-[0.65rem] max-w-[11rem] truncate">{p.code}</span>
                ))}
              </div>
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

  useEffect(() => {
    if (!open) return
    setForm({
      username: user?.username ?? '',
      full_name: user?.full_name ?? '',
      email: user?.email ?? '',
      role_id: user?.role_id ?? '',
      status: user?.status ?? 'active',
    })
  }, [open, user])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.username.trim()) {
      toast.error('Username is required')
      return
    }
    setSaving(true)
    try {
      const body = {
        username: form.username.trim(),
        full_name: form.full_name.trim() || null,
        email: form.email.trim() || null,
        role_id: form.role_id || null,
        status: form.status || 'active',
      }
      if (user) {
        await apiPut(`/api/users/${user.id}`, body)
        toast.success('User updated')
      } else {
        await apiPost('/api/users', body)
        toast.success('User created')
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
        <Field label="Username" required><input className="input" value={form.username} onChange={set('username')} /></Field>
        <Field label="Full Name"><input className="input" value={form.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email"><input type="email" className="input" value={form.email} onChange={set('email')} /></Field>
        <Field label="Role">
          <select className="input" value={form.role_id} onChange={set('role_id')}>
            <option value="">—</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="input" value={form.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </div>
    </Modal>
  )
}
