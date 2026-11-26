import { UpdateUnconfirmed } from '../../lib/confirmUpdate'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/hooks/useAuth'
import AdminLayout from '../dashboard/components/AdminLayout'
import LoadingState from '../dashboard/components/LoadingState'
import { clientsPath } from './clientRoutes'
import { ClientCreationUnconfirmed, createClient, getClient, updateClient, type ClientDetails } from './services/clientsService'

const clientTypes = ['Persona', 'Empresa'] as const

function ClientForm({ initial }: { initial?: ClientDetails }) {
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

    const fields = new FormData(event.currentTarget)
    const nombre = String(fields.get('name') ?? '').trim()
    const tipo_cliente = clientTypes.find(type => type === fields.get('type'))
    if (!nombre || !tipo_cliente) return setError('Completa el nombre y el tipo de cliente.')

    submissionLocked.current = true
    setSaving(true)
    setError(null)
    try {
      const changes = {
        nombre,
        tipo_cliente,
        correo: String(fields.get('email') ?? '').trim() || null,
        telefono: String(fields.get('phone') ?? '').trim() || null,
        direccion: String(fields.get('address') ?? '').trim() || null,
        observaciones: String(fields.get('notes') ?? '').trim() || null,
      }
      if (initial) await updateClient(initial.id, changes)
      else await createClient(changes)
      if (mounted.current) void navigate(clientsPath, {
        replace: true,
        state: initial ? { clientUpdated: true } : { clientCreated: true },
      })
    } catch (error) {
      if (!mounted.current) return
      const uncertain = error instanceof ClientCreationUnconfirmed || error instanceof UpdateUnconfirmed
      submissionLocked.current = uncertain
      setUnconfirmed(uncertain)
      setError(error instanceof Error ? error.message : 'No fue posible guardar el cliente.')
      setSaving(false)
    }
  }

  return (
    <>
      <form className="admin-panel admin-record-form" onSubmit={handleSubmit} aria-busy={saving}>
        <fieldset>
          <label>Nombre<input name="name" defaultValue={initial?.nombre} required /></label>
          <label>
            Tipo de cliente
            <select name="type" required defaultValue={initial?.tipo_cliente ?? ""}>
              <option value="">Selecciona un tipo</option>
              {clientTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>Correo (opcional)<input name="email" type="email" defaultValue={initial?.correo ?? ""} /></label>
          <label>Teléfono (opcional)<input name="phone" type="tel" defaultValue={initial?.telefono ?? ""} /></label>
          <label className="admin-field-wide">Dirección (opcional)<input name="address" defaultValue={initial?.direccion ?? ""} /></label>
          <label className="admin-field-wide">Observaciones (opcional)<textarea name="notes" rows={4} defaultValue={initial?.observaciones ?? ""} /></label>
          <div className="admin-field-wide">
            <button type="submit" className="admin-primary" disabled={saving || unconfirmed}>
              {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Registrar cliente'}
            </button>
            {initial && <Link className="admin-action" to={clientsPath}>Cancelar</Link>}
          </div>
        </fieldset>
      </form>
      {saving && <LoadingState message="Guardando cliente…" />}
      {error && <p className="admin-error admin-table-error" role="alert">{error}</p>}
    </>
  )
}

export default function CreateClientPage() {
  const { user } = useAuth()

  return (
    <AdminLayout>
      <Link className="admin-action admin-back" to={clientsPath}>Volver a clientes</Link>
      <div className="admin-page-heading"><h1>Nuevo cliente</h1></div>
      {user?.rol.nombre === 'Administrador' && <ClientForm key={user.id} />}
    </AdminLayout>
  )
}

function EditClientContent({ id }: { id: string }) {
  const query = useCallback((signal: AbortSignal) => getClient(id, signal), [id])
  const result = useAdminQuery(query)
  if (result.status === 'loading') return <LoadingState message="Cargando cliente…" />
  if (result.status === 'error') return <p className="admin-error" role="alert">{result.message}</p>
  if (!result.data) return <p role="status">Cliente no disponible.</p>
  return <ClientForm initial={result.data} />
}

export function EditClientPage() {
  const { user } = useAuth()
  const { id } = useParams()
  return (
    <AdminLayout>
      <Link className="admin-action admin-back" to={clientsPath}>Volver a clientes</Link>
      <div className="admin-page-heading"><h1>Editar cliente</h1></div>
      {id && user?.rol.nombre === 'Administrador' && <EditClientContent key={user.id + '/' + id} id={id} />}
    </AdminLayout>
  )
}
