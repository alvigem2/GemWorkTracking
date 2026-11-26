import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: number | null
  icon: LucideIcon
  tone?: 'primary' | 'success' | 'warning' | 'neutral'
}

export default function MetricCard({ label, value, icon: Icon, tone = 'primary' }: MetricCardProps) {
  return (
    <article className="admin-metric">
      <span className="admin-metric-icon" data-tone={tone}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <h2>{label}</h2>
      {value === null
        ? <p className="admin-metric-value" aria-label="Sin datos">—</p>
        : <p className="admin-metric-value">{value.toLocaleString('es')}</p>}
    </article>
  )
}
