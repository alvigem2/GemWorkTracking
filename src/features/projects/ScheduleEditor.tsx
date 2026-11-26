import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/hooks/useAuth'
import { refreshNotifications } from '../notifications/useNotificationUpdates'
import { consolidatedBackend, ExecutionError } from './consolidatedContract'
import { formatProjectDate } from './projectPresentation'
import { modifySchedule, type ScheduleEntity } from './services/scheduleService'

export default function ScheduleEditor({ entity, item, onSaved, onReload, anchor }: {
  entity: ScheduleEntity
  item: { id: string | number; fecha_inicio: string | null; fecha_fin_estimada: string | null }
  anchor?: string
  onSaved: () => void
  onReload: () => void
}) {
  const { user } = useAuth()
  const { hash } = useLocation()
  const details = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const editor = details.current
    if (!anchor || hash !== '#' + anchor || !editor) return
    const section = editor.parentElement?.closest('details')
    if (section) section.open = true
    editor.open = true
    editor.scrollIntoView()
  }, [anchor, hash])
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<{ message: string; reload: boolean }>()
  if (!consolidatedBackend || user?.rol.nombre !== 'Administrador' ||
      user.estado.nombre.trim().toLowerCase() !== 'activo') return null
  const profileId = user.id

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current || failure?.reload) return
    const fields = new FormData(event.currentTarget)
    pending.current = true
    setSaving(true)
    setFailure(undefined)
    try {
      await modifySchedule({
        entity, id: item.id, expectedStart: item.fecha_inicio, expectedEnd: item.fecha_fin_estimada,
        start: String(fields.get('start') ?? ''), end: String(fields.get('end') ?? ''),
        reason: String(fields.get('reason') ?? ''),
      })
      refreshNotifications(profileId)
      onSaved()
    } catch (error) {
      setFailure({
        message: error instanceof Error ? error.message : 'No se pudo guardar el cronograma.',
        reload: error instanceof ExecutionError && error.reload,
      })
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <details id={anchor} ref={details} className="project-work-form">
      <summary>Modificar cronograma</summary>
      <form className="admin-record-form" onSubmit={submit} aria-busy={saving}>
        <p>Inicio actual: {formatProjectDate(item.fecha_inicio)} · Finalización estimada actual: {formatProjectDate(item.fecha_fin_estimada)}</p>
        <fieldset disabled={saving || failure?.reload}>
          <label>Nueva fecha de inicio<input name="start" type="date" defaultValue={item.fecha_inicio ?? ''} required /></label>
          <label>Nueva fecha estimada<input name="end" type="date" defaultValue={item.fecha_fin_estimada ?? ''} required /></label>
          <label className="admin-field-wide">Motivo<textarea name="reason" rows={2} required /></label>
          <div className="admin-field-wide"><button type="submit" className="admin-primary">{saving ? 'Guardando…' : 'Guardar cronograma'}</button></div>
        </fieldset>
        {failure && <p className="admin-error" role="alert">{failure.message}</p>}
        {failure?.reload && <button type="button" className="admin-secondary" onClick={onReload}>Recargar datos</button>}
      </form>
    </details>
  )
}
