import { supabase } from '../../lib/supabase'
import { confirmUpdate } from '../../lib/confirmUpdate'
import { completeDocumentUpload, documentPath, documentScopes, documentStates, DocumentRecoveryRequired, isDocumentUuid, validateDocumentFile } from './documentRules'

export const taskEvidenceEnabled = import.meta.env.VITE_TASK_EVIDENCE === 'true'

interface CatalogLabel { nombre: string }
interface Option extends CatalogLabel { id: string }
interface UserLabel { nombre_completo: string }

export interface ProjectDocument {
  id: string
  proyecto_id: string
  tarea_id?: string | null
  tarea?: CatalogLabel | null
  subido_por?: string
  nombre: string
  descripcion: string | null
  nombre_archivo: string
  ruta_storage: string
  extension: string | null
  tamano_bytes: number | string | null
  creado_en: string | null
  publicado_en: string | null
  publicado_por: string | null
  estado: CatalogLabel | null
  alcance: CatalogLabel | null
  responsable: UserLabel | null
  publicador: UserLabel | null
}

function client() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase
}

const table = () => client().schema('public').from('documentos')
const storage = () => client().storage.from('documentos')
const pageSize = 20

export async function getProjectDocuments(projectId: string, page: number, clientOnly: boolean, signal: AbortSignal) {
  const join = clientOnly ? '!inner' : ''
  const fields = 'id,proyecto_id,nombre,descripcion,nombre_archivo,ruta_storage,extension,tamano_bytes,creado_en,publicado_en,publicado_por,' +
    'estado:estado_documento' + join + '(nombre),alcance:alcance_documento' + join + '(nombre),' +
    'responsable:usuarios!subido_por(nombre_completo),publicador:usuarios!publicado_por(nombre_completo)' +
    (taskEvidenceEnabled ? ',tarea_id,subido_por,tarea:tareas(nombre)' : '')
  let query = table().select(fields).eq('proyecto_id', projectId)
  if (clientOnly) query = query.eq('estado.nombre', 'Publicado').eq('alcance.nombre', 'Cliente')

  const start = page * pageSize
  const { data, error } = await query.order('creado_en', { ascending: false }).order('id')
    .range(start, start + pageSize).abortSignal(signal)
    .overrideTypes<ProjectDocument[], { merge: false }>()

  if (error) throw new Error('No fue posible consultar los documentos. ' + error.message, { cause: error })
  return { documents: data.slice(0, pageSize), hasNext: data.length > pageSize }
}

export async function getDocumentCatalogs(signal: AbortSignal) {
  const db = client().schema('public')
  const [states, scopes] = await Promise.all([
    db.from('estado_documento').select('id,nombre').in('nombre', documentStates).abortSignal(signal)
      .overrideTypes<Option[], { merge: false }>(),
    db.from('alcance_documento').select('id,nombre').in('nombre', documentScopes).abortSignal(signal)
      .overrideTypes<Option[], { merge: false }>(),
  ])
  if (states.error || scopes.error) throw new Error('No fue posible cargar los catálogos de documentos.')
  return { states: states.data ?? [], scopes: scopes.data ?? [] }
}

export function catalogId(options: readonly Option[], name: string) {
  const matches = options.filter(option => option.nombre === name)
  if (matches.length !== 1) throw new Error('Falta un valor único en el catálogo para «' + name + '».')
  return matches[0].id
}

export type DocumentCatalogs = Awaited<ReturnType<typeof getDocumentCatalogs>>

function checkedPath(row: ProjectDocument) {
  const expected = documentPath(row.proyecto_id, row.id)
  if (row.ruta_storage !== expected) throw new Error('La ruta registrada del documento no coincide con el contrato.')
  return expected
}

export async function downloadProjectDocument(row: ProjectDocument) {
  const { data, error } = await storage().download(checkedPath(row))
  if (error) throw new Error('No fue posible acceder al PDF. ' + error.message, { cause: error })
  if (await data.slice(0, 5).text() !== '%PDF-') throw new Error('El archivo almacenado carece de una cabecera PDF válida.')
  return new Blob([data], { type: 'application/pdf' })
}

