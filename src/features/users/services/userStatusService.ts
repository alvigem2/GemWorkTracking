import { supabase } from '../../../lib/supabase'
import { confirmUpdate } from '../../../lib/confirmUpdate'
import { getUserFilters, type UserListItem } from './usersService'

type Catalogs = Awaited<ReturnType<typeof getUserFilters>>
type CountFilter = { column: string; id: string | number }

export function resolveCatalogId(items: Catalogs['statuses'], name: string) {
  const matches = items.filter(item => item.nombre === name)
  if (matches.length !== 1) throw new Error('El catálogo no contiene un valor único para «' + name + '».')
  return matches[0].id
}

function db() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase.schema('public')
}

async function countRows(table: string, filters: CountFilter[], signal: AbortSignal) {
  const field = table === 'usuarios' ? 'id' : filters[0].column
  let query = db().from(table).select(field, { count: 'exact', head: true })
  for (const { column, id } of filters) query = query.eq(column, id)
  const { count, error } = await query.abortSignal(signal)
  if (error || count === null) throw new Error(error?.message ?? 'Supabase no confirmó el total.')
  return count
}

const roleFilter = (id: string | number) => ({ column: 'rol_id', id })
const statusFilter = (id: string | number) => ({ column: 'estado_usuario_id', id })

export async function getUserCounts(catalogs: Catalogs, signal: AbortSignal) {
  return Promise.all([
    countRows('usuarios', [], signal),
    ...['Activo', 'Inactivo'].map(name => countRows('usuarios', [statusFilter(resolveCatalogId(catalogs.statuses, name))], signal)),
    ...['Administrador', 'Desarrollador', 'Cliente'].map(name => countRows('usuarios', [roleFilter(resolveCatalogId(catalogs.roles, name))], signal)),
  ])
}

export function nextUserStatus(state: string | undefined) {
  if (state === 'Activo') return 'Inactivo'
  if (state === 'Inactivo') return 'Activo'
  return null
}

export function userStatusPlan(row: UserListItem, actorId: string, catalogs: Catalogs) {
  const current = row.estado?.nombre
  const target = nextUserStatus(current)
  const role = row.rol?.nombre
  if (!current || !target || !role) throw new Error('No se pudo verificar el estado o el rol de la cuenta.')
  if (target === 'Inactivo' && String(row.id) === actorId) throw new Error('No puedes desactivar tu propia cuenta.')
  return { row, role, current, target, roleId: resolveCatalogId(catalogs.roles, role),
    from: resolveCatalogId(catalogs.statuses, current), to: resolveCatalogId(catalogs.statuses, target) }
}

type Plan = ReturnType<typeof userStatusPlan>

export class AssignedUserError extends Error {
  readonly count: number
  readonly projects: { id: string; nombre: string }[]

  constructor(message: string, count: number, projects: AssignedUserError['projects']) {
    super(message)
    this.count = count
    this.projects = projects
  }
}

export async function checkUserStatusChange(plan: Plan, signal: AbortSignal) {
  if (plan.target !== 'Inactivo') return
  if (plan.role === 'Administrador') {
    const active = await countRows('usuarios', [roleFilter(plan.roleId), statusFilter(plan.from)], signal)
    if (active <= 1) throw new Error('No puedes desactivar al último administrador activo.')
    return
  }
  if (plan.role !== 'Cliente' && plan.role !== 'Desarrollador') throw new Error('El rol no admite esta operación.')
  const isClient = plan.role === 'Cliente'
  const table = isClient ? 'proyecto_usuario_cliente' : 'tarea_desarrollador'
  const column = isClient ? 'usuario_id' : 'desarrollador_id'
  const project = 'proyecto:proyectos!inner(id,nombre,estado:estado_proyecto!inner(nombre))'
  const fields = isClient ? project : 'tarea:tareas!inner(etapa:etapas!inner(' + project + '))'
  const status = isClient ? 'proyecto.estado.nombre' : 'tarea.etapa.proyecto.estado.nombre'
  const { data, count, error } = await db().from(table).select(fields, { count: 'exact' })
    .eq(column, plan.row.id).neq(status, 'Terminado')
    .order(isClient ? 'proyecto_id' : 'tarea_id').limit(5).abortSignal(signal)
    .overrideTypes<{
      proyecto?: { id: string; nombre: string }
      tarea?: { etapa: { proyecto: { id: string; nombre: string } } }
    }[], { merge: false }>()
  if (error || count === null) {
    throw new Error('No se pudieron verificar las asignaciones en proyectos abiertos. ' +
      (error?.message ?? ''), { cause: error })
  }
  if (count === 0) return

  const projects = new Map<string, { id: string; nombre: string }>()
  for (const item of data ?? []) {
    const project = item.proyecto ?? item.tarea?.etapa.proyecto
    if (project) projects.set(project.id, project)
  }
  throw new AssignedUserError(isClient
    ? 'No puedes desactivar este usuario mientras tenga proyectos asignados sin terminar.'
    : 'No puedes desactivar este usuario mientras tenga tareas asignadas en proyectos sin terminar.',
  count, [...projects.values()])
}

export async function saveUserStatus(plan: Plan, signal: AbortSignal) {
  await checkUserStatusChange(plan, signal)
  signal.throwIfAborted()
  const result = await db().from('usuarios').update({ estado_usuario_id: plan.to })
    .eq('id', plan.row.id).eq('estado_usuario_id', plan.from).eq('rol_id', plan.roleId)
    .select('id,estado_usuario_id').retry(false).abortSignal(signal).maybeSingle()
    .overrideTypes<{ id: string; estado_usuario_id: string | number } | null, { merge: false }>()
  if (!result.error && !result.data) throw new Error('No se confirmó el cambio. El estado o el rol pudo haber cambiado, o la cuenta ya no es modificable.')
  await confirmUpdate(Promise.resolve(result), plan.row.id)
  if (String(result.data?.estado_usuario_id) !== String(plan.to)) {
    throw new Error('Supabase no confirmó el estado solicitado. Comprueba el listado.')
  }
}
