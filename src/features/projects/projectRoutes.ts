export const projectsPath = '/admin/proyectos'
export const newProjectPath = projectsPath + '/nuevo'

export function projectDetailsPath(id: string | number): string {
  return projectsPath + '/' + encodeURIComponent(id)
}

export const editProjectPattern = projectsPath + '/:id/editar'

export function editProjectPath(id: string | number): string {
  return projectDetailsPath(id) + '/editar'
}
