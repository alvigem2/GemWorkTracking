import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigError } from '../../../lib/supabase'
import type { AuthState, PerfilUsuario } from '../../../types/auth'
import { AuthServiceError, getCurrentUser, login, logout, ProfileUnavailable } from '../services/authService'
import { AuthContext } from './authContextValue'

function authenticatedState(user: PerfilUsuario | null, session: Session | null): AuthState {
  const matches = user && session && user.auth_user_id === session.user.id
  return {
    user: matches ? user : null,
    session: matches ? {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in ?? 0,
      token_type: session.token_type,
    } : null,
    loading: false,
    error: null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: supabase !== null,
    error: supabase ? null : supabaseConfigError,
  })
  const latestSession = useRef<Session | null>(null)
  const revision = useRef(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const lifecycle = useRef<object | null>(null)

  const enqueue = useCallback(<T,>(run: () => Promise<T>) => {
    const result = queue.current.then(run)
    queue.current = result.catch(() => {})
    return result
  }, [])

  const revalidate = useCallback(async (isCurrent: () => boolean, session: Session | null) => {
    if (!isCurrent()) return null
    try {
      const user = session ? await getCurrentUser() : null
      if (isCurrent()) setState(previous => ({
        ...authenticatedState(user, session),
        error: user ? null : previous.error ?? (session ? 'Tu sesión terminó. Vuelve a iniciar sesión.' : null),
      }))
      return user
    } catch (error) {
      if (!isCurrent()) return null
      const message = error instanceof AuthServiceError ? error.message : 'No fue posible verificar tu perfil.'
      if (error instanceof ProfileUnavailable) {
        setState({ ...authenticatedState(null, null), error: message })
        try {
          await logout()
        } catch {
          // Se mantiene cerrado el acceso de la aplicación al perfil invalidado.
        }
      } else {
        setState(previous => ({ ...previous, loading: false, error: message }))
      }
      return null
    }
  }, [])

  useEffect(() => {
    const currentLifecycle = {}
    lifecycle.current = currentLifecycle
    let timer: ReturnType<typeof setTimeout> | undefined

    if (!supabase) {
      return () => { lifecycle.current = null }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      latestSession.current = session
      setState(previous =>
        previous.user && previous.user.auth_user_id !== session?.user.id
          ? { ...previous, user: null, session: null, loading: session !== null || previous.loading }
          : previous,
      )
      const currentRevision = ++revision.current
      clearTimeout(timer)

      // Las consultas deben empezar después de que Supabase termine el callback.
      timer = setTimeout(() => {
        void enqueue(async () => {
          const isCurrent = () =>
            lifecycle.current === currentLifecycle && revision.current === currentRevision
          await revalidate(isCurrent, session)
        })
      }, 0)
    })

    return () => {
      lifecycle.current = null
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [enqueue, revalidate])

  const runOperation = useCallback(<T,>(
    operation: () => Promise<T>,
    resolveUser: (result: T) => PerfilUsuario | null,
    fallback: string,
  ) => {
    const currentLifecycle = lifecycle.current

    return enqueue(async () => {
      const isMounted = () => currentLifecycle !== null && lifecycle.current === currentLifecycle
      if (isMounted()) setState(previous => ({ ...previous, loading: true, error: null }))
      const startingRevision = revision.current

      try {
        const result = await operation()
        if (isMounted()) setState(authenticatedState(resolveUser(result), latestSession.current))
        return result
      } catch (error) {
        if (isMounted()) {
          setState(previous => ({
            ...(revision.current === startingRevision ? previous : authenticatedState(null, null)),
            loading: false,
            error: error instanceof AuthServiceError ? error.message : fallback,
          }))
        }
        throw error
      }
    })
  }, [enqueue])

  const signIn = useCallback((nombre_usuario: string, password: string) =>
    runOperation(
      () => login({ nombre_usuario, password }),
      user => user,
      'No fue posible iniciar sesión.',
    ), [runOperation])

  const signOut = useCallback(() =>
    runOperation(logout, () => null, 'No fue posible cerrar la sesión.'), [runOperation])

  const refreshUser = useCallback(() => {
    const currentLifecycle = lifecycle.current
    const currentRevision = revision.current
    const session = latestSession.current
    if (!session || !currentLifecycle) return Promise.resolve(null)
    return enqueue(() => revalidate(
      () => lifecycle.current === currentLifecycle && revision.current === currentRevision,
      session,
    ))
  }, [enqueue, revalidate])

  useEffect(() => {
    const onFocus = () => { void refreshUser() }
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onFocus)
    }
  }, [refreshUser])

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
