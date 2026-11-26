import { ChevronDown, CircleUserRound } from 'lucide-react'
import NotificationBell from '../../notifications/NotificationBell'
import type { PerfilUsuario } from '../../../types/auth'

const areaTitles = {
  Administrador: 'Área de administración',
  Desarrollador: 'Área de desarrollo',
  Cliente: 'Área de clientes',
}

export default function Header({ user }: { user: PerfilUsuario }) {
  return (
    <header className="admin-header">
      <span className="admin-header-title">{areaTitles[user.rol.nombre]}</span>
      <div className="admin-header-user">
        <div className="admin-header-identity">
          <strong>{user.nombre_completo}</strong>
          <span>{user.rol.nombre}</span>
        </div>
        <NotificationBell user={user} />
        {user.rol.nombre === 'Administrador' && <details className="admin-account">
          <summary>
            <CircleUserRound size={18} aria-hidden="true" /> Mi cuenta
            <ChevronDown size={14} aria-hidden="true" />
          </summary>
          <div className="admin-account-content">
            <span>Nombre de usuario</span>
            <strong>{user.nombre_usuario}</strong>
          </div>
        </details>}
      </div>
    </header>
  )
}
