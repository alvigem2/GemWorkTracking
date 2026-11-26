import type { ReactNode } from 'react'

interface StatusBadgeProps {
  children: ReactNode
  tone?: 'success' | 'warning' | 'error' | 'neutral'
}

export default function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return <span className="admin-status" data-tone={tone}>{children}</span>
}
