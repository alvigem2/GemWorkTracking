import { CircleCheck, ClipboardList, Clock3, FolderKanban, ListTodo } from 'lucide-react'
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
import ProjectDocuments from '../documents/ProjectDocuments'
import TaskExecution from '../projects/TaskExecution'
import BackendProgress from '../projects/BackendProgress'
import { consolidatedBackend } from '../projects/consolidatedContract'
import { formatProjectDate } from '../projects/projectPresentation'
import { getDeveloperAssignments, type DeveloperAssignment } from './services/developerTasksService'
import './developer.css'

const dashboardPath = roleRoutes.Desarrollador
const tasksPath = dashboardPath + '/tareas'

function showWeight(value: number | string | null) {
  return value === null ? '—' : value + '%'
}

function taskCategory(nombre: string | undefined): 'pending' | 'progress' | 'blocked' | 'done' | 'other' {
  switch (nombre) {
    case 'Pendiente': return 'pending'
    case 'En curso': return 'progress'
    case 'Bloqueada': return 'blocked'
    case 'Completada': return 'done'
    default: return 'other'
  }
}

function TaskStatus({ name }: { name?: string }) {
  if (!name) return '—'
  return <StatusBadge tone={statusTone(name)}>{name}</StatusBadge>
}

type DeveloperContext = { assignments: DeveloperAssignment[]; reload: () => void }

function DeveloperContent({ profileId }: { profileId: string }) {
  const query = useCallback((signal: AbortSignal) => getDeveloperAssignments(profileId, signal), [profileId])
  const [version, setVersion] = useState(0)
  const result = useAdminQuery(query, version)
  const reload = () => setVersion(current => current + 1)

  if (result.status === 'loading') return <LoadingState message="Cargando tus tareas asignadas…" />
  if (result.status === 'error') return <p className="admin-error" role="alert">{result.message}</p>
  return <Outlet context={{ assignments: result.data, reload } satisfies DeveloperContext} />
}

export default function DeveloperPanel() {
  const { user } = useAuth()
  const inbox = useMatch(notificationPath('Desarrollador'))
  if (!user) return null

  return (
    <AdminLayout>
      {inbox ? <Outlet /> : <DeveloperContent key={user.id} profileId={user.id} />}
    </AdminLayout>
  )
}

export function DeveloperDashboard() {
  const { assignments } = useOutletContext<DeveloperContext>()
  const projects = new Map<string | number, string>()
  const counts = { pending: 0, progress: 0, blocked: 0, done: 0, other: 0 }

  for (const { tarea } of assignments) {
    counts[taskCategory(tarea.estado?.nombre)] += 1
    const project = tarea.etapa?.proyecto
    if (project) projects.set(project.id, project.nombre)
  }

  return (
    <>
      <div className="admin-page-heading">
        <h1>Dashboard</h1>
        <p>Resumen de tus tareas y proyectos asignados.</p>
      </div>
      <section className="admin-metrics developer-metrics" aria-label="Métricas de asignaciones">
        <MetricCard label="Tareas asignadas" value={assignments.length} icon={ClipboardList} />
        <MetricCard label="Pendientes" value={counts.pending} icon={ListTodo} tone="neutral" />
        <MetricCard label="En curso" value={counts.progress} icon={Clock3} tone="warning" />
        <MetricCard label="Bloqueadas" value={counts.blocked} icon={ClipboardList} tone="warning" />
        <MetricCard label="Completadas" value={counts.done} icon={CircleCheck} tone="success" />
        <MetricCard label="Proyectos con tareas visibles" value={projects.size} icon={FolderKanban} />
      </section>
      {counts.other > 0 && <p className="developer-note">{counts.other} tareas con otro estado o sin estado visible.</p>}
      <section className="admin-panel" aria-labelledby="developer-projects">
        <h2 id="developer-projects">Proyectos en los que participas</h2>
        {projects.size === 0
          ? <EmptyState icon={FolderKanban} title="Sin proyectos visibles" description="Aquí aparecen los proyectos de tus tareas asignadas." />
          : <ul className="developer-projects">{[...projects].map(([id, name]) => <li key={id}>{name}</li>)}</ul>}
      </section>
    </>
  )
}

