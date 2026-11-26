import type { ComponentProps } from 'react'
import type StatusBadge from './StatusBadge'

export function statusTone(name: string): ComponentProps<typeof StatusBadge>['tone'] {
  switch (name.trim().toLowerCase()) {
    case 'activo':
    case 'terminado':
    case 'completada': return 'success'
    case 'en curso': return 'warning'
    case 'inactivo':
    case 'bloqueada':
    case 'bloqueado': return 'error'
    default: return 'neutral'
  }
}
