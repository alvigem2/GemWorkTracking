import { Activity, CircleCheck, Clock3, FolderKanban, FolderOpen, Rocket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { auditPath } from '../audit/auditRoutes'
import { formatAuditTimestamp } from '../audit/auditPresentation'
import { getRecentAudit } from '../audit/auditService'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { ProjectProgress } from '../projects/ProjectProgress'
import { useAuth } from '../auth/hooks/useAuth'
import AdminLayout from './components/AdminLayout'
import DataTable from './components/DataTable'
import EmptyState from './components/EmptyState'
import MetricCard from './components/MetricCard'
import StatusBadge from './components/StatusBadge'
import { statusTone } from './components/statusTone'
import LoadingState from './components/LoadingState'
import {
  countProjects, countProjectsByStatus, getRecentProjects,
  type ProjectStatusCounts, type RecentProject,
} from './services/dashboardService'

const columns = [
  { id: 'name', label: 'Nombre del proyecto', render: (row: RecentProject) => row.nombre },
  { id: 'client', label: 'Cliente', render: (row: RecentProject) => row.cliente?.nombre ?? '—' },
  {
    id: 'status', label: 'Estado',
    render: (row: RecentProject) => row.estado
      ? <StatusBadge tone={statusTone(row.estado.nombre)}>{row.estado.nombre}</StatusBadge>
      : '—',
  },
  { id: 'progress', label: 'Avance', render: (row: RecentProject) => (
    <ProjectProgress stages={row.etapas} compact />
  ) },
  { id: 'due', label: 'Finalización prevista', render: (row: RecentProject) => row.fecha_fin_estimada ?? '—' },
  { id: 'action', label: 'Acción', render: () => '—' },
]

function DashboardContent() {
  const total = useAdminQuery(countProjects)
  const counts = useAdminQuery<ProjectStatusCounts>(countProjectsByStatus)
  const projects = useAdminQuery(getRecentProjects)
  const activity = useAdminQuery(getRecentAudit)
  const loadingMetrics = total.status === 'loading' || counts.status === 'loading'
  const metrics = counts.status === 'ready' ? counts.data : null


  return (
    <>
      <div className="admin-page-heading">
        <h1>Dashboard</h1>
        <p>Resumen general de proyectos y actividades.</p>
      </div>

      {loadingMetrics && <LoadingState message="Cargando métricas de proyectos…" />}
      {total.status === 'error' && <p className="admin-error" role="alert">{total.message}</p>}
      {counts.status === 'error' && <p className="admin-error" role="alert">{counts.message}</p>}
      <section className="admin-metrics" aria-label="Métricas de proyectos" aria-busy={loadingMetrics}>
        <MetricCard label="Total de proyectos" value={total.status === 'ready' ? total.data : null} icon={FolderKanban} />
        <MetricCard label="Proyectos en curso" value={metrics?.['En curso'] ?? null} icon={Clock3} tone="warning" />
        <MetricCard label="Proyectos terminados" value={metrics?.Terminado ?? null} icon={CircleCheck} tone="success" />
        <MetricCard label="Proyectos iniciados" value={metrics?.Iniciado ?? null} icon={Rocket} tone="neutral" />
      </section>

      <div className="admin-sections">
        <section className="admin-panel" aria-labelledby="recent-projects">
          <h2 id="recent-projects">Proyectos recientes</h2>
          <DataTable
            labelledBy="recent-projects"
            columns={columns}
            rows={projects.status === 'ready' ? projects.data : []}
            loading={projects.status === 'loading'}
            getRowKey={row => row.id}
            empty={projects.status === 'error'
              ? <p className="admin-error" role="alert">{projects.message}</p>
              : <EmptyState
                  icon={FolderOpen}
                  title="Sin proyectos para mostrar"
                  description="Todavía no hay proyectos para listar."
                />}
          />
        </section>
        <section className="admin-panel" aria-labelledby="recent-activity">
          <h2 id="recent-activity">Actividad reciente</h2>
          {activity.status === 'loading' && <LoadingState message="Cargando actividad…" />}
          {activity.status === 'error' && <p className="admin-error admin-table-error" role="alert">{activity.message}</p>}
          {activity.status === 'ready' && (activity.data.rows.length > 0 ? (
            <ul className="audit-recent">
              {activity.data.rows.map(event => (
                <li key={event.id}>
                  <strong>{event.tipo?.nombre ?? 'Acción sin nombre visible'}</strong>
                  <p>{event.tabla_afectada ?? 'Entidad no visible'} · {formatAuditTimestamp(event.fecha_evento)}</p>
                  {event.usuario && <p>{event.usuario.nombre_completo}</p>}
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={Activity} title="Sin actividad reciente"
            description="No hay eventos de auditoría visibles." />)}
          <Link className="admin-action audit-note" to={auditPath}>Ver bitácora</Link>
        </section>
      </div>
    </>
  )
}

export default function AdminDashboard() {
  const { user } = useAuth()

  return (
    <AdminLayout>
      {user && <DashboardContent key={user.auth_user_id} />}
    </AdminLayout>
  )
}
