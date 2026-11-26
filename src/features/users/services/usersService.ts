import type { RolNombre } from '../../../types/auth'
import { supabase } from '../../../lib/supabase'

type CatalogItem = { id: string | number; nombre: string }
type CatalogName = Pick<CatalogItem, 'nombre'>

export interface UserListItem {
  id: string | number
  nombre_completo: string
  nombre_usuario: string
  rol: CatalogName | null
  estado: CatalogName | null
  telefono: string | null
  creado_en: string | null
}

export interface UserFilters {
  fullName: string
  username: string
  role: string
  status: string
}

const pageSize = 20

function publicSchema() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase.schema('public')
}

export async function getUserFilters(signal: AbortSignal) {
  const db = publicSchema()
  const [roles, statuses] = await Promise.all(['roles', 'estado_usuario'].map(table =>
    db.from(table).select('id, nombre').order('nombre').order('id')
      .abortSignal(signal).overrideTypes<CatalogItem[], { merge: false }>(),
  ))

  const error = roles.error ?? statuses.error
  if (error) throw new Error('No fue posible cargar los filtros. ' + error.message, { cause: error })
  return { roles: roles.data ?? [], statuses: statuses.data ?? [] }
}

function searchPattern(value: string): string {
  return '%' + value.replace(/[\\%_]/g, '\\$&') + '%'
}

export async function listUsers(filters: UserFilters, page: number, signal: AbortSignal) {
  const offset = page * pageSize
  let query = publicSchema()
    .from('usuarios')
    .select('id, nombre_completo, nombre_usuario, telefono, rol:roles(nombre), estado:estado_usuario(nombre), creado_en')

  if (filters.fullName) query = query.ilike('nombre_completo', searchPattern(filters.fullName))
  if (filters.username) query = query.ilike('nombre_usuario', searchPattern(filters.username))
  if (filters.role) query = query.eq('rol_id', filters.role)
  if (filters.status) query = query.eq('estado_usuario_id', filters.status)

  const { data, error } = await query
    .order('creado_en', { ascending: false, nullsFirst: false })
    .order('id')
    .range(offset, offset + pageSize)
    .abortSignal(signal)
    .overrideTypes<UserListItem[], { merge: false }>()

  if (error) {
    if (error.code === 'PGRST200' || error.code === 'PGRST201') {
      throw new Error([error.code, error.message, error.details, error.hint].filter(Boolean).join(' '), { cause: error })
    }
    throw new Error('No fue posible cargar los usuarios. ' + error.message, { cause: error })
  }

  return { users: data.slice(0, pageSize), hasNext: data.length > pageSize }
}

interface CreateUserPayload {
  nombre_completo: string
  nombre_usuario: string
  password: string
  rol: RolNombre
  telefono?: string
}

export class UserCreationUnconfirmed extends Error {}

const creationErrors: Partial<Record<number, string>> = {
  400: 'Revisa los datos del formulario. La función rechazó la solicitud.',
  401: 'La sesión no es válida. Vuelve a iniciar sesión.',
  403: 'Tu cuenta no tiene permiso para crear usuarios.',
  409: 'El nombre de usuario ya existe. Elige otro.',
  413: 'La solicitud es demasiado grande. Revisa los campos.',
  415: 'La función no admite el formato de la solicitud.',
}

export async function createUser(payload: CreateUserPayload): Promise<void> {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')

  const { error, response } = await supabase.functions.invoke('gemwork-admin-usuarios', { body: payload })
  const status = response?.status
  if (!error && status === 201) return

  const message = status === undefined ? undefined : creationErrors[status]
  if (message) throw new Error(message)

  const reason = status !== undefined && status >= 500
    ? 'La función devolvió un error del servidor (' + status + ').'
    : 'No se recibió una confirmación del alta.'
  throw new UserCreationUnconfirmed(reason + ' Revisa el listado antes de volver a intentarlo.')
}
