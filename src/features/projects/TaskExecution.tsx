import { useAuth } from '../auth/hooks/useAuth'
import { useRef, useState } from 'react'
import { UpdateUnconfirmed } from '../../lib/confirmUpdate'
import { refreshNotifications } from '../notifications/useNotificationUpdates'
import { canChangeTask, consolidatedBackend, ExecutionError, taskTransitions } from './consolidatedContract'
import { transitionTask } from './executionService'
import type { TaskStatus } from './services/projectWorkService'

export default function TaskExecution({ task, catalog, projectState, assigned = false, onSaved, onReload }: {
  task: { id: string | number; estado: { nombre: string } | null }
  catalog?: readonly TaskStatus[]
  projectState?: string
  assigned?: boolean
  onSaved: () => void
  onReload: () => void
}) {
  const { user } = useAuth()
  const canWrite = canChangeTask(user?.rol.nombre, user?.estado.nombre.trim().toLowerCase() === 'activo',
    assigned, projectState)
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<{ message: string; reload: boolean }>()
  const current = task.estado?.nombre
  const options = taskTransitions(current).filter(name => consolidatedBackend || catalog?.some(state => state.nombre === name))

  async function change(target: string) {
    if (!user || !canWrite || !current || pending.current || failure?.reload) return
    if ((!consolidatedBackend || target === 'Completada') &&
        !window.confirm('¿Cambiar la tarea a «' + target + '»?')) return
    pending.current = true
    setSaving(true)
    setFailure(undefined)
    try {
      await transitionTask(task.id, current, target, catalog)
      refreshNotifications(user.id)
      onSaved()
    } catch (error) {
      setFailure({
        message: error instanceof Error ? error.message : 'No se pudo cambiar el estado.',
        reload: error instanceof UpdateUnconfirmed || (error instanceof ExecutionError && error.reload),
      })
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  if (!canWrite || !options.length) return <span>Sin transiciones disponibles</span>
  return (
    <div className="admin-edit-actions">
      {options.map(target => (
        <button className="admin-secondary" key={target} type="button"
          disabled={saving || failure?.reload} onClick={() => void change(target)}>{target}</button>
      ))}
      {saving && <span role="status">Guardando…</span>}
      {failure && <p className="admin-error" role="alert">{failure.message}</p>}
      {failure?.reload && <button type="button" className="admin-secondary" onClick={onReload}>Recargar datos</button>}
    </div>
  )
}
