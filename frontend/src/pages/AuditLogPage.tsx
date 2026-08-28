import { useEffect, useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { apiGet } from '../lib/api'
import { formatDateTime, timeAgo } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import EmptyState from '../components/ui/EmptyState'
import DataToolbar from '../components/ui/DataToolbar'

interface AuditEntry {
  id: string
  timestamp: string
  user_email: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string | null
}

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
      />

      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Entity</th>
                <th>Summary</th>
                <th>User</th>
                <th className="text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>
                    <span className={`badge ${actionBadge(e.action)}`}>{e.action}</span>
                  </td>
                  <td className="text-xs">
                    {e.entity_type ?? '—'}
                    {e.entity_id && (
                      <span className="ml-1.5 font-mono text-[0.65rem] text-[var(--text-muted)]">
                        {e.entity_id.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="cell-wrap max-w-md">{e.summary ?? '—'}</td>
                  <td className="text-xs">{e.user_email ?? 'system'}</td>
                  <td className="text-right">
                    <div className="text-xs font-semibold">{timeAgo(e.timestamp)}</div>
                    <div className="text-[0.65rem] text-[var(--text-muted)]">{formatDateTime(e.timestamp)}</div>
                  </td>
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
