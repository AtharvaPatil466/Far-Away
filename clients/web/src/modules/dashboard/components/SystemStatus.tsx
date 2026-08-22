import type { SystemStatusSnapshot } from '@/lib/systemStatus'
import { cn } from '@/lib/utils'

interface SystemStatusProps {
  status: SystemStatusSnapshot
  className?: string
}

type StatusTone = 'healthy' | 'degraded' | 'critical'

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  live: { label: 'LIVE', tone: 'healthy' },
  offline: { label: 'OFFLINE', tone: 'critical' },
  simulation: { label: 'SIMULATION', tone: 'degraded' },
  historical: { label: 'HISTORICAL', tone: 'degraded' },
  fallback: { label: 'FALLBACK', tone: 'degraded' },
  intact: { label: 'VERIFIED', tone: 'healthy' },
  online: { label: 'ONLINE', tone: 'healthy' },
  'usgs-connected': { label: 'USGS CONNECTED', tone: 'healthy' },
}

const UNAVAILABLE_META: Record<string, { label: string; tone: StatusTone }> = {
  Backend: { label: 'STATUS UNAVAILABLE', tone: 'degraded' },
  Audit: { label: 'NOT VERIFIED', tone: 'degraded' },
  Agents: { label: 'STATUS UNAVAILABLE', tone: 'degraded' },
  Feed: { label: 'STATUS UNAVAILABLE', tone: 'degraded' },
}

function statusMeta(label: string, value: string) {
  if (value === 'unknown') return UNAVAILABLE_META[label] ?? { label: 'STATUS UNAVAILABLE', tone: 'degraded' as const }
  return STATUS_META[value]
}

const TONE_CLASS: Record<StatusTone, string> = {
  healthy: 'text-success',
  degraded: 'text-warning/80',
  critical: 'text-error',
}

/** Compact, evidence-based runtime provenance display for the commander view. */
export function SystemStatus({ status, className }: SystemStatusProps) {
  const indicators = [
    ['Backend', status.backend],
    ['Data', status.dataSource],
    ['Audit', status.audit],
  ] as const

  return (
    <section aria-label="System status" className={cn('px-3 py-4', className)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {indicators.map(([label, value]) => {
          const meta = statusMeta(label, value)
          return (
            <div key={label} className="min-w-0">
              <span className="block font-mono text-[10px] uppercase text-on-surface-variant">{label}</span>
              <span className={cn('mt-1 flex items-center gap-1.5 font-mono text-label-sm uppercase', TONE_CLASS[meta.tone])}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                {meta.label}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
