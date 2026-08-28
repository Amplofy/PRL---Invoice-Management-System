import { CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'
import type { ValidationIssue } from '../../lib/invoice'

interface ValidationSummaryProps {
  issues: ValidationIssue[]
  /** When true, checks have not run yet — show a neutral hint instead of results. */
  idle?: boolean
}

export default function ValidationSummary({ issues, idle = false }: ValidationSummaryProps) {
  if (idle) {
    return (
      <div className="glass p-5">
        <div className="section-title">Validation</div>
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
          <div>
            <div className="text-sm font-semibold">Checks run on save</div>
            <div className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
              Duplicates, contract balance and service-matrix rules are verified the moment you save.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <div className="glass p-5">
        <div className="section-title">Validation</div>
        <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--accent-3)_30%,transparent)] bg-[color-mix(in_srgb,#10b981_10%,transparent)] p-3">
          <CheckCircle2 size={16} className="shrink-0 text-[var(--accent-3)]" />
          <span className="text-sm font-semibold text-[var(--accent-3)]">All checks passed — ready to save</span>
        </div>
      </div>
    )
  }

  return (
    <div className="glass p-5">
      <div className="section-title">Validation</div>
      <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,#ef4444_10%,transparent)] p-3">
        <AlertTriangle size={16} className="shrink-0 text-[var(--danger)]" />
        <span className="text-sm font-semibold text-[var(--danger)]">
          Save blocked — {issues.length} issue{issues.length > 1 ? 's' : ''} to fix
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-xs">
        {issues.map((i, idx) => (
          <li key={`${i.field}-${idx}`} className="flex gap-1.5 text-[var(--danger)]">
            <span>•</span>
            <span>
              <b className="capitalize">{i.field.replace(/_/g, ' ')}</b>: {i.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
