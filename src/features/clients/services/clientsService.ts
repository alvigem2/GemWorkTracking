import { confirmUpdate } from '../../../lib/confirmUpdate'
import { supabase } from '../../../lib/supabase'

export interface ClientListItem {
  id: string
  nombre: string
  tipo_cliente: string
  correo: string | null
  telefono: string | null
}

interface NewClient {
  nombre: string
  tipo_cliente: string
  correo: string | null
  telefono: string | null
  direccion: string | null
  observaciones: string | null
}

export class ClientCreationUnconfirmed extends Error {}

const pageSize = 20

function clientsTable() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase.schema('public').from('clientes')
}

export async function listClients(name: string, page: number, signal: AbortSignal) {
  const offset = page * pageSize
  let query = clientsTable().select('id, nombre, tipo_cliente, correo, telefono')

  if (name) {
    const literal = name.replace(/[\\%_]/g, '\\$&')
    query = query.ilike('nombre', '%' + literal + '%')
  }

  const { data, error } = await query
    .order('creado_en', { ascending: false })
    .order('id')
    .range(offset, offset + pageSize)
    .abortSignal(signal)
    .overrideTypes<ClientListItem[], { merge: false }>()

  if (error) throw new Error('No fue posible cargar los clientes. ' + error.message, { cause: error })
  return { clients: data.slice(0, pageSize), hasNext: data.length > pageSize }
}

export async function createClient(client: NewClient): Promise<void> {
  const { error, status } = await clientsTable().insert(client).retry(false)
  if (!error) return

  const detail = error.code ? error.code + ': ' + error.message : error.message
  if (status === 0 || status >= 500) {
    throw new ClientCreationUnconfirmed(
      'No fue posible confirmar el registro. Revisa el listado antes de intentar de nuevo. ' + detail,
      { cause: error },
    )
  }
  throw new Error('Supabase rechazó el registro. ' + detail, { cause: error })
}

export interface ClientDetails extends ClientListItem {
  direccion: string | null
  observaciones: string | null
}

export async function getClient(id: string, signal: AbortSignal) {
  const { data, error } = await clientsTable().select('id,nombre,tipo_cliente,correo,telefono,direccion,observaciones')
    .eq('id', id).abortSignal(signal).maybeSingle().overrideTypes<ClientDetails | null, { merge: false }>()
  if (error?.code === '22P02') return null
  if (error) throw new Error('No fue posible cargar el cliente. ' + error.message, { cause: error })
  return data
}

export function updateClient(id: string, changes: NewClient) {
  const { nombre, tipo_cliente, correo, telefono, direccion, observaciones } = changes
  return confirmUpdate(clientsTable().update({ nombre, tipo_cliente, correo, telefono, direccion, observaciones })
    .eq('id', id).select('id').retry(false).maybeSingle().overrideTypes<{ id: string } | null, { merge: false }>(), id)
}
