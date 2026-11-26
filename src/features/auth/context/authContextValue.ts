import { createContext } from 'react'
import type { AuthState, PerfilUsuario } from '../../../types/auth'

interface AuthContextValue extends AuthState {
  signIn: (nombre_usuario: string, password: string) => Promise<PerfilUsuario>
  signOut: () => Promise<void>
  refreshUser: () => Promise<PerfilUsuario | null>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
