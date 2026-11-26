import { CircleCheck, Clock3, FolderKanban, List } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, Outlet, useMatch, useOutletContext, useParams } from 'react-router-dom'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { useAuth } from '../auth/hooks/useAuth'
import { notificationPath } from '../notifications/notificationRoutes'
import { roleRoutes } from '../auth/routes/roleRoutes'
import AdminLayout from '../dashboard/components/AdminLayout'
import DetailBreadcrumbs from '../dashboard/components/DetailBreadcrumbs'
import DataTable from '../dashboard/components/DataTable'
import EmptyState from '../dashboard/components/EmptyState'
import LoadingState from '../dashboard/components/LoadingState'
import MetricCard from '../dashboard/components/MetricCard'
import StatusBadge from '../dashboard/components/StatusBadge'
import { statusTone } from '../dashboard/components/statusTone'
import { StageProgress, ProjectProgress } from '../projects/ProjectProgress'
import ProjectDocuments from '../documents/ProjectDocuments'
import { ProjectSection, ProjectSectionLinks } from '../projects/ProjectSections'
import ProjectSchedule from '../projects/ProjectSchedule'
import '../projects/projects.css'
import { formatProjectDate, projectStatusTone } from '../projects/projectPresentation'
import { getClientProjects, getClientProjectStages, type AssignedProject, type ClientTask } from './services/clientProjectsService'
import './clientPanel.css'

const dashboardPath = roleRoutes.Cliente
const projectsPath = dashboardPath + '/proyectos'

function ClientContent({ profileId }: { profileId: string }) {
  const query = useCallback((signal: AbortSignal) => getClientProjects(profileId, signal), [profileId])
  const [version, setVersion] = useState(0)
  const projects = useAdminQuery(query, version)

  if (projects.status === 'loading') return <LoadingState message="Cargando tus proyectos…" />
  if (projects.status === 'error') return <p className="admin-error" role="alert">{projects.message}</p>
  return (
    <>
      <div className="client-refresh">
        <button type="button" className="admin-secondary" onClick={() => setVersion(current => current + 1)}>
          Actualizar proyectos
        </button>
      </div>
      <Outlet context={projects.data} />
    </>
  )
}

export default function ClientPanel() {
  const { user } = useAuth()
  const inbox = useMatch(notificationPath('Cliente'))
  if (!user) return null

  return (
    <AdminLayout>
      {inbox ? <Outlet /> : <ClientContent key={user.id} profileId={user.id} />}
    </AdminLayout>
  )
}

const columns = [
  { id: 'name', label: 'Proyecto', render: (project: AssignedProject) => (
    <Link className="admin-action" to={projectsPath + '/' + encodeURIComponent(project.id)}>{project.nombre}</Link>
  ) },
  { id: 'status', label: 'Estado', render: (project: AssignedProject) => project.estado
    ? <StatusBadge tone={projectStatusTone(project.estado.nombre)}>{project.estado.nombre}</StatusBadge> : '—' },
  { id: 'start', label: 'Fecha de inicio', render: (project: AssignedProject) => formatProjectDate(project.fecha_inicio) },
  { id: 'end', label: 'Finalización estimada', render: (project: AssignedProject) => formatProjectDate(project.fecha_fin_estimada) },
  { id: 'progress', label: 'Avance visible', render: (project: AssignedProject) => (
    <ProjectProgress stages={project.etapas} compact visibleOnly />
  ) },
]

function ProjectTable({ title, projects }: { title: string; projects: AssignedProject[] }) {
  return (
    <section className="admin-panel" aria-labelledby="client-project-list">
      <h2 id="client-project-list">{title}</h2>
      <DataTable labelledBy="client-project-list" columns={columns} rows={projects} getRowKey={project => project.id}
        empty={<EmptyState icon={FolderKanban} title="Sin proyectos visibles"
          description="Aquí aparecerán los proyectos asignados a tu cuenta." />} />
    </section>
  )
}

export function ClientDashboard() {
  const projects = useOutletContext<AssignedProject[]>()
  const inProgress = projects.filter(project => project.estado?.nombre === 'En curso').length
  const completed = projects.filter(project => project.estado?.nombre === 'Terminado').length

  return (
    <>
      <div className="admin-page-heading"><h1>Dashboard</h1><p>Resumen de tus proyectos asignados.</p></div>
      <section className="admin-metrics client-metrics" aria-label="Métricas de proyectos">
        <MetricCard label="Proyectos asignados visibles" value={projects.length} icon={FolderKanban} />
        <MetricCard label="En curso" value={inProgress} icon={Clock3} tone="warning" />
        <MetricCard label="Terminados" value={completed} icon={CircleCheck} tone="success" />
      </section>
      {projects.some(project => !project.estado) && <p className="client-note">Algunos proyectos no tienen un estado visible.</p>}
      <ProjectTable title="Proyectos recientes" projects={projects.slice(0, 5)} />
    </>
  )
}

