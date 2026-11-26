import type { RolNombre } from '../../../types/auth'

export const roleRoutes = {
  Administrador: '/admin',
  Desarrollador: '/desarrollador',
  Cliente: '/cliente',
} satisfies Record<RolNombre, string>

export function routeForRole(role: RolNombre | undefined): string | null {
  return role && Object.hasOwn(roleRoutes, role) ? roleRoutes[role] : null
}
