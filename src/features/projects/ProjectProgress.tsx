import ProgressBar from '../dashboard/components/ProgressBar'
import {
  calculateProjectProgress, calculateStageProgress, currentLaPazDay, type ProgressStage,
} from './progressCalculation'

type Progress = ReturnType<typeof calculateProjectProgress>
const decimals = new Intl.NumberFormat('es', { maximumFractionDigits: 2 })

function IndicatorValue({ value, reason, label }: { value: number | null; reason?: string; label: string }) {
  if (value === null) return <><span>No disponible</span>{reason && <small className="progress-reason">{reason}</small>}</>
  return <ProgressBar value={Number(value.toFixed(2))} label={label} />
}

function Indicators({ progress, compact, visibleOnly }: { progress: Progress; compact?: boolean; visibleOnly?: boolean }) {
  const { actual, planned } = progress
  const difference = actual.value === null || planned.value === null ? null
    : Number((actual.value - planned.value).toFixed(2))
  const direction = difference === null ? '' : difference > 0 ? 'Adelantado'
    : difference < 0 ? 'Retrasado' : 'Según planificación'

  return (
    <dl className={compact ? 'progress-compact' : 'project-details'}>
      <div>
        <dt>{visibleOnly ? 'Real de tareas visibles' : 'Avance real'}</dt>
        <dd><IndicatorValue {...actual} label="Avance real" /></dd>
      </div>
      <div>
        <dt>{visibleOnly ? 'Planificado de tareas visibles' : 'Avance planificado'}</dt>
        <dd><IndicatorValue {...planned} label="Avance planificado" /></dd>
      </div>
      <div>
        <dt>{visibleOnly ? 'Desviación de tareas visibles' : 'Desviación'}</dt>
        <dd>{difference === null ? 'No disponible'
          : (difference > 0 ? '+' : '') + decimals.format(difference) + ' pp · ' + direction}</dd>
      </div>
    </dl>
  )
}

export function ProjectProgress({ stages, visibleOnly, compact }: {
  stages: readonly ProgressStage[]; visibleOnly?: boolean; compact?: boolean
}) {
  return <Indicators progress={calculateProjectProgress(stages)} compact={compact} visibleOnly={visibleOnly} />
}

export function StageProgress({ stage, visibleOnly }: { stage: ProgressStage; visibleOnly?: boolean }) {
  return <Indicators progress={calculateStageProgress(stage, currentLaPazDay())} compact visibleOnly={visibleOnly} />
}
