export const consolidatedBackend = import.meta.env?.VITE_BACKEND_35_6 === 'true'

const transitions = {
  Pendiente: ['En curso'],
  'En curso': ['Bloqueada', 'Completada'],
  Bloqueada: ['En curso'],
  Completada: [],
} as const

export type ExecutionState = keyof typeof transitions

export function taskTransitions(current: string | undefined): readonly ExecutionState[] {
  return current && Object.hasOwn(transitions, current) ? transitions[current as ExecutionState] : []
}

export function canChangeTask(role: string | undefined, active: boolean, assigned: boolean,
  projectState: string | undefined, consolidated = consolidatedBackend) {
  if (!active) return false
  if (!consolidated) return role === 'Administrador'
  return projectState === 'En curso' && (role === 'Administrador' || (role === 'Desarrollador' && assigned))
}

export class ExecutionError extends Error {
  readonly reload: boolean

  constructor(message: string, reload = false, cause?: unknown) {
    super(message, { cause })
    this.reload = reload
  }
}

export function mutationError(error: { code: string; message: string }, status: number) {
  const messages: Record<string, string> = {
    '42501': 'No tienes permiso para realizar este cambio.',
    '23514': 'El cambio incumple una regla del proyecto. ' + error.message,
    '55000': 'Los datos cambiaron. Recarga el detalle antes de volver a intentarlo.',
    P0002: 'El registro ya no está disponible. Recarga el detalle.',
    '40P01': 'Otra operación entró en conflicto. Recarga el detalle antes de reintentar.',
  }
  if (messages[error.code]) return new ExecutionError(messages[error.code],
    ['55000', 'P0002', '40P01'].includes(error.code), error)
  if (status === 0 || status >= 500) {
    return new ExecutionError('No se pudo confirmar el cambio. Recarga el detalle antes de reintentar.', true, error)
  }
  return new ExecutionError('No fue posible guardar el cambio. ' + error.message, false, error)
}

export function confirmedRow(data: unknown, id: string | number): Record<string, unknown> {
  if (Array.isArray(data) && data.length === 1) {
    const row: unknown = data[0]
    if (row && typeof row === 'object' && 'id' in row && row.id === String(id)) {
      return row as Record<string, unknown>
    }
  }
  throw new ExecutionError('Supabase no confirmó el registro solicitado. Recarga el detalle.', true)
}
