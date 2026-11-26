import { Bell, CalendarClock, ClipboardList, FileText, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PerfilUsuario } from '../../types/auth'
import EmptyState from '../dashboard/components/EmptyState'
import StatusBadge from '../dashboard/components/StatusBadge'
import { hasNotificationDestination, resolveNotificationDestination } from './notificationRoutes'
import { archiveNotification, markNotificationAsRead, notificationActions, type Notification } from './notificationsService'
import { useNotificationMutation } from './useNotificationUpdates'

const dateFormatter = new Intl.DateTimeFormat('es', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/La_Paz',
})

function date(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return <time dateTime={value}>{dateFormatter.format(Date.parse(value))}</time>
}

const icons = {
  'Cambio de cronograma': CalendarClock,
  'Desviación del proyecto': TriangleAlert,
  'Documento publicado': FileText,
  'Nueva tarea asignada': ClipboardList,
  'Proyecto próximo a finalizar': CalendarClock,
  'Tarea bloqueada': TriangleAlert,
  'Tarea próxima a vencer': CalendarClock,
  'Tarea vencida': TriangleAlert,
} as const

export default function NotificationList({ items, user, compact, mutation }: {
  items: Notification[]; user: PerfilUsuario; compact?: boolean; mutation: ReturnType<typeof useNotificationMutation>
}) {
  const navigate = useNavigate()
  const request = useRef<AbortController | null>(null)
  const [navigation, setNavigation] = useState<{ busy: boolean; message: string }>({ busy: false, message: '' })
  useEffect(() => () => request.current?.abort(), [])

  async function open(item: Notification) {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setNavigation({ busy: true, message: '' })
    try {
      const path = await resolveNotificationDestination(user, item, controller.signal)
      if (!controller.signal.aborted) void navigate(path)
      if (!controller.signal.aborted) setNavigation({ busy: false, message: '' })
    } catch (error) {
      if (!controller.signal.aborted) setNavigation({
        busy: false, message: error instanceof Error ? error.message : 'No se pudo comprobar el acceso.',
      })
    } finally {
      request.current = null
    }
  }

  if (items.length === 0) return compact
    ? <p>No hay notificaciones recientes.</p>
    : <EmptyState icon={Bell} title="Sin notificaciones" description="Las notificaciones de este filtro aparecerán aquí." />

  return (
    <>
      {navigation.message && <p className="admin-error admin-table-error" role="alert">{navigation.message}</p>}
      <ul className="notification-list">
        {items.map(item => {
          const state = item.estado?.nombre
          const actions = notificationActions(state)
          const type = item.tipo?.nombre ?? ''
          const Icon = icons[type as keyof typeof icons] ?? Bell
          return (
            <li key={item.id}>
              <div className="notification-item-heading">
                <Icon size={17} aria-hidden="true" />
                <strong>{item.titulo}</strong>
                <StatusBadge tone={actions.read ? 'warning' : 'neutral'}>{state ?? 'Estado no disponible'}</StatusBadge>
              </div>
              {item.mensaje && <p className="notification-message">{item.mensaje}</p>}
              <div className="notification-meta">
                {type && <span>{type}</span>}
                {date(item.creado_en)}
                {!compact && item.leida_en && <span>Lectura · {date(item.leida_en)}</span>}
              </div>
              {!compact && (item.proyecto || item.tarea) && (
                <div className="notification-meta">
                  {item.proyecto && <span>Proyecto · {item.proyecto.nombre}</span>}
                  {item.tarea && <span>Tarea · {item.tarea.nombre}</span>}
                </div>
              )}
              <div className="notification-actions">
                {actions.read && <button type="button" className="admin-secondary" disabled={mutation.busy}
                  onClick={() => void mutation.run(async signal => {
                    await markNotificationAsRead(item.id, signal)
                    return 'Notificación marcada como leída.'
                  })}>Marcar como leída</button>}
                {!compact && actions.archive && <button type="button" className="admin-secondary" disabled={mutation.busy}
                  onClick={() => void mutation.run(async signal => {
                    await archiveNotification(item.id, signal)
                    return 'Notificación archivada.'
                  })}>Archivar</button>}
                {!compact && hasNotificationDestination(item) &&
                  <button type="button" className="admin-secondary" disabled={navigation.busy}
                    onClick={() => void open(item)}>Ver elemento relacionado</button>}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
