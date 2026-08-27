import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogIn,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  FlaskConical,
  Sparkles,
  Layers,
  ChartNoAxesCombined,
  ArrowRight,
} from 'lucide-react'
import { supabase, isDemoMode, enterDemo } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/ui/Toast'
import BrandLogo from '../components/BrandLogo'
import { useTheme } from '../theme'

function DemoEmblem() {
  const [tilt, setTilt] = useState<{ rx: number; ry: number } | null>(null)
  return (
    <div
      className="relative mx-auto h-40 w-40"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const px = (e.clientX - r.left) / r.width - 0.5
        const py = (e.clientY - r.top) / r.height - 0.5
        setTilt({ rx: -py * 18, ry: px * 18 })
      }}
      onMouseLeave={() => setTilt(null)}
      style={{ perspective: '700px' }}
    >
      <div className="float-slow absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: tilt ? `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` : undefined,
            transition: tilt ? 'transform 0.1s linear' : 'transform 0.5s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <div className="boot-ring" />
          <div className="boot-ring2" />
          <div className="boot-logo">
            <BrandLogo size={58} />
          </div>
        </div>
      </div>
    </div>
  )
}

const FEATURES = [
  { icon: Layers, text: 'End-to-end invoice lifecycle — draft → approval → payment order' },
  { icon: ChartNoAxesCombined, text: 'Real-time control tower with utilization & trend analytics' },
  { icon: ShieldCheck, text: 'Role-based access, immutable audit log, discrepancy comparison' },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()
  const { refresh } = useAuth()
  const { theme } = useTheme()

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
    toast.success('Demo session started', 'Exploring with simulated data')
    navigate('/control-tower', { replace: true })
  }

  return (
    <div className="relative z-10 flex min-h-screen">
      <div className="bg-orb orb-1" />
      <div className="bg-orb orb-2" />
      <div className="bg-orb orb-3" />

      {/* Hero / brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden p-12 lg:flex">
        {theme === 'prl' && (
          <div className="absolute inset-0">
            <img src="/brand/prl-refinery.jpg" alt="" className="h-full w-full object-cover" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(7,11,29,0.72) 0%, rgba(7,11,29,0.62) 45%, rgba(7,11,29,0.92) 100%)',
              }}
            />
          </div>
        )}
        <div className="ring-card glass-hover glass relative z-10 overflow-hidden rounded-3xl p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }} />
          <DemoEmblem />
          <h1 className="mt-6 text-center text-3xl font-extrabold leading-tight gradient-text">
            PRL-EOMS
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-[var(--text-dim)]">
            Enterprise Operations &amp; Management Suite for Pakistan Refinery Ltd — invoices,
            contracts, approvals and payment orders in one cockpit.
          </p>

          <div className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <span className="kpi-icon mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-white" style={{ background: 'var(--gradient-primary)' }}>
                  <Icon size={15} />
                </span>
                <span className="text-sm text-[var(--text-dim)]">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-8 text-[0.72rem] text-[var(--text-muted)]">
          Built by <span className="font-semibold text-[var(--text-dim)]">Abdul Moiz</span> · ©{' '}
          {new Date().getFullYear()} PRL — secure · role-based · audited
        </div>
      </div>

      {/* Auth panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 lg:px-8">
        <div className="glass-strong reveal in-view w-full max-w-md overflow-hidden">
          <div className="flex flex-col items-center px-8 pb-6 pt-8 lg:hidden">
            <BrandLogo size={52} />
            <h1 className="mt-4 text-center text-2xl font-extrabold tracking-tight gradient-text">PRL-EOMS</h1>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 px-8 pb-6">
            <div className="hidden lg:block">
              <div className="flex items-center gap-3">
                <BrandLogo size={44} />
                <div>
                  <div className="text-lg font-extrabold leading-none gradient-text">PRL-EOMS</div>
                  <div className="mt-1 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Sign in to continue
                  </div>
                </div>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-[var(--text-dim)]">Email</span>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
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
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type={show ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pl-10 pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
                  aria-label="Toggle password"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center !py-3">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Signing in…
                </span>
              ) : (
                <>
                  <LogIn size={18} />
                  Sign in to PRL-EOMS
                </>
              )}
            </button>
          </form>

          <div className="flex items-center gap-3 px-8 pb-2">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">or</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="px-8 pb-6 pt-1">
            <button
              type="button"
              onClick={onEnterDemo}
              disabled={demoBusy}
              className="btn btn-ghost w-full justify-between !px-4 !py-3"
            >
              {demoBusy ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-[var(--accent)]" />
                  Spinning up demo…
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-2">
                    <FlaskConical size={18} className="text-[var(--accent)]" />
                    <span className="font-semibold">Explore the live demo</span>
                  </span>
                  <ArrowRight size={16} className="text-[var(--text-muted)]" />
                </>
              )}
            </button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[0.68rem] text-[var(--text-muted)]">
              <Sparkles size={11} className="text-[var(--accent-3)]" />
              Sample data · simulated actions · no account needed — your real data is never touched
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 border-t border-[var(--border)] px-8 py-4 text-[0.7rem] text-[var(--text-muted)]">
            <ShieldCheck size={14} className="text-[var(--accent-3)]" />
            Secure access · Role-based · Audited
          </div>
          {isDemoMode() && (
            <div className="flex items-center justify-center gap-2 border-t border-dashed border-[var(--border)] bg-[rgba(96,165,250,0.06)] px-8 py-3 text-[0.7rem] font-semibold text-[var(--accent)]">
              <FlaskConical size={14} />
              Demo session active — sign in below to switch to your account
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
