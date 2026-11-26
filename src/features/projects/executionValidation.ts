import {
  calendarDay, currentLaPazDay, calculateProjectProgress, getValidWeights, type ProgressStage, type ScheduledDates,
} from './progressCalculation'

interface ExecutionStage extends ProgressStage, ScheduledDates {
  nombre: string
}

function hasValidSchedule(item: ScheduledDates) {
  const start = calendarDay(item.fecha_inicio)
  const end = calendarDay(item.fecha_fin_estimada)
  return start !== null && end !== null && end >= start
}

function weightIssues(stages: readonly ExecutionStage[]): string[] {
  if (!stages.length) return ['El proyecto necesita al menos una etapa.']

  const issues = []
  if (!getValidWeights(stages)) issues.push('Los pesos de las etapas deben ser válidos y sumar 100 %.')
  for (const stage of stages) {
    if (!stage.tareas.length) issues.push('La etapa «' + stage.nombre + '» necesita al menos una tarea.')
    else if (!getValidWeights(stage.tareas)) {
      issues.push('Los pesos de las tareas de «' + stage.nombre + '» deben ser válidos y sumar 100 %.')
    }
  }
  return issues
}

export function validateProjectStart(project: ScheduledDates, stages: readonly ExecutionStage[]): string[] {
  const issues = weightIssues(stages)
  if (!hasValidSchedule(project)) issues.push('Completa las fechas del proyecto en orden cronológico.')

  for (const stage of stages) {
    if (!hasValidSchedule(stage)) issues.push('Revisa las fechas planificadas de «' + stage.nombre + '».')
    const invalid = stage.tareas.filter(task => !hasValidSchedule(task)).length
    if (invalid > 0) issues.push('Tareas con fechas faltantes o inválidas en «' + stage.nombre + '»: ' + invalid + '.')
  }
  return issues
}

export function validateActualFinish(startDate: string | null, endDate: string, today = currentLaPazDay()): string | null {
  const start = calendarDay(startDate)
  const end = calendarDay(endDate)
  if (start === null || end === null || end < start) {
    return 'La fecha real debe ser válida e igual o posterior al inicio.'
  }
  if (end > today) return 'La fecha real no puede ser posterior a hoy en La Paz.'
  return null
}

export function validateProjectFinish(stages: readonly ExecutionStage[]): string[] {
  const issues = weightIssues(stages)
  const pending = stages.flatMap(stage => stage.tareas).filter(task => task.estado?.nombre !== 'Completada').length
  if (pending > 0) issues.push('Quedan ' + pending + ' tareas sin estado confirmado «Completada».')
  const { actual } = calculateProjectProgress(stages)
  if (actual.value === null || Math.abs(actual.value - 100) > 1e-8) {
    issues.push('El avance real debe estar disponible y alcanzar 100 %.')
  }
  return issues
}
