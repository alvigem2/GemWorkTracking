import { UpdateUnconfirmed } from '../../lib/confirmUpdate'
import { Building2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/hooks/useAuth'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { newClientPath } from '../clients/clientRoutes'
import AdminLayout from '../dashboard/components/AdminLayout'
import EmptyState from '../dashboard/components/EmptyState'
import LoadingState from '../dashboard/components/LoadingState'
import { projectDetailsPath, projectsPath } from './projectRoutes'
import { createProject, getProject, getProjectClients, ProjectCreationUnconfirmed, updateProject, type ProjectDetails } from './services/projectsService'
import { consolidatedBackend } from './consolidatedContract'
import './projects.css'

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function ProjectForm({ creatorId, initial }: { creatorId: string; initial?: ProjectDetails }) {
  const clients = useAdminQuery(getProjectClients)
  const navigate = useNavigate()
  const operation = useRef<AbortController | null>(null)
  const [name, setName] = useState(initial?.nombre ?? '')
  const [description, setDescription] = useState(initial?.descripcion ?? '')
  const [clientId, setClientId] = useState(initial?.cliente_id ?? '')
  const [start, setStart] = useState(initial?.fecha_inicio ?? '')
  const [end, setEnd] = useState(initial?.fecha_fin_estimada ?? '')
  const [saving, setSaving] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => operation.current?.abort(), [])

  const availableClients = clients.status === 'ready' ? clients.data : []
  const client = availableClients.find(option => String(option.id) === clientId)
  const editDates = !initial || !consolidatedBackend
  const validDates = !editDates || (isValidDate(start) && isValidDate(end))
  const dateOrderError = editDates && validDates && end < start
    ? 'La fecha estimada de finalización debe ser igual o posterior a la fecha de inicio.'
    : null
  const cannotSave = !client || !name.trim() || !validDates || Boolean(dateOrderError) || saving || unconfirmed

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (operation.current || unconfirmed || clients.status !== 'ready' || availableClients.length === 0) return

    const nombre = name.trim()
    const descripcion = description.trim()

    if (!nombre) return setError('Introduce el nombre del proyecto.')
    if (!client) return setError('Selecciona un cliente principal disponible.')
    if (!validDates) {
      return setError('Introduce una fecha de inicio y una fecha estimada válidas.')
    }
    if (dateOrderError) return setError(dateOrderError)

    const controller = new AbortController()
    operation.current = controller
    setSaving(true)
    setError(null)
    try {
      const fields = {
        nombre,
        cliente_id: String(client.id),
      }
      const dates = { fecha_inicio: start, fecha_fin_estimada: end }
      const id = initial ? String(initial.id) : await createProject({
        ...fields,
        ...dates,
        ...(descripcion ? { descripcion } : {}),
        creado_por: creatorId,
      }, controller.signal)
      if (initial) await updateProject(id, { ...fields, ...(editDates && dates), descripcion: descripcion || null })

      if (!controller.signal.aborted) {
        void navigate(projectDetailsPath(id), {
          replace: true,
          state: initial ? { updatedProjectId: id } : { createdProjectId: id },
        })
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const uncertain = error instanceof ProjectCreationUnconfirmed || error instanceof UpdateUnconfirmed
        if (!uncertain) operation.current = null
        setUnconfirmed(uncertain)
        setError(error instanceof Error ? error.message : 'No fue posible guardar el proyecto.')
        setSaving(false)
      }
    }
  }

  return (
    <>
      {clients.status === 'loading' && <LoadingState message="Cargando clientes…" />}
      {clients.status === 'error' && <p className="admin-error" role="alert">{clients.message}</p>}
      {clients.status === 'ready' && availableClients.length === 0 && (
        <div>
          <EmptyState icon={Building2} title="Sin clientes disponibles"
            description="Registra un cliente comercial antes de guardar este proyecto." />
          <Link className="admin-action admin-back" to={newClientPath}>Registrar cliente</Link>
        </div>
      )}
      <form className="admin-panel admin-record-form" onSubmit={handleSubmit} noValidate aria-busy={saving}>
        <fieldset>
          <label className="admin-field-wide">
            Nombre del proyecto
            <input name="name" value={name} onChange={event => setName(event.target.value)} required />
          </label>
          <label className="admin-field-wide">
            Descripción (opcional)
            <textarea name="description" rows={4} value={description} onChange={event => setDescription(event.target.value)} />
          </label>
          <label className="admin-field-wide">
            Cliente principal
            <select name="client" required value={clientId} onChange={event => setClientId(event.target.value)}>
              <option value="">{clients.status === 'ready' && availableClients.length === 0
                ? 'Sin clientes disponibles'
                : 'Selecciona un cliente'}</option>
              {availableClients.map(client => <option key={client.id} value={client.id}>{client.nombre}</option>)}
            </select>
          </label>
          {editDates && <>
          <label>
            Fecha de inicio
            <input name="start" type="date" value={start} onChange={event => setStart(event.target.value)} required />
          </label>
          <label>
            Fecha estimada de finalización
            <input name="end" type="date" value={end} onChange={event => setEnd(event.target.value)}
              aria-invalid={Boolean(dateOrderError)}
              aria-describedby={dateOrderError ? 'project-date-error' : undefined} required />
          </label>
          </>}
          {initial && consolidatedBackend && <Link className="admin-action admin-field-wide"
            to={projectDetailsPath(initial.id) + '#project-schedule-editor'}>Modificar cronograma</Link>}
          {dateOrderError && <p id="project-date-error" className="admin-error admin-field-wide" role="alert">{dateOrderError}</p>}
          <div className="admin-field-wide">
            <button type="submit" className="admin-primary" disabled={cannotSave}>{saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear proyecto'}</button>
            {initial && <Link className="admin-action" to={projectDetailsPath(initial.id)}>Cancelar</Link>}
          </div>
        </fieldset>
      </form>
      {saving && <LoadingState message="Guardando proyecto…" />}
      {error && <p className="admin-error admin-table-error" role="alert">{error}</p>}
    </>
  )
}

export default function CreateProjectPage() {
  const { user } = useAuth()

  return (
    <AdminLayout>
      <Link className="admin-action admin-back" to={projectsPath}>Volver a proyectos</Link>
      <div className="admin-page-heading">
        <h1>Nuevo proyecto</h1>
        <p>El proyecto se creará en estado Iniciado.</p>
      </div>
      {user?.rol.nombre === 'Administrador' && <ProjectForm key={user.id} creatorId={user.id} />}
    </AdminLayout>
  )
}

function EditProjectContent({ id, userId }: { id: string; userId: string }) {
  const query = useCallback((signal: AbortSignal) => getProject(id, signal), [id])
  const result = useAdminQuery(query)
  if (result.status === 'loading') return <LoadingState message="Cargando proyecto…" />
  if (result.status === 'error') return <p className="admin-error" role="alert">{result.message}</p>
  if (!result.data) return <p role="status">Proyecto no disponible.</p>
  return <ProjectForm initial={result.data} creatorId={userId} />
}

export function EditProjectPage() {
  const { user } = useAuth()
  const { id } = useParams()
  return (
    <AdminLayout>
      <Link className="admin-action admin-back" to={projectsPath}>Volver a proyectos</Link>
      <div className="admin-page-heading"><h1>Editar proyecto</h1></div>
      {id && user?.rol.nombre === 'Administrador' && <EditProjectContent key={user.id + '/' + id} id={id} userId={user.id} />}
    </AdminLayout>
  )
}