export async function uploadProjectDocument(input: {
  projectId: string; actorId: string; name: string; description: string; scope: string; file: File; taskId?: string
}, catalogs: DocumentCatalogs) {
  const { projectId, actorId, name, description, scope, file, taskId } = input
  await validateDocumentFile(name, file)
  if (!isDocumentUuid(actorId)) throw new Error('No se pudo identificar el perfil del administrador.')
  if (!documentScopes.some(value => value === scope)) throw new Error('Selecciona un alcance válido.')
  const id = crypto.randomUUID()
  const path = documentPath(projectId, id)
  const draft = catalogId(catalogs.states, 'Borrador')
  const scopeId = catalogId(catalogs.scopes, scope)
  if (taskId) {
    const result = await client().schema('public').rpc('fn_preparar_evidencia_tarea', {
      p_tarea_id: taskId, p_documento_id: id, p_nombre: name, p_descripcion: description,
      p_archivo: file.name, p_bytes: file.size,
    }).retry(false)
    if (result.status === 0 || result.status >= 500 || (!result.error && result.data !== path)) {
      throw new DocumentRecoveryRequired('No se confirmó el borrador ' + id + '. Actualiza el listado.')
    }
    if (result.error) throw new Error(result.error.message, { cause: result.error })
  } else {
    const result = await table().insert({
      id, proyecto_id: projectId, estado_documento_id: draft, alcance_documento_id: scopeId,
      nombre: name.trim(), descripcion: description.trim() || null, nombre_archivo: file.name,
      ruta_storage: path, extension: 'pdf', tamano_bytes: file.size, subido_por: actorId,
      publicado_por: null, publicado_en: null,
    }).select('id,ruta_storage').retry(false).maybeSingle()
      .overrideTypes<{ id: string; ruta_storage: string } | null, { merge: false }>()

    if (result.status === 0 || result.status >= 500 || (!result.error && !result.data)) {
      throw new DocumentRecoveryRequired('No se confirmó el registro del borrador ' + id + '. Verifica el listado antes de reintentar.')
    }
    await confirmUpdate(Promise.resolve(result), id)
    if (result.data?.ruta_storage !== path) {
      throw new DocumentRecoveryRequired('La ruta del borrador ' + id + ' no coincide. Verifica el registro antes de continuar.')
    }

  }

  await completeDocumentUpload(id, {
    async upload() {
      const { data, error } = await storage().upload(path, file, { contentType: 'application/pdf', upsert: false })
      if (!error && data.path === path) return 'saved'
      const status = error && 'status' in error ? Number(error.status) : NaN
      return status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status) ? 'rejected' : 'uncertain'
    },
    async isMissing() {
      const { error } = await storage().info(path)
      return error !== null && 'code' in error && error.code === 'NoSuchKey'
    },
    async removeDraft() {
      if (taskId) return publishTaskEvidence(id, true)
      await confirmUpdate(table().delete().eq('id', id).eq('proyecto_id', projectId)
        .eq('estado_documento_id', draft).eq('ruta_storage', path).eq('subido_por', actorId)
        .select('id').retry(false).maybeSingle().overrideTypes<{ id: string } | null, { merge: false }>(), id)
    },
  })
}

export async function publishTaskEvidence(id: string, discard = false) {
  const { data, error, status } = await client().schema('public').rpc('fn_publicar_evidencia_tarea', {
    p_documento_id: id, p_descartar: discard,
  }).retry(false)
  if (status === 0 || status >= 500 || (!error && data !== id)) {
    throw new DocumentRecoveryRequired('No se confirmó el cambio. Actualiza el listado.')
  }
  if (error) throw new Error(error.message, { cause: error })
}

export async function changePublication(row: ProjectDocument, actorId: string, catalogs: DocumentCatalogs, publish: boolean) {
  if (!isDocumentUuid(actorId)) throw new Error('No se pudo identificar el perfil del administrador.')
  const from = publish ? 'Borrador' : 'Publicado'
  const to = publish ? 'Publicado' : 'Retirado'
  if (row.estado?.nombre !== from) throw new Error('El estado del documento cambió. Actualiza el listado.')
  const previous = catalogId(catalogs.states, from)
  const target = catalogId(catalogs.states, to)
  let query = table().update(publish ? {
    estado_documento_id: target, publicado_por: actorId, publicado_en: new Date().toISOString(),
  } : { estado_documento_id: target }).eq('id', row.id).eq('proyecto_id', row.proyecto_id).eq('estado_documento_id', previous)

  if (publish) {
    const scope = row.alcance?.nombre ?? ''
    if (!documentScopes.some(value => value === scope)) throw new Error('El documento no tiene un alcance válido.')
    const { error } = await storage().info(checkedPath(row))
    if (error) throw new Error('No se pudo verificar el archivo en Storage. ' + error.message, { cause: error })
    query = query.eq('alcance_documento_id', catalogId(catalogs.scopes, scope))
  }

  const result = await query.select('id,estado_documento_id,publicado_por,publicado_en').retry(false).maybeSingle()
    .overrideTypes<{ id: string; estado_documento_id: string; publicado_por: string | null; publicado_en: string | null } | null, { merge: false }>()
  await confirmUpdate(Promise.resolve(result), row.id)
  if (result.data?.estado_documento_id !== target ||
    (publish && (result.data.publicado_por !== actorId || !result.data.publicado_en))) {
    throw new DocumentRecoveryRequired('No se confirmó el estado solicitado. Actualiza el documento antes de reintentar.')
  }
}
