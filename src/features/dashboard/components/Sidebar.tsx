import { useId, useState } from 'react'
import { Bell, Building2, ClipboardList, FolderKanban, LayoutDashboard, LogOut, Menu, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { RolNombre } from '../../../types/auth'
import { auditPath } from '../../audit/auditRoutes'
import { roleRoutes } from '../../auth/routes/roleRoutes'
import { clientsPath } from '../../clients/clientRoutes'
import { notificationPath } from '../../notifications/notificationRoutes'
import { projectsPath } from '../../projects/projectRoutes'
import { usersPath } from '../../users/userRoutes'

interface SidebarProps {
  role: RolNombre
  signingOut: boolean
  onSignOut: () => void
}

export default function Sidebar({ role, signingOut, onSignOut }: SidebarProps) {
  const [expanded, setExpanded] = useState(false)
  const menuId = useId()
  const base = roleRoutes[role]
  const entries = [
    { path: base, label: 'Dashboard', icon: LayoutDashboard, end: true },
    ...(role === 'Administrador' ? [
      { path: projectsPath, label: 'Proyectos', icon: FolderKanban },
      { path: clientsPath, label: 'Clientes', icon: Building2 },
      { path: usersPath, label: 'Usuarios', icon: Users },
    ] : role === 'Desarrollador'
      ? [{ path: base + '/tareas', label: 'Mis tareas', icon: ClipboardList }]
      : [{ path: base + '/proyectos', label: 'Mis proyectos', icon: FolderKanban }]),
    { path: notificationPath(role), label: 'Notificaciones', icon: Bell },
    ...(role === 'Administrador' ? [{ path: auditPath, label: 'Bitácora', icon: ClipboardList }] : []),
  ]

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-top">
        <div className="admin-brand"><strong>GemWork</strong><span>Tracking</span></div>
        <button className="admin-menu-toggle" type="button" aria-expanded={expanded}
          aria-controls={menuId} onClick={() => setExpanded(current => !current)}>
          <Menu size={20} aria-hidden="true" /> Menú
        </button>
      </div>
      <div id={menuId} className="admin-sidebar-content" data-expanded={expanded}>
        <nav aria-label={'Navegación de ' + role.toLowerCase()}>
          <ul className="admin-nav">
            {entries.map(({ path, label, icon: Icon, end }) => (
              <li key={path}>
                <NavLink to={path} end={end} onClick={() => setExpanded(false)}>
                  <Icon size={19} aria-hidden="true" /> {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <button className="admin-signout" type="button" onClick={onSignOut} disabled={signingOut}>
          <LogOut size={19} aria-hidden="true" /> {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </div>
    </aside>
  )
}
