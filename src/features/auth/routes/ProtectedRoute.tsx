import { useEffect, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { routeForRole } from './roleRoutes'

export default function ProtectedRoute({ role, loadingElement }: {
  role: string
  loadingElement?: ReactNode
}) {
  const { loading, session, user, refreshUser } = useAuth()
  const { pathname } = useLocation()
  const profileId = user?.id
  const hasSession = Boolean(session)

  useEffect(() => {
    if (!profileId || !hasSession) return
    void refreshUser()
  }, [pathname, profileId, hasSession, refreshUser])

  if (!session || !user) {
    return loading
      ? (loadingElement ?? <main><p role="status">Comprobando sesión…</p></main>)
      : <Navigate to="/login" replace />
  }

  const destination = routeForRole(user.rol.nombre)
  if (!destination) return <Navigate to="/login" replace />
  if (user.rol.nombre !== role) return <Navigate to={destination} replace />

  return <Outlet />
}
