import {
  TrafficLight,
  type TrafficLightTone,
} from './TrafficLight'

interface StatCardProps {
  label: string
  value: string
  detail: string
  tone: 'cyan' | 'violet' | 'green' | 'amber' | 'red'
  onClick?: () => void
  trafficLightTone?: TrafficLightTone
}

export function StatCard({
  label,
  value,
  detail,
  tone,
  onClick,
  trafficLightTone,
}: StatCardProps) {
  if (onClick) {
    return (
      <button
        className={`stat-card stat-card-button stat-${tone}`}
        onClick={onClick}
        type="button"
      >
        <div className="stat-glow" />
        {trafficLightTone && <TrafficLight tone={trafficLightTone} />}
        <span className="stat-label">{label}</span>
        <strong>{value}</strong>
        <span className="stat-detail">{detail}</span>
        <span className="stat-open-detail">Apri dettaglio</span>
      </button>
    )
  }

  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-glow" />
      {trafficLightTone && <TrafficLight tone={trafficLightTone} />}
      <span className="stat-label">{label}</span>
      <strong>{value}</strong>
      <span className="stat-detail">{detail}</span>
    </article>
  )
}
