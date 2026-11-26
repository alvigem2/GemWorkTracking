import { FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../auth/hooks/useAuth'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import AdminLayout from '../dashboard/components/AdminLayout'
import EmptyState from '../dashboard/components/EmptyState'
import DetailBreadcrumbs from '../dashboard/components/DetailBreadcrumbs'
import { ProjectSection, ProjectSectionLinks } from './ProjectSections'
import LoadingState from '../dashboard/components/LoadingState'
import StatusBadge from '../dashboard/components/StatusBadge'
import { formatProjectDate, projectStatusTone } from './projectPresentation'
import { editProjectPath, projectsPath } from './projectRoutes'
import { getProject } from './services/projectsService'
import { AssignmentPanel } from './AssignmentPanel'
import { getAssignableUsers } from './services/assignmentsService'
import AuditTable from '../audit/AuditTable'
import { emptyAuditFilters } from '../audit/auditService'
import ProjectDocuments from '../documents/ProjectDocuments'
import ProjectWork from './ProjectWork'
import './projects.css'

function ProjectDetails({ id, created }: { id: string; created: boolean }) {
  const query = useCallback((signal: AbortSignal) => getProject(id, signal), [id])
  const [version, setVersion] = useState(0)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [notice, setNotice] = useState('')
  function reload(message = '') {
    setNotice(message)
    setVersion(current => current + 1)
  }
  const result = useAdminQuery(query, version)
  const [eligibleVersion, setEligibleVersion] = useState(0)
  const eligible = useAdminQuery(getAssignableUsers, eligibleVersion)
  useEffect(() => {
    const refresh = () => setEligibleVersion(current => current + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  if (result.status === 'loading') return <LoadingState message="Cargando proyecto…" />
  if (result.status === 'error') return <p className="admin-error" role="alert">{result.message}</p>

  const project = result.data
  if (!project) return (
    <EmptyState icon={FolderOpen} title="Proyecto no disponible"
      description={created
        ? "El proyecto se guardó, pero tu sesión no pudo leer el detalle."
        : "El proyecto no existe o no está disponible para tu cuenta."} />
  )

  return (
    <>
      <div className="admin-page-heading admin-heading-actions">
        <h1>{project.nombre}</h1>
        <Link className="admin-primary" to={editProjectPath(project.id)}>Editar proyecto</Link>
      </div>
      {notice && <p className="admin-success" role="status">{notice}</p>}
      <ProjectSectionLinks items={[
        { id: 'project-overview', label: 'Información' },
        { id: 'project-work', label: 'Avance y tareas' },
        { id: 'project-timeline', label: 'Cronograma' },
        { id: 'project-assignments', label: 'Asignaciones' },
        { id: 'project-documents', label: 'Documentos' },
        { id: 'project-history-section', label: 'Historial' },
      ]} />
      <section id="project-overview" className="admin-panel" aria-labelledby="project-info">
        <h2 id="project-info">Información del proyecto</h2>
        <dl className="project-details">
          <div className="project-description"><dt>Descripción</dt><dd>{project.descripcion || '—'}</dd></div>
          <div><dt>Cliente principal</dt><dd>{project.cliente?.nombre ?? '—'}</dd></div>
          <div><dt>Estado</dt><dd>{project.estado
            ? <StatusBadge tone={projectStatusTone(project.estado.nombre)}>{project.estado.nombre}</StatusBadge>
            : '—'}</dd></div>
          <div><dt>Fecha de inicio</dt><dd>{formatProjectDate(project.fecha_inicio)}</dd></div>
          <div><dt>Finalización estimada</dt><dd>{formatProjectDate(project.fecha_fin_estimada)}</dd></div>
          <div><dt>Finalización real</dt><dd>{formatProjectDate(project.fecha_fin_real)}</dd></div>
          <div><dt>Fecha de creación</dt><dd>{formatProjectDate(project.creado_en)}</dd></div>
        </dl>
      </section>
      <ProjectWork project={project} eligible={eligible}
        onProjectTransition={() => reload('Estado del proyecto actualizado.')}
        onProjectSchedule={() => reload('Cronograma actualizado correctamente.')}
        onProjectReload={() => reload()}
        onHistoryChanged={() => setHistoryVersion(current => current + 1)} />
      <ProjectSection id="project-assignments" title="Usuarios Cliente asignados">
        <AssignmentPanel target={{ kind: 'client', id }} eligible={eligible} />
      </ProjectSection>
      <ProjectSection id="project-documents" title="Documentos">
        <ProjectDocuments projectId={id} management />
      </ProjectSection>
      <ProjectSection id="project-history-section" title="Historial de cronograma">
        <AuditTable key={historyVersion} view="schedule" headingId="project-history" filters={{ ...emptyAuditFilters, project: String(project.id) }} />
      </ProjectSection>
    </>
  )
}

export default function ProjectDetailsPage() {
  const { id } = useParams()
  const { state } = useLocation()
  const created = Boolean(id && state?.createdProjectId === id)
  const { user } = useAuth()

  return (
    <AdminLayout>
      <DetailBreadcrumbs to={projectsPath} parent="Proyectos" current="Detalle de proyecto" />
      {id && state?.updatedProjectId === id && <p className="admin-success" role="status">Proyecto actualizado correctamente.</p>}
      {created && <p className="admin-success" role="status">Proyecto creado correctamente.</p>}
      {id && user && <ProjectDetails key={user.auth_user_id + '/' + id} id={id} created={created} />}
    </AdminLayout>
  )
}
