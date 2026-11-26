import { useState, type FormEvent } from 'react'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { useAuth } from '../auth/hooks/useAuth'
import AdminLayout from '../dashboard/components/AdminLayout'
import LoadingState from '../dashboard/components/LoadingState'
import AuditTable, { type AuditView } from './AuditTable'
import { emptyAuditFilters, getAuditOptions, type AuditFilters } from './auditService'

function AuditContent() {
  const [view, setView] = useState<AuditView>('audit')
  const [filters, setFilters] = useState<AuditFilters>(emptyAuditFilters)
  const [error, setError] = useState('')
  const options = useAdminQuery(getAuditOptions)

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (name: keyof AuditFilters) => String(form.get(name) ?? '').trim()
    const from = value('from')
    const to = value('to')
    if (from && to && from > to) {
      setError('La fecha final debe ser igual o posterior a la inicial.')
      return
    }
    setError('')
    setFilters({ actor: value('actor'), project: value('project'),
      entity: value('entity'), action: value('action'), from, to })
  }

  return (
    <>
      <div className="admin-page-heading"><h1>Bitácora</h1></div>
      <label className="audit-view">
        Fuente
        <select value={view} onChange={event => {
          setView(event.target.value === 'schedule' ? 'schedule' : 'audit')
          setFilters(emptyAuditFilters)
          setError('')
        }}>
          <option value="audit">Bitácora general</option>
          <option value="schedule">Historial de cronograma</option>
        </select>
      </label>
      <form className="admin-panel admin-search" key={view} onSubmit={applyFilters}>
        <label>Responsable<select name="actor" disabled={options.status !== 'ready'}>
          <option value="">Todos</option>
          {options.status === 'ready' && options.data.actors.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </select></label>
        <label>{view === 'audit' ? 'Proyecto (cambios directos)' : 'Proyecto'}<select name="project" disabled={options.status !== 'ready'}>
          <option value="">Todos</option>
          {options.status === 'ready' && options.data.projects.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </select></label>
        {view === 'audit' ? (
          <>
            <label>Entidad (tabla exacta)<input name="entity" placeholder="Nombre de tabla" /></label>
            <label>Acción<select name="action" disabled={options.status !== 'ready'}>
              <option value="">Todas</option>
              {options.status === 'ready' && options.data.actions.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select></label>
          </>
        ) : <label>Entidad<select name="entity">
          <option value="">Todas</option><option value="proyecto">Proyecto</option>
          <option value="etapa">Etapa</option><option value="tarea">Tarea</option>
        </select></label>}
        <label>Desde<input name="from" type="date" /></label>
        <label>Hasta<input name="to" type="date" /></label>
        <button type="submit" className="admin-primary">Aplicar filtros</button>
      </form>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {options.status === 'loading' && <LoadingState message="Cargando filtros…" />}
      {options.status === 'error' && <p className="admin-error" role="alert">{options.message}</p>}
      {view === 'audit' && <p className="audit-note">La comparación muestra fechas planificadas y pesos cuando están registrados.</p>}
      <AuditTable view={view} filters={filters} headingId="audit-results" />
    </>
  )
}

export default function AuditPage() {
  const { user } = useAuth()
  return <AdminLayout>{user && <AuditContent key={user.id} />}</AdminLayout>
}
