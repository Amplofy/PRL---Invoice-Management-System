import { Plus } from 'lucide-react'

interface FABProps {
  onClick: () => void
  label?: string
}

export default function FAB({ onClick, label = 'New' }: FABProps) {
  return (
    <button
      onClick={onClick}
      className="btn btn-primary fixed bottom-6 right-6 z-40 h-14 w-14 items-center justify-center rounded-full !p-0 shadow-lg"
      style={{ boxShadow: '0 8px 30px rgba(59,130,246,0.45)' }}
      aria-label={label}
      title={label}
    >
      <Plus size={22} />
    </button>
  )
}
