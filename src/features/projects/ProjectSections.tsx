import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

export function ProjectSectionLinks({ items }: { items: readonly { id: string; label: string }[] }) {
  return (
    <nav className="project-section-links" aria-label="Secciones del proyecto">
      {items.map(({ id, label }) => (
        <a key={id} href={'#' + id} onClick={event => {
          event.preventDefault()
          const section = document.getElementById(id)
          if (section instanceof HTMLDetailsElement) section.open = true
          section?.scrollIntoView()
        }}>{label}</a>
      ))}
    </nav>
  )
}

export function ProjectSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <details id={id} className="admin-panel project-section">
      <summary>{title}<ChevronDown size={18} aria-hidden="true" /></summary>
      <div className="project-section-body">{children}</div>
    </details>
  )
}
