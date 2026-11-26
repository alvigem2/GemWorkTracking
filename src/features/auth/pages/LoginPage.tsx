import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { routeForRole } from '../routes/roleRoutes'

export default function LoginPage() {
  const { user, session, loading, error, signIn } = useAuth()
  const [validationError, setValidationError] = useState<string | null>(null)
  const destination = session ? routeForRole(user?.rol.nombre) : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    const form = event.currentTarget
    const fields = new FormData(form)
    const username = String(fields.get('nombre_usuario') ?? '').trim()
    const password = String(fields.get('password') ?? '')
    if (!username || !password) {
      setValidationError('Introduce tu nombre de usuario y contraseña.')
      return
    }

    setValidationError(null)
    try {
      await signIn(username, password)
    } catch {
      // AuthProvider publica un mensaje apto para mostrar.
    }
  }

  if (!loading && destination) return <Navigate to={destination} replace />

  const message = validationError ?? error ?? (session && user && !destination
    ? 'Tu cuenta no tiene un rol habilitado. Contacta al administrador.'
    : null)

  return (
    <main className="auth-panel">
      <h1>GemWork Tracking</h1>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Nombre de usuario
          <input name="nombre_usuario" autoComplete="username" required disabled={loading} />
        </label>
        <label>
          Contraseña
          <input name="password" type="password" autoComplete="current-password" required disabled={loading} />
        </label>
        <button type="submit" disabled={loading}>Iniciar sesión</button>
        {loading && <p role="status">Comprobando sesión…</p>}
        {message && <p className="auth-error" role="alert">{message}</p>}
      </form>
    </main>
  )
}
