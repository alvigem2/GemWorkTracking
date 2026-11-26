import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { RolNombre } from '../../types/auth'
import { useAuth } from '../auth/hooks/useAuth'
import AdminLayout from '../dashboard/components/AdminLayout'
import LoadingState from '../dashboard/components/LoadingState'
import { createUser, UserCreationUnconfirmed } from './services/usersService'
import { usersPath } from './userRoutes'

const roles = ['Administrador', 'Desarrollador', 'Cliente'] as const satisfies readonly RolNombre[]
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,39}$/

function PasswordField({ name, label }: { name: string; label: string }) {
  const [visible, setVisible] = useState(false)
  const visibilityLabel = visible ? 'Ocultar' : 'Mostrar'

  return (
    <div className="admin-secret-field">
      <label htmlFor={name}>{label}</label>
      <div>
        <input id={name} name={name} type={visible ? 'text' : 'password'}
          autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
        <button type="button" className="admin-secret-toggle" aria-controls={name}
          aria-label={visibilityLabel + ' ' + label.toLowerCase()} onClick={() => setVisible(!visible)}>
          {visibilityLabel}
        </button>
      </div>
    </div>
  )
}

function CreateUserForm() {
  const navigate = useNavigate()
  const mounted = useRef(false)
  const submissionLocked = useRef(false)
  const [saving, setSaving] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLocked.current) return

    const form = event.currentTarget
    const fields = new FormData(form)
    const nombre_completo = String(fields.get('fullName') ?? '').trim()
    const nombre_usuario = String(fields.get('username') ?? '').trim()
    const password = String(fields.get('initial-password') ?? '')
    const confirmation = fields.get('password-confirmation')
    const rol = roles.find(role => role === fields.get('role'))
    const telefono = String(fields.get('phone') ?? '').trim()

    if (nombre_completo.length < 3 || nombre_completo.length > 150) {
      return setError('El nombre completo debe tener entre 3 y 150 caracteres.')
    }
    if (!usernamePattern.test(nombre_usuario)) {
      return setError('El nombre de usuario debe tener entre 3 y 40 caracteres. Empieza con una letra minúscula o un número y usa solo minúsculas, números, puntos, guiones o guiones bajos.')
    }
    if (password.length < 8 || password.length > 128) {
      return setError('La contraseña debe tener entre 8 y 128 caracteres.')
    }
    if (password !== confirmation) return setError('Las contraseñas deben coincidir.')
    if (!rol) return setError('Selecciona un rol válido.')
    if (telefono.length > 30) return setError('El teléfono admite hasta 30 caracteres.')

    submissionLocked.current = true
    setSaving(true)
    setError(null)
    try {
      await createUser({ nombre_completo, nombre_usuario, password, rol, ...(telefono ? { telefono } : {}) })
      form.reset()
      if (mounted.current) void navigate(usersPath, { replace: true, state: { userCreated: true } })
    } catch (error) {
      if (!mounted.current) return
      const uncertain = error instanceof UserCreationUnconfirmed
      submissionLocked.current = uncertain
      setUnconfirmed(uncertain)
      if (uncertain) {
        for (const name of ['initial-password', 'password-confirmation']) {
          const input = form.elements.namedItem(name)
          if (input instanceof HTMLInputElement) input.value = ''
        }
      }
      setError(error instanceof Error ? error.message : 'No fue posible crear el usuario.')
      setSaving(false)
    }
  }

  return (
    <>
      <form className="admin-panel admin-record-form" method="post" onSubmit={handleSubmit}
        noValidate aria-busy={saving}>
        <fieldset disabled={saving || unconfirmed}>
          <label>Nombre completo<input name="fullName" autoComplete="name" required /></label>
          <label>Nombre de usuario<input name="username" autoCapitalize="none" spellCheck={false} required /></label>
          <PasswordField name="initial-password" label="Contraseña inicial" />
          <PasswordField name="password-confirmation" label="Confirmar contraseña" />
          <p className="admin-field-wide">La contraseña inicial debe entregarse al usuario por un medio seguro.</p>
          <label>
            Rol
            <select name="role" required defaultValue="">
              <option value="">Selecciona un rol</option>
              {roles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label>Teléfono (opcional)<input name="phone" type="tel" autoComplete="tel" /></label>
          <div className="admin-field-wide">
            <button type="submit" className="admin-primary" disabled={saving || unconfirmed}>
              {saving ? 'Guardando…' : 'Crear usuario'}
            </button>
          </div>
        </fieldset>
      </form>
      {saving && <LoadingState message="Creando usuario…" />}
      {error && <p className="admin-error admin-table-error" role="alert">{error}</p>}
    </>
  )
}

export default function CreateUserPage() {
  const { user } = useAuth()
  return (
    <AdminLayout>
      <Link className="admin-action admin-back" to={usersPath}>Volver a usuarios</Link>
      <div className="admin-page-heading"><h1>Nuevo usuario</h1></div>
      {user?.rol.nombre === 'Administrador' && <CreateUserForm key={user.id} />}
    </AdminLayout>
  )
}
