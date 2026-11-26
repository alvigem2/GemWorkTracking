import { consolidatedBackend } from '../consolidatedContract'
import { confirmUpdate } from '../../../lib/confirmUpdate'
import { supabase } from '../../../lib/supabase'
import { projectProgressFields, type ProgressStage } from '../progressCalculation'

type Option = { id: string | number; nombre: string }

export interface ProjectListItem {
  id: string | number
  nombre: string
  cliente: { nombre: string } | null
  estado: { nombre: string } | null
  fecha_inicio: string | null
  fecha_fin_estimada: string | null
}

export type ProjectListWithProgress = ProjectListItem & { etapas: ProgressStage[] }

export interface ProjectDetails extends ProjectListItem {
  cliente_id: string
  descripcion: string | null
  fecha_fin_real: string | null
  creado_en: string | null
}

export interface ProjectFilters {
  name: string
  client: string
  status: string
}

const fields = 'id, nombre, cliente:clientes!cliente_id(nombre), estado:estado_proyecto!estado_proyecto_id(nombre), fecha_inicio, fecha_fin_estimada'
const pageSize = 20

function publicSchema() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase.schema('public')
}

export async function getProjectFilters(signal: AbortSignal) {
  const db = publicSchema()
  const [clients, statuses] = await Promise.all(['clientes', 'estado_proyecto'].map(table =>
    db.from(table).select('id, nombre').order('nombre').order('id')
      .abortSignal(signal).overrideTypes<Option[], { merge: false }>(),
  ))

  if (clients.error || statuses.error) {
    throw new Error('No fue posible cargar los filtros de cliente y estado.', {
      cause: clients.error ?? statuses.error,
    })
  }
  return { clients: clients.data, statuses: statuses.data }
}

export async function listProjects(filters: ProjectFilters, page: number, signal: AbortSignal) {
  const offset = page * pageSize
  let query = publicSchema().from('proyectos').select(fields + ',' + projectProgressFields)

  if (filters.name) {
    const literal = filters.name.replace(/[\\%_]/g, '\\$&')
    query = query.ilike('nombre', '%' + literal + '%')
  }
  if (filters.client) query = query.eq('cliente_id', filters.client)
  if (filters.status) query = query.eq('estado_proyecto_id', filters.status)

  const { data, error } = await query
    .order('creado_en', { ascending: false, nullsFirst: false })
    .order('id')
    .range(offset, offset + pageSize)
    .abortSignal(signal)
    .overrideTypes<ProjectListWithProgress[], { merge: false }>()

  if (error) throw new Error('No fue posible cargar los proyectos.', { cause: error })
  return { projects: data.slice(0, pageSize), hasNext: data.length > pageSize }
}

export async function getProject(id: string, signal: AbortSignal): Promise<ProjectDetails | null> {
  const { data, error } = await publicSchema()
    .from('proyectos')
    .select(fields + ', cliente_id, descripcion, fecha_fin_real, creado_en')
    .eq('id', id)
    .abortSignal(signal)
    .maybeSingle()
    .overrideTypes<ProjectDetails | null, { merge: false }>()

  if (error?.code === '22P02') return null
  if (error) throw new Error(databaseError('No fue posible cargar el detalle del proyecto', error), { cause: error })
  return data
}

interface NewProject {
  nombre: string
  descripcion?: string
  cliente_id: string
  fecha_inicio: string
  fecha_fin_estimada: string
  creado_por: string
}

export class ProjectCreationUnconfirmed extends Error {}

function databaseError(description: string, error: { code: string; message: string }): string {
  const code = error.code ? ' (' + error.code + ')' : ''
  return description + code + '. ' + error.message
}

export async function getProjectClients(signal: AbortSignal): Promise<Option[]> {
  const { data, error } = await publicSchema()
    .from('clientes')
    .select('id, nombre')
    .order('nombre')
    .order('id')
    .abortSignal(signal)
    .overrideTypes<Option[], { merge: false }>()

  if (error) throw new Error(databaseError('No fue posible cargar los clientes', error), { cause: error })
  return data
}

export async function createProject(project: NewProject, signal: AbortSignal): Promise<string> {
  const db = publicSchema()
  const { data: initialStatus, error: statusError } = await db
    .from('estado_proyecto')
    .select('id')
    .eq('nombre', 'Iniciado')
    .abortSignal(signal)
    .maybeSingle()
    .overrideTypes<{ id: string } | null, { merge: false }>()

  if (statusError) {
    throw new Error(databaseError('No fue posible consultar el estado Iniciado', statusError), { cause: statusError })
  }
  if (!initialStatus) throw new Error('El estado Iniciado no está disponible.')

  signal.throwIfAborted()
  // Una vez enviada la escritura, conserva el resultado aunque la vista se desmonte.
  const { data, error, status } = await db
    .from('proyectos')
    .insert({ ...project, estado_proyecto_id: initialStatus.id })
    .select('id')
    .retry(false)
    .maybeSingle()
    .overrideTypes<{ id: string } | null, { merge: false }>()

  if (error) {
    if (status === 0 || status >= 500) {
      throw new ProjectCreationUnconfirmed(databaseError(
        'No fue posible confirmar la creación. Revisa el listado antes de intentar de nuevo', error,
      ), { cause: error })
    }
    throw new Error(databaseError('Supabase rechazó la creación o la devolución del ID', error), { cause: error })
  }
  if (!data?.id) {
    throw new ProjectCreationUnconfirmed('Supabase aceptó la solicitud, pero no devolvió el ID. Revisa el listado antes de intentar de nuevo.')
  }

  return data.id
}

export interface ProjectChanges {
  nombre: string
  descripcion: string | null
  cliente_id: string
  fecha_inicio?: string
  fecha_fin_estimada?: string
}

export function updateProject(id: string, changes: ProjectChanges) {
  const { nombre, descripcion, cliente_id, fecha_inicio, fecha_fin_estimada } = changes
  return confirmUpdate(publicSchema().from('proyectos')
    .update({ nombre, descripcion, cliente_id, ...(!consolidatedBackend && { fecha_inicio, fecha_fin_estimada }) }).eq('id', id)
    .select('id').retry(false).maybeSingle().overrideTypes<{ id: string } | null, { merge: false }>(), id)
}

export async function getProjectStatuses(signal: AbortSignal): Promise<Option[]> {
  const { data, error } = await publicSchema().from('estado_proyecto')
    .select('id, nombre').order('nombre').abortSignal(signal)
    .overrideTypes<Option[], { merge: false }>()
  if (error) throw new Error(databaseError('No fue posible cargar los estados de proyecto', error), { cause: error })
  return data
}
