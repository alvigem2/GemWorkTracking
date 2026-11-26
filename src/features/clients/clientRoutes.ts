export const clientsPath = '/admin/clientes'
export const newClientPath = clientsPath + '/nuevo'

export const editClientPattern = clientsPath + '/:id/editar'

export function editClientPath(id: string): string {
  return clientsPath + '/' + encodeURIComponent(id) + '/editar'
}
