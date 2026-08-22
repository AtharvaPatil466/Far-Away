import type { MapState } from '@/lib/mapTypes'
import type { DataSourceState } from '@/lib/systemStatus'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { LiveMap } from './LiveMap'

interface IncidentHeroProps {
  mapState: MapState
  dataSource: DataSourceState
  headline: string
  criticalCount: number
  mapStatus: { label: string; tone: 'healthy' | 'degraded' | 'critical' }
  clock: string
  onReviewCritical: () => void
  demoControls: React.ReactNode
}

const MAP_TONE = {
  healthy: 'text-success',
  degraded: 'text-warning',
  critical: 'text-error',
} as const

export function IncidentHero({
  mapState,
  dataSource,
  headline,
  criticalCount,
  mapStatus,
  clock,
  onReviewCritical,
  demoControls,
}: IncidentHeroProps) {
  return (
    <section
      className="relative h-[clamp(520px,62vh,760px)] min-h-[520px] overflow-hidden border-y border-outline-variant"
      aria-labelledby="incident-hero-title"
    >
      <LiveMap mapState={mapState} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background/80 to-transparent" />

      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 md:p-5">
        <div className="flex flex-wrap gap-2 font-mono text-label-sm uppercase">
          <span className="border border-warning/40 bg-background/90 px-2 py-1 text-warning">
            {dataSource === 'fallback' ? 'Simulation / fallback' : dataSource}
          </span>
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

      <div className="absolute inset-x-0 bottom-0 z-10 grid items-end gap-5 p-5 md:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(340px,520px)] lg:p-9">
        <div className="max-w-4xl">
          <p className="mb-3 font-mono text-[13px] uppercase tracking-[0.08em] text-on-surface-variant">
            Sector 7 Command · Odisha Coast
          </p>
          <h1
            id="incident-hero-title"
            className="max-w-[900px] text-[clamp(42px,5.2vw,72px)] font-normal uppercase leading-[0.92] tracking-[-0.03em] text-on-surface"
          >
            Cyclone Remal<br />
            {headline}
          </h1>
          {criticalCount > 0 ? (
            <Button type="button" variant="accent" size="lg" className="mt-6" onClick={onReviewCritical}>
              Review critical decisions <Icon name="arrow_forward" />
            </Button>
          ) : (
            <p className="mt-6 font-mono text-label-md uppercase text-on-surface-variant">No critical decisions pending</p>
          )}
        </div>
        <div className="pointer-events-auto">{demoControls}</div>
      </div>
    </section>
  )
}
