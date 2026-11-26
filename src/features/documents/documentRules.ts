export const pdfLimit = 20971520
export const documentStates = ['Borrador', 'Publicado', 'Retirado'] as const
export const documentScopes = ['Interno', 'Cliente'] as const
export function isDocumentUuid(value: string) {
  return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)
}

export function documentPath(projectId: string, documentId: string) {
  if (!isDocumentUuid(projectId) || !isDocumentUuid(documentId)) throw new Error('Identificador de documento o proyecto inválido.')
  return projectId + '/' + documentId + '.pdf'
}

export async function validateDocumentFile(name: string, file: File) {
  if (!name.trim() || [...name.trim()].length > 180) throw new Error('Introduce un nombre de hasta 180 caracteres.')
  if (!file.name || [...file.name].length > 255) throw new Error('El nombre original admite hasta 255 caracteres.')
  if (!/\.pdf$/i.test(file.name) || file.type !== 'application/pdf') throw new Error('Selecciona un PDF con tipo application/pdf.')
  if (file.size <= 0 || file.size > pdfLimit) throw new Error('El archivo debe tener contenido y pesar como máximo 20 MiB.')
  if (await file.slice(0, 5).text() !== '%PDF-') throw new Error('El archivo carece de la cabecera básica de un PDF.')
}

export function documentActions(admin: boolean, status?: string) {
  return { publish: admin && status === 'Borrador', withdraw: admin && status === 'Publicado' }
}

export class DocumentRecoveryRequired extends Error {}

type UploadOutcome = 'saved' | 'rejected' | 'uncertain'

export async function completeDocumentUpload(id: string, operations: {
  upload: () => Promise<UploadOutcome>
  isMissing: () => Promise<boolean>
  removeDraft: () => Promise<void>
}) {
  let removed = false
  try {
    const outcome = await operations.upload()
    if (outcome === 'saved') return
    if (outcome === 'rejected' && await operations.isMissing()) {
      await operations.removeDraft()
      removed = true
    }
  } catch {
    // Si falta confirmación, se conserva la referencia para recuperación.
  }
  if (removed) throw new Error('Storage rechazó la carga. Se retiró el borrador recién creado.')
  throw new DocumentRecoveryRequired('No se pudo confirmar la carga o la limpieza. Revisa el documento ' + id + ' antes de volver a intentar.')
}
