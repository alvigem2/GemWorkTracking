import { FileText, FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useAdminQuery } from '../../hooks/useAdminQuery'
import { useLocation } from 'react-router-dom'
import { UpdateUnconfirmed } from '../../lib/confirmUpdate'
import { useAuth } from '../auth/hooks/useAuth'
import DataTable from '../dashboard/components/DataTable'
import EmptyState from '../dashboard/components/EmptyState'
import LoadingState from '../dashboard/components/LoadingState'
import StatusBadge from '../dashboard/components/StatusBadge'
import { documentActions, DocumentRecoveryRequired, pdfLimit } from './documentRules'
import {
  changePublication, downloadProjectDocument, getDocumentCatalogs, getProjectDocuments,
  uploadProjectDocument, publishTaskEvidence, taskEvidenceEnabled, type ProjectDocument,
} from './documentsService'

const date = new Intl.DateTimeFormat('es', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/La_Paz',
})
const number = new Intl.NumberFormat('es', { maximumFractionDigits: 1 })

function formatDate(value: string | null) {
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? date.format(timestamp) : '—'
}

function size(value: ProjectDocument['tamano_bytes']) {
  if (value === null || value === '') return '—'
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  return bytes >= 1048576 ? number.format(bytes / 1048576) + ' MiB'
    : bytes >= 1024 ? number.format(bytes / 1024) + ' KiB' : number.format(bytes) + ' B'
}

const columns = [
  { id: 'name', label: 'Documento', render: (row: ProjectDocument) =>
    <div className="document-description">
      <span className="admin-document-name"><FileText size={17} aria-hidden="true" />{row.nombre}</span>
      <p>{row.nombre_archivo}</p>{row.descripcion && <p>{row.descripcion}</p>}
    </div> },
  { id: 'size', label: 'Tamaño', render: (row: ProjectDocument) => size(row.tamano_bytes) },
  { id: 'status', label: 'Estado', render: (row: ProjectDocument) => row.estado
    ? <StatusBadge tone={row.estado.nombre === 'Publicado' ? 'success' : 'neutral'}>{row.estado.nombre}</StatusBadge> : '—' },
  { id: 'scope', label: 'Alcance', render: (row: ProjectDocument) => row.alcance
    ? <StatusBadge>{row.alcance.nombre}</StatusBadge> : '—' },
  { id: 'uploaded', label: 'Carga', render: (row: ProjectDocument) =>
    <>{formatDate(row.creado_en)}<p>{row.responsable?.nombre_completo ?? '—'}</p></> },
  { id: 'published', label: 'Publicación', render: (row: ProjectDocument) =>
    <>{formatDate(row.publicado_en)}<p>{row.publicador?.nombre_completo ?? '—'}</p></> },
]

