import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './features/auth/pages/LoginPage'
import ProtectedRoute from './features/auth/routes/ProtectedRoute'
import { useAuth } from './features/auth/hooks/useAuth'
import { roleRoutes, routeForRole } from './features/auth/routes/roleRoutes'

import { clientsPath, editClientPattern, newClientPath } from './features/clients/clientRoutes'
import { editProjectPattern, newProjectPath, projectsPath } from './features/projects/projectRoutes'
import { newUserPath, usersPath } from './features/users/userRoutes'
import { notificationPath } from './features/notifications/notificationRoutes'
import { auditPath } from './features/audit/auditRoutes'
import LoadingState from './features/dashboard/components/LoadingState'

const AuditPage = lazy(() => import('./features/audit/AuditPage'))
const AdminDashboard = lazy(() => import('./features/dashboard/AdminDashboard'))
const ProjectsPage = lazy(() => import('./features/projects/ProjectsPage'))
const CreateProjectPage = lazy(() => import('./features/projects/CreateProjectPage'))
const ClientsPage = lazy(() => import('./features/clients/ClientsPage'))
const CreateClientPage = lazy(() => import('./features/clients/CreateClientPage'))
const UsersPage = lazy(() => import('./features/users/UsersPage'))
const CreateUserPage = lazy(() => import('./features/users/CreateUserPage'))
const DeveloperPanel = lazy(() => import('./features/tasks/DeveloperPanel'))
const DeveloperDashboard = lazy(() => import('./features/tasks/DeveloperPanel').then(module => ({ default: module.DeveloperDashboard })))
const DeveloperTasksPage = lazy(() => import('./features/tasks/DeveloperPanel').then(module => ({ default: module.DeveloperTasksPage })))
const DeveloperTaskPage = lazy(() => import('./features/tasks/DeveloperPanel').then(module => ({ default: module.DeveloperTaskPage })))
const ClientPanel = lazy(() => import('./features/clients/ClientPanel'))
const ClientDashboard = lazy(() => import('./features/clients/ClientPanel').then(module => ({ default: module.ClientDashboard })))
const ClientProjectsPage = lazy(() => import('./features/clients/ClientPanel').then(module => ({ default: module.ClientProjectsPage })))
const ClientProjectPage = lazy(() => import('./features/clients/ClientPanel').then(module => ({ default: module.ClientProjectPage })))
const NotificationsPage = lazy(() => import('./features/notifications/NotificationsPage'))
const AdminNotificationsPage = lazy(() => import('./features/notifications/NotificationsPage').then(module => ({ default: module.AdminNotificationsPage })))
const EditProjectPage = lazy(() => import('./features/projects/CreateProjectPage').then(module => ({ default: module.EditProjectPage })))
const EditClientPage = lazy(() => import('./features/clients/CreateClientPage').then(module => ({ default: module.EditClientPage })))
const ProjectDetailsPage = lazy(() => import('./features/projects/ProjectDetailsPage'))

function RootRedirect() {
  const { user, session, loading } = useAuth()
  if (loading) return <main><p role="status">Comprobando sesión…</p></main>

  const destination = session ? routeForRole(user?.rol.nombre) : null
  return <Navigate to={destination ?? '/login'} replace />
}

function App() {
  const Router = import.meta.env.PROD ? HashRouter : BrowserRouter
  return (
    <Router>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute
          role="Administrador"
          loadingElement={<main><LoadingState message="Comprobando sesión…" /></main>}
        />}>
          <Route path={roleRoutes.Administrador} element={<Suspense fallback={<LoadingState message="Cargando dashboard…" />}><AdminDashboard /></Suspense>} />
          <Route path={projectsPath} element={<Suspense fallback={<LoadingState message="Cargando módulo de proyectos…" />}><ProjectsPage /></Suspense>} />
          <Route path={newProjectPath} element={<Suspense fallback={<LoadingState message="Cargando formulario…" />}><CreateProjectPage /></Suspense>} />
          <Route path={clientsPath} element={<Suspense fallback={<LoadingState message="Cargando clientes…" />}><ClientsPage /></Suspense>} />
          <Route path={editProjectPattern} element={<Suspense fallback={<LoadingState message="Cargando formulario…" />}><EditProjectPage /></Suspense>} />
          <Route path={editClientPattern} element={<Suspense fallback={<LoadingState message="Cargando formulario…" />}><EditClientPage /></Suspense>} />
          <Route path={newClientPath} element={<Suspense fallback={<LoadingState message="Cargando formulario…" />}><CreateClientPage /></Suspense>} />
          <Route path={usersPath} element={<Suspense fallback={<LoadingState message="Cargando usuarios…" />}><UsersPage /></Suspense>} />
          <Route path={newUserPath} element={<Suspense fallback={<LoadingState message="Cargando formulario…" />}><CreateUserPage /></Suspense>} />
          <Route path={auditPath} element={<Suspense fallback={<LoadingState message="Cargando bitácora…" />}><AuditPage /></Suspense>} />
          <Route path={notificationPath('Administrador')} element={<Suspense fallback={<LoadingState message="Cargando bandeja…" />}><AdminNotificationsPage /></Suspense>} />
          <Route path={projectsPath + '/:id'} element={<Suspense fallback={<LoadingState message="Cargando módulo de proyectos…" />}><ProjectDetailsPage /></Suspense>} />
        </Route>
        <Route element={<ProtectedRoute role="Desarrollador" />}>
          <Route path={roleRoutes.Desarrollador} element={<Suspense fallback={<LoadingState message="Cargando panel…" />}><DeveloperPanel /></Suspense>}>
            <Route index element={<DeveloperDashboard />} />
            <Route path="tareas" element={<DeveloperTasksPage />} />
            <Route path="notificaciones" element={<NotificationsPage />} />
            <Route path="tareas/:id" element={<DeveloperTaskPage />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute role="Cliente" />}>
          <Route path={roleRoutes.Cliente} element={<Suspense fallback={<LoadingState message="Cargando panel…" />}><ClientPanel /></Suspense>}>
            <Route index element={<ClientDashboard />} />
            <Route path="proyectos" element={<ClientProjectsPage />} />
            <Route path="notificaciones" element={<NotificationsPage />} />
            <Route path="proyectos/:id" element={<ClientProjectPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  )
}

export default App
