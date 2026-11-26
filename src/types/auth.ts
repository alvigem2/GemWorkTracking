/**
 * Tipos de autenticación y perfil de usuario.
 * Basados en la estructura de la base de datos Supabase.
 */

export type RolNombre = 'Administrador' | 'Desarrollador' | 'Cliente';

export interface Rol {
  id: number;
  nombre: RolNombre;
}

export type EstadoUsuarioNombre = 'activo' | 'inactivo' | 'bloqueado';

export interface EstadoUsuario {
  id: number;
  nombre: EstadoUsuarioNombre;
}

export interface PerfilUsuario {
  id: string;
  auth_user_id: string;
  nombre_completo: string;
  nombre_usuario: string;
  rol: Rol;
  estado: EstadoUsuario;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface LoginCredentials {
  nombre_usuario: string;
  password: string;
}

export interface LoginResult {
  user: PerfilUsuario;
  session: AuthTokens;
}

export interface AuthState {
  user: PerfilUsuario | null;
  session: AuthTokens | null;
  loading: boolean;
  error: string | null;
}