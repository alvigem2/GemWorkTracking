import { supabase } from '../../../lib/supabase'
import { calendarDay } from '../progressCalculation'
import { confirmedRow, consolidatedBackend, ExecutionError, mutationError } from '../consolidatedContract'

export type ScheduleEntity = 'proyectos' | 'etapas' | 'tareas'

export interface ScheduleChange {
  entity: ScheduleEntity
  id: string | number
  expectedStart: string | null
  expectedEnd: string | null
  start: string
  end: string
  reason: string
}

export function prepareSchedule(change: ScheduleChange) {
  const { entity, id, expectedStart, expectedEnd, start, end, reason } = change
  if (!reason.trim()) throw new ExecutionError('Introduce el motivo del cambio.')
  if (!expectedStart || !expectedEnd || calendarDay(expectedStart) === null || calendarDay(expectedEnd) === null) {
    throw new ExecutionError('Las fechas actuales no están disponibles o son inválidas. Recarga el detalle.', true)
  }
  if (calendarDay(start) === null || calendarDay(end) === null || end < start) {
    throw new ExecutionError('Introduce fechas válidas. La fecha estimada debe ser igual o posterior al inicio.')
  }
  const changes = Number(start !== expectedStart) + Number(end !== expectedEnd)
  if (!changes) throw new ExecutionError('Cambia al menos una fecha del cronograma.')
  return {
    changes,
    payload: {
      p_entidad: entity, p_registro_id: String(id),
      p_inicio_esperado: expectedStart, p_fin_esperado: expectedEnd,
      p_inicio_nuevo: start, p_fin_nuevo: end, p_motivo: reason.trim(),
    },
  }
}

export async function modifySchedule(change: ScheduleChange) {
  if (!consolidatedBackend) throw new ExecutionError('La modificación con historial todavía no está habilitada.')
  const { changes, payload } = prepareSchedule(change)
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  const { data, error, status } = await supabase.schema('public')
    .rpc('fn_modificar_cronograma', payload).retry(false)
  if (error) throw mutationError(error, status)
  const row = confirmedRow(data, change.id)
  if (row.fecha_inicio !== change.start || row.fecha_fin_estimada !== change.end || row.cambios !== changes) {
    throw new ExecutionError('Supabase no confirmó las fechas solicitadas. Recarga el detalle.', true)
  }
}
