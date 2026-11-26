import { UpdateUnconfirmed } from '../../lib/confirmUpdate'
import { ClipboardList, FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import DataTable from '../dashboard/components/DataTable'
import EmptyState from '../dashboard/components/EmptyState'
import LoadingState from '../dashboard/components/LoadingState'
import StatusBadge from '../dashboard/components/StatusBadge'
import { statusTone } from '../dashboard/components/statusTone'
import { TaskAssignments, type AssignableUsers } from './AssignmentPanel'
import { StageProgress, ProjectProgress } from './ProjectProgress'
import ProjectExecution from './ProjectExecution'
import { ProjectSection } from './ProjectSections'
import ProjectSchedule from './ProjectSchedule'
import type { ProjectDetails } from './services/projectsService'
import BackendProgress from './BackendProgress'
import TaskExecution from './TaskExecution'
import ScheduleEditor from './ScheduleEditor'
import { consolidatedBackend } from './consolidatedContract'
import { calendarDay, isValidWeight } from './progressCalculation'
import { formatProjectDate } from './projectPresentation'
import {
  createStage, createTask, getProjectStages, getTaskStatuses, WorkCreationUnconfirmed,
  updateWorkItem, type ProjectTask, type TaskStatus, type WorkInput, type WorkItem, type WorkChanges,
} from './services/projectWorkService'

function formatWeight(value: number | string | null) {
  return value === null ? '—' : value + '%'
}

const taskColumns = [
  { id: 'name', label: 'Tarea', render: (row: ProjectTask) => row.nombre },
  {
    id: 'status', label: 'Estado',
    render: (row: ProjectTask) => row.estado ? <StatusBadge tone={statusTone(row.estado.nombre)}>{row.estado.nombre}</StatusBadge> : '—',
  },
  { id: 'weight', label: 'Peso', render: (row: ProjectTask) => formatWeight(row.peso_porcentual) },
  { id: 'start', label: 'Inicio', render: (row: ProjectTask) => formatProjectDate(row.fecha_inicio) },
  { id: 'end', label: 'Finalización estimada', render: (row: ProjectTask) => formatProjectDate(row.fecha_fin_estimada) },
]

type WorkFormProps = { label: string; onSaved: () => void } & (
  | { initial: WorkItem; update: (input: WorkChanges) => Promise<void>; save?: never }
  | { initial?: never; update?: never; save: (input: WorkInput) => Promise<void> }
)

function WorkForm({ label, save, onSaved, initial, update }: WorkFormProps) {
  const details = useRef<HTMLDetailsElement>(null)
  const mounted = useRef(false)
  const locked = useRef(false)
  const [saving, setSaving] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current) return
    const fields = new FormData(event.currentTarget)
    const nombre = String(fields.get('name') ?? '').trim()
    const descripcion = String(fields.get('description') ?? '').trim()
    const weight = String(fields.get('weight') ?? '')
    const order = String(fields.get('order') ?? '')
    const peso_porcentual = Number(weight)
    const orden = Number(order)
    const fecha_inicio = String(fields.get('start') ?? '')
    const fecha_fin_estimada = String(fields.get('end') ?? '')
    const editDates = !initial || !consolidatedBackend

    if (!nombre) return setError('Introduce un nombre.')
    if (!weight || !isValidWeight(peso_porcentual)) return setError('Introduce un peso entre 0,01 y 100 %, con hasta dos decimales.')
    if (initial && (peso_porcentual < 0 || peso_porcentual > 100)) return setError('El peso debe estar entre 0 y 100 %.')
    if ((fecha_inicio && calendarDay(fecha_inicio) === null) ||
      (fecha_fin_estimada && calendarDay(fecha_fin_estimada) === null)) {
      return setError('Introduce fechas válidas.')
    }
    if (!initial && (!order || !Number.isSafeInteger(orden))) return setError('Introduce un orden entero.')
    if (fecha_inicio && fecha_fin_estimada && fecha_fin_estimada < fecha_inicio) {
      return setError('La fecha estimada debe ser igual o posterior al inicio.')
    }


    locked.current = true
    setSaving(true)
    setError(null)
    try {
      if (update) await update({
        nombre,
        peso_porcentual,
        descripcion: descripcion || null,
        ...(editDates && { fecha_inicio: fecha_inicio || null, fecha_fin_estimada: fecha_fin_estimada || null }),
      })
      else await save({
        nombre,
        peso_porcentual,
        orden,
        ...(descripcion ? { descripcion } : {}),
        ...(fecha_inicio ? { fecha_inicio } : {}),
        ...(fecha_fin_estimada ? { fecha_fin_estimada } : {}),
      })
      if (mounted.current) onSaved()
    } catch (error) {
      if (!mounted.current) return
      const uncertain = error instanceof WorkCreationUnconfirmed || error instanceof UpdateUnconfirmed
      locked.current = uncertain
      setUnconfirmed(uncertain)
      setError(error instanceof Error ? error.message : 'No se pudo guardar.')
      setSaving(false)
    }
  }

  return (
    <details className="project-work-form" ref={details}>
      <summary>{label}</summary>
      <form className="admin-record-form" onSubmit={onSubmit} aria-label={label} aria-busy={saving}>
        <fieldset disabled={saving || unconfirmed}>
          <label className="admin-field-wide">Nombre<input name="name" defaultValue={initial?.nombre} required /></label>
          <label className="admin-field-wide">Descripción<textarea name="description" defaultValue={initial?.descripcion ?? ""} rows={2} /></label>
          <label>Peso (%)<input name="weight" type="number" step="0.01" defaultValue={initial?.peso_porcentual ?? ""} min="0.01" max="100" required /></label>
          {!initial && <label>Orden<input name="order" type="number" step="1" required /></label>}
          {(!initial || !consolidatedBackend) && <>
            <label>Fecha de inicio<input name="start" type="date" defaultValue={initial?.fecha_inicio ?? ""} /></label>
            <label>Finalización estimada<input name="end" type="date" defaultValue={initial?.fecha_fin_estimada ?? ""} /></label>
          </>}
          <div className="admin-field-wide">
            <button className="admin-primary" type="submit" disabled={saving || unconfirmed}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            {initial && <button type="button" className="admin-secondary" disabled={saving} onClick={event => {
              event.currentTarget.form?.reset()
              if (!unconfirmed) setError(null)
              if (details.current) details.current.open = false
            }}>Cancelar</button>}
          </div>
        </fieldset>
        {error && <p className="admin-error" role="alert">{error}</p>}
      </form>
    </details>
  )
}

