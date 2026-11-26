import { Building2 } from 'lucide-react'
import { useCallback, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { useAuth } from '../auth/hooks/useAuth'
import AdminLayout from '../dashboard/components/AdminLayout'
import DataTable from '../dashboard/components/DataTable'
import EmptyState from '../dashboard/components/EmptyState'
import { editClientPath, newClientPath } from './clientRoutes'
import { listClients, type ClientListItem } from './services/clientsService'

const columns = [
  { id: 'name', label: 'Nombre', render: (client: ClientListItem) => client.nombre },
  { id: 'type', label: 'Tipo de cliente', render: (client: ClientListItem) => client.tipo_cliente },
  { id: 'email', label: 'Correo', render: (client: ClientListItem) => client.correo ?? '—' },
  { id: 'action', label: 'Acción', render: (client: ClientListItem) => (
    <Link className="admin-action" to={editClientPath(client.id)} aria-label={'Editar cliente ' + client.nombre}>Editar cliente</Link>
  ) },
  { id: 'phone', label: 'Teléfono', render: (client: ClientListItem) => client.telefono ?? '—' },
]

function ClientsContent() {
  const [name, setName] = useState('')
  const [page, setPage] = useState(0)
  const { state } = useLocation()
  const query = useCallback((signal: AbortSignal) => listClients(name, page, signal), [name, page])
  const result = useAdminQuery(query)
  const hasNext = result.status === 'ready' && result.data.hasNext

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setName(String(fields.get('name') ?? '').trim())
    setPage(0)
  }

  return (
    <>
      <div className="admin-page-heading admin-heading-actions">
        <h1>Clientes</h1>
        <Link className="admin-primary" to={newClientPath}>Nuevo cliente</Link>
      </div>
      {state?.clientUpdated === true && <p className="admin-success" role="status">Cliente actualizado correctamente.</p>}
      {state?.clientCreated === true && <p className="admin-success" role="status">Cliente registrado correctamente.</p>}
      <form className="admin-panel admin-search" role="search" aria-label="Buscar clientes" onSubmit={handleSearch}>
        <label>Buscar por nombre<input name="name" type="search" /></label>
        <button className="admin-primary" type="submit">Buscar</button>
      </form>
      <section className="admin-panel" aria-labelledby="client-results">
        <h2 id="client-results">Listado de clientes</h2>
        <DataTable
          labelledBy="client-results"
          columns={columns}
          rows={result.status === 'ready' ? result.data.clients : []}
          loading={result.status === 'loading'}
          getRowKey={client => client.id}
          empty={result.status === 'error'
            ? <p className="admin-error admin-table-error" role="alert">{result.message}</p>
            : <EmptyState icon={Building2} title="Sin clientes para mostrar" description={name
                ? 'Prueba con otro nombre.'
                : 'Registra un cliente para asignarlo a un proyecto.'} />}
        />
        {(page > 0 || hasNext) && (
          <nav className="admin-pagination" aria-label="Paginación de clientes">
            <button type="button" onClick={() => setPage(page - 1)} disabled={page === 0}>Anterior</button>
            <span>Página {page + 1}</span>
            <button type="button" onClick={() => setPage(page + 1)} disabled={!hasNext}>Siguiente</button>
          </nav>
        )}
      </section>
    </>
  )
}

export default function ClientsPage() {
  const { user } = useAuth()
  return <AdminLayout>{user && <ClientsContent key={user.id} />}</AdminLayout>
}
