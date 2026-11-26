import { supabase } from '../../lib/supabase'
import type { PerfilUsuario, RolNombre } from '../../types/auth'
import { roleRoutes } from '../auth/routes/roleRoutes'
import { projectDetailsPath } from '../projects/projectRoutes'
import { getDeveloperAssignments } from '../tasks/services/developerTasksService'
import type { Notification } from './notificationsService'

export function notificationPath(role: RolNombre) {
  return roleRoutes[role] + '/notificaciones'
}

type Related = Pick<Notification, 'proyecto_id' | 'tarea_id' | 'documento_id'>

export function hasNotificationDestination(item: Related) {
  return item.proyecto_id !== null || item.tarea_id !== null || item.documento_id !== null
}

export async function resolveNotificationDestination(user: PerfilUsuario, item: Related, signal: AbortSignal) {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  const db = supabase.schema('public')
  const role = user.rol.nombre
  const unavailable = () => new Error('El elemento relacionado ya no está disponible para tu cuenta.')
  let projectId = item.proyecto_id

  if (item.documento_id !== null) {
    const join = role === 'Cliente' ? ',estado:estado_documento!inner(nombre),alcance:alcance_documento!inner(nombre)' : ''
    let query = db.from('documentos').select('proyecto_id' + join).eq('id', item.documento_id)
    if (role === 'Cliente') query = query.eq('estado.nombre', 'Publicado').eq('alcance.nombre', 'Cliente')
    const { data, error } = await query.abortSignal(signal).maybeSingle()
      .overrideTypes<{ proyecto_id: string } | null, { merge: false }>()
    if (error || !data) throw unavailable()
    projectId = data.proyecto_id
  }

  if (role === 'Desarrollador') {
    const assignments = await getDeveloperAssignments(user.id, signal)
    const assignment = assignments.find(({ tarea }) => item.documento_id === null && item.tarea_id !== null
      ? String(tarea.id) === String(item.tarea_id)
      : projectId !== null && String(tarea.etapa?.proyecto?.id) === String(projectId))
    if (!assignment) throw unavailable()
    return roleRoutes.Desarrollador + '/tareas/' + encodeURIComponent(assignment.tarea.id) +
      (item.documento_id !== null ? '#documentos' : '')
  }

  if (item.tarea_id !== null && item.documento_id === null) {
    const { data, error } = await db.from('tareas').select('etapa:etapas!inner(proyecto_id)')
      .eq('id', item.tarea_id).abortSignal(signal).maybeSingle()
      .overrideTypes<{ etapa: { proyecto_id: string } } | null, { merge: false }>()
    if (error || !data) throw unavailable()
    projectId = data.etapa.proyecto_id
  }

  if (projectId === null) throw unavailable()
  if (role === 'Cliente') {
    const { data, error } = await db.from('proyecto_usuario_cliente').select('proyecto:proyectos!inner(id)')
      .eq('usuario_id', user.id).eq('proyecto_id', projectId).limit(1).abortSignal(signal).maybeSingle()
    if (error || !data) throw unavailable()
  } else {
    const { data, error } = await db.from('proyectos').select('id')
      .eq('id', projectId).abortSignal(signal).maybeSingle()
    if (error || !data) throw unavailable()
  }

  const path = role === 'Administrador' ? projectDetailsPath(projectId)
    : roleRoutes.Cliente + '/proyectos/' + encodeURIComponent(projectId)
  return path + (item.documento_id !== null ? '#documentos' : '')
}
