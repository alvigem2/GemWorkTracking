import { useCallback, useState } from 'react'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { getBackendProgress } from './executionService'

function Report({ kind, id }: { kind: 'project' | 'stage'; id: string }) {
  const query = useCallback((signal: AbortSignal) => getBackendProgress(kind, id, signal), [kind, id])
  const result = useAdminQuery(query)
  if (result.status === 'loading') return <p role="status">Consultando avance en Supabase…</p>
  if (result.status === 'error') return <p className="admin-error" role="alert">{result.message}</p>
  return <p>Avance según Supabase: {result.data.toLocaleString('es', { maximumFractionDigits: 2 })} %. La validez de las ponderaciones se indica en el cálculo local.</p>
}

export default function BackendProgress({ kind, id, manual }: { kind: 'project' | 'stage'; id: string; manual?: boolean }) {
  const [requested, setRequested] = useState(false)
  if (!manual || requested) return <Report kind={kind} id={id} />
  return <button className="admin-secondary" type="button" onClick={() => setRequested(true)}>Consultar avance de etapa en Supabase</button>
}
