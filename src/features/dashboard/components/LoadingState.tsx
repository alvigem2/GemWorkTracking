import { LoaderCircle } from 'lucide-react'

export default function LoadingState({ message }: { message: string }) {
  return (
    <p className="admin-loading" role="status">
      <LoaderCircle size={20} aria-hidden="true" />
      {message}
    </p>
  )
}
