import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
} from 'lucide-react'
import type {
  LedgerVerification,
  LiveEvidenceAvailability,
  LiveEvidenceRecord,
  LiveEvidenceSnapshot,
} from '../types'
import {
  cacheLiveEvidence,
  fetchLiveEvidence,
  predictionId,
  readCachedLiveEvidence,
  verifyLiveEvidence,
} from '../liveEvidence'

interface LedgerRow {
  id: string
  prediction: LiveEvidenceRecord
  outcome: LiveEvidenceRecord | null
}

const IST_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'UNKNOWN'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? `${IST_FORMAT.format(date)} IST` : 'UNKNOWN'
}

function durationSince(value: string | null | undefined, now = Date.now()): string {
  if (!value) return 'UNKNOWN'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'UNKNOWN'
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

function hashPrefix(value: string | undefined): string {
  if (!value) return 'UNKNOWN'
  return value === 'shadow-genesis' ? 'GENESIS' : `${value.slice(0, 12)}…`
}

function numberOrUnknown(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : 'UNKNOWN'
}

function probabilityLabel(payload: Record<string, unknown>): string {
  const probability = Number(payload.probability)
  if (!Number.isFinite(probability)) return 'UNKNOWN'
  const decision = payload.would_alert === true ? 'would alert' : 'would not alert'
  return `Damaging impact ${(probability * 100).toFixed(1)}% · ${decision}`
}

function eventLabel(payload: Record<string, unknown>): string {
  const features = payload.features as Record<string, unknown> | undefined
  const magnitude = Number(features?.magnitude)
  const depth = Number(features?.depth_km)
  const magnitudeText = Number.isFinite(magnitude) ? `M${magnitude.toFixed(1)}` : 'Magnitude UNKNOWN'
  const depthText = Number.isFinite(depth) ? ` · ${depth.toFixed(1)} km deep` : ''
  return `${magnitudeText}${depthText} · location not retained`
}

function outcomeLabel(outcome: LiveEvidenceRecord | null): string {
  if (!outcome) return 'Awaiting USGS settlement'
  const occurred = outcome.payload.occurred
  if (typeof occurred !== 'boolean') return 'Outcome UNKNOWN'
  return `${occurred ? 'Damaging impact occurred' : 'No damaging impact'}${outcome.payload.detail ? ` · ${String(outcome.payload.detail)}` : ''}`
}

function rowsFrom(snapshot: LiveEvidenceSnapshot | null): LedgerRow[] {
  if (!snapshot) return []
  const outcomes = new Map<string, LiveEvidenceRecord>()
  snapshot.records
    .filter((record) => record.kind === 'outcome')
    .forEach((record) => outcomes.set(predictionId(record.payload), record))
  return snapshot.records
    .filter((record) => record.kind === 'prediction')
    .map((prediction) => ({
      id: predictionId(prediction.payload),
      prediction,
      outcome: outcomes.get(predictionId(prediction.payload)) ?? null,
    }))
    .sort((a, b) => Date.parse(String(b.prediction.payload.issued_at)) - Date.parse(String(a.prediction.payload.issued_at)))
}

export function LiveEvidence() {
  const [snapshot, setSnapshot] = useState<LiveEvidenceSnapshot | null>(null)
  const [availability, setAvailability] = useState<LiveEvidenceAvailability>('UNAVAILABLE')
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [verification, setVerification] = useState<LedgerVerification>('NOT AVAILABLE')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const live = await fetchLiveEvidence()
      const successfulAt = new Date().toISOString()
      setSnapshot(live)
      setCachedAt(successfulAt)
      setAvailability('LIVE')
      setVerification('NOT AVAILABLE')
      cacheLiveEvidence(live, new Date(successfulAt))
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Live refresh failed')
      setAvailability((current) => snapshot || current === 'CACHED' ? 'CACHED' : 'UNAVAILABLE')
    } finally {
      setRefreshing(false)
    }
  }, [snapshot])

  useEffect(() => {
    const cached = readCachedLiveEvidence()
    if (cached) {
      setSnapshot(cached.snapshot)
      setCachedAt(cached.cached_at)
      setAvailability('CACHED')
    }
    void refresh()
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
    // Initial cache hydration + one bounded live refresh only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(() => rowsFrom(snapshot), [snapshot])
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null
  const last24h = rows.filter((row) => {
    const issued = Date.parse(String(row.prediction.payload.issued_at))
    return Number.isFinite(issued) && now - issued <= 86_400_000
  }).length

  const verify = async () => {
    if (!snapshot) return
    setVerification('VERIFYING')
    try {
      setVerification(await verifyLiveEvidence(snapshot) ? 'VERIFIED' : 'BROKEN')
    } catch {
      setVerification('NOT AVAILABLE')
    }
  }

  const statusDetail = availability === 'LIVE'
    ? 'Most recent API refresh succeeded.'
    : availability === 'CACHED'
      ? `Live refresh failed. Showing the last successful real snapshot, cached ${durationSince(cachedAt, now)} ago.`
      : 'No valid live or cached snapshot exists.'

  const scorecard = snapshot?.scorecard
  const sampleCount = scorecard?.n_resolved ?? snapshot?.counts.settled ?? null
  const journalActivityTimestamp = snapshot?.journal_last_activity_at
    ? Date.parse(snapshot.journal_last_activity_at)
    : Number.NaN
  const isJournalStale = !Number.isFinite(journalActivityTimestamp)
    || now - journalActivityTimestamp > 86_400_000
  const chainStatus = snapshot?.chain_verified === false
    ? 'BROKEN'
    : verification === 'VERIFIED'
      ? 'VERIFIED'
      : verification === 'VERIFYING'
        ? 'VERIFYING'
        : 'NOT VERIFIED'
  const verifyButtonLabel = verification === 'VERIFYING'
    ? 'Verifying…'
    : chainStatus === 'VERIFIED'
      ? 'Ledger Verified'
      : chainStatus === 'BROKEN'
        ? 'Chain Broken'
        : 'Verify Ledger'

  return (
    <div className="evidence-pane live-evidence-pane">
      <header className="live-evidence-header">
        <div className="live-evidence-hero">
          <div className="live-kicker"><Database size={14} /> LIVE EVIDENCE <span>REAL SHADOW JOURNAL</span></div>
          <h2>Predictions are committed before outcomes are known.</h2>
          <p>DisasterMind records real shadow predictions first, then scores them only after real outcomes arrive.</p>
        </div>
        <div className="live-actions">
          <button type="button" className="ledger-action" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCcw size={15} className={refreshing ? 'is-spinning' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className={`ledger-action verify-action chain-${chainStatus.toLowerCase().replace(' ', '-')}`} onClick={() => void verify()} disabled={!snapshot || verification === 'VERIFYING'}>
            {chainStatus === 'BROKEN' ? <ShieldX size={16} /> : <ShieldCheck size={16} />} {verifyButtonLabel}
          </button>
        </div>
      </header>

      <section className="runtime-status-strip" aria-label="Live evidence runtime status" aria-live="polite">
        <div className={`runtime-status-cell api-${availability.toLowerCase()}`}>
          <span>API STATUS</span>
          <strong><i /> {availability}</strong>
          <small>{statusDetail}</small>
        </div>
        <div className="runtime-status-cell">
          <span>LAST REFRESH</span>
          <strong>{formatTimestamp(cachedAt)}</strong>
          <small>{cachedAt ? `${durationSince(cachedAt, now)} ago` : 'No successful refresh'}</small>
        </div>
        <div className={`runtime-status-cell ${isJournalStale ? 'journal-stale' : ''}`}>
          <span>LAST JOURNAL ACTIVITY</span>
          <strong>{formatTimestamp(snapshot?.journal_last_activity_at)}</strong>
          <small>{snapshot?.journal_last_activity_at ? `${durationSince(snapshot.journal_last_activity_at, now)} ago${isJournalStale ? ' · STALE' : ''}` : 'UNKNOWN'}</small>
        </div>
        <div className={`runtime-status-cell runtime-chain chain-${chainStatus.toLowerCase().replace(' ', '-')}`}>
          <span>CHAIN</span>
          <strong>{chainStatus}</strong>
          <small>{chainStatus === 'VERIFIED' ? `${snapshot?.counts.records ?? 0} records re-hashed` : chainStatus === 'BROKEN' ? 'Integrity check failed' : 'Run Verify Ledger'}</small>
        </div>
      </section>

      {refreshError && availability !== 'UNAVAILABLE' && (
        <div className="cache-notice"><AlertTriangle size={15} /> {refreshError}. Cached real evidence remains visible; no demo data was substituted.</div>
      )}

      <section className="live-metrics" aria-label="Real shadow journal summary">
        <div><span>Predictions committed</span><strong>{numberOrUnknown(snapshot?.counts.predictions)}</strong><small>Immutable prediction records</small></div>
        <div className="metric-unresolved"><span>Unresolved</span><strong>{numberOrUnknown(snapshot?.counts.unresolved)}</strong><small>Expected while outcomes mature</small></div>
        <div><span>Settled</span><strong>{numberOrUnknown(snapshot?.counts.settled)}</strong><small>Outcome records appended</small></div>
        <div className="metric-source"><span>Source</span><strong>{snapshot ? 'USGS' : 'UNKNOWN'}</strong><small>{snapshot ? 'Earthquake Hazards Program' : 'No valid snapshot'}</small></div>
      </section>

      {availability === 'UNAVAILABLE' ? (
        <section className="ledger-empty">
          <ShieldX size={28} />
          <h3>LIVE EVIDENCE UNAVAILABLE</h3>
          <p>No valid live response or prior real snapshot exists. Demo predictions are never used as a fallback.</p>
          {refreshError && <code>{refreshError}</code>}
        </section>
      ) : (
        <>
          <section className={`ledger-idle ${last24h ? 'has-activity' : ''} ${isJournalStale ? 'is-stale' : ''}`}>
            {last24h ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
            <div>
              <strong>{last24h ? 'SYSTEM RECORDING LIVE EVIDENCE' : 'NO RECENT SHADOW COMMITS'}</strong>
              <span>{last24h
                ? `${last24h} prediction${last24h === 1 ? '' : 's'} committed in the last 24 hours.`
                : isJournalStale
                  ? `The evidence ledger is valid, but the latest journal activity is stale (${durationSince(snapshot?.journal_last_activity_at, now)} old).`
                  : 'No prediction entries were recorded in the last 24 hours. Unresolved predictions remain valid evidence while outcomes mature.'}</span>
            </div>
          </section>

          {scorecard && typeof sampleCount === 'number' && sampleCount > 0 && (
            <section className="score-strip" aria-label="Settled shadow scorecard">
              <div className="score-title"><strong>SETTLED SCORECARD</strong><span>n = {sampleCount}{sampleCount < 30 ? ' · SMALL SAMPLE — interpret cautiously' : ''}</span></div>
              {typeof scorecard.brier === 'number' && <div><span>Brier</span><strong>{scorecard.brier.toFixed(3)}</strong><small>n={sampleCount}</small></div>}
              {typeof scorecard.auc === 'number' && <div><span>AUC</span><strong>{scorecard.auc.toFixed(3)}</strong><small>n={sampleCount}</small></div>}
              {typeof scorecard.confusion?.pod === 'number' && <div><span>POD</span><strong>{(scorecard.confusion.pod * 100).toFixed(1)}%</strong><small>n={sampleCount}</small></div>}
              {typeof scorecard.confusion?.far === 'number' && <div><span>FAR</span><strong>{(scorecard.confusion.far * 100).toFixed(1)}%</strong><small>n={sampleCount}</small></div>}
            </section>
          )}

          <div className="ledger-layout">
            <section className="ledger-list" aria-label="Prediction ledger">
              <div className="ledger-list-head">
                <div><strong>PREDICTION LEDGER</strong><span>{rows.length} committed predictions · newest first</span></div>
                <span className="provenance-chip">REAL SHADOW JOURNAL</span>
              </div>
              {rows.length === 0 ? (
                <div className="ledger-no-records">No predictions are present in this real journal snapshot.</div>
              ) : rows.map((row) => {
                const payload = row.prediction.payload
                return (
                  <button key={`${row.id}-${row.prediction.hash}`} type="button" className={`ledger-row ${selected?.prediction.hash === row.prediction.hash ? 'selected' : ''}`} onClick={() => setSelectedId(row.id)}>
                    <div className="ledger-row-primary"><code>{row.id}</code><span>{String(payload.hazard ?? 'UNKNOWN').toUpperCase()}</span></div>
                    <div className="ledger-source"><span>SOURCE</span><strong>{snapshot ? 'USGS' : 'UNKNOWN'}</strong></div>
                    <div className="ledger-event"><strong>{eventLabel(payload)}</strong><span>{probabilityLabel(payload)}</span></div>
                    <div className="ledger-timestamps">
                      <span><b>EVENT</b> {formatTimestamp(String(payload.issued_at ?? ''))}</span>
                      <small><b>COMMITTED</b> NOT RETAINED</small>
                    </div>
                    <span className={`ledger-state ${row.outcome ? 'settled' : 'unresolved'}`}>{row.outcome ? 'SETTLED' : 'UNRESOLVED'}</span>
                    <div className="ledger-hashes"><code>HASH {hashPrefix(row.prediction.hash)}</code><code>PREV {hashPrefix(row.prediction.previous_hash)}</code></div>
                    <ChevronRight size={16} />
                  </button>
                )
              })}
            </section>

            <aside className="ledger-detail" aria-label="Selected evidence record">
              {selected && snapshot ? (
                <>
                  <div className="detail-head">
                    <div><span>SELECTED EVIDENCE RECORD</span><code>{selected.id}</code></div>
                    <span className={`ledger-state ${selected.outcome ? 'settled' : 'unresolved'}`}>{selected.outcome ? 'SETTLED' : 'UNRESOLVED'}</span>
                  </div>
                  <dl>
                    <div><dt>Hazard</dt><dd>{String(selected.prediction.payload.hazard ?? 'UNKNOWN')}</dd></div>
                    <div><dt>Source</dt><dd>{snapshot.source.name}</dd></div>
                    <div><dt>Event / location</dt><dd>{eventLabel(selected.prediction.payload)}</dd></div>
                    <div><dt>Predicted outcome</dt><dd>{probabilityLabel(selected.prediction.payload)}</dd></div>
                    <div><dt>Event timestamp</dt><dd>{formatTimestamp(String(selected.prediction.payload.issued_at ?? ''))}</dd></div>
                    <div><dt>Committed timestamp</dt><dd>UNKNOWN — not retained by journal</dd></div>
                    <div><dt>Prediction age</dt><dd>{durationSince(String(selected.prediction.payload.issued_at ?? ''), now)}</dd></div>
                    <div><dt>Outcome</dt><dd>{outcomeLabel(selected.outcome)}</dd></div>
                    {selected.outcome && <div><dt>Outcome observed</dt><dd>{formatTimestamp(String(selected.outcome.payload.observed_at ?? ''))}</dd></div>}
                    <div><dt>Model version</dt><dd><code>{String(selected.prediction.payload.model_version ?? 'UNKNOWN')}</code></dd></div>
                    <div><dt>Hash</dt><dd><code title={selected.prediction.hash}>{selected.prediction.hash}</code></dd></div>
                    <div><dt>Previous hash</dt><dd><code title={selected.prediction.previous_hash}>{selected.prediction.previous_hash}</code></dd></div>
                    <div><dt>Provenance</dt><dd><span className="provenance-chip">REAL SHADOW JOURNAL</span> {snapshot.source.model_input}</dd></div>
                  </dl>
                  <div className="commit-explainer">When the outcome arrives, it is appended as a new hash-linked record. This prediction payload is not overwritten; changing it breaks verification.</div>
                </>
              ) : <p>No prediction selected.</p>}
            </aside>
          </div>
        </>
      )}

      <section className="verification-scope">
        <strong>WHAT “VERIFY LEDGER” PROVES</strong>
        <p>The browser re-hashes every canonical payload and previous-hash link in this actual API snapshot, and requires the backend’s verification of the on-disk journal to agree. It does not prove external timestamp anchoring or that the repository’s history was never rewritten.</p>
        {snapshot && <p><strong>Timestamp limitation:</strong> {snapshot.timestamp_basis}</p>}
      </section>
    </div>
  )
}
