import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
}

export default function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="admin-empty">
      <span><Icon size={23} aria-hidden="true" /></span>
      <p><strong>{title}</strong></p>
      <p>{description}</p>
    </div>
  )
}
