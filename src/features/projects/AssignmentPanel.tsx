import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { useAuth } from '../auth/hooks/useAuth'
import LoadingState from '../dashboard/components/LoadingState'
import {
  addAssignment, AssignmentUnconfirmed, getAssignments, removeAssignment,
  type AssignableUser, type AssignmentTarget,
} from './services/assignmentsService'

export type AssignableUsers = ReturnType<typeof useAdminQuery<AssignableUser[]>>

interface AssignmentPanelProps {
  target: AssignmentTarget
  eligible: AssignableUsers
}

export function AssignmentPanel({ target: { kind, id }, eligible }: AssignmentPanelProps) {
  const { user } = useAuth()
  const [version, setVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const busy = useRef(false)
  const mounted = useRef(false)
  const query = useCallback((signal: AbortSignal) => getAssignments({ kind, id }, signal), [kind, id])
  const assignments = useAdminQuery(query, version)
  const role = kind === 'client' ? 'Cliente' : 'Desarrollador'
  const canAssign = user?.rol.nombre === 'Administrador' &&
    user.estado.nombre.trim().toLowerCase() === 'activo'
  const assigned = assignments.status === 'ready' ? assignments.data : []
  const available = eligible.status === 'ready'
    ? eligible.data.filter(option => option.rol.nombre === role && !assigned.some(row => row.id === option.id))
    : []

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function mutate(action: () => Promise<void>, message: string) {
    if (busy.current || uncertain || !canAssign || assignments.status !== 'ready') return
    busy.current = true
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await action()
      if (!mounted.current) return
      setNotice(message)
      setSelected('')
      setVersion(current => current + 1)
    } catch (failure) {
      if (!mounted.current) return
      setUncertain(failure instanceof AssignmentUnconfirmed)
      setError(failure instanceof Error ? failure.message : 'No se pudo completar el cambio.')
    } finally {
      busy.current = false
      if (mounted.current) setSaving(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !available.some(option => option.id === selected)) return
    void mutate(() => addAssignment({ kind, id }, selected, user.id), 'Asignación creada.')
  }

  function handleRemove(userId: string, name: string) {
    if (window.confirm('¿Retirar la asignación de ' + name + '?')) {
      void mutate(() => removeAssignment({ kind, id }, userId), 'Asignación retirada.')
    }
  }

  const locked = saving || uncertain || !canAssign || assignments.status !== 'ready'

  return (
    <div className="project-assignments" aria-busy={saving}>
      {notice && <p className="admin-success" role="status">{notice}</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {assignments.status === 'loading' && <LoadingState message="Cargando asignaciones…" />}
      {assignments.status === 'error' && <p className="admin-error" role="alert">{assignments.message}</p>}
      {assignments.status === 'ready' && (assigned.length === 0
        ? <p>Sin usuarios asignados.</p>
        : <ul>{assigned.map(row => {
          const name = row.user?.nombre_completo ?? 'Usuario sin perfil visible'
          return (
            <li key={row.id}>
              <span>{name}{row.user && ' (@' + row.user.nombre_usuario + ')'}</span>
              <button type="button" className="admin-danger" disabled={locked}
                aria-label={'Retirar asignación de ' + name}
                onClick={() => handleRemove(row.id, name)}>Retirar</button>
            </li>
          )
        })}</ul>)}
      {eligible.status === 'loading' && <LoadingState message="Cargando usuarios activos…" />}
      {eligible.status === 'error' && <p className="admin-error" role="alert">{eligible.message}</p>}
      {assignments.status === 'ready' && eligible.status === 'ready' && (available.length === 0
        ? <p>No hay usuarios activos con el rol {role} disponibles para asignar.</p>
        : <form className="admin-search" onSubmit={handleSubmit}>
          <label>
            Usuario con rol {role}
            <select required value={selected} disabled={locked} onChange={event => setSelected(event.target.value)}>
              <option value="">Selecciona un usuario</option>
              {available.map(option => (
                <option key={option.id} value={option.id}>{option.nombre_completo} (@{option.nombre_usuario})</option>
              ))}
            </select>
          </label>
          <button type="submit" className="admin-primary" disabled={!selected || locked}>Asignar</button>
        </form>)}
      <button type="button" className="admin-secondary" disabled={saving || assignments.status === 'loading'}
        onClick={() => {
          setUncertain(false)
          setError('')
          setNotice('')
          setSelected('')
          setVersion(current => current + 1)
        }}>Actualizar asignaciones</button>
    </div>
  )
}

export function TaskAssignments({ taskId, taskName, eligible }: {
  taskId: string | number
  taskName: string
  eligible: AssignableUsers
}) {
  const [opened, setOpened] = useState(false)

  return (
    <details className="project-work-form" onToggle={event => {
      if (event.currentTarget.open) setOpened(true)
    }}>
      <summary aria-label={'Desarrolladores asignados a ' + taskName}>Desarrolladores</summary>
      {opened && <AssignmentPanel target={{ kind: 'developer', id: taskId }} eligible={eligible} />}
    </details>
  )
}
