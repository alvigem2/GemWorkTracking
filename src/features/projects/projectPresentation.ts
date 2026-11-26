export { statusTone as projectStatusTone } from '../dashboard/components/statusTone'

const dateFormatter = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' })

export function formatProjectDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date)
}