export function ClientProjectsPage() {
  const projects = useOutletContext<AssignedProject[]>()
  return (
    <>
      <div className="admin-page-heading"><h1>Mis proyectos</h1></div>
      <ProjectTable title="Proyectos asignados" projects={projects} />
    </>
  )
}

const taskColumns = [
  { id: 'name', label: 'Tarea', render: (task: ClientTask) => task.nombre },
  { id: 'status', label: 'Estado', render: (task: ClientTask) => task.estado
    ? <StatusBadge tone={statusTone(task.estado.nombre)}>{task.estado.nombre}</StatusBadge> : '—' },
  { id: 'start', label: 'Inicio', render: (task: ClientTask) => formatProjectDate(task.fecha_inicio) },
  { id: 'end', label: 'Finalización estimada', render: (task: ClientTask) => formatProjectDate(task.fecha_fin_estimada) },
]

function ClientProjectStages({ profileId, project }: { profileId: string; project: AssignedProject }) {
  const projectId = project.id
  const query = useCallback((signal: AbortSignal) => getClientProjectStages(profileId, projectId, signal), [profileId, projectId])
  const result = useAdminQuery(query)

  return (
    <section id="project-work" className="admin-panel client-stages" aria-labelledby="client-stages-title">
      <h2 id="client-stages-title">Avance, etapas y tareas</h2>
      {result.status === 'loading' && <LoadingState message="Cargando etapas y tareas…" />}
      {result.status === 'error' && <p className="admin-error admin-table-error" role="alert">{result.message}</p>}
      {result.status === 'ready' && (
        <>
          <ProjectProgress stages={result.data} visibleOnly />
          <ProjectSection id="project-timeline" title="Cronograma">
            <ProjectSchedule stages={result.data} project={project} />
          </ProjectSection>
        </>
      )}
      {result.status === 'ready' && (result.data.length === 0
        ? <EmptyState icon={List} title="Sin etapas visibles" description="Las etapas disponibles aparecerán aquí." />
        : <div className="client-stage-list">{result.data.map(stage => (
          <section className="admin-panel" key={stage.id} aria-labelledby={'client-stage-' + stage.id}>
            <h2 id={'client-stage-' + stage.id}><span className="project-stage-label">Etapa</span>{stage.nombre}</h2>
            <p className="client-stage-dates">
              Inicio {formatProjectDate(stage.fecha_inicio)} · Finalización estimada {formatProjectDate(stage.fecha_fin_estimada)}
            </p>
            <div className="client-stage-dates"><StageProgress stage={stage} visibleOnly /></div>
            <DataTable labelledBy={'client-stage-' + stage.id} columns={taskColumns} rows={stage.tareas}
              getRowKey={task => task.id}
              empty={<EmptyState icon={List} title="Sin tareas visibles" description="No hay tareas disponibles en esta etapa." />} />
          </section>
        ))}</div>)}
    </section>
  )
}

export function ClientProjectPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const projects = useOutletContext<AssignedProject[]>()
  const project = projects.find(item => item.id === id)

  return (
    <>
      <DetailBreadcrumbs to={projectsPath} parent="Mis proyectos" current="Detalle de proyecto" />
      {project ? (
        <>
          <div className="admin-page-heading"><h1>{project.nombre}</h1></div>
          <ProjectSectionLinks items={[
            { id: 'project-overview', label: 'Información' },
            { id: 'project-work', label: 'Avance y tareas' },
            { id: 'project-timeline', label: 'Cronograma' },
            { id: 'project-documents', label: 'Documentos' },
          ]} />
          <section id="project-overview" className="admin-panel" aria-labelledby="client-project-info">
            <h2 id="client-project-info">Información del proyecto</h2>
            <dl className="client-project-details">
              <div className="admin-field-wide"><dt>Descripción</dt><dd>{project.descripcion || '—'}</dd></div>
              <div><dt>Estado</dt><dd>{project.estado
                ? <StatusBadge tone={projectStatusTone(project.estado.nombre)}>{project.estado.nombre}</StatusBadge> : '—'}</dd></div>
              <div><dt>Inicio</dt><dd>{formatProjectDate(project.fecha_inicio)}</dd></div>
              <div><dt>Finalización estimada</dt><dd>{formatProjectDate(project.fecha_fin_estimada)}</dd></div>
              <div><dt>Finalización real</dt><dd>{formatProjectDate(project.fecha_fin_real)}</dd></div>
              <div><dt>Creación</dt><dd>{formatProjectDate(project.creado_en)}</dd></div>
            </dl>
          </section>
          {user && <ClientProjectStages key={project.id} profileId={user.id} project={project} />}
          <ProjectSection id="project-documents" title="Documentos">
            <ProjectDocuments key={project.id} projectId={project.id} />
          </ProjectSection>
        </>
      ) : <EmptyState icon={FolderKanban} title="Proyecto no disponible"
        description="El proyecto no figura entre tus asignaciones visibles." />}
    </>
  )
}
