interface StatCardProps {
  label: string
  value: string
  detail: string
  tone: 'cyan' | 'violet' | 'green' | 'amber'
}

export function StatCard({ label, value, detail, tone }: StatCardProps) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-glow" />
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <span className="stat-detail">{detail}</span>
    </article>
  )
}
