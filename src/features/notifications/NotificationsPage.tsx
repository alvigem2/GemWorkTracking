import { useCallback, useEffect, useState } from 'react'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import type { PerfilUsuario } from '../../types/auth'
import { useAuth } from '../auth/hooks/useAuth'
import AdminLayout from '../dashboard/components/AdminLayout'
import LoadingState from '../dashboard/components/LoadingState'
import NotificationList from './NotificationList'
import { getNotifications, markAllNotificationsAsRead, type NotificationFilter } from './notificationsService'
import { refreshNotifications, useNotificationMutation, useNotificationVersion } from './useNotificationUpdates'

function Inbox({ user }: { user: PerfilUsuario }) {
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [page, setPage] = useState(0)
  const version = useNotificationVersion(user.id)
  const mutation = useNotificationMutation(user.id)
  const query = useCallback((signal: AbortSignal) => getNotifications(user.id, filter, page, signal), [user.id, filter, page])
  const result = useAdminQuery(query, version)
  const hasNext = result.status === 'ready' && result.data.hasNext

  useEffect(() => refreshNotifications(user.id), [user.id])

  return (
    <>
      <div className="admin-page-heading">
        <h1>Notificaciones</h1>
        <p>Consulta y organiza los avisos de tu cuenta.</p>
      </div>
      <section className="admin-panel notification-inbox" aria-label="Bandeja de notificaciones">
        <div className="notification-toolbar">
          <label className="notification-filter">
            Estado
            <select value={filter} onChange={event => {
              const next = event.target.value as NotificationFilter
              setFilter(next)
              setPage(0)
            }}>
              <option value="all">Todas</option>
              <option value="unread">No leídas</option>
              <option value="read">Leídas</option>
              <option value="archived">Archivadas</option>
            </select>
          </label>
          <button type="button" className="admin-secondary" disabled={mutation.busy}
            onClick={() => void mutation.run(async signal => {
              const { succeeded, failed } = await markAllNotificationsAsRead(user.id, signal)
              setPage(0)
              if (!succeeded && !failed) return 'No hay notificaciones no leídas.'
              const summary = succeeded + ' notificaciones marcadas como leídas.'
              if (failed) throw new Error(summary + ' ' + failed + ' no pudieron actualizarse.')
              return summary
            })}>Marcar todas como leídas</button>
          <button type="button" className="admin-secondary" disabled={mutation.busy}
            onClick={() => refreshNotifications(user.id)}>Actualizar</button>
        </div>
        {mutation.busy && <LoadingState message="Actualizando notificaciones…" />}
        {mutation.feedback && <p className={mutation.feedback.error ? 'admin-error admin-table-error' : 'admin-success admin-table-error'}
          role={mutation.feedback.error ? 'alert' : 'status'}>{mutation.feedback.message}</p>}
        {result.status === 'loading' && <LoadingState message="Cargando notificaciones…" />}
        {result.status === 'error' && <p className="admin-error admin-table-error" role="alert">{result.message}</p>}
        {result.status === 'ready' && <NotificationList items={result.data.items} user={user} mutation={mutation} />}
        {(page > 0 || hasNext) && (
          <nav className="admin-pagination" aria-label="Paginación de notificaciones">
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
            <span>Página {page + 1}</span>
            <button type="button" disabled={!hasNext} onClick={() => setPage(page + 1)}>Siguiente</button>
          </nav>
        )}
      </section>
    </>
  )
}

export default function NotificationsPage() {
  const { user } = useAuth()
  return user ? <Inbox key={user.id} user={user} /> : null
}

export function AdminNotificationsPage() {
  return <AdminLayout><NotificationsPage /></AdminLayout>
}
