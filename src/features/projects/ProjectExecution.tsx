import { useAuth } from '../auth/hooks/useAuth'
import { useRef, useState } from 'react'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { UpdateUnconfirmed } from '../../lib/confirmUpdate'
import LoadingState from '../dashboard/components/LoadingState'
import StatusBadge from '../dashboard/components/StatusBadge'
import { statusTone } from '../dashboard/components/statusTone'
import { transitionProject, validateBackendWeights } from './executionService'
import { currentLaPazDay } from './progressCalculation'
import { ExecutionError } from './consolidatedContract'
import { validateActualFinish, validateProjectFinish, validateProjectStart } from './executionValidation'
import { getProjectStatuses, type ProjectDetails } from './services/projectsService'
import type { ProjectStage } from './services/projectWorkService'

export default function ProjectExecution({ project, stages, onSaved, onReload }: {
  project: ProjectDetails; stages: ProjectStage[]; onSaved: () => void; onReload: () => void
}) {
  const catalog = useAdminQuery(getProjectStatuses)
  const { user } = useAuth()
  const canWrite = user?.rol.nombre === 'Administrador' && user.estado.nombre.trim().toLowerCase() === 'activo'
  const lock = useRef(false)
  const [saving, setSaving] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')
  const [end, setEnd] = useState(() => new Date(currentLaPazDay() * 86400000).toISOString().slice(0, 10))
  const current = project.estado?.nombre
  const finishing = current === 'En curso'
  const targetName = current === 'Iniciado' ? 'En curso' : finishing ? 'Terminado' : null
  const states = catalog.status === 'ready' ? catalog.data : []
  const from = states.find(state => state.nombre === current)
  const to = states.find(state => state.nombre === targetName)
  const issues = current === 'Iniciado' ? validateProjectStart(project, stages)
    : finishing ? validateProjectFinish(stages) : []

  const dateIssue = finishing ? validateActualFinish(project.fecha_inicio, end) : null
  if (dateIssue) issues.push(dateIssue)

  const blocked = !canWrite || !from || !to || issues.length > 0 || saving || uncertain

  async function save() {
    if (!from || !to || blocked || lock.current) return
    if (finishing && validateActualFinish(project.fecha_inicio, end)) return
    if (!window.confirm(finishing ? '¿Finalizar el proyecto con fecha real ' + end + '?' : '¿Iniciar la ejecución?')) return
    lock.current = true
    setSaving(true)
    setError('')
    try {
      await validateBackendWeights(String(project.id))
      await transitionProject(String(project.id), from.id, to.id, finishing ? end : undefined)
      onSaved()
    } catch (failure) {
      const unknown = failure instanceof UpdateUnconfirmed || (failure instanceof ExecutionError && failure.reload)
      lock.current = unknown
      setUncertain(unknown)
      setSaving(false)
      setError(failure instanceof Error ? failure.message : 'No se pudo cambiar el estado.')
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="project-execution-title">
      <h2 id="project-execution-title">Ejecución del proyecto</h2>
      <div className="project-execution-content">
        {current && <StatusBadge tone={statusTone(current)}>{current}</StatusBadge>}
        {catalog.status === 'loading' && <LoadingState message="Cargando estados de proyecto…" />}
        {catalog.status === 'error' && <p className="admin-error" role="alert">{catalog.message}</p>}
        {targetName ? (
          <>
            {finishing && <label>Fecha real de finalización <input type="date" value={end}
              min={project.fecha_inicio ?? undefined}
              max={new Date(currentLaPazDay() * 86400000).toISOString().slice(0, 10)} disabled={saving} onChange={event => setEnd(event.target.value)} /></label>}
            {issues.length > 0 && (
              <div><strong>Requisitos pendientes</strong><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>
            )}
            {catalog.status === 'ready' && (!from || !to) && <p>Faltan estados de origen o destino en el catálogo visible.</p>}
            <button type="button" className="admin-primary" disabled={blocked} onClick={() => void save()}>
              {saving ? 'Guardando…' : finishing ? 'Finalizar proyecto' : 'Iniciar ejecución'}
            </button>
            {error && <p className="admin-error" role="alert">{error}</p>}
            {uncertain && <button type="button" className="admin-secondary" onClick={onReload}>Recargar datos</button>}
          </>
        ) : <p>{current === 'Terminado' ? 'El proyecto está terminado.' : 'Estado del proyecto no disponible.'}</p>}
      </div>
    </section>
  )
}
