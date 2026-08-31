import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Receipt,
  Kanban,
  FileCheck2,
  Banknote,
  FileText,
  History,
  BarChart3,
  ScrollText,
  Upload,
  Mail,
  Crosshair,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import BrandLogo from './BrandLogo'
import { useAuth, isAdmin } from '../lib/auth'

interface NavEntry {
  to: string
  label: string
  icon: LucideIcon
  adminOnly?: boolean
}

interface NavGroup {
  title: string
  entries: NavEntry[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Main',
    entries: [{ to: '/control-tower', label: 'Control Tower', icon: LayoutDashboard }],
  },
  {
    title: 'Operations',
    entries: [
      { to: '/invoices', label: 'Invoices', icon: Receipt },
      { to: '/workflow', label: 'Workflow Board', icon: Kanban },
      { to: '/contracts', label: 'Contracts', icon: FileText },
      { to: '/approvals', label: 'Approvals', icon: FileCheck2 },
      { to: '/payment-orders', label: 'Payment Orders', icon: Banknote },
      { to: '/po-history', label: 'PO History', icon: History },
    ],
  },
  {
    title: 'Insights',
    entries: [
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/audit-log', label: 'Audit Log', icon: ScrollText },
      { to: '/delta', label: 'Delta Analyst', icon: Crosshair },
      { to: '/followups', label: 'Follow-ups', icon: Mail },
    ],
  },
  {
    title: 'Administration',
    entries: [
      { to: '/import', label: 'Data Import', icon: Upload },
      { to: '/admin', label: 'System Admin', icon: Settings, adminOnly: true },
      { to: '/users', label: 'Users & Roles', icon: Users, adminOnly: true },
    ],
  },
]

export function SidebarNav() {
  const { user } = useAuth()
  const admin = isAdmin(user?.role)

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {NAV_GROUPS.map((group) => {
        const visible = group.entries.filter((e) => !e.adminOnly || admin)
        if (visible.length === 0) return null
        return (
          <div key={group.title}>
            <div className="section-title px-2">{group.title}</div>
            <div className="space-y-0.5">
              {visible.map((entry) => {
                const Icon = entry.icon
                return (
                  <NavLink
                    key={entry.to}
                    to={entry.to}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={18} className="nav-icon" />
                    <span>{entry.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

export default function Sidebar() {
  return (
    <aside className="glass-strong fixed inset-y-0 left-0 z-40 hidden w-64 flex-col !rounded-none lg:flex">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <BrandLogo />
        <div>
          <div className="text-[0.95rem] font-extrabold tracking-tight leading-none gradient-text">
            PRL-EOMS
          </div>
          <div className="mt-1 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Pakistan Refinery Ltd
          </div>
        </div>
      </div>

      <SidebarNav />

      <div className="border-t border-[var(--border)] px-5 py-4">
        <div className="text-[0.7rem] font-medium text-[var(--text-muted)]">
          Built by <span className="font-semibold text-[var(--text-dim)]">Abdul Moiz</span>
        </div>
        <div className="mt-0.5 text-[0.65rem] text-[var(--text-muted)]">© {new Date().getFullYear()} PRL</div>
      </div>
    </aside>
  )
}
