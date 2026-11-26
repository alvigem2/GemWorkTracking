const dateTime = new Intl.DateTimeFormat('es', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/La_Paz',
})

export function formatAuditTimestamp(value: string | null) {
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? dateTime.format(timestamp) : '—'
}

export function formatAuditDate(value: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/')
  return formatAuditTimestamp(value)
}
