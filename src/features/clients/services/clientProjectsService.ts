import { supabase } from '../../../lib/supabase'
import { projectProgressFields, type ProgressStage } from '../../projects/progressCalculation'

export interface AssignedProject {
  id: string
  nombre: string
  descripcion: string | null
  fecha_inicio: string | null
  fecha_fin_estimada: string | null
  fecha_fin_real: string | null
  creado_en: string | null
  etapas: ProgressStage[]
  estado: { nombre: string } | null
}

const fields = 'proyecto:proyectos!inner(id,nombre,descripcion,fecha_inicio,fecha_fin_estimada,fecha_fin_real,creado_en,estado:estado_proyecto(nombre),' + projectProgressFields + ')'
const pageSize = 200

export async function getClientProjects(profileId: string, signal: AbortSignal): Promise<AssignedProject[]> {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')

  const db = supabase.schema('public')
  const projects = new Map<string, AssignedProject>()
  let offset = 0
  let total = 0

  do {
    const { data, error, count } = await db.from('proyecto_usuario_cliente')
      .select(fields, offset === 0 ? { count: 'exact' } : undefined)
      .eq('usuario_id', profileId)
      .order('proyecto(creado_en)', { ascending: false, nullsFirst: false })
      .order('proyecto_id')
      .range(offset, offset + pageSize - 1)
      .abortSignal(signal)
      .overrideTypes<{ proyecto: AssignedProject }[], { merge: false }>()

    if (error) throw new Error('No fue posible consultar tus proyectos. ' + error.message, { cause: error })
    if (offset === 0) {
      if (count === null) throw new Error('No fue posible confirmar el total de asignaciones.')
      total = count
    }
    if (data.length === 0) break
    for (const { proyecto } of data) projects.set(proyecto.id, proyecto)
    offset += data.length
  } while (offset < total)

  return [...projects.values()]
}

export interface ClientTask {
  peso_porcentual: number | string | null
  id: string | number
  nombre: string
  fecha_inicio: string | null
  fecha_fin_estimada: string | null
  estado: { nombre: string } | null
}

type ClientStage = Omit<ClientTask, 'estado'> & { tareas: ClientTask[] }
const scheduleFields = 'id,nombre,fecha_inicio,fecha_fin_estimada'

export async function getClientProjectStages(profileId: string, projectId: string, signal: AbortSignal): Promise<ClientStage[]> {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')

  const { data, error } = await supabase.schema('public').from('proyecto_usuario_cliente')
    .select(`proyecto:proyectos!inner(etapas(${scheduleFields},peso_porcentual,tareas(${scheduleFields},peso_porcentual,estado:estado_tarea(nombre))))`)
    .eq('usuario_id', profileId)
    .eq('proyecto_id', projectId)
    .order('orden', { referencedTable: 'proyecto.etapas', nullsFirst: false })
    .order('id', { referencedTable: 'proyecto.etapas' })
    .order('orden', { referencedTable: 'proyecto.etapas.tareas', nullsFirst: false })
    .order('id', { referencedTable: 'proyecto.etapas.tareas' })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle()
    .overrideTypes<{ proyecto: { etapas: ClientStage[] } } | null, { merge: false }>()

  if (error) throw new Error('No fue posible consultar las etapas y tareas. ' + error.message, { cause: error })
  if (!data) throw new Error('El proyecto ya no está disponible entre tus asignaciones.')
  return data.proyecto.etapas
}
