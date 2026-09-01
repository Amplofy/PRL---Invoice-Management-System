import { Plus } from 'lucide-react'

interface FABProps {
  onClick: () => void
  label?: string
}

export default function FAB({ onClick, label = 'New' }: FABProps) {
  return (
    <button
      onClick={onClick}
      className="btn btn-primary btn-icon fixed bottom-6 right-6 z-40 h-12 w-12 shadow-lg"
      style={{ boxShadow: '0 8px 30px rgba(59,130,246,0.45)' }}
      aria-label={label}
      title={label}
    >
      <Plus size={22} />
    </button>
  )
}
