import { useEffect, useState } from 'react'

type QueryState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

export function useAdminQuery<T>(query: (signal: AbortSignal) => Promise<T>, version = 0): QueryState<T> {
  const [result, setResult] = useState<{ query: typeof query; version: number; state: QueryState<T> }>()

  useEffect(() => {
    const controller = new AbortController()
    // Evita iniciar la petición durante el montaje de prueba de StrictMode.
    const timer = setTimeout(async () => {
      try {
        const data = await query(controller.signal)
        if (!controller.signal.aborted) setResult({ query, version, state: { status: 'ready', data } })
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : 'No fue posible completar la consulta.'
          setResult({ query, version, state: { status: 'error', message } })
        }
      }
    }, 0)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, version])

  return result?.query === query && result.version === version ? result.state : { status: 'loading' }
}
