import { useEffect, useState } from 'react'
import { useLocation, useNavigate, NavLink } from 'react-router-dom'
import {
  Search,
  Palette,
  Bell,
  LogOut,
  User as UserIcon,
  Command,
  Menu,
  X,
  FlaskConical,
  LayoutDashboard,
  Receipt,
  GitBranch,
  FileCheck2,
  Banknote,
  FileText,
  BarChart3,
  Upload,
  Mail,
  GitCompareArrows,
  Settings,
  Users,
} from 'lucide-react'
import ThemePanel from './ThemePanel'
import CommandPalette, { type CommandItem } from './ui/CommandPalette'
import { useAuth } from '../lib/auth'
import { initials } from '../lib/format'
import BrandLogo from './BrandLogo'
import { SidebarNav } from './Sidebar'

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/control-tower': 'Control Tower',
  '/invoices': 'Invoices',
  '/workflow': 'Workflow',
  '/approvals': 'Approvals',
  '/payment-orders': 'Payment Orders',
  '/contracts': 'Contracts',
  '/reports': 'Reports',
  '/import': 'Data Import',
  '/followups': 'Follow-ups',
  '/compare': 'Compare',
  '/admin': 'Admin Panel',
  '/users': 'Users & Roles',
}

const COMMAND_ITEMS: CommandItem[] = [
  { id: 'tower', label: 'Open Control Tower', icon: <LayoutDashboard size={16} />, path: '/control-tower' },
  { id: 'invoices', label: 'Browse Invoices', icon: <Receipt size={16} />, path: '/invoices' },
  { id: 'workflow', label: 'Invoice Workspace', icon: <GitBranch size={16} />, path: '/workflow' },
  { id: 'approvals', label: 'Approve Invoices', icon: <FileCheck2 size={16} />, path: '/approvals' },
  { id: 'pos', label: 'Payment Orders', icon: <Banknote size={16} />, path: '/payment-orders' },
  { id: 'contracts', label: 'Manage Contracts', icon: <FileText size={16} />, path: '/contracts' },
  { id: 'reports', label: 'View Reports', icon: <BarChart3 size={16} />, path: '/reports' },
  { id: 'import', label: 'Import Data', icon: <Upload size={16} />, path: '/import' },
  { id: 'followups', label: 'Follow-up Emails', icon: <Mail size={16} />, path: '/followups' },
  { id: 'compare', label: 'Compare Files', icon: <GitCompareArrows size={16} />, path: '/compare' },
  { id: 'admin', label: 'Admin Settings', icon: <Settings size={16} />, path: '/admin' },
  { id: 'users', label: 'Users & Roles', icon: <Users size={16} />, path: '/users' },
]

function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="hidden items-baseline gap-1.5 md:flex">
      <span className="text-sm font-bold tabular-nums">
        {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="text-[0.65rem] uppercase tracking-wider text-[var(--text-muted)]">
        {now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
      </span>
    </div>
  )
}

export default function Header() {
  const { user, signOut, demo } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const title = TITLES[location.pathname] ?? 'PRL-EOMS'

  return (
    <>
      <header className="glass sticky top-0 z-30 flex items-center justify-between gap-3 !rounded-none border-b border-[var(--border)] px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="btn btn-ghost !px-2.5 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-extrabold tracking-tight leading-none">{title}</span>
              {demo && (
                <span className="badge badge-info !px-2 !py-0.5 text-[0.62rem]">
                  <FlaskConical size={10} /> Demo
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[0.7rem] text-[var(--text-muted)]">
              Pakistan Refinery Ltd — Enterprise Operations
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          <LiveClock />
          <button
            onClick={() => setPaletteOpen(true)}
            className="btn btn-ghost hidden !px-3 md:flex"
            title="Search (Ctrl+K)"
          >
            <Search size={16} />
            <span className="text-[var(--text-muted)]">Search…</span>
            <span className="ml-1 flex items-center gap-0.5 rounded border border-[var(--border)] px-1 text-[0.65rem] text-[var(--text-muted)]">
              <Command size={10} /> K
            </span>
          </button>
          <button onClick={() => setPaletteOpen(true)} className="btn btn-ghost !px-3 md:hidden" aria-label="Search">
            <Search size={16} />
          </button>
          <button onClick={() => setThemeOpen((v) => !v)} className="btn btn-ghost !px-3" title="Theme">
            <Palette size={16} />
          </button>
          <button className="btn btn-ghost relative !px-3" title="Notifications">
            <Bell size={16} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--accent)]" />
          </button>
          <div className="relative">
            <button
              onClick={() => navigate('/control-tower')}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] py-1 pl-1 pr-3 transition hover:bg-[var(--surface-hover)]"
              title={user?.email ?? 'Account'}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ background: 'var(--gradient-primary)' }}
              >
                {initials(user?.name ?? user?.email)}
              </span>
              <span className="hidden max-w-[120px] truncate text-sm font-semibold sm:block">
                {user?.name ?? user?.email}
              </span>
              <span className="hidden rounded-md px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-[var(--text-dim)] sm:block">
                {user?.role ?? 'viewer'}
              </span>
              <UserIcon size={14} className="text-[var(--text-muted)]" />
            </button>
          </div>
          <button onClick={() => signOut()} className="btn btn-ghost !px-3" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 transition lg:hidden ${
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div
          className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`glass-strong absolute inset-y-0 left-0 flex w-72 flex-col !rounded-none transition-transform duration-300 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 pb-4 pt-5">
            <div className="flex items-center gap-3">
              <BrandLogo />
              <div>
                <div className="text-[0.9rem] font-extrabold leading-none gradient-text">PRL-EOMS</div>
                <div className="mt-1 text-[0.62rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Pakistan Refinery Ltd
                </div>
              </div>
            </div>
            <button onClick={() => setMobileOpen(false)} className="btn btn-ghost !px-2.5" aria-label="Close navigation">
              <X size={18} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SidebarNav />
          </div>
          <div className="border-t border-[var(--border)] px-5 py-4">
            <NavLink
              to="/control-tower"
              className="flex items-center gap-2 text-[0.7rem] font-medium text-[var(--text-muted)]"
            >
              <span className="font-semibold text-[var(--text-dim)]">{user?.name ?? user?.email}</span>
              <span className="rounded-md px-1.5 py-0.5 text-[0.6rem] font-bold uppercase text-[var(--accent)]">
                {user?.role}
              </span>
            </NavLink>
            <div className="mt-0.5 text-[0.65rem] text-[var(--text-muted)]">
              Built by Abdul Moiz · © {new Date().getFullYear()} PRL
            </div>
          </div>
        </div>
      </div>

      {themeOpen && (
        <div
          className="fixed inset-0 z-40"
          onMouseDown={(e) => {
            e.stopPropagation()
            setThemeOpen(false)
          }}
        >
          <div className="absolute right-4 top-16 md:right-6" onMouseDown={(e) => e.stopPropagation()}>
            <ThemePanel />
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={COMMAND_ITEMS} />
    </>
  )
}