export default function ProjectWork({ project, eligible, onProjectTransition, onProjectSchedule, onProjectReload, onHistoryChanged }: {
  project: ProjectDetails; eligible: AssignableUsers
  onProjectTransition: () => void; onProjectSchedule: () => void
  onProjectReload: () => void; onHistoryChanged: () => void
}) {
  const projectId = String(project.id)
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState('')
  const query = useCallback((signal: AbortSignal) => getProjectStages(projectId, signal), [projectId])
  const statuses = useAdminQuery(getTaskStatuses)

  function refresh(message = '') {
    setNotice(message)
    setVersion(current => current + 1)
  }

  return (
    <section id="project-work" className="admin-panel project-work" aria-labelledby="project-work-title">
      <h2 id="project-work-title">Avance, etapas y tareas</h2>
      <div className="project-work-content">
        {notice && <p className="admin-success" role="status">{notice}</p>}
        <div className="project-work-actions">
          <WorkForm key={version} label="Nueva etapa" save={input => createStage(projectId, input)}
            onSaved={() => refresh('Etapa creada correctamente.')} />
          <button type="button" className="admin-secondary"
            onClick={() => refresh()}>Actualizar listado</button>
        </div>
        <StageList key={version} query={query} statuses={statuses} eligible={eligible} project={project}
          onTaskSaved={() => refresh('Tarea creada correctamente.')}
          onProjectTransition={onProjectTransition}
          onProjectSchedule={onProjectSchedule}
          onProjectReload={onProjectReload}
          onScheduleSaved={() => {
            refresh('Cronograma actualizado correctamente.')
            onHistoryChanged()
          }}
          onEdited={() => refresh('Cambios guardados correctamente.')} />
      </div>
    </section>
  )
}

