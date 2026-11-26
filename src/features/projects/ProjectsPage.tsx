import { FolderOpen } from 'lucide-react'
import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/hooks/useAuth'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import AdminLayout from '../dashboard/components/AdminLayout'
import DataTable from '../dashboard/components/DataTable'
import EmptyState from '../dashboard/components/EmptyState'
import StatusBadge from '../dashboard/components/StatusBadge'
import { ProjectProgress } from './ProjectProgress'
import { formatProjectDate, projectStatusTone } from './projectPresentation'
import { editProjectPath, newProjectPath, projectDetailsPath } from './projectRoutes'
import { getProjectFilters, listProjects, type ProjectFilters, type ProjectListWithProgress } from './services/projectsService'
import './projects.css'

const columns = [
  { id: 'name', label: 'Proyecto', render: (row: ProjectListWithProgress) => row.nombre },
  { id: 'client', label: 'Cliente', render: (row: ProjectListWithProgress) => row.cliente?.nombre ?? '—' },
  {
    id: 'status', label: 'Estado',
    render: (row: ProjectListWithProgress) => row.estado
      ? <StatusBadge tone={projectStatusTone(row.estado.nombre)}>{row.estado.nombre}</StatusBadge>
      : '—',
  },
  { id: 'start', label: 'Fecha de inicio', render: (row: ProjectListWithProgress) => formatProjectDate(row.fecha_inicio) },
  { id: 'due', label: 'Finalización estimada', render: (row: ProjectListWithProgress) => formatProjectDate(row.fecha_fin_estimada) },
  { id: 'progress', label: 'Avance', render: (row: ProjectListWithProgress) => (
    <ProjectProgress stages={row.etapas} compact />
  ) },
  {
    id: 'action', label: 'Acción',
    render: (row: ProjectListWithProgress) => (
      <div className="admin-edit-actions"><Link className="admin-action" to={projectDetailsPath(row.id)}
        aria-label={'Ver detalles de ' + row.nombre}>
        Ver detalles
      </Link>
      <Link className="admin-action" to={editProjectPath(row.id)} aria-label={'Editar proyecto ' + row.nombre}>Editar proyecto</Link>
      </div>
    ),
  },
]

function ProjectResults({ filters, page, onPage }: {
  filters: ProjectFilters
  page: number
  onPage: (page: number) => void
}) {
  const query = useCallback((signal: AbortSignal) => listProjects(filters, page, signal), [filters, page])
  const result = useAdminQuery(query)

  return (
    <section className="admin-panel" aria-labelledby="project-results">
      <h2 id="project-results">Listado de proyectos</h2>
      <DataTable
        labelledBy="project-results"
        columns={columns}
        rows={result.status === 'ready' ? result.data.projects : []}
        loading={result.status === 'loading'}
        getRowKey={row => row.id}
        empty={result.status === 'error'
          ? <p className="admin-error admin-table-error" role="alert">{result.message}</p>
          : <EmptyState icon={FolderOpen} title="Sin proyectos para mostrar"
              description={filters.name || filters.client || filters.status
                ? 'Prueba con otros filtros.'
                : 'Los proyectos disponibles aparecerán aquí.'} />}
      />
      {(page > 0 || (result.status === 'ready' && result.data.hasNext)) && (
        <nav className="admin-pagination" aria-label="Paginación de proyectos">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page === 0}>
            Anterior
          </button>
          <span>Página {page + 1}</span>
          <button type="button" onClick={() => onPage(page + 1)}
            disabled={result.status !== 'ready' || !result.data.hasNext}>
            Siguiente
          </button>
        </nav>
      )}
    </section>
  )
}

function ProjectsContent() {
  const [filters, setFilters] = useState<ProjectFilters>({ name: '', client: '', status: '' })
  const [page, setPage] = useState(0)
  const options = useAdminQuery(getProjectFilters)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const next = {
      name: String(fields.get('name') ?? '').trim(),
      client: String(fields.get('client') ?? ''),
      status: String(fields.get('status') ?? ''),
    }
    if (next.name === filters.name && next.client === filters.client && next.status === filters.status) return
    setFilters(next)
    setPage(0)
  }

  return (
    <>
      <div className="admin-page-heading admin-heading-actions">
        <div>
          <h1>Proyectos</h1>
          <p>Consulta los proyectos, sus clientes, estados y fechas previstas.</p>
        </div>
        <Link className="admin-primary" to={newProjectPath}>Nuevo proyecto</Link>
      </div>
      <form className="admin-panel project-filters" onSubmit={handleSubmit} role="search"
        aria-label="Buscar y filtrar proyectos">
        <label>Buscar por nombre<input type="search" name="name" /></label>
        <label>
          Estado
          <select name="status" disabled={options.status !== 'ready'}>
            <option value="">Todos los estados</option>
            {options.status === 'ready' && options.data.statuses.map(status => (
              <option key={status.id} value={status.id}>{status.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Cliente
          <select name="client" disabled={options.status !== 'ready'}>
            <option value="">Todos los clientes</option>
            {options.status === 'ready' && options.data.clients.map(client => (
              <option key={client.id} value={client.id}>{client.nombre}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="admin-primary">Aplicar filtros</button>
      </form>
      {options.status === 'loading' && <p className="project-note" role="status">Cargando filtros…</p>}
      {options.status === 'error' && <p className="admin-error" role="alert">{options.message}</p>}
      <ProjectResults key={JSON.stringify(filters)} filters={filters} page={page} onPage={setPage} />
    </>
  )
}

export default function ProjectsPage() {
  const { user } = useAuth()

  return <AdminLayout>{user && <ProjectsContent key={user.auth_user_id} />}</AdminLayout>
}
