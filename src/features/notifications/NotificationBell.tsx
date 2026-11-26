import { Bell } from 'lucide-react'
import { useCallback, useId, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import type { PerfilUsuario } from '../../types/auth'
import LoadingState from '../dashboard/components/LoadingState'
import NotificationList from './NotificationList'
import { notificationPath } from './notificationRoutes'
import { getNotifications, getUnreadCount } from './notificationsService'
import { refreshNotifications, useNotificationMutation, useNotificationVersion } from './useNotificationUpdates'

function NotificationPreview({ user, version, mutation }: {
  user: PerfilUsuario; version: number; mutation: ReturnType<typeof useNotificationMutation>
}) {
  const query = useCallback((signal: AbortSignal) => getNotifications(user.id, 'all', 0, signal, 5), [user.id])
  const result = useAdminQuery(query, version)
  if (result.status === 'loading') return <LoadingState message="Cargando recientes…" />
  if (result.status === 'error') return <p className="admin-error" role="alert">{result.message}</p>
  return <NotificationList items={result.data.items} user={user} mutation={mutation} compact />
}

function BellMenu({ user }: { user: PerfilUsuario }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const version = useNotificationVersion(user.id, true)
  const mutation = useNotificationMutation(user.id)
  const query = useCallback((signal: AbortSignal) => getUnreadCount(user.id, signal), [user.id])
  const count = useAdminQuery(query, version)
  const label = count.status === 'ready' ? 'Notificaciones, no leídas: ' + count.data : 'Notificaciones'

  return (
    <details className="notification-bell" onToggle={event => {
      const next = event.currentTarget.open
      setOpen(next)
      if (next) refreshNotifications(user.id)
    }}>
      <summary aria-label={label} aria-controls={panelId}>
        <Bell size={19} aria-hidden="true" />
        {count.status === 'ready' && <span aria-hidden="true">{count.data}</span>}
      </summary>
      <div id={panelId} className="notification-preview">
        <strong>Notificaciones recientes</strong>
        {count.status === 'error' && <p role="status">{count.message}</p>}
        {mutation.feedback && <p className={mutation.feedback.error ? 'admin-error' : 'admin-success'}
          role={mutation.feedback.error ? 'alert' : 'status'}>{mutation.feedback.message}</p>}
        {open && <NotificationPreview user={user} version={version} mutation={mutation} />}
        <Link className="admin-action" to={notificationPath(user.rol.nombre)}>Ver todas las notificaciones</Link>
      </div>
    </details>
  )
}

export default function NotificationBell({ user }: { user: PerfilUsuario }) {
  const { pathname } = useLocation()
  return <BellMenu key={user.id + '/' + pathname} user={user} />
}
