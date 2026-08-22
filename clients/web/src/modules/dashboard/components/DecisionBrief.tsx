import type { EscalationItem } from '@/lib/mapTypes'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

interface DecisionBriefProps {
  escalation: EscalationItem | null
  remainingEscalations: EscalationItem[]
  additionalCritical: number
  highRiskZones: number
  activeUnits: number
  unitCount: number
  onReview: (item: EscalationItem) => void
}

function situationFacts(item: EscalationItem): string[] {
  const sentences = item.memo.situation
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2)
  const evidence = item.decisionEvidence
  if (evidence && sentences.length < 3) {
    sentences.push(`${evidence.riskScore}% risk score · ${evidence.confidence}% model confidence`)
  }
  return sentences.slice(0, 3)
}

export function DecisionBrief({
  escalation,
  remainingEscalations,
  additionalCritical,
  highRiskZones,
  activeUnits,
  unitCount,
  onReview,
}: DecisionBriefProps) {
  return (
    <section className="grid gap-12 py-inversa-59 lg:grid-cols-2 lg:gap-inversa-59" aria-labelledby="decision-brief-title">
      <div>
        <p className="font-mono text-label-md uppercase text-on-surface-variant">Mission brief / current state</p>
        <h2 id="decision-brief-title" className="mt-3 max-w-xl text-[clamp(40px,4.2vw,58px)] font-normal leading-[1.02] tracking-[-0.03em] text-on-surface">
          What we know
        </h2>
        <dl className="mt-8 divide-y divide-outline-variant border-y border-outline-variant">
          <div className="grid grid-cols-[80px_1fr] gap-4 py-4">
            <dt className="font-mono text-label-sm uppercase text-on-surface-variant">Hazard</dt>
            <dd className="text-body-md text-on-surface">Cyclone Remal response remains the active incident context.</dd>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-4 py-4">
            <dt className="font-mono text-label-sm uppercase text-on-surface-variant">Terrain</dt>
            <dd className="text-body-md text-on-surface">{highRiskZones} mapped high-risk {highRiskZones === 1 ? 'zone' : 'zones'} across the operations map.</dd>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-4 py-4">
            <dt className="font-mono text-label-sm uppercase text-on-surface-variant">Field</dt>
            <dd className="text-body-md text-on-surface">{activeUnits} of {unitCount} deployed units currently report active status.</dd>
          </div>
        </dl>
      </div>

      <div className="border-t-2 border-error pt-5 lg:border-l-2 lg:border-t-0 lg:pl-8 lg:pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-label-sm uppercase">
          <span className="text-error">Priority 1 / Human decision</span>
          {additionalCritical > 0 && <span className="text-on-surface-variant">+{additionalCritical} more critical</span>}
        </div>
        {escalation ? (
          <>
            <h3 className="mt-5 text-[clamp(30px,3.2vw,46px)] font-normal leading-[1.05] tracking-[-0.03em] text-on-surface">
              {escalation.zone}
            </h3>
            <p className="mt-3 max-w-2xl text-body-md text-on-surface-variant">{escalation.memo.recommended}</p>
            <ul className="mt-7 divide-y divide-outline-variant border-y border-outline-variant">
              {situationFacts(escalation).map((fact) => (
                <li key={fact} className="py-3 font-mono text-[13px] leading-relaxed text-on-surface">{fact}</li>
              ))}
            </ul>
            <Button type="button" variant="accent" size="lg" className="mt-7" onClick={() => onReview(escalation)}>
              Review decision <Icon name="arrow_forward" />
            </Button>
          </>
        ) : (
          <p className="mt-6 font-mono text-label-md uppercase text-on-surface-variant">No critical human decision is currently pending.</p>
        )}

        {remainingEscalations.length > 0 && (
          <details className="group mt-8 border-t border-outline-variant pt-4">
            <summary className="cursor-pointer list-none font-mono text-label-sm uppercase text-on-surface-variant hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
              <span className="group-open:hidden">View remaining decisions →</span>
              <span className="hidden group-open:inline">Hide remaining decisions ↑</span>
            </summary>
            <ul className="mt-4 divide-y divide-outline-variant border-y border-outline-variant">
              {remainingEscalations.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                    onClick={() => onReview(item)}
                  >
                    <span className={item.priority === 'CRITICAL' ? 'font-mono text-[10px] uppercase text-error' : 'font-mono text-[10px] uppercase text-warning'}>
                      {item.priority}
                    </span>
                    <span className="truncate text-body-sm text-on-surface">{item.zone}</span>
                    <span className="font-mono text-[10px] uppercase text-on-surface-variant">Review →</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}
