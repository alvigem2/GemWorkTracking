import { confirmUpdate } from '../../../lib/confirmUpdate'
import { supabase } from '../../../lib/supabase'
import { consolidatedBackend } from '../consolidatedContract'

type Id = string | number
export type TaskState = 'Pendiente' | 'En curso' | 'Bloqueada' | 'Completada'
export interface TaskStatus { id: Id; nombre: TaskState }

export interface WorkItem {
  id: Id
  nombre: string
  descripcion: string | null
  peso_porcentual: number | string | null
  orden: number | null
  fecha_inicio: string | null
  fecha_fin_estimada: string | null
}

export interface ProjectTask extends WorkItem {
  estado: Pick<TaskStatus, 'nombre'> | null
}

export interface ProjectStage extends WorkItem {
  tareas: ProjectTask[]
}

export interface WorkInput {
  nombre: string
  descripcion?: string
  peso_porcentual: number
  orden: number
  fecha_inicio?: string
  fecha_fin_estimada?: string
}

const workFields = 'id, nombre, descripcion, peso_porcentual, orden, fecha_inicio, fecha_fin_estimada'

function publicSchema() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase.schema('public')
}

function queryError(message: string, error: { code: string; message: string }): Error {
  const code = error.code ? ' (' + error.code + ')' : ''
  return new Error(message + code + '. ' + error.message)
}

export async function getProjectStages(projectId: string, signal: AbortSignal): Promise<ProjectStage[]> {
  const { data, error } = await publicSchema()
    .from('proyectos')
    .select(`etapas(${workFields}, tareas(${workFields}, estado:estado_tarea(nombre)))`)
    .eq('id', projectId)
    .order('orden', { referencedTable: 'etapas', nullsFirst: false })
    .order('id', { referencedTable: 'etapas' })
    .order('orden', { referencedTable: 'etapas.tareas', nullsFirst: false })
    .order('id', { referencedTable: 'etapas.tareas' })
    .abortSignal(signal)
    .maybeSingle()
    .overrideTypes<{ etapas: ProjectStage[] } | null, { merge: false }>()

  if (error) throw queryError('No fue posible cargar las etapas y tareas', error)
  if (!data) throw new Error('El proyecto no está disponible para consultar sus etapas.')
  return data.etapas
}

export async function getTaskStatuses(signal: AbortSignal): Promise<TaskStatus[]> {
  const { data, error } = await publicSchema()
    .from('estado_tarea')
    .select('id, nombre')
    .order('nombre')
    .abortSignal(signal)
    .overrideTypes<{ id: Id; nombre: string }[], { merge: false }>()

  if (error) throw queryError('No fue posible cargar los estados de tarea', error)
  return data.filter((state): state is TaskStatus =>
    state.nombre === 'Pendiente' || state.nombre === 'En curso' ||
    state.nombre === 'Bloqueada' || state.nombre === 'Completada',
  )
}

export class WorkCreationUnconfirmed extends Error {}

async function confirmWorkInsert(
  request: PromiseLike<{ error: { code: string; message: string } | null; status: number }>,
): Promise<void> {
  const { error, status } = await request
  if (!error) return
  if (status === 0 || status >= 500) {
    throw new WorkCreationUnconfirmed(
      'No se pudo confirmar el guardado. Actualiza el listado antes de volver a intentarlo.',
    )
  }
  throw queryError('Supabase rechazó el guardado', error)
}

export function createStage(projectId: string, input: WorkInput): Promise<void> {
  return confirmWorkInsert(
    publicSchema().from('etapas').insert({ ...input, proyecto_id: projectId }).retry(false),
  )
}

export function createTask(stageId: Id, catalog: readonly TaskStatus[], input: WorkInput): Promise<void> {
  const pending = catalog.find(state => state.nombre === 'Pendiente')
  if (!pending) throw new Error('El catálogo no contiene el estado Pendiente.')
  return confirmWorkInsert(
    publicSchema().from('tareas').insert({ ...input, etapa_id: stageId, estado_tarea_id: pending.id }).retry(false),
  )
}

export interface WorkChanges {
  nombre: string
  descripcion: string | null
  peso_porcentual: number
  fecha_inicio?: string | null
  fecha_fin_estimada?: string | null
}

export function updateWorkItem(
  table: 'etapas' | 'tareas',
  id: Id,
  parentId: Id,
  changes: WorkChanges,
) {
  const { nombre, descripcion, peso_porcentual, fecha_inicio, fecha_fin_estimada } = changes
  return confirmUpdate(publicSchema().from(table)
    .update({ nombre, descripcion, peso_porcentual, ...(!consolidatedBackend && { fecha_inicio, fecha_fin_estimada }) })
    .eq('id', id).eq(table === 'etapas' ? 'proyecto_id' : 'etapa_id', parentId)
    .select('id').retry(false).maybeSingle().overrideTypes<{ id: Id } | null, { merge: false }>(), id)
}
