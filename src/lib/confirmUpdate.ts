type ConfirmedChange = {
  data: { id: string | number } | null
  error: { code: string; message: string } | null
  status: number
}

export class UpdateUnconfirmed extends Error {}

export async function confirmUpdate(request: PromiseLike<ConfirmedChange>, id: string | number) {
  const { data, error, status } = await request
  if (error) {
    const detail = error.code ? error.code + ': ' + error.message : error.message
    if (status === 0 || status >= 500) {
      throw new UpdateUnconfirmed('No se pudo confirmar el cambio. Vuelve al listado para comprobarlo. ' + detail)
    }
    throw new Error('Supabase rechazó el cambio. ' + detail, { cause: error })
  }
  if (data === null || String(data.id) !== String(id)) {
    throw new Error('No se confirmó la actualización del registro. Puede que ya no exista o que RLS impida modificarlo.')
  }
}