const columns = [
  { id: 'task', label: 'Tarea', render: ({ tarea }: DeveloperAssignment) => (
    <Link className="admin-action" to={tasksPath + '/' + encodeURIComponent(tarea.id)}>{tarea.nombre}</Link>
  ) },
  { id: 'project', label: 'Proyecto', render: ({ tarea }: DeveloperAssignment) => tarea.etapa?.proyecto?.nombre ?? '—' },
  { id: 'stage', label: 'Etapa', render: ({ tarea }: DeveloperAssignment) => tarea.etapa?.nombre ?? '—' },
  { id: 'status', label: 'Estado', render: ({ tarea }: DeveloperAssignment) => <TaskStatus name={tarea.estado?.nombre} /> },
  { id: 'start', label: 'Inicio', render: ({ tarea }: DeveloperAssignment) => formatProjectDate(tarea.fecha_inicio) },
  { id: 'end', label: 'Finalización estimada', render: ({ tarea }: DeveloperAssignment) => formatProjectDate(tarea.fecha_fin_estimada) },
  { id: 'assigned', label: 'Asignación', render: (row: DeveloperAssignment) => formatProjectDate(row.asignado_en) },
  { id: 'weight', label: 'Peso', render: ({ tarea }: DeveloperAssignment) => showWeight(tarea.peso_porcentual) },
]

export function DeveloperTasksPage() {
  const { assignments } = useOutletContext<DeveloperContext>()

  return (
    <>
      <div className="admin-page-heading"><h1>Mis tareas</h1></div>
      <section className="admin-panel" aria-labelledby="developer-task-list">
        <h2 id="developer-task-list">Tareas asignadas</h2>
        <DataTable labelledBy="developer-task-list" columns={columns} rows={assignments}
          getRowKey={row => row.tarea.id}
          empty={<EmptyState icon={ClipboardList} title="Sin tareas asignadas"
            description="Las tareas que te asignen aparecerán aquí." />} />
      </section>
    </>
  )
}

export function DeveloperTaskPage() {
  const { id } = useParams()
  const { assignments, reload } = useOutletContext<DeveloperContext>()
  const assignment = assignments.find(row => String(row.tarea.id) === id)
  const task = assignment?.tarea
  const project = task?.etapa?.proyecto

  return (
    <>
      <DetailBreadcrumbs to={tasksPath} parent="Mis tareas" current="Detalle de tarea" />
      {task && assignment ? (
        <>
          <div className="admin-page-heading"><h1>{task.nombre}</h1></div>
          <section className="admin-panel" aria-labelledby="developer-task-info">
            <h2 id="developer-task-info">Información de la tarea</h2>
            <dl className="developer-task-details">
              <div className="admin-field-wide"><dt>Descripción</dt><dd>{task.descripcion || '—'}</dd></div>
              <div><dt>Proyecto</dt><dd>{task.etapa?.proyecto?.nombre ?? '—'}</dd></div>
              <div><dt>Etapa</dt><dd>{task.etapa?.nombre ?? '—'}</dd></div>
              <div><dt>Estado actual</dt><dd><TaskStatus name={task.estado?.nombre} /></dd></div>
              <div><dt>Peso porcentual</dt><dd>{showWeight(task.peso_porcentual)}</dd></div>
              <div><dt>Orden</dt><dd>{task.orden ?? '—'}</dd></div>
              <div><dt>Inicio</dt><dd>{formatProjectDate(task.fecha_inicio)}</dd></div>
              <div><dt>Finalización estimada</dt><dd>{formatProjectDate(task.fecha_fin_estimada)}</dd></div>
              <div><dt>Asignación</dt><dd>{formatProjectDate(assignment.asignado_en)}</dd></div>
              <div><dt>Creación</dt><dd>{formatProjectDate(task.creado_en)}</dd></div>
              <div><dt>Última actualización</dt><dd>{formatProjectDate(task.actualizado_en)}</dd></div>
            </dl>
            {consolidatedBackend
              ? <TaskExecution task={task} projectState={project?.estado?.nombre} assigned onSaved={reload} onReload={reload} />
              : <p className="developer-readonly">El estado es de solo lectura para Desarrollador.</p>}
          </section>
          {consolidatedBackend && task.etapa && project && (
            <section className="admin-panel" aria-label="Avance">
              <h2>Avance de la etapa y del proyecto</h2>
              <h3>{task.etapa.nombre}</h3>
              <BackendProgress kind="stage" id={String(task.etapa.id)} />
              <h3>{project.nombre}</h3>
              <BackendProgress kind="project" id={String(project.id)} />
            </section>
          )}
          {project && <ProjectDocuments key={project.id} projectId={String(project.id)} taskId={String(task.id)} />}
        </>
      ) : <EmptyState icon={ClipboardList} title="Tarea no disponible"
        description="La tarea no figura entre tus asignaciones visibles." />}
    </>
  )
}
