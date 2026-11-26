import { supabase } from '../../../lib/supabase'

type Id = string | number
type NamedRecord = { id: Id; nombre: string }

export interface DeveloperTask extends NamedRecord {
  descripcion: string | null
  peso_porcentual: number | string | null
  orden: number | null
  fecha_inicio: string | null
  fecha_fin_estimada: string | null
  creado_en: string | null
  actualizado_en: string | null
  estado: NamedRecord | null
  etapa: (NamedRecord & { proyecto: (NamedRecord & { estado: { nombre: string } | null }) | null }) | null
}

export interface DeveloperAssignment {
  asignado_en: string | null
  tarea: DeveloperTask
}

const fields = 'asignado_en, tarea:tareas!inner(id, nombre, descripcion, peso_porcentual, orden, fecha_inicio, fecha_fin_estimada, creado_en, actualizado_en, estado:estado_tarea(id,nombre), etapa:etapas(id,nombre,proyecto:proyectos(id,nombre,estado:estado_proyecto(nombre))))'
const pageSize = 200

export async function getDeveloperAssignments(profileId: string, signal: AbortSignal): Promise<DeveloperAssignment[]> {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')

  const db = supabase.schema('public')
  const assignments = new Map<Id, DeveloperAssignment>()
  let offset = 0
  let total = 0

  do {
    const { data, error, count } = await db.from('tarea_desarrollador')
      .select(fields, offset === 0 ? { count: 'exact' } : undefined)
      .eq('desarrollador_id', profileId)
      .order('asignado_en', { ascending: false, nullsFirst: false })
      .order('tarea_id')
      .range(offset, offset + pageSize - 1)
      .abortSignal(signal)
      .overrideTypes<DeveloperAssignment[], { merge: false }>()

    if (error) throw new Error('No fue posible cargar tus tareas asignadas. ' + error.message, { cause: error })
    if (offset === 0) {
      if (count === null) throw new Error('No fue posible confirmar el total de tareas asignadas.')
      total = count
    }
    if (data.length === 0) break
    for (const item of data) assignments.set(item.tarea.id, item)
    offset += data.length
  } while (offset < total)

  return [...assignments.values()]
}
