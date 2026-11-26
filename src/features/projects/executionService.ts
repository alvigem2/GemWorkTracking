import { supabase } from '../../lib/supabase'
import { confirmUpdate } from '../../lib/confirmUpdate'
import { confirmedRow, consolidatedBackend, ExecutionError, mutationError, taskTransitions, type ExecutionState } from './consolidatedContract'
import type { TaskStatus } from './services/projectWorkService'

function db() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase.schema('public')
}

export async function validateBackendWeights(id: string) {
  const { data, error } = await db().rpc('fn_validar_ponderaciones_proyecto', { p_proyecto_id: id })
  if (error) throw new Error(error.message, { cause: error })
  const result = Array.isArray(data) ? data[0] : data
  if (result?.es_valido !== true) throw new Error(result?.mensaje || 'Supabase no confirmó las ponderaciones.')
}

export async function getBackendProgress(kind: 'project' | 'stage', id: string, signal: AbortSignal) {
  const request = kind === 'project'
    ? db().rpc('fn_calcular_avance_proyecto', { p_proyecto_id: id })
    : db().rpc('fn_calcular_avance_etapa', { p_etapa_id: id })
  const { data, error } = await request.abortSignal(signal)
  if (error) throw new Error(error.message, { cause: error })
  if (data === null || data === '' || !Number.isFinite(Number(data))) {
    throw new Error('Supabase no devolvió un avance numérico.')
  }
  return Number(data)
}

export async function transitionProject(id: string, from: string | number, to: string | number, end?: string) {
  const result = await db().from('proyectos')
    .update(end ? { estado_proyecto_id: to, fecha_fin_real: end } : { estado_proyecto_id: to })
    .eq('id', id).eq('estado_proyecto_id', from)
    .select('id,estado_proyecto_id,fecha_fin_real').retry(false).maybeSingle()
    .overrideTypes<{ id: string; estado_proyecto_id: string | number; fecha_fin_real: string | null } | null, { merge: false }>()
  if (result.error) throw mutationError(result.error, result.status)
  if (!result.data) throw new ExecutionError('El proyecto cambió o dejó de estar disponible. Recarga el detalle.', true)
  await confirmUpdate(Promise.resolve(result), id)
  if (String(result.data?.estado_proyecto_id) !== String(to) || (end && result.data?.fecha_fin_real !== end)) {
    throw new Error('Supabase no confirmó el estado o la fecha solicitados. Actualiza el detalle.')
  }
}

export async function transitionTask(id: string | number, fromName: string, toName: string, catalog?: readonly TaskStatus[]) {
  if (!taskTransitions(fromName).includes(toName as ExecutionState)) {
    throw new ExecutionError('La transición de estado no está permitida.')
  }
  if (consolidatedBackend) {
    const { data, error, status } = await db().rpc('fn_cambiar_estado_tarea', {
      p_tarea_id: String(id), p_estado_nombre: toName, p_estado_anterior_nombre: fromName,
    }).retry(false)
    if (error) throw mutationError(error, status)
    const row = confirmedRow(data, id)
    if (row.estado !== toName) throw new ExecutionError('Supabase no confirmó el estado solicitado. Recarga el detalle.', true)
    return
  }

  const from = catalog?.find(state => state.nombre === fromName)?.id
  const to = catalog?.find(state => state.nombre === toName)?.id
  if (from === undefined || to === undefined) throw new ExecutionError('Falta el estado en el catálogo. Recarga el detalle.', true)
  const result = await db().from('tareas').update({ estado_tarea_id: to })
    .eq('id', id).eq('estado_tarea_id', from)
    .select('id,estado_tarea_id').retry(false).maybeSingle()
    .overrideTypes<{ id: string | number; estado_tarea_id: string | number } | null, { merge: false }>()
  if (result.error) throw mutationError(result.error, result.status)
  if (!result.data) throw new ExecutionError('El estado de la tarea cambió o ya no está disponible. Recarga el detalle.', true)
  await confirmUpdate(Promise.resolve(result), id)
  if (String(result.data?.estado_tarea_id) !== String(to)) {
    throw new ExecutionError('Supabase no confirmó el estado solicitado. Recarga el detalle.', true)
  }
}