function StageList({ query, statuses, eligible, project, onTaskSaved, onEdited, onProjectTransition, onProjectSchedule, onProjectReload, onScheduleSaved }: {
  query: (signal: AbortSignal) => ReturnType<typeof getProjectStages>
  statuses: ReturnType<typeof useAdminQuery<TaskStatus[]>>
  eligible: AssignableUsers
  project: ProjectDetails
  onTaskSaved: () => void
  onEdited: () => void
  onProjectTransition: () => void
  onProjectSchedule: () => void
  onProjectReload: () => void
  onScheduleSaved: () => void
}) {
  const result = useAdminQuery(query)
  const catalog = statuses.status === 'ready' ? statuses.data : undefined
  const columns = [...taskColumns, {
    id: 'assignments',
    label: 'Asignaciones',
    render: (task: ProjectTask) => <TaskAssignments taskId={task.id} taskName={task.nombre} eligible={eligible} />,
  }]
  if (result.status === 'loading') return <LoadingState message="Cargando etapas y tareas…" />
  if (result.status === 'error') return <p className="admin-error" role="alert">{result.message}</p>
  return (
    <>
      <ProjectExecution project={project} stages={result.data} onSaved={onProjectTransition} onReload={onProjectReload} />
      <ProjectProgress stages={result.data} />
      <BackendProgress kind="project" id={String(project.id)} />
      <ProjectSection id="project-timeline" title="Cronograma">
        <ScheduleEditor anchor="project-schedule-editor" entity="proyectos" item={project} onSaved={onProjectSchedule} onReload={onProjectReload} />
        <ProjectSchedule stages={result.data} project={project} />
      </ProjectSection>
      {result.data.length === 0 && <EmptyState icon={FolderOpen} title="Sin etapas"
        description="Crea una etapa para organizar las tareas del proyecto." />}
      {statuses.status === 'loading' && <LoadingState message="Cargando estados de tarea…" />}
      {statuses.status === 'error' && <p className="admin-error" role="alert">{statuses.message}</p>}
      {catalog && !catalog.some(state => state.nombre === 'Pendiente') && (
        <p className="admin-error" role="status">No está disponible el estado Pendiente para crear tareas.</p>
      )}
      {!consolidatedBackend && result.data.some(stage => stage.tareas.length > 0) && (
        <p>Las transiciones de tareas siguen la matriz provisional de la interfaz administrativa.</p>
      )}
      {result.data.map(stage => (
        <section className="admin-panel project-work-stage" key={stage.id} aria-labelledby={'stage-' + stage.id}>
          <h2 id={'stage-' + stage.id}><span className="project-stage-label">Etapa</span>{stage.nombre}</h2>
          <div className="project-work-stage-info">
            {stage.descripcion && <p>{stage.descripcion}</p>}
            <p>Peso {formatWeight(stage.peso_porcentual)} · Inicio {formatProjectDate(stage.fecha_inicio)}
              {' · Finalización estimada ' + formatProjectDate(stage.fecha_fin_estimada)}</p>
            <StageProgress stage={stage} />
            <BackendProgress kind="stage" id={String(stage.id)} manual={!consolidatedBackend} />
            <WorkForm label="Editar etapa" initial={stage} onSaved={onEdited}
              update={input => updateWorkItem('etapas', stage.id, project.id, input)} />
            <ScheduleEditor entity="etapas" item={stage} onSaved={onScheduleSaved} onReload={onProjectReload} />
            {catalog?.some(state => state.nombre === 'Pendiente') && (
              <WorkForm label="Nueva tarea" save={input => createTask(stage.id, catalog, input)} onSaved={onTaskSaved} />
            )}
          </div>
          <DataTable labelledBy={'stage-' + stage.id} columns={[...columns, {
              id: 'transition', label: 'Cambiar estado',
              render: (task: ProjectTask) => consolidatedBackend || catalog
                ? <TaskExecution task={task} catalog={catalog} projectState={project.estado?.nombre}
                    onSaved={onEdited} onReload={onProjectReload} /> : '—',
            }, {
              id: 'edit', label: 'Edición',
              render: (task: ProjectTask) => <>
                <WorkForm label="Editar tarea" initial={task} onSaved={onEdited}
                  update={input => updateWorkItem('tareas', task.id, stage.id, input)} />
                <ScheduleEditor entity="tareas" item={task} onSaved={onScheduleSaved} onReload={onProjectReload} />
              </>,
            }]} rows={stage.tareas}
            getRowKey={task => task.id} empty={<EmptyState icon={ClipboardList} title="Sin tareas"
              description="Las tareas de esta etapa aparecerán aquí." />} />
        </section>
      ))}
    </>
  )
}
