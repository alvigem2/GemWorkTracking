import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function DetailBreadcrumbs({ to, parent, current }: { to: string; parent: string; current: string }) {
  return (
    <nav className="detail-breadcrumbs" aria-label="Ruta de navegación">
      <ol>
        <li><Link className="admin-action" to={to}>{parent}</Link></li>
        <li aria-current="page"><ChevronRight size={16} aria-hidden="true" />{current}</li>
      </ol>
    </nav>
  )
}
