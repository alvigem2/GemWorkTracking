import { supabase } from '../../lib/supabase'

type Id = string | number
type Option = { id: Id; nombre: string }
type Label = Pick<Option, 'nombre'>
type Actor = { nombre_completo: string }
type RelatedTask = Label & { etapa: { proyecto: Label | null } | null }

export interface AuditEvent {
  id: Id
  fecha_evento: string | null
  tabla_afectada: string | null
  registro_afectado_id: Id | null
  tipo: Label | null
  usuario: Actor | null
  antes_inicio: string | null
  despues_inicio: string | null
  antes_fin: string | null
  despues_fin: string | null
  antes_peso: string | null
  despues_peso: string | null
}

export interface ScheduleEvent {
  id: Id
  proyecto_id: Id | null
  etapa_id: Id | null
  tarea_id: Id | null
  campo_modificado: string | null
  fecha_anterior: string | null
  fecha_nueva: string | null
  motivo: string | null
  modificado_en: string | null
  proyecto: Label | null
  etapa: (Label & { proyecto: Label | null }) | null
  tarea: RelatedTask | null
  usuario: Actor | null
}

export interface AuditFilters {
  actor: string
  project: string
  entity: string
  action: string
  from: string
  to: string
}

export const emptyAuditFilters: AuditFilters = { actor: '', project: '', entity: '', action: '', from: '', to: '' }
const pageSize = 20

function db() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase.schema('public')
}

export async function getAuditOptions(signal: AbortSignal) {
  const schema = db()
  const [actors, projects, actions] = await Promise.all([
    schema.from('usuarios').select('id,nombre:nombre_completo').order('nombre_completo')
      .abortSignal(signal).overrideTypes<Option[], { merge: false }>(),
    schema.from('proyectos').select('id,nombre').order('nombre')
      .abortSignal(signal).overrideTypes<Option[], { merge: false }>(),
    schema.from('tipo_evento_bitacora').select('id,nombre').order('nombre')
      .abortSignal(signal).overrideTypes<Option[], { merge: false }>(),
  ])
  const error = actors.error ?? projects.error ?? actions.error
  if (error) throw new Error('No fue posible cargar todos los filtros. ' + error.message, { cause: error })
  return { actors: actors.data ?? [], projects: projects.data ?? [], actions: actions.data ?? [] }
}

const auditFields = `id,fecha_evento,tabla_afectada,registro_afectado_id,tipo:tipo_evento_bitacora(nombre),usuario:usuarios(nombre_completo),
antes_inicio:datos_anteriores->>fecha_inicio,despues_inicio:datos_nuevos->>fecha_inicio,
antes_fin:datos_anteriores->>fecha_fin_estimada,despues_fin:datos_nuevos->>fecha_fin_estimada,
antes_peso:datos_anteriores->>peso_porcentual,despues_peso:datos_nuevos->>peso_porcentual`.replace(/\s/g, '')

export async function getAuditEvents(filters: AuditFilters, page: number, signal: AbortSignal, size = pageSize) {
  let query = db().from('bitacora').select(auditFields)
  if (filters.actor) query = query.eq('usuario_id', filters.actor)
  if (filters.action) query = query.eq('tipo_evento_bitacora_id', filters.action)
  if (filters.entity) query = query.eq('tabla_afectada', filters.entity)
  // La bitácora carece de proyecto_id; este filtro se limita a cambios directos sobre el proyecto.
  if (filters.project) query = query.eq('tabla_afectada', 'proyectos').eq('registro_afectado_id', filters.project)
  if (filters.from) query = query.gte('fecha_evento', filters.from + 'T00:00:00-04:00')
  if (filters.to) query = query.lte('fecha_evento', filters.to + 'T23:59:59.999999-04:00')

  const offset = page * size
  const { data, error } = await query.order('fecha_evento', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false }).range(offset, offset + size).abortSignal(signal)
    .overrideTypes<AuditEvent[], { merge: false }>()

  if (error) throw new Error('No fue posible consultar la bitácora. ' + error.message, { cause: error })
  return { rows: data.slice(0, size), hasNext: data.length > size }
}

export function getRecentAudit(signal: AbortSignal) {
  return getAuditEvents(emptyAuditFilters, 0, signal, 5)
}

const historyFields = 'id,proyecto_id,etapa_id,tarea_id,campo_modificado,fecha_anterior,fecha_nueva,motivo,modificado_en,proyecto:proyectos(nombre),etapa:etapas(nombre,proyecto:proyectos(nombre)),tarea:tareas(nombre,etapa:etapas(proyecto:proyectos(nombre))),usuario:usuarios(nombre_completo)'

export async function getScheduleHistory(filters: AuditFilters, page: number, signal: AbortSignal) {
  const projectId = filters.project
  if (projectId && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(projectId)) {
    throw new Error('El identificador del proyecto no es válido.')
  }

  let query = db().from('historial_cronograma').select(historyFields + (projectId
    ? ',etapa_del_proyecto:etapas(),tarea_del_proyecto:tareas(etapa:etapas!inner())' : ''))

  if (projectId) {
    query = query.eq('etapa_del_proyecto.proyecto_id', projectId)
      .eq('tarea_del_proyecto.etapa.proyecto_id', projectId)
      .or(`proyecto_id.eq.${projectId},etapa_del_proyecto.not.is.null,tarea_del_proyecto.not.is.null`)
  }
  if (filters.actor) query = query.eq('usuario_id', filters.actor)
  if (filters.entity === 'tarea') query = query.not('tarea_id', 'is', null)
  if (filters.entity === 'etapa') query = query.is('tarea_id', null).not('etapa_id', 'is', null)
  if (filters.entity === 'proyecto') query = query.is('tarea_id', null).is('etapa_id', null).not('proyecto_id', 'is', null)
  if (filters.from) query = query.gte('modificado_en', filters.from + 'T00:00:00-04:00')
  if (filters.to) query = query.lte('modificado_en', filters.to + 'T23:59:59.999999-04:00')

  const offset = page * pageSize
  const { data, error } = await query.order('modificado_en', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false }).range(offset, offset + pageSize).abortSignal(signal)
    .overrideTypes<ScheduleEvent[], { merge: false }>()

  if (error) throw new Error('No fue posible consultar el historial. ' + error.message, { cause: error })
  return { rows: data.slice(0, pageSize), hasNext: data.length > pageSize }
}
