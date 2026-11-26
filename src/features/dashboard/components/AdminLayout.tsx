import type { ReactNode } from 'react'
import { useAuth } from '../../auth/hooks/useAuth'
import Header from './Header'
import Sidebar from './Sidebar'
import '../admin.css'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, error, signOut } = useAuth()
  if (!user) return null

  async function handleSignOut() {
    try {
      await signOut()
    } catch {
      // AuthProvider expone el mensaje de error para el usuario.
    }
  }

  return (
    <div className="admin-layout">
      <a className="admin-skip" href="#admin-content" onClick={event => {
        event.preventDefault()
        document.getElementById('admin-content')?.focus()
      }}>Saltar al contenido</a>
      <Sidebar role={user.rol.nombre} signingOut={loading} onSignOut={handleSignOut} />
      <div className="admin-workspace">
        <Header user={user} />
        <main id="admin-content" className="admin-content" tabIndex={-1}>
          {error && <p className="admin-error" role="alert">{error}</p>}
          {children}
        </main>
      </div>
    </div>
  )
}
