export interface ScheduledDates {
  fecha_inicio: string | null
  fecha_fin_estimada: string | null
}

interface WeightedItem {
  peso_porcentual: number | string | null
}

interface WeightedTask extends WeightedItem, ScheduledDates {
  estado: { nombre: string } | null
}

export interface ProgressStage extends WeightedItem {
  tareas: WeightedTask[]
}

const taskFields = 'peso_porcentual,fecha_inicio,fecha_fin_estimada,estado:estado_tarea(nombre)'
export const projectProgressFields = 'etapas(peso_porcentual,tareas(' + taskFields + '))'

const dayMs = 86_400_000
const lapaz = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function calendarDay(date: string | null): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-')) return null
  const parsed = new Date(date + 'T00:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? parsed.getTime() / dayMs : null
}

export function currentLaPazDay(now = new Date()): number {
  const parts = Object.fromEntries(lapaz.formatToParts(now).map(part => [part.type, part.value]))
  return Date.parse(parts.year + '-' + parts.month + '-' + parts.day + 'T00:00:00Z') / dayMs
}

export function plannedTaskProgress(dates: ScheduledDates, today: number): number | null {
  const start = calendarDay(dates.fecha_inicio)
  const end = calendarDay(dates.fecha_fin_estimada)

  if (start === null || end === null || end < start) return null
  if (today < start) return 0
  if (today >= end) return 100
  return 100 * (today - start) / (end - start)
}

interface Indicator {
  value: number | null
  reason?: string
}

function unavailable(reason: string): Indicator {
  return { value: null, reason }
}

export function isValidWeight(weight: number) {
  return Number.isFinite(weight) && weight >= 0.01 && weight <= 100 &&
    Math.abs(weight * 100 - Math.round(weight * 100)) < 1e-8
}

export function getValidWeights(items: readonly WeightedItem[]): number[] | null {
  if (items.length === 0) return null

  const weights = items.map(item => {
    const value = item.peso_porcentual
    return value === null || (typeof value === 'string' && value.trim() === '') ? NaN : Number(value)
  })
  if (weights.some(weight => !isValidWeight(weight))) return null
  return Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) < 1e-8 ? weights : null
}

export function calculateStageProgress(stage: ProgressStage, today: number) {
  const weights = getValidWeights(stage.tareas)
  if (!weights) {
    const reason = stage.tareas.length
      ? 'Los pesos de las tareas deben ser válidos y sumar 100 %.': 'La etapa no tiene tareas visibles.'
    return { actual: unavailable(reason), planned: unavailable(reason) }
  }

  let actual = 0
  let planned = 0
  let missingStatus = false
  let invalidDates = false

  stage.tareas.forEach((task, index) => {
    const weight = weights[index]
    if (!task.estado?.nombre) missingStatus = true
    if (task.estado?.nombre === 'Completada') actual += weight

    const expected = plannedTaskProgress(task, today)
    if (expected === null) invalidDates = true
    else planned += weight * expected / 100
  })

  return {
    actual: missingStatus ? unavailable('Falta el estado de una tarea ponderada.') : { value: Math.min(100, actual) },
    planned: invalidDates ? unavailable('Una tarea ponderada tiene fechas faltantes o inválidas.') : { value: Math.min(100, planned) },
  }
}

function aggregateStages(indicators: Indicator[], weights: number[]): Indicator {
  let total = 0
  for (const [index, indicator] of indicators.entries()) {
    if (indicator.value === null) {
      return unavailable('Etapa ' + (index + 1) + ': ' + indicator.reason)
    }
    total += weights[index] * indicator.value / 100
  }
  return { value: Math.min(100, total) }
}

export function calculateProjectProgress(stages: readonly ProgressStage[], today = currentLaPazDay()) {
  const weights = getValidWeights(stages)
  if (!weights) {
    const reason = stages.length
      ? 'Los pesos de las etapas deben ser válidos y sumar 100 %.': 'El proyecto no tiene etapas visibles.'
    return { actual: unavailable(reason), planned: unavailable(reason) }
  }

  const results = stages.map(stage => calculateStageProgress(stage, today))
  const actual = aggregateStages(results.map(stage => stage.actual), weights)
  return {
    actual: actual.value === null ? actual : { value: Math.round((actual.value + 1e-10) * 100) / 100 },
    planned: aggregateStages(results.map(stage => stage.planned), weights),
  }
}
