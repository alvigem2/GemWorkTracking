import { calendarDay, currentLaPazDay, type ScheduledDates } from './progressCalculation'

interface ScheduleItem extends ScheduledDates {
  id: string | number
  nombre: string
  fecha_fin_real?: string | null
}

interface ScheduleStage extends ScheduleItem {
  tareas: ScheduleItem[]
}

function displayDate(value: string | null | undefined) {
  if (!value) return '—'
  if (calendarDay(value) === null) return 'Fecha inválida'
  return value.split('-').reverse().join('/')
}

function displayDay(day: number) {
  return displayDate(new Date(day * 86_400_000).toISOString().slice(0, 10))
}

export default function ProjectSchedule({ stages, project }: {
  stages: readonly ScheduleStage[]
  project: ScheduleItem
}) {
  const rows = [{ key: 'project-' + project.id, label: 'Proyecto', item: project }, ...stages.flatMap(stage => [
    { key: 'stage-' + stage.id, label: 'Etapa', item: stage },
    ...stage.tareas.map(task => ({ key: 'task-' + task.id, label: 'Tarea', item: task })),
  ])]
  const today = currentLaPazDay()
  const dates = rows.map(row => row.item)
    .flatMap(item => [calendarDay(item.fecha_inicio), calendarDay(item.fecha_fin_estimada), calendarDay(item.fecha_fin_real ?? null)])
    .filter((day): day is number => day !== null)
  const firstDay = dates.reduce((min, day) => Math.min(min, day), Infinity)
  const lastDay = dates.reduce((max, day) => Math.max(max, day), -Infinity)
  const span = lastDay - firstDay + 1
  const percent = (day: number) => 100 * (day - firstDay) / span
  const todayVisible = today >= firstDay && today <= lastDay
  const todayLabel = displayDay(today)

  return (
    <section className="admin-panel project-schedule" aria-labelledby="project-schedule-title">
      <h2 id="project-schedule-title">Cronograma</h2>
      <p className="schedule-note">Hoy en La Paz: {todayLabel}{dates.length > 0 && !todayVisible ? ' · Fuera del intervalo mostrado' : ''}</p>
      {stages.length === 0 && <p className="schedule-note">Sin etapas ni tareas visibles.</p>}
      <div className="admin-table-scroll" tabIndex={0} role="region" aria-labelledby="project-schedule-title">
        <table className="admin-table schedule-table">
          <thead>
            <tr><th scope="col">Etapa o tarea</th><th scope="col">Inicio</th>
              <th scope="col">Finalización estimada</th><th scope="col">Finalización real</th>
              <th scope="col">Línea de tiempo
                {dates.length > 0 && <span className="schedule-axis"><span>{displayDay(firstDay)}</span><span>{displayDay(lastDay)}</span></span>}
              </th></tr>
          </thead>
          <tbody>
            {rows.map(({ key, label, item }) => {
              const start = calendarDay(item.fecha_inicio)
              const end = calendarDay(item.fecha_fin_estimada)
              return (
                <tr key={key} data-kind={label}>
                  <th scope="row">{label} · {item.nombre}</th>
                  <td>{displayDate(item.fecha_inicio)}</td><td>{displayDate(item.fecha_fin_estimada)}</td>
                  <td>{displayDate(item.fecha_fin_real)}</td>
                  <td>
                    {start !== null && end !== null && end >= start ? (
                      <div className="schedule-track" data-kind={label} aria-hidden="true">
                        <span className="schedule-range" style={{ left: percent(start) + '%', width: 100 * (end - start + 1) / span + '%' }} />
                        {todayVisible && <span className="schedule-today" style={{ left: percent(today + 0.5) + '%' }} />}
                      </div>
                    ) : 'Sin intervalo válido'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
