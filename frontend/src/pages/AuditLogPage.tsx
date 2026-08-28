import { useEffect, useMemo, useState } from 'react'
import { ScrollText, Clock, Users } from 'lucide-react'
import { apiGet } from '../lib/api'
import { formatDateTime, timeAgo } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import GlassCard from '../components/ui/GlassCard'
import EmptyState from '../components/ui/EmptyState'
import DataToolbar from '../components/ui/DataToolbar'
import ColumnsButton from '../components/ui/ColumnsButton'
import AdvancedFilter from '../components/ui/AdvancedFilter'
import SummaryCards from '../components/ui/SummaryCards'
import { useColumnVisibility } from '../lib/columns'
import { applyFilters, type FilterColumnDef, type FilterState } from '../lib/filters'

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

const AUDIT_FILTER_COLUMNS: FilterColumnDef[] = [
  { key: 'action', label: 'Action', type: 'select' },
  { key: 'entity_type', label: 'Entity', type: 'select' },
  { key: 'entity_id', label: 'Entity ID', type: 'text' },
  { key: 'summary', label: 'Summary', type: 'text' },
  { key: 'user', label: 'User', type: 'text' },
  { key: 'timestamp', label: 'When', type: 'date' },
]

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
  const [filters, setFilters] = useState<FilterState[]>([])
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

  const filterColumns = useMemo<FilterColumnDef[]>(
    () =>
      AUDIT_FILTER_COLUMNS.map((c) =>
        c.key === 'action'
          ? { ...c, options: actions.map((a) => ({ value: a, label: a })) }
          : c.key === 'entity_type'
            ? { ...c, options: entityTypes.map((t) => ({ value: t, label: t })) }
            : c,
      ),
    [actions, entityTypes],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const searched = q
      ? entries.filter((e) =>
          `${e.summary ?? ''} ${e.entity_id ?? ''} ${e.user_email ?? ''}`.toLowerCase().includes(q),
        )
      : entries
    return applyFilters(searched, filters, filterColumns, (e, key) =>
      (e as unknown as Record<string, string | null>)[key] ?? null,
    )
  }, [entries, search, filters, filterColumns])

  const usersCount = useMemo(() => new Set(filtered.map((e) => e.user_email ?? 'system')).size, [filtered])
  const todayCount = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return filtered.filter((e) => e.timestamp.slice(0, 10) === today).length
  }, [filtered])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        description="Immutable trail of every action across the system."
        actions={<span className="badge badge-info"><ScrollText size={13} /> {entries.length} events</span>}
      />

      <SummaryCards
        items={[
          {
            label: 'Events Shown',
            value: String(filtered.length),
            sub: `of ${entries.length} total`,
            icon: <ScrollText size={16} />,
            tone: 'primary',
          },
          {
            label: 'Today',
            value: String(todayCount),
            sub: 'events logged today',
            icon: <Clock size={16} />,
            tone: 'warn',
          },
          {
            label: 'Distinct Users',
            value: String(usersCount),
            sub: 'in current view',
            icon: <Users size={16} />,
            tone: 'purple',
          },
        ]}
      />

      <DataToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search summary, entity id, user…' }}
        filterBar={<AdvancedFilter columns={filterColumns} filters={filters} onChange={setFilters} />}
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
