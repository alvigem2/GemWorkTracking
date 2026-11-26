import { useAuth } from '../hooks/useAuth'

export default function RolePage() {
  const { user, loading, error, signOut } = useAuth()
  if (!user) return null

  async function handleSignOut() {
    try {
      await signOut()
    } catch {
      // AuthProvider publica un mensaje apto para mostrar.
    }
  }

  return (
    <main className="auth-panel">
      <h1>GemWork Tracking</h1>
      <p>{user.nombre_completo}</p>
      <p>{user.rol.nombre}</p>
      <button type="button" onClick={handleSignOut} disabled={loading}>
        {loading ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </main>
  )
}
