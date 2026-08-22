import { useEffect, useState } from 'react'

import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

/**
 * Ledger status bar — always visible, low clutter.
 *
 * Shows the two counters SEPARATELY (settled vs pending) because collapsing
 * them hides the thing that matters: a season with nothing settled is not a
 * season that scored zero. Anchor state is a THIRD, independent light — a
 * stale anchor means the attesting job is late, never that the chain is
 * broken, so it must not be able to turn the integrity indicator red.
 *
 * Every value is computed backend-side and served as static JSON, so the bar
 * cannot drift from the checks that produce it.
 */
interface Ledger {
  settled: number
  pending: number
  predictions: number
  scoreable: boolean
  reason: string
  chain_intact: boolean
  monotonic: boolean
  freshness: { state: 'stalled' | 'ingesting' | 'quiet'; last_poll_at: string | null }
  anchor: {
    state: 'verified' | 'stale' | 'drifted' | 'absent'
    server_time?: string
    url?: string
    run_id?: string
  }
}

const FRESHNESS_LABEL: Record<Ledger['freshness']['state'], string> = {
  ingesting: 'ingesting',
  quiet: 'quiet — no qualifying events',
  stalled: 'stalled',
}

const ANCHOR_LABEL: Record<Ledger['anchor']['state'], string> = {
  verified: 'anchored',
  drifted: 'anchor pending next run',
  stale: 'anchor late',
  absent: 'not anchored',
}

/** Only a broken chain is an integrity failure. Everything else is context. */
function anchorTone(state: Ledger['anchor']['state']) {
  if (state === 'verified') return 'text-primary'
  if (state === 'absent' || state === 'stale') return 'text-warning'
  return 'text-on-surface-variant'
}

function hhmm(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

export function AuditFooter() {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/'
    fetch(`${base}data/ledger.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: Ledger) => setLedger(d))
      .catch(() => setFailed(true))
  }, [])

  // Absent data is stated, never faked. A footer that renders zeros when the
  // fetch failed is worse than one that admits it does not know.
  if (failed) {
    return (
      <footer className="flex items-center gap-2 border-t border-outline-variant bg-surface-container-lowest px-4 py-1.5 text-code-sm text-on-surface-variant">
        <Icon name="lock" className="text-[14px]" />
        <span>AUDIT: ledger unavailable</span>
      </footer>
    )
  }
  if (!ledger) return null

  const chainOk = ledger.chain_intact && ledger.monotonic

  return (
    <footer
      aria-label="Audit ledger status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-outline-variant bg-surface-container-lowest px-4 py-1.5 text-code-sm text-on-surface-variant"
    >
      <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
        <Icon name="lock" className="text-[14px]" />
        Audit
      </span>

      <span className="text-on-surface">
        {ledger.settled} settled
      </span>
      <span aria-hidden>·</span>
      <span>{ledger.pending} pending</span>

      <span aria-hidden>·</span>
      <span className={cn(ledger.freshness.state === 'stalled' && 'text-warning')}>
        {FRESHNESS_LABEL[ledger.freshness.state]}
      </span>

      <span aria-hidden>·</span>
      {ledger.anchor.url ? (
        <a
          href={ledger.anchor.url}
          target="_blank"
          rel="noreferrer"
          className={cn('underline decoration-dotted underline-offset-2', anchorTone(ledger.anchor.state))}
          title={`Run ${ledger.anchor.run_id} — server-recorded ${ledger.anchor.server_time}`}
        >
          {ANCHOR_LABEL[ledger.anchor.state]} {hhmm(ledger.anchor.server_time)}
        </a>
      ) : (
        <span className={anchorTone(ledger.anchor.state)}>{ANCHOR_LABEL[ledger.anchor.state]}</span>
      )}

      <span aria-hidden>·</span>
      <span className={cn('flex items-center gap-1', chainOk ? 'text-primary' : 'text-error')}>
        <Icon name={chainOk ? 'verified_user' : 'gpp_bad'} className="text-[14px]" />
        {chainOk ? 'chain verified' : 'CHAIN BROKEN'}
      </span>

      {/* Scoring is a separate claim from integrity: a season can be perfectly
          intact and still have too few settled outcomes to score. */}
      {!ledger.scoreable && (
        <span className="ml-auto italic" title={ledger.reason}>
          scoring requires a season
        </span>
      )}
    </footer>
  )
}
