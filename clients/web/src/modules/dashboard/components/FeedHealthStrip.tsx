import { useEffect, useMemo, useState } from 'react'
import { fetchLiveEvidence } from '@/modules/evidence/liveEvidence'
import {
  buildCommanderFeedHealth,
  isStaleEvidence,
  relativeAge,
} from '@/modules/evidence/feedHealth'
import type { CommanderFeedHealthState, LiveEvidenceSnapshot } from '@/modules/evidence/types'
import { cn } from '@/lib/utils'

const STATE_META: Record<CommanderFeedHealthState, { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'text-success' },
  degraded: { label: 'Degraded', className: 'text-warning' },
  stale: { label: 'Stale', className: 'text-warning' },
  'not-active': { label: 'Not active', className: 'text-on-surface-variant' },
  'status-unavailable': { label: 'Status unavailable', className: 'text-warning/70' },
  'shadow-source': { label: 'Shadow source', className: 'text-on-surface' },
}

/** Read-only Commander summary of evidence the frontend can actually verify. */
export function FeedHealthStrip() {
  const [shadowSnapshot, setShadowSnapshot] = useState<LiveEvidenceSnapshot | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let active = true
    void fetchLiveEvidence()
      .then((snapshot) => {
        if (active) setShadowSnapshot(snapshot)
      })
      .catch(() => {
        // No optimistic fallback: without a valid response, source status stays unavailable.
      })
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const sources = useMemo(() => buildCommanderFeedHealth(shadowSnapshot), [shadowSnapshot])
  const usgs = sources.find((source) => source.id === 'usgs')!
  const usgsState = STATE_META[usgs.state]
  const usgsPredictionAge = relativeAge(usgs.lastPredictionEventAt, now)
  const usgsPredictionIsStale = isStaleEvidence(usgs.lastPredictionEventAt, now)

  return (
    <section className="shrink-0 border-t border-outline-variant px-3 py-4 lg:border-l lg:border-t-0" aria-labelledby="feed-health-title">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4" aria-live="polite">
        <div className="grid min-w-0 grid-cols-2 gap-4">
          <div>
            <h2 id="feed-health-title" className="font-mono text-[10px] uppercase text-on-surface-variant">USGS</h2>
            <span className={cn('mt-1 block font-mono text-label-sm uppercase', usgsState.className)}>{usgsState.label}</span>
          </div>
          <div>
            <span className="font-mono text-[10px] uppercase text-on-surface-variant">Last event</span>
            <span className={cn('mt-1 block font-mono text-label-sm uppercase text-on-surface', usgsPredictionIsStale && 'text-warning/80')}>
              {usgsPredictionAge ? `${usgsPredictionAge}${usgsPredictionIsStale ? ' · stale' : ''}` : 'Not exposed'}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="font-mono text-[10px] uppercase text-on-surface-variant underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide sources ↑' : 'View data sources →'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 grid grid-cols-2 border-t border-outline-variant pt-3 sm:grid-cols-4">
        {sources.slice(1).map((source) => {
          const state = STATE_META[source.state]
          return (
            <div key={source.id} className="min-w-0 py-2 pr-3" title={source.evidenceNote}>
              <div className="truncate font-mono text-[10px] uppercase text-on-surface">{source.name}</div>
              <div className={cn('mt-1 font-mono text-[10px] uppercase', state.className)}>{state.label}</div>
            </div>
          )
        })}
        </div>
      )}

      <p className="mt-3 font-mono text-[9px] uppercase leading-relaxed text-on-surface-variant">
        Event time is not a poll or journal-commit timestamp.
      </p>
    </section>
  )
}
