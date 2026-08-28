import { formatAmountWords } from '../../lib/format'

interface AmountWordsProps {
  amount: number | string | null | undefined
  className?: string
}

export default function AmountWords({ amount, className = '' }: AmountWordsProps) {
  const num = Number(amount ?? 0)
  if (!num || Number.isNaN(num)) return null
  return (
    <div className={`glass p-5 ${className}`}>
      <div className="section-title">Amount in Words</div>
      <div className="text-sm italic leading-relaxed text-[var(--text-dim)]">
        {formatAmountWords(num)}
      </div>
    </div>
  )
}
