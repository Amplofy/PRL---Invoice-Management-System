import { useEffect, useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { apiGet } from '../lib/api'
import { formatDateTime, timeAgo } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import EmptyState from '../components/ui/EmptyState'
import DataToolbar from '../components/ui/DataToolbar'
import ColumnsButton from '../components/ui/ColumnsButton'
import { useColumnVisibility } from '../lib/columns'

interface AuditEntry {
  id: string
  timestamp: string
  user_email: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string | null
}

const AUDIT_COLUMN_DEFS = [
  { key: 'action', label: 'Action' },
  { key: 'entity', label: 'Entity' },
  { key: 'entity_id', label: 'Entity ID' },
  { key: 'summary', label: 'Summary' },
  { key: 'user', label: 'User' },
  { key: 'when', label: 'When' },
  { key: 'exact_time', label: 'Exact Time' },
]

const AUDIT_DEFAULT_COLUMNS = ['action', 'entity', 'summary', 'user', 'when']

const ACTION_TONES: Record<string, string> = {
  create: 'badge-ok',
  approve: 'badge-ok',
  login: 'badge-info',
  update: 'badge-warn',
  generatepo: 'badge-purple',
  import: 'badge-purple',
  sendfollowups: 'badge-purple',
  senddiscrepancy: 'badge-purple',
  reject: 'badge-err',
  delete: 'badge-err',
}

function actionBadge(action: string): string {
  return ACTION_TONES[action.toLowerCase()] ?? 'badge-neutral'
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('all')
  const [entityType, setEntityType] = useState('all')
  const col = useColumnVisibility(
    'prl-eoms-cols-audit-log',
    AUDIT_COLUMN_DEFS.map((c) => c.key),
    AUDIT_DEFAULT_COLUMNS,
  )
  const toast = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const d = await apiGet<{ auditLog: AuditEntry[] }>('/api/audit-log')
        setEntries(d.auditLog)
      } catch (e) {
        toast.error('Failed to load audit log', (e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [toast])

  const actions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries],
  )
  const entityTypes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.entity_type ?? '').filter(Boolean))).sort(),
    [entries],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return entries.filter((e) => {
      if (action !== 'all' && e.action !== action) return false
      if (entityType !== 'all' && (e.entity_type ?? '') !== entityType) return false
      if (q) {
        const hay = `${e.summary ?? ''} ${e.entity_id ?? ''} ${e.user_email ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [entries, search, action, entityType])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        description="Immutable trail of every action across the system."
        actions={
          <span className="badge badge-info">
            <ScrollText size={13} /> {entries.length} events
          </span>
        }
      />

      <DataToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search summary, entity id, user…' }}
        filters={[
          {
            key: 'action',
            label: 'Action',
            value: action,
            onChange: setAction,
            options: [{ value: 'all', label: 'All actions' }, ...actions.map((a) => ({ value: a, label: a }))],
          },
          {
            key: 'entity',
            label: 'Entity',
            value: entityType,
            onChange: setEntityType,
            options: [
              { value: 'all', label: 'All entities' },
              ...entityTypes.map((t) => ({ value: t, label: t })),
            ],
          },
        ]}
        resultsCount={filtered.length}
      >
        <ColumnsButton
          columns={AUDIT_COLUMN_DEFS}
          isVisible={col.show}
          onToggle={col.toggle}
          onReset={col.reset}
          hiddenCount={col.hiddenCount}
        />
      </DataToolbar>

      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {col.show('action') && <th>Action</th>}
                {col.show('entity') && <th>Entity</th>}
                {col.show('entity_id') && <th>Entity ID</th>}
                {col.show('summary') && <th>Summary</th>}
                {col.show('user') && <th>User</th>}
                {col.show('when') && <th className="text-right">When</th>}
                {col.show('exact_time') && <th className="text-right">Exact Time</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  {col.show('action') && (
                    <td>
                      <span className={`badge ${actionBadge(e.action)}`}>{e.action}</span>
                    </td>
                  )}
                  {col.show('entity') && <td className="text-xs">{e.entity_type ?? '—'}</td>}
                  {col.show('entity_id') && (
                    <td className="font-mono text-[0.65rem]">{e.entity_id ? e.entity_id.slice(0, 8) : '—'}</td>
                  )}
                  {col.show('summary') && <td className="cell-wrap max-w-md">{e.summary ?? '—'}</td>}
                  {col.show('user') && <td className="text-xs">{e.user_email ?? 'system'}</td>}
                  {col.show('when') && (
                    <td className="text-right text-xs font-semibold">{timeAgo(e.timestamp)}</td>
                  )}
                  {col.show('exact_time') && (
                    <td className="text-right text-[0.65rem] text-[var(--text-muted)]">
                      {formatDateTime(e.timestamp)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && (
          <EmptyState
            title="No audit events match"
            description="Adjust the filters or search to see more of the trail."
            icon={<ScrollText size={28} />}
          />
        )}
      </GlassCard>
    </div>
  )
}
