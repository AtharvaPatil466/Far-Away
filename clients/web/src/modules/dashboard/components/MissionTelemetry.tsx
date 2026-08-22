interface MissionTelemetryProps {
  unitCount: number
  criticalCount: number
  highRiskZones: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function MissionTelemetry({ unitCount, criticalCount, highRiskZones }: MissionTelemetryProps) {
  const items = [
    { value: 'Cyclone Remal', label: 'Incident context', editorial: true },
    { value: pad(unitCount), label: 'Units deployed' },
    { value: pad(criticalCount), label: 'Critical decisions', critical: criticalCount > 0 },
    { value: String(highRiskZones), label: 'Mapped high-risk zones' },
  ]

  return (
    <section className="border-b border-outline-variant" aria-label="Mission telemetry">
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={`min-w-0 py-5 pr-4 md:py-7 ${index % 2 ? 'border-l border-outline-variant pl-4' : ''} ${index > 1 ? 'border-t border-outline-variant lg:border-t-0' : ''} ${index > 0 ? 'lg:border-l lg:pl-6' : ''}`}
          >
            <dd className={`${item.editorial ? 'truncate font-sans text-[clamp(20px,2.2vw,32px)] tracking-[-0.03em]' : 'font-mono text-[clamp(30px,3.2vw,48px)] tabular-nums'} ${item.critical ? 'text-error' : 'text-on-surface'}`}>
              {item.value}
            </dd>
            <dt className="mt-2 font-mono text-label-sm uppercase tracking-[0.08em] text-on-surface-variant">{item.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  )
}
