import { supabase } from '../../lib/supabase'

export type NotificationFilter = 'all' | 'read' | 'unread' | 'archived'
type TargetState = 'Leída' | 'Archivada'
type NamedRelation = { nombre: string }
type EntityId = string | number

export interface Notification {
  id: string
  titulo: string
  mensaje: string | null
  creado_en: string | null
  leida_en: string | null
  proyecto_id: EntityId | null
  tarea_id: EntityId | null
  documento_id: string | null
  tipo: NamedRelation | null
  estado: NamedRelation | null
  proyecto: NamedRelation | null
  tarea: NamedRelation | null
}

export const filterStates = {
  all: ['No leída', 'Leída'], unread: ['No leída'], read: ['Leída'], archived: ['Archivada'],
} as const

const fields = 'id,titulo,mensaje,creado_en,leida_en,proyecto_id,tarea_id,documento_id,tipo:tipo_notificacion(nombre),estado:estado_notificacion!inner(nombre),proyecto:proyectos(nombre),tarea:tareas(nombre)'
const pageSize = 20
const batchSize = 100

export function notificationActions(state: string | undefined) {
  return { read: state === 'No leída', archive: state === 'No leída' || state === 'Leída' }
}

function database() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase.schema('public')
}

const table = () => database().from('notificaciones')

export async function getUnreadCount(profileId: string, signal: AbortSignal) {
  const { count, error } = await table()
    .select('id,estado:estado_notificacion!inner(nombre)', { count: 'exact', head: true })
    .eq('usuario_id', profileId).eq('estado.nombre', filterStates.unread[0]).abortSignal(signal)

  if (error || count === null) throw new Error('No fue posible consultar el total de notificaciones no leídas.')
  return count
}

export async function getNotifications(
  profileId: string, filter: NotificationFilter, page: number, signal: AbortSignal, limit = pageSize,
) {
  const offset = page * limit
  const { data, error } = await table().select(fields).eq('usuario_id', profileId)
    .in('estado.nombre', filterStates[filter])
    .order('creado_en', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
    .range(offset, offset + limit).abortSignal(signal)
    .overrideTypes<Notification[], { merge: false }>()

  if (error) throw new Error('No fue posible consultar las notificaciones. ' + error.message, { cause: error })
  return { items: data.slice(0, limit), hasNext: data.length > limit }
}

export const notificationStateRpc = 'fn_cambiar_estado_mi_notificacion'

export function notificationStateParams(id: string, state: TargetState) {
  return { p_notificacion_id: id, p_estado_nombre: state }
}

export function confirmNotificationChange(data: unknown, error: { message: string } | null) {
  if (error) throw new Error('No fue posible actualizar la notificación. ' + error.message, { cause: error })
  if (data !== true) throw new Error('La RPC no confirmó el cambio. La notificación podría haber dejado de estar disponible.')
}

async function changeState(id: string, state: TargetState, signal: AbortSignal) {
  signal.throwIfAborted()
  const { data, error } = await database()
    .rpc(notificationStateRpc, notificationStateParams(id, state)).retry(false).abortSignal(signal)
  confirmNotificationChange(data, error)
}

export const markNotificationAsRead = (id: string, signal: AbortSignal) => changeState(id, 'Leída', signal)
export const archiveNotification = (id: string, signal: AbortSignal) => changeState(id, 'Archivada', signal)

export async function markNotificationBatch(
  ids: string[], mark: (id: string) => Promise<void>, signal: AbortSignal,
) {
  let succeeded = 0
  let failed = 0
  const concurrency = 4
  for (let start = 0; start < ids.length; start += concurrency) {
    signal.throwIfAborted()
    const results = await Promise.allSettled(ids.slice(start, start + concurrency).map(mark))
    for (const result of results) {
      if (result.status === 'fulfilled') succeeded++
      else failed++
    }
  }
  return { succeeded, failed }
}

export async function markAllNotificationsAsRead(profileId: string, signal: AbortSignal) {
  const ids: string[] = []
  let cursor: string | undefined
  for (;;) {
    signal.throwIfAborted()
    let query = table().select('id,estado:estado_notificacion!inner(nombre)')
      .eq('usuario_id', profileId).eq('estado.nombre', filterStates.unread[0])
    if (cursor) query = query.gt('id', cursor)
    const { data, error } = await query.order('id').limit(batchSize).abortSignal(signal)
      .overrideTypes<{ id: string }[], { merge: false }>()
    if (error) throw new Error('No fue posible consultar las notificaciones pendientes. ' + error.message)
    if (!data.length) break
    for (const item of data) ids.push(item.id)
    cursor = data.at(-1)?.id
  }

  return markNotificationBatch(ids, async id => {
    // La RPC no recibe un estado esperado. Comprobar de nuevo antes de cada envío.
    const { data, error } = await table().select('id,estado:estado_notificacion!inner(nombre)')
      .eq('usuario_id', profileId).eq('id', id).eq('estado.nombre', filterStates.unread[0])
      .abortSignal(signal).maybeSingle()
    if (error || !data) throw new Error('La notificación ya no está pendiente o no pudo verificarse.')
    await markNotificationAsRead(id, signal)
  }, signal)
}
