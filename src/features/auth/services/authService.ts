import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase, supabaseConfigError } from '../../../lib/supabase'
import type {
  LoginCredentials,
  PerfilUsuario,
} from '../../../types/auth'

/**
 * Forma que devuelve la Edge Function gemwork-login-ts.
 * El backend envía los tokens de Sesión de Supabase Auth.
 */
interface GemworkLoginResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

/** Mensajes técnicos del backend que no deben exponerse al usuario final. */
const CREDENTIALS_ERRORS = ['invalid', 'credential', 'password', 'user']

export class AuthServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthServiceError'
  }
}

export class ProfileUnavailable extends AuthServiceError {}

export function isDefinitiveSessionError(error: { status?: number; code?: string; name?: string }) {
  return error.name === 'AuthSessionMissingError' || error.code === 'session_not_found' ||
    error.code === 'user_not_found' || error.code === 'user_banned' ||
    error.code === 'refresh_token_not_found' || error.code === 'refresh_token_already_used' ||
    error.status === 401
}

function requireSupabase() {
  if (!supabase) throw new AuthServiceError(supabaseConfigError)
  return supabase
}

/**
 * Consulta el perfil en public.usuarios incluyendo rol y estado.
 * Devuelve null cuando no existe un perfil asociado a la cuenta de auth.
 */
async function fetchPerfil(authUserId: string): Promise<PerfilUsuario | null> {
  const { data, error } = await requireSupabase()
    .schema('public')
    .from('usuarios')
    .select(
      `id,
       auth_user_id,
       nombre_completo,
       nombre_usuario,
       rol:roles ( id, nombre ),
       estado:estado_usuario ( id, nombre )`,
    )
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) {
    // No registrar el error completo: podría contener datos técnicos internos.
    throw new AuthServiceError(
      'No fue posible cargar tu perfil. Inténtalo nuevamente.',
    )
  }

  if (!data) {
    return null
  }

  return {
    id: data.id as string,
    auth_user_id: data.auth_user_id as string,
    nombre_completo: data.nombre_completo as string,
    nombre_usuario: data.nombre_usuario as string,
    rol: data.rol as unknown as PerfilUsuario['rol'],
    estado: data.estado as unknown as PerfilUsuario['estado'],
  }
}

function isUsuarioActivo(estado: PerfilUsuario['estado']): boolean {
  const nombre = estado?.nombre?.trim().toLowerCase() ?? ''
  return nombre === 'activo'
}

function validatePerfil(perfil: PerfilUsuario | null): PerfilUsuario {
  if (!perfil || !perfil.rol?.nombre) {
    throw new ProfileUnavailable(
      'Tu cuenta no está habilitada. Contacta al administrador.',
    )
  }
  if (!isUsuarioActivo(perfil.estado)) {
    throw new ProfileUnavailable(
      'Tu cuenta está inactiva. Contacta al administrador.',
    )
  }
  return perfil
}

function mapFunctionError(message: unknown): string {
  const normalized = typeof message === 'string' ? message.toLowerCase() : ''
  if (CREDENTIALS_ERRORS.some((token) => normalized.includes(token))) {
    return 'Usuario o contraseña incorrectos.'
  }
  return 'No fue posible iniciar sesión. Inténtalo nuevamente.'
}

/**
 * Inicia sesión con nombre de usuario y contraseña.
 *
 * 1. Invoca la Edge Function gemwork-login-ts.
 * 2. Establece la sesión en Supabase con los tokens recibidos.
 * 3. Carga el perfil (con rol y estado) desde public.usuarios.
 * 4. Rechaza perfiles inexistentes o inactivos.
 */
export async function login({
  nombre_usuario,
  password,
}: LoginCredentials): Promise<PerfilUsuario> {
  const supabase = requireSupabase()
  const { data, error: fnError } = await supabase.functions.invoke<
    GemworkLoginResponse | { message?: string; error?: string }
  >('gemwork-login-ts', {
    body: { nombre_usuario: nombre_usuario.trim().toLowerCase(), password },
  })

  if (fnError) {
    const status = fnError instanceof FunctionsHttpError ? fnError.context.status : undefined
    throw new AuthServiceError(
      status === 401 ? 'Usuario o contraseña incorrectos.' : mapFunctionError(fnError.message),
    )
  }

  const payload = data as Partial<GemworkLoginResponse> | null
  if (
    typeof payload?.access_token !== 'string' || !payload.access_token ||
    typeof payload.refresh_token !== 'string' || !payload.refresh_token
  ) {
    const backendMessage =
      (data as { message?: string; error?: string } | null)?.message ??
      (data as { message?: string; error?: string } | null)?.error
    throw new AuthServiceError(mapFunctionError(backendMessage))
  }

  const { data: authData, error: sessionError } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  })

  if (sessionError || !authData.session || !authData.user) {
    throw new AuthServiceError(
      'La sesión no pudo establecerse. Vuelve a iniciar sesión.',
    )
  }

  try {
    const perfil = await fetchPerfil(authData.user.id)
    return validatePerfil(perfil)
  } catch (error) {
    if (error instanceof ProfileUnavailable) await logout()
    throw error
  }
}

/** Cierra la sesión actual en Supabase Auth. */
export async function logout(): Promise<void> {
  const { error } = await requireSupabase().auth.signOut({ scope: 'local' })
  if (error) {
    throw new AuthServiceError(
      'No fue posible cerrar la sesión. Inténtalo nuevamente.',
    )
  }
}

/**
 * Devuelve el perfil del usuario autenticado o null si no hay sesión.
 * No lanza errores de "no autenticado": solo devuelve null.
 */
export async function getCurrentUser(): Promise<PerfilUsuario | null> {
  const supabase = requireSupabase()
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()

  if (sessionError) {
    if (isDefinitiveSessionError(sessionError)) return null
    throw new AuthServiceError('No fue posible verificar la sesión. Comprueba tu conexión.')
  }
  if (!sessionData.session) return null

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) {
    if (isDefinitiveSessionError(authError)) return null
    throw new AuthServiceError('No fue posible verificar la sesión. Comprueba tu conexión.')
  }
  if (!authData.user) return null

  const perfil = await fetchPerfil(authData.user.id)
  return validatePerfil(perfil)
}
