import type { EscalationTrigger } from '@/lib/mapTypes'
import type { MapState } from '@/lib/mapTypes'
import type { DataSourceState } from '@/lib/systemStatus'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { LiveMap } from './LiveMap'

interface IncidentHeroProps {
  mapState: MapState
  dataSource: DataSourceState
  /** Small mono context line: incident · geography · provenance. */
  eyebrow: string
  /** The current human decision, derived from live escalation state. */
  headline: string
  /** Real zone + recommendation sentence behind the headline. */
  supporting: string
  criticalCount: number
  mapStatus: { label: string; tone: 'healthy' | 'degraded' | 'critical' }
  clock: string
  onReviewCritical: () => void
  demoControls: React.ReactNode
}

/**
 * Provenance wording mirrors systemStatus.ts values. Fallback data in this build
 * is the intentional deterministic demo scenario — labelled plainly, never as LIVE.
 */
const PROVENANCE_META: Record<DataSourceState, { label: string; className: string }> = {
  live: { label: 'Live backend', className: 'border-success/40 bg-background/90 text-success' },
  fallback: { label: 'Deterministic scenario · local data', className: 'border-warning/45 bg-background/90 text-warning' },
  simulation: { label: 'Simulation · local data', className: 'border-warning/45 bg-background/90 text-warning' },
  historical: { label: 'Historical replay', className: 'border-outline-variant/60 bg-background/90 text-on-surface-variant' },
}

const MAP_TONE = {
  healthy: 'text-success',
  degraded: 'text-warning',
  critical: 'text-error',
} as const

/** Headline verb per authority-matrix trigger; human-only triggers read accordingly. */
export function decisionHeadlineFor(trigger: EscalationTrigger): string {
  switch (trigger) {
    case 'MANDATORY_EVACUATION':
      return 'Evacuation review required'
    case 'CROSS_STATE_RESOURCE':
      return 'Cross-state resource review'
    case 'MILITARY_ASSET':
      return 'Military asset review required'
    case 'REQUISITION_INFRASTRUCTURE':
      return 'Requisition approval required'
    case 'MEDIA_BROADCAST':
      return 'Broadcast approval required'
    case 'INTERNATIONAL_AID':
      return 'International aid decision required'
    case 'STATE_OF_EMERGENCY':
      return 'Emergency declaration required'
    case 'ARMED_FORCES':
      return 'Armed forces decision required'
    case 'CRITICAL_INFRASTRUCTURE':
      return 'Infrastructure requisition required'
  }
}

export function IncidentHero({
  mapState,
  dataSource,
  eyebrow,
  headline,
  supporting,
  criticalCount,
  mapStatus,
  clock,
  onReviewCritical,
  demoControls,
}: IncidentHeroProps) {
  const provenance = PROVENANCE_META[dataSource]
  return (
    <section
      className="relative h-[clamp(400px,46vh,560px)] min-h-[400px] overflow-hidden border-y border-outline-variant"
      aria-labelledby="incident-hero-title"
    >
      <LiveMap mapState={mapState} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background/80 to-transparent" />

      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 md:p-5">
        <div className="flex flex-wrap gap-2 font-mono text-label-sm uppercase">
          <span className={cn('px-2 py-1', provenance.className)}>{provenance.label}</span>
          {criticalCount > 0 && (
            <span className="border border-error/45 bg-background/90 px-2 py-1 text-error">
              Priority 1 · {criticalCount}
            </span>
          )}
        </div>
        <div className="mr-10 flex flex-col items-end gap-1 bg-background/90 px-2 py-1 font-mono text-label-sm uppercase md:mr-12">
          <span className={cn('flex items-center gap-1.5', MAP_TONE[mapStatus.tone])}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {mapStatus.label}
          </span>
          <span className="tabular-nums text-on-surface-variant">{clock} IST</span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 grid items-end gap-5 p-5 md:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(340px,520px)] lg:p-8">
        <div className="max-w-4xl">
          <p className="mb-3 font-mono text-[13px] uppercase tracking-[0.08em] text-on-surface-variant">{eyebrow}</p>
          <h1
            id="incident-hero-title"
            className="max-w-[900px] text-[clamp(38px,4.4vw,62px)] font-normal uppercase leading-[0.94] tracking-[-0.03em] text-on-surface"
          >
            {headline}
          </h1>
          <p className="mt-4 max-w-2xl text-body-md leading-relaxed text-on-surface-variant">{supporting}</p>
          {criticalCount > 0 ? (
            <Button type="button" variant="accent" size="lg" className="mt-5" onClick={onReviewCritical}>
              Review critical decisions <Icon name="arrow_forward" />
            </Button>
          ) : (
            <p className="mt-5 font-mono text-label-md uppercase text-on-surface-variant">No critical decisions pending</p>
          )}
        </div>
        <div className="pointer-events-auto">{demoControls}</div>
      </div>
    </section>
  )
}
