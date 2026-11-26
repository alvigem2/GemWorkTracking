import StatusBadge from '../dashboard/components/StatusBadge'
import { statusTone } from '../dashboard/components/statusTone'
import { CircleCheck, CircleMinus, Code, Shield, UserRound, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { useAuth } from '../auth/hooks/useAuth'
import AdminLayout from '../dashboard/components/AdminLayout'
import DataTable from '../dashboard/components/DataTable'
import EmptyState from '../dashboard/components/EmptyState'
import LoadingState from '../dashboard/components/LoadingState'
import { getUserFilters, listUsers, type UserFilters, type UserListItem } from './services/usersService'

import type { PerfilUsuario } from '../../types/auth'
import MetricCard from '../dashboard/components/MetricCard'
import { projectDetailsPath } from '../projects/projectRoutes'
import { AssignedUserError, checkUserStatusChange, getUserCounts, nextUserStatus, saveUserStatus, userStatusPlan } from './services/userStatusService'
import { newUserPath } from './userRoutes'

const emptyFilters: UserFilters = { fullName: '', username: '', role: '', status: '' }
const dateFormatter = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' })

function formatDate(value: string | null): string {
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? dateFormatter.format(timestamp) : '—'
}

const columns = [
  { id: 'full-name', label: 'Nombre completo', render: (row: UserListItem) => row.nombre_completo },
  { id: 'username', label: 'Nombre de usuario', render: (row: UserListItem) => row.nombre_usuario },
  { id: 'role', label: 'Rol', render: (row: UserListItem) => row.rol?.nombre ?? '—' },
  { id: 'status', label: 'Estado', render: (row: UserListItem) => row.estado ? <StatusBadge tone={statusTone(row.estado.nombre)}>{row.estado.nombre}</StatusBadge> : '—' },
  { id: 'phone', label: 'Teléfono', render: (row: UserListItem) => row.telefono ?? '—' },
  { id: 'created', label: 'Fecha de creación', render: (row: UserListItem) => formatDate(row.creado_en) },
]

const metrics = [
  { label: 'Total de usuarios', icon: Users },
  { label: 'Usuarios activos', icon: CircleCheck },
  { label: 'Usuarios inactivos', icon: CircleMinus },
  { label: 'Administradores', icon: Shield },
  { label: 'Desarrolladores', icon: Code },
  { label: 'Clientes', icon: UserRound },
]

function UsersContent({ user }: { user: PerfilUsuario }) {
  const { state } = useLocation()
  const [filters, setFilters] = useState(emptyFilters)
  const [page, setPage] = useState(0)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState<Error | null>(null)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])
  const canManage = user.rol.nombre === 'Administrador' && user.estado.nombre.trim().toLowerCase() === 'activo'
  const options = useAdminQuery(getUserFilters)
  const catalogs = options.status === 'ready' ? options.data : null
  const countsQuery = useCallback((signal: AbortSignal) => catalogs ? getUserCounts(catalogs, signal) : Promise.resolve(null), [catalogs])
  const counts = useAdminQuery(countsQuery, version)
  const query = useCallback((signal: AbortSignal) => listUsers(filters, page, signal), [filters, page])
  const result = useAdminQuery(query, version)
  const hasNext = result.status === 'ready' && result.data.hasNext

  async function changeStatus(row: UserListItem) {
    if (pending.current || !canManage || !catalogs) return
    const controller = new AbortController()
    pending.current = controller
    const { signal } = controller
    setNotice('')
    setFailure(null)
    setBusy(true)
    let submitted = false
    try {
      const plan = userStatusPlan(row, user.id, catalogs)
      await checkUserStatusChange(plan, signal)
      if (signal.aborted) return
      const context = plan.target === 'Inactivo' ? '\nLa cuenta quedará inactiva en GemWork Tracking.' : ''
      if (!window.confirm(row.nombre_completo + ' (@' + row.nombre_usuario + ')\nRol: ' + plan.role +
        '\nEstado actual: ' + plan.current + '\nEstado resultante: ' + plan.target + context)) return
      submitted = true
      await saveUserStatus(plan, signal)
      if (!signal.aborted) {
        setNotice('Se actualizó el estado de ' + row.nombre_completo + ' a ' + plan.target + '.')
      }
    } catch (error) {
      if (!signal.aborted) setFailure(error instanceof Error ? error : new Error('No se pudo actualizar el estado.'))
    } finally {
      pending.current = null
      if (!signal.aborted) {
        setBusy(false)
        if (submitted) {
          setPage(0)
          setVersion(current => current + 1)
        }
      }
    }
  }

  const actionColumn = {
    id: 'action', label: 'Acciones', render: (row: UserListItem) => {
      const target = nextUserStatus(row.estado?.nombre)
      if (!target || !canManage) return '—'
      if (target === 'Inactivo' && user.id === String(row.id)) return 'No puedes desactivar tu propia cuenta.'
      return <button className="admin-secondary" type="button" disabled={busy || !catalogs}
        onClick={() => void changeStatus(row)}>{target === 'Activo' ? 'Activar usuario' : 'Desactivar usuario'}</button>
    },
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const next = {
      fullName: String(fields.get('fullName') ?? '').trim(),
      username: String(fields.get('username') ?? '').trim(),
      role: String(fields.get('role') ?? ''),
      status: String(fields.get('status') ?? ''),
    }
    if (next.fullName !== filters.fullName || next.username !== filters.username ||
      next.role !== filters.role || next.status !== filters.status) {
      setFilters(next)
    }
    setPage(0)
  }

  return (
    <>
      <div className="admin-page-heading admin-heading-actions">
        <div>
          <h1>Usuarios</h1>
          <p>Consulta las cuentas del sistema, sus roles y estados.</p>
        </div>
        <Link className="admin-primary" to={newUserPath}>Nuevo usuario</Link>
      </div>
      {state?.userCreated === true && <p className="admin-success" role="status">Usuario creado correctamente.</p>}
      <section className="admin-metrics" aria-label="Totales generales de usuarios">
        {metrics.map(({ label, icon }, index) => <MetricCard key={label} label={label} icon={icon}
          value={counts.status === 'ready' ? counts.data?.[index] ?? null : null} />)}
      </section>
      {catalogs && counts.status === 'loading' && <LoadingState message="Cargando totales de usuarios…" />}
      {counts.status === 'error' && <p className="admin-error" role="alert">{counts.message}</p>}
      {busy && <LoadingState message="Verificando el cambio de estado…" />}
      {notice && <p className="admin-success" role="status">{notice}</p>}
      {failure && <div className="admin-panel admin-table-error">
        <p className="admin-error" role="alert">{failure.message}
          {failure instanceof AssignedUserError && ' Asignaciones en proyectos sin terminar: ' + failure.count + '.'}</p>
        {failure instanceof AssignedUserError && failure.projects.length > 0 &&
          <ul>{failure.projects.map(project => <li key={project.id}>
            <Link className="admin-action" to={projectDetailsPath(project.id)}>{project.nombre}</Link>
          </li>)}</ul>}
      </div>}
      <form className="admin-panel admin-search" role="search" aria-label="Buscar y filtrar usuarios" onSubmit={handleSearch}>
        <label>Nombre completo<input name="fullName" type="search" /></label>
        <label>Nombre de usuario<input name="username" type="search" /></label>
        <label>
          Rol
          <select name="role" disabled={options.status !== 'ready'} defaultValue="">
            <option value="">Todos los roles</option>
            {options.status === 'ready' && options.data.roles.map(role => (
              <option key={role.id} value={role.id}>{role.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select name="status" disabled={options.status !== 'ready'} defaultValue="">
            <option value="">Todos los usuarios</option>
            {options.status === 'ready' && options.data.statuses.filter(status => status.nombre === 'Activo' || status.nombre === 'Inactivo').map(status => (
              <option key={status.id} value={status.id}>{status.nombre}</option>
            ))}
          </select>
        </label>
        <button className="admin-primary" type="submit">Aplicar filtros</button>
      </form>
      {options.status === 'loading' && <LoadingState message="Cargando roles y estados…" />}
      {options.status === 'error' && <p className="admin-error" role="alert">{options.message}</p>}
      <section className="admin-panel" aria-labelledby="user-results">
        <h2 id="user-results">Listado de usuarios</h2>
        <DataTable
          labelledBy="user-results"
          columns={canManage ? [...columns, actionColumn] : columns}
          rows={result.status === 'ready' ? result.data.users : []}
          loading={result.status === 'loading'}
          getRowKey={user => user.id}
          empty={result.status === 'error'
            ? <p className="admin-error admin-table-error" role="alert">{result.message}</p>
            : <EmptyState icon={Users} title="Sin usuarios para mostrar"
                description={Object.values(filters).some(Boolean)
                  ? 'Prueba con otros filtros.'
                  : 'No hay usuarios visibles para esta cuenta.'} />}
        />
        {(page > 0 || hasNext) && (
          <nav className="admin-pagination" aria-label="Paginación de usuarios">
            <button type="button" onClick={() => setPage(page - 1)} disabled={page === 0}>Anterior</button>
            <span>Página {page + 1}</span>
            <button type="button" onClick={() => setPage(page + 1)} disabled={!hasNext}>Siguiente</button>
          </nav>
        )}
      </section>
    </>
  )
}

export default function UsersPage() {
  const { user } = useAuth()
  return <AdminLayout>{user && <UsersContent key={user.id} user={user} />}</AdminLayout>
}
