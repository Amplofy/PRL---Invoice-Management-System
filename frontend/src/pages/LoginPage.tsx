import { useState, type FormEvent, type ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogIn,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  FlaskConical,
  ArrowRight,
  FileCheck2,
  Banknote,
  ScrollText,
  Workflow,
  Crosshair,
} from 'lucide-react'
import { supabase, isDemoMode, enterDemo } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/ui/Toast'
import BrandLogo from '../components/BrandLogo'
import PRLFlame from '../components/ui/PRLFlame'

const CAPABILITIES: Array<{ icon: ComponentType<{ size?: number }>; title: string; text: string }> = [
  {
    icon: FileCheck2,
    title: 'Invoice lifecycle',
    text: 'Draft, validate, approve and reject with a live contract stamp on every entry.',
  },
  {
    icon: Workflow,
    title: 'Three-tier approval',
    text: 'A cascade workflow board that keeps every tier and value visible at a glance.',
  },
  {
    icon: Banknote,
    title: 'Payment orders',
    text: 'Generate, version and archive POs the moment an invoice is approved.',
  },
  {
    icon: ScrollText,
    title: 'Immutable audit',
    text: 'Every action is stamped with actor, entity and time — fully traceable.',
  },
  {
    icon: Crosshair,
    title: 'Delta Analyst',
    text: 'Drop two files and compare them in the browser — a demo session never uploads your files.',
  },
]

function AuthPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()
  const { refresh } = useAuth()

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      toast.error('Supabase not configured', 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      toast.error('Sign-in failed', error.message)
      return
    }
    await refresh()
    toast.success('Welcome back')
    navigate('/control-tower', { replace: true })
  }

  const onEnterDemo = async () => {
    setDemoBusy(true)
    enterDemo()
    await refresh()
    setDemoBusy(false)
    toast.success('Demo session started', 'Simulated data plus a local Delta Analyst — your files stay in this browser')
    navigate('/control-tower', { replace: true })
  }

  return (
    <div className="glass-strong reveal in-view w-full max-w-[420px]">
      <div className="px-7 pb-7 pt-8 sm:px-9">
        <div className="flex items-center gap-3">
          <BrandLogo size={46} />
          <div className="min-w-0">
            <div className="text-lg font-extrabold leading-none tracking-tight">PRL-EOMS</div>
            <div className="mt-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Enterprise Operations Suite
            </div>
          </div>
        </div>

        <h1 className="mt-7 text-2xl font-extrabold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Sign in to your workspace to continue.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">Email</span>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@prl.com.pk"
                className="input pl-10"
                autoComplete="email"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">Password</span>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type={show ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="input pl-10 pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] transition hover:text-[var(--text)]"
                aria-label="Toggle password visibility"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center !py-3">
            {loading ? (
              <span className="flex items-center gap-2">
                <PRLFlame size={18} />
                Signing in…
              </span>
            ) : (
              <>
                <LogIn size={16} />
                Sign in
              </>
            )}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            or explore
          </span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <button
          type="button"
          onClick={onEnterDemo}
          disabled={demoBusy}
          className="btn btn-ghost w-full justify-between !border !border-[var(--border)] !px-4 !py-3"
        >
          {demoBusy ? (
            <span className="flex items-center gap-2">
              <PRLFlame size={17} />
              Spinning up demo…
            </span>
          ) : (
            <>
              <span className="flex items-center gap-2.5">
                <FlaskConical size={17} className="text-[var(--accent)]" />
                <span className="font-semibold">Explore the live demo</span>
              </span>
              <ArrowRight size={15} className="text-[var(--text-muted)]" />
            </>
          )}
        </button>
        <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
          Sample invoices with simulated actions. Delta Analyst compares your own files locally — nothing is uploaded.
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-[var(--border)] px-7 py-3.5 text-[0.7rem] font-medium text-[var(--text-muted)] sm:px-9">
        <ShieldCheck size={13} className="text-[var(--accent-3)]" />
        Secure · Role-based · Audited
      </div>

      {isDemoMode() && (
        <div className="flex items-center justify-center gap-2 border-t border-dashed border-[var(--border)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] px-7 py-2.5 text-[0.7rem] font-semibold text-[var(--accent)]">
          <FlaskConical size={13} />
          Demo session active
        </div>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="relative z-10 flex min-h-dvh">
      {/* Brand panel — facility photo as the full background under a PRL-blue scrim */}
      <aside className="relative hidden w-[44%] flex-col overflow-hidden lg:flex">
        <img
          src="/brand/prl-refinery.jpg"
          alt="Pakistan Refinery Ltd facility"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(170deg, rgba(30,32,90,0.86) 0%, rgba(38,40,105,0.74) 48%, rgba(22,23,70,0.9) 100%)',
          }}
        />

        <div className="relative z-10 flex flex-1 flex-col p-10 xl:p-14">
          <div className="flex flex-1 items-center">
            <div className="max-w-md">
              <h2 className="text-[2rem] font-extrabold leading-[1.15] tracking-tight text-white xl:text-[2.4rem]">
                Run refinery operations with{' '}
                <span
                  style={{
                    background: 'linear-gradient(120deg, #ffffff, #c7d2fe 60%, #a5b4fc)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  total clarity
                </span>
              </h2>
              <p className="mt-4 text-[0.95rem] leading-relaxed text-white/65">
                One cockpit for invoices, contracts, approvals and payment orders — built for the
                pace and precision your finance team works at.
              </p>

              <div className="mt-9 grid grid-cols-2 gap-x-6 gap-y-5">
                {CAPABILITIES.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex items-start gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.85), rgba(139,92,246,0.85))' }}
                    >
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.8rem] font-bold text-white">{title}</span>
                      <span className="mt-0.5 block text-[0.72rem] leading-snug text-white/50">{text}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 text-[0.7rem] text-white/50">
            <span>
              Built by <span className="font-semibold text-white/80">Abdul Moiz</span>
            </span>
            <span>© {new Date().getFullYear()} Pakistan Refinery Ltd</span>
          </div>
        </div>
      </aside>

      {/* Auth panel */}
      <main className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <AuthPanel />
      </main>
    </div>
  )
}
