import { ClipboardList } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import DataTable from '../dashboard/components/DataTable'
import EmptyState from '../dashboard/components/EmptyState'
import { formatAuditDate, formatAuditTimestamp } from './auditPresentation'
import { getAuditEvents, getScheduleHistory, type AuditEvent, type AuditFilters, type ScheduleEvent } from './auditService'

export type AuditView = 'audit' | 'schedule'

function SafeValues({ start, end, weight }: { start: string | null; end: string | null; weight: string | null }) {
  const values = [
    ['Inicio', formatAuditDate(start)],
    ['Finalización estimada', formatAuditDate(end)],
    ['Peso', weight && /^\d{1,3}(\.\d{1,12})?$/.test(weight) && Number(weight) <= 100 ? weight + ' %' : '—'],
  ].filter(([, value]) => value !== '—')
  return values.length ? <div>{values.map(([label, value]) => <p key={label}>{label} · {value}</p>)}</div> : '—'
}

const auditColumns = [
  { id: 'time', label: 'Fecha y hora', render: (row: AuditEvent) => formatAuditTimestamp(row.fecha_evento) },
  { id: 'actor', label: 'Responsable', render: (row: AuditEvent) => row.usuario?.nombre_completo ?? 'Sin actor identificado' },
  { id: 'action', label: 'Acción', render: (row: AuditEvent) => row.tipo?.nombre ?? '—' },
  { id: 'entity', label: 'Entidad', render: (row: AuditEvent) => row.tabla_afectada ?? '—' },
  { id: 'record', label: 'Registro', render: (row: AuditEvent) => row.registro_afectado_id ?? '—' },
  { id: 'before', label: 'Antes', render: (row: AuditEvent) => <SafeValues start={row.antes_inicio} end={row.antes_fin} weight={row.antes_peso} /> },
  { id: 'after', label: 'Después', render: (row: AuditEvent) => <SafeValues start={row.despues_inicio} end={row.despues_fin} weight={row.despues_peso} /> },
]

const scheduleColumns = [
  { id: 'time', label: 'Modificación', render: (row: ScheduleEvent) => formatAuditTimestamp(row.modificado_en) },
  { id: 'entity', label: 'Entidad', render: (row: ScheduleEvent) => {
    if (row.tarea_id !== null) return row.tarea ? 'Tarea · ' + row.tarea.nombre : 'Tarea'
    if (row.etapa_id !== null) return row.etapa ? 'Etapa · ' + row.etapa.nombre : 'Etapa'
    return row.proyecto ? 'Proyecto · ' + row.proyecto.nombre : 'Proyecto'
  } },
  { id: 'project', label: 'Proyecto', render: (row: ScheduleEvent) =>
    (row.proyecto ?? row.etapa?.proyecto ?? row.tarea?.etapa?.proyecto)?.nombre ?? '—' },
  { id: 'field', label: 'Campo', render: (row: ScheduleEvent) => row.campo_modificado ?? '—' },
  { id: 'before', label: 'Fecha anterior', render: (row: ScheduleEvent) => formatAuditDate(row.fecha_anterior) },
  { id: 'after', label: 'Fecha nueva', render: (row: ScheduleEvent) => formatAuditDate(row.fecha_nueva) },
  { id: 'reason', label: 'Motivo', render: (row: ScheduleEvent) => <div className="audit-reason">{row.motivo ?? '—'}</div> },
  { id: 'actor', label: 'Responsable', render: (row: ScheduleEvent) => row.usuario?.nombre_completo ?? '—' },
]

function RecordsTable<Row extends { id: string | number }>({ headingId, title, filters, load, columns }: {
  headingId: string
  title: string
  filters: AuditFilters
  load: (filters: AuditFilters, page: number, signal: AbortSignal) => Promise<{ rows: Row[]; hasNext: boolean }>
  columns: readonly { id: string; label: string; render: (row: Row) => React.ReactNode }[]
}) {
  const [page, setPage] = useState(0)
  const query = useCallback((signal: AbortSignal) => load(filters, page, signal), [filters, page, load])
  const result = useAdminQuery(query)
  const hasNext = result.status === 'ready' && result.data.hasNext

  return (
    <section className="admin-panel audit-panel" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <DataTable labelledBy={headingId} columns={columns} rows={result.status === 'ready' ? result.data.rows : []}
        loading={result.status === 'loading'} getRowKey={row => row.id}
        empty={result.status === 'error'
          ? <p className="admin-error admin-table-error" role="alert">{result.message}</p>
          : <EmptyState icon={ClipboardList} title="Sin registros visibles" description="No hay resultados para esta consulta." />} />
      {(page > 0 || hasNext) && (
        <nav className="admin-pagination" aria-label={'Paginación de ' + title.toLowerCase()}>
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page + 1}</span>
          <button type="button" disabled={!hasNext} onClick={() => setPage(page + 1)}>Siguiente</button>
        </nav>
      )}
    </section>
  )
}

export default function AuditTable({ view, filters, headingId }: {
  view: AuditView
  filters: AuditFilters
  headingId: string
}) {
  return view === 'audit'
    ? <RecordsTable key={JSON.stringify(filters)} title="Bitácora general" headingId={headingId}
        filters={filters} load={getAuditEvents} columns={auditColumns} />
    : <RecordsTable key={JSON.stringify(filters)} title="Historial de cronograma" headingId={headingId}
        filters={filters} load={getScheduleHistory} columns={scheduleColumns} />
}
