export interface TelemetryWindow {
  value: string
  tone: 'critical' | 'warning' | 'neutral'
}

interface MissionTelemetryProps {
  /** Residents figure parsed verbatim from the top pending recommendation; null when absent. */
  scopeResidents: string | null
  pendingDecisions: number
  criticalPending: boolean
  highRiskZones: number
  /** Auto-execute countdown for the top decision, or the human-only marker. */
  decisionWindow: TelemetryWindow | null
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

const TONE_CLASS = {
  critical: 'text-error',
  warning: 'text-warning',
  neutral: 'text-on-surface',
} as const

interface TelemetryItem {
  value: string
  label: string
  tone: keyof typeof TONE_CLASS
}

export function MissionTelemetry({ scopeResidents, pendingDecisions, criticalPending, highRiskZones, decisionWindow }: MissionTelemetryProps) {
  const items: TelemetryItem[] = [
    { value: scopeResidents ?? '—', label: 'Residents in decision scope', tone: 'neutral' },
    { value: pad(pendingDecisions), label: 'Pending human decisions', tone: criticalPending ? 'critical' : 'neutral' },
    { value: String(highRiskZones), label: 'Mapped high-risk zones', tone: 'neutral' },
    decisionWindow
      ? { value: decisionWindow.value, label: 'Top decision window', tone: decisionWindow.tone }
      : { value: '—', label: 'Top decision window', tone: 'neutral' },
  ]

  return (
    <section className="border-b border-outline-variant" aria-label="Mission telemetry">
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={`min-w-0 py-4 pr-4 md:py-5 ${index % 2 ? 'border-l border-outline-variant pl-4' : ''} ${index > 1 ? 'border-t border-outline-variant lg:border-t-0' : ''} ${index > 0 ? 'lg:border-l lg:pl-6' : ''}`}
          >
            <dd className={`truncate font-mono text-[clamp(26px,2.8vw,42px)] tabular-nums ${TONE_CLASS[item.tone]}`}>
              {item.value}
            </dd>
            <dt className="mt-2 font-mono text-label-sm uppercase tracking-[0.08em] text-on-surface-variant">{item.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  )
}
