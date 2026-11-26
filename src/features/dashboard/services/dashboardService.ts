import { supabase } from '../../../lib/supabase'
import { projectProgressFields, type ProgressStage } from '../../projects/progressCalculation'

const statusNames = ['Iniciado', 'En curso', 'Terminado'] as const
export type ProjectStatusName = (typeof statusNames)[number]
export type ProjectStatusCounts = Record<ProjectStatusName, number>

type ProjectStatus = { id: string | number; nombre: string }

export interface RecentProject {
  id: string | number
  nombre: string
  cliente: { nombre: string } | null
  estado: { nombre: string } | null
  fecha_fin_estimada: string | null
  etapas: ProgressStage[]
}

function publicSchema() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase.schema('public')
}

export async function countProjects(signal: AbortSignal): Promise<number> {
  const { count, error } = await publicSchema()
    .from('proyectos')
    .select('*', { count: 'exact', head: true })
    .abortSignal(signal)

  if (error || count === null) throw new Error('No fue posible contar los proyectos.', { cause: error })
  return count
}

export async function countProjectsByStatus(signal: AbortSignal): Promise<ProjectStatusCounts> {
  const db = publicSchema()
  const { data, error } = await db
    .from('estado_proyecto')
    .select('id, nombre')
    .in('nombre', statusNames)
    .abortSignal(signal)
    .overrideTypes<ProjectStatus[], { merge: false }>()

  if (error) throw new Error('No fue posible consultar el catálogo de estados.', { cause: error })

  const counts = await Promise.all(statusNames.map(async nombre => {
    const ids = data.filter(status => status.nombre === nombre).map(status => status.id)
    if (ids.length === 0) throw new Error('El estado «' + nombre + '» no está disponible.')

    const { count, error } = await db
      .from('proyectos')
      .select('*', { count: 'exact', head: true })
      .in('estado_proyecto_id', ids)
      .abortSignal(signal)

    if (error || count === null) {
      throw new Error('No fue posible contar los proyectos del estado «' + nombre + '».', { cause: error })
    }
    return count
  }))

  const [iniciado, enCurso, terminado] = counts
  return { Iniciado: iniciado, 'En curso': enCurso, Terminado: terminado }
}

export async function getRecentProjects(signal: AbortSignal): Promise<RecentProject[]> {
  const { data, error } = await publicSchema()
    .from('proyectos')
    .select('id, nombre, cliente:clientes!cliente_id(nombre), estado:estado_proyecto!estado_proyecto_id(nombre), fecha_fin_estimada,' + projectProgressFields)
    .order('creado_en', { ascending: false, nullsFirst: false })
    .order('id')
    .limit(5)
    .abortSignal(signal)
    .overrideTypes<RecentProject[], { merge: false }>()

  if (error) {
    if (error.code === 'PGRST200' || error.code === 'PGRST201') {
      throw new Error([error.code, error.message, error.details, error.hint].filter(Boolean).join(' '), { cause: error })
    }
    throw new Error('No fue posible cargar los proyectos recientes.', { cause: error })
  }

  return data
}