function PdfViewer({ blob, name, onClose }: { blob: Blob; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const title = useId()
  useEffect(() => {
    const url = URL.createObjectURL(blob)
    if (frame.current) frame.current.src = url
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return (
    <dialog ref={dialog} className="document-preview-dialog" aria-labelledby={title} onClose={onClose}>
      <form method="dialog" className="admin-heading-actions">
        <strong id={title}>{name}</strong><button className="admin-secondary">Cerrar</button>
      </form>
      <iframe ref={frame} title={'Vista previa de ' + name} />
    </dialog>
  )
}

type Run = (operation: () => Promise<void>, success?: string) => Promise<void>

function UploadDocument({ projectId, actorId, taskId, run, disabled }: {
  projectId: string; actorId: string; taskId?: string; run: Run; disabled: boolean
}) {
  const catalogs = useAdminQuery(getDocumentCatalogs)
  const [file, setFile] = useState<File | null>(null)
  const draftAvailable = catalogs.status === 'ready' &&
    catalogs.data.states.filter(item => item.nombre === 'Borrador').length === 1

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || !draftAvailable || catalogs.status !== 'ready') return
    const form = event.currentTarget
    const data = new FormData(form)
    const input = { projectId, actorId, taskId, file, name: String(data.get('name') ?? ''),
      description: String(data.get('description') ?? ''), scope: taskId ? 'Cliente' : String(data.get('scope') ?? '') }
    const options = catalogs.data
    void run(async () => {
      await uploadProjectDocument(input, options)
      form.reset()
      setFile(null)
    }, taskId ? 'Evidencia subida. Usa Publicar para compartirla con el cliente.' : 'Documento subido como borrador.')
  }

  return (
    <details className="project-work-form admin-documents-note">
      <summary>{taskId ? 'Subir evidencia de esta tarea' : 'Subir documento'}</summary>
      <form className="admin-record-form" onSubmit={submit}>
        <fieldset disabled={disabled}>
          <label>Nombre<input name="name" maxLength={180} required /></label>
          {!taskId && <label>Alcance<select name="scope" defaultValue="" required>
            <option value="">Selecciona un alcance</option>
            {catalogs.status === 'ready' && catalogs.data.scopes.map(scope =>
              <option key={scope.id} value={scope.nombre}>{scope.nombre}</option>)}
          </select></label>}
          <label className="admin-field-wide">Descripción (opcional)<textarea name="description" rows={2} /></label>
          <label className="admin-field-wide">Archivo PDF<input type="file" accept="application/pdf,.pdf" required
            onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
          <p className="admin-field-wide">PDF de hasta {size(pdfLimit)}. {file && <>{file.name} · {size(file.size)}</>}</p>
          <div><button className="admin-primary" disabled={!file || !draftAvailable}>Subir PDF</button></div>
        </fieldset>
        {catalogs.status === 'loading' && <LoadingState message="Cargando alcances…" />}
        {catalogs.status === 'error' && <p className="admin-error" role="alert">{catalogs.message}</p>}
      </form>
    </details>
  )
}

function PublicationActions({ row, actorId, run, disabled, evidence }: {
  row: ProjectDocument; actorId: string; run: Run; disabled: boolean; evidence?: boolean
}) {
  const actions = documentActions(true, row.estado?.nombre)
  const canWithdraw = !evidence && actions.withdraw
  if (!actions.publish && !canWithdraw) return null

  function submit(publish: boolean) {
    const message = publish
      ? row.alcance?.nombre === 'Cliente'
        ? '¿Publicar este documento? Será visible para los clientes autorizados del proyecto.'
        : '¿Publicar este documento de alcance interno?'
      : '¿Retirar la publicación? El PDF y el registro se conservarán.'
    if (!window.confirm(message)) return
    void run(async () => {
      if (evidence) return publishTaskEvidence(row.id)
      const catalogs = await getDocumentCatalogs(new AbortController().signal)
      await changePublication(row, actorId, catalogs, publish)
    }, publish ? 'Documento publicado.' : 'Publicación retirada.')
  }

  return <>
    {actions.publish && <button type="button" className="admin-primary" disabled={disabled} onClick={() => submit(true)}>Publicar</button>}
    {canWithdraw && <button type="button" className="admin-danger" disabled={disabled} onClick={() => submit(false)}>Retirar publicación</button>}
  </>
}

export default function ProjectDocuments({ projectId, management = false, taskId }: {
  projectId: string; management?: boolean; taskId?: string
}) {
  const { user } = useAuth()
  const admin = management && user?.rol.nombre === 'Administrador' && user.estado.nombre.trim().toLowerCase() === 'activo'
  const evidence = taskEvidenceEnabled && !!taskId && user?.rol.nombre === 'Desarrollador' && user.estado.nombre.trim().toLowerCase() === 'activo'
  const clientOnly = user?.rol.nombre === 'Cliente'
  const headingId = useId()
  const section = useRef<HTMLElement>(null)
  const { hash } = useLocation()
  useEffect(() => {
    if (hash !== '#documentos') return
    section.current?.scrollIntoView({ block: 'start' })
    section.current?.focus({ preventScroll: true })
  }, [hash, projectId])
  const [page, setPage] = useState(0)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<{ blob: Blob; name: string } | null>(null)
  const lock = useRef(false)
  const query = useCallback((signal: AbortSignal) => getProjectDocuments(projectId, page, clientOnly, signal), [projectId, page, clientOnly])
  const result = useAdminQuery(query, version)
  const hasNext = result.status === 'ready' && result.data.hasNext

  async function run(operation: () => Promise<void>, success?: string) {
    if (lock.current || (uncertain && success)) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await operation()
      if (success) {
        setPage(0)
        setVersion(current => current + 1)
        setNotice(success)
      }
    } catch (failure) {
      if (failure instanceof DocumentRecoveryRequired || failure instanceof UpdateUnconfirmed) setUncertain(true)
      setError(failure instanceof Error ? failure.message : 'No fue posible completar la operación.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function open(row: ProjectDocument, view: boolean) {
    void run(async () => {
      const blob = await downloadProjectDocument(row)
      if (view) {
        setPreview({ blob, name: row.nombre_archivo })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = row.nombre_archivo
        document.body.append(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    })
  }

  const actions = {
    id: 'actions', label: 'Acciones', render: (row: ProjectDocument): ReactNode => (
      <div className="admin-edit-actions">
        <button className="admin-secondary" type="button" disabled={busy} onClick={() => open(row, true)}>Visualizar</button>
        <button className="admin-secondary" type="button" disabled={busy} onClick={() => open(row, false)}>Descargar</button>
        {(admin || (evidence && row.tarea_id === taskId && row.subido_por === user.id)) &&
          <PublicationActions row={row} actorId={user.id} run={run} disabled={busy || uncertain} evidence={!admin} />}
      </div>
    ),
  }

  return (
    <section ref={section} id="documentos" tabIndex={-1} className="admin-panel admin-documents" aria-labelledby={headingId}>
      <h2 id={headingId}>Documentos</h2>
      {(admin || evidence) && <UploadDocument projectId={projectId} actorId={user.id}
        taskId={evidence ? taskId : undefined} run={run} disabled={busy || uncertain} />}
      {busy && <LoadingState message="Procesando documento…" />}
      {notice && <p className="admin-success admin-documents-note" role="status">{notice}</p>}
      {error && <p className="admin-error admin-table-error" role="alert">{error}</p>}
      {uncertain && <button type="button" className="admin-secondary admin-table-error" disabled={busy}
        onClick={() => {
          setVersion(current => current + 1)
          setUncertain(false)
        }}>Actualizar listado para verificar</button>}
      <DataTable labelledBy={headingId} columns={[...columns, ...(taskEvidenceEnabled ? [{ id: 'task', label: 'Tarea', render: (row: ProjectDocument) => row.tarea?.nombre ?? '—' }] : []), actions]}
        rows={result.status === 'ready' ? result.data.documents : []}
        loading={result.status === 'loading'} getRowKey={row => row.id}
        empty={result.status === 'error'
          ? <p className="admin-error admin-table-error" role="alert">{result.message}</p>
          : <EmptyState icon={FolderOpen} title="Sin documentos visibles"
              description="Aquí aparecen los documentos disponibles para tu cuenta." />} />
      {(page > 0 || hasNext) && (
        <nav className="admin-pagination" aria-label="Paginación de documentos">
          <button type="button" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page + 1}</span>
          <button type="button" disabled={busy || !hasNext} onClick={() => setPage(page + 1)}>Siguiente</button>
        </nav>
      )}
      {preview && <PdfViewer {...preview} onClose={() => setPreview(null)} />}
    </section>
  )
}
