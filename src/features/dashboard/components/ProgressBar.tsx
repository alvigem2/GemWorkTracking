interface ProgressBarProps {
  value: number
  label: string
}

export default function ProgressBar({ value, label }: ProgressBarProps) {
  const percent = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0

  return (
    <div className="admin-progress">
      <progress max={100} value={percent} aria-label={label} />
      <span aria-hidden="true">{percent}%</span>
    </div>
  )
}
