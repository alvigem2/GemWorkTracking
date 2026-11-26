import { supabase } from '../../../lib/supabase'

export interface AssignmentTarget {
  kind: 'client' | 'developer'
  id: string | number
}

interface Person {
  nombre_completo: string
  nombre_usuario: string
}

export interface AssignableUser extends Person {
  id: string
  rol: { nombre: string }
}

type ClientRow = { usuario_id: string; usuario: Person | null }
type DeveloperRow = { desarrollador_id: string; usuario: Person | null }

function tableFor(kind: AssignmentTarget['kind']) {
  return kind === 'client'
    ? { table: 'proyecto_usuario_cliente', target: 'proyecto_id', person: 'usuario_id' } as const
    : { table: 'tarea_desarrollador', target: 'tarea_id', person: 'desarrollador_id' } as const
}

function publicSchema() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase.schema('public')
}

export async function getAssignableUsers(signal: AbortSignal): Promise<AssignableUser[]> {
  const { data, error } = await publicSchema().from('usuarios')
    .select('id,nombre_completo,nombre_usuario,rol:roles!inner(nombre),estado:estado_usuario!inner(nombre)')
    .in('rol.nombre', ['Cliente', 'Desarrollador'])
    .ilike('estado.nombre', 'Activo')
    .order('nombre_completo')
    .order('id')
    .abortSignal(signal)
    .overrideTypes<AssignableUser[], { merge: false }>()

  if (error) throw new Error('No fue posible cargar los usuarios activos. ' + error.message, { cause: error })
  return data
}

export async function getAssignments(target: AssignmentTarget, signal: AbortSignal) {
  const { table, target: targetColumn, person } = tableFor(target.kind)
  const { data, error } = await publicSchema().from(table)
    .select(`${person},usuario:usuarios!${person}(nombre_completo,nombre_usuario)`)
    .eq(targetColumn, target.id)
    .order(person)
    .abortSignal(signal)
    .overrideTypes<(ClientRow | DeveloperRow)[], { merge: false }>()

  if (error) throw new Error('No fue posible cargar las asignaciones. ' + error.message, { cause: error })
  return data.map(row => ({
    id: 'usuario_id' in row ? row.usuario_id : row.desarrollador_id,
    user: row.usuario,
  }))
}

export class AssignmentUnconfirmed extends Error {}

function checkMutation(error: { code: string; message: string }, status: number): never {
  if (status === 0 || status >= 500) {
    throw new AssignmentUnconfirmed('No se pudo confirmar el cambio. Actualiza el listado antes de volver a intentarlo.')
  }
  if (error.code === '23505') throw new Error('Ese usuario ya está asignado. Actualiza el listado.')
  if (error.code === '42501' || status === 401 || status === 403) {
    throw new Error('Supabase denegó el cambio. Verifica tu sesión y los permisos de asignación.')
  }
  throw new Error('Supabase rechazó el cambio. ' + error.message, { cause: error })
}

export async function addAssignment(target: AssignmentTarget, userId: string, assignedBy: string) {
  const { table, target: targetColumn, person } = tableFor(target.kind)
  const { error, status } = await publicSchema().from(table).insert({
    [targetColumn]: target.id,
    [person]: userId,
    asignado_por: assignedBy,
  }).retry(false)

  if (error) checkMutation(error, status)
}

export async function removeAssignment(target: AssignmentTarget, userId: string) {
  const { table, target: targetColumn, person } = tableFor(target.kind)
  const { data, error, status } = await publicSchema().from(table).delete()
    .eq(targetColumn, target.id)
    .eq(person, userId)
    .select(person)
    .retry(false)

  if (error) checkMutation(error, status)
  if (!data?.length) {
    throw new Error('No se retiró ninguna asignación. Puede que ya no exista o que RLS impida retirarla.')
  }
}
