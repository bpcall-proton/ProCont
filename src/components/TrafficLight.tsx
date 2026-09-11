export type TrafficLightTone = 'green' | 'amber' | 'red'

const labels: Record<TrafficLightTone, string> = {
  green: 'verde',
  amber: 'giallo',
  red: 'rosso',
}

export function TrafficLight({ tone }: { tone: TrafficLightTone }) {
  return (
    <span
      aria-label={`Semaforo ${labels[tone]}`}
      className="traffic-light"
      role="img"
    >
      <i
        className={`traffic-light-dot traffic-light-red ${
          tone === 'red' ? 'is-active' : ''
        }`}
      />
      <i
        className={`traffic-light-dot traffic-light-amber ${
          tone === 'amber' ? 'is-active' : ''
        }`}
      />
      <i
        className={`traffic-light-dot traffic-light-green ${
          tone === 'green' ? 'is-active' : ''
        }`}
      />
    </span>
  )
}
