// Shared types for the EVIDENCE module (cyclone backtest, feed provenance,
// shadow journal). These mirror the data contracts produced by the backend/data
// lane — consumed as documented JSON, never imported across the lane boundary.

export interface CycloneStorm {
  sid: string
  name: string
  season: number
  landfall_time: string
  landfall_lat: number
  landfall_lon: number
  region: string
  max_wind_kt: number | null
  cutoff_wind_kt: number | null
  activated: boolean | null // null = "unknown" (no pre-cutoff wind record)
}

export interface CycloneRegion {
  region: string
  storms: number
  activated: number
  unknown: number
  activation_rate: number
}

export interface CycloneBacktest {
  lead_hours: number
  total_storms: number
  india_landfalls: number
  activated: number
  unknown: number
  activation_rate: number
  regions: CycloneRegion[]
  storms: CycloneStorm[]
  notes?: string | string[]
}

export type FeedStatus = 'live' | 'degraded' | 'key-required'

export interface FeedAdapter {
  name: string
  source: string
  endpoint: string
  status: FeedStatus
  detail: string
  keyFree: boolean
}

export interface ShadowRecord {
  kind: 'prediction' | 'outcome'
  payload: Record<string, unknown>
  hash: string
}

export interface ShadowJournalDoc {
  _note?: string
  genesis: string
  records: ShadowRecord[]
}

export type LiveEvidenceAvailability = 'LIVE' | 'CACHED' | 'UNAVAILABLE'
export type LedgerVerification = 'NOT AVAILABLE' | 'VERIFYING' | 'VERIFIED' | 'BROKEN'

export interface LiveEvidenceRecord {
  kind: 'prediction' | 'outcome'
  payload: Record<string, unknown>
  canonical_payload: string
  hash: string
  previous_hash: string
}

export interface LiveEvidenceCounts {
  records: number
  predictions: number
  outcomes: number
  unresolved: number | null
  settled: number | null
}

export interface LiveEvidenceScorecard {
  n_predictions: number
  n_resolved: number
  n_unresolved: number
  threshold?: number
  auc?: number
  brier?: number
  ece?: number
  confusion?: {
    pod: number
    far: number
    tp: number
    fp: number
    fn: number
    tn: number
  }
}

export interface LiveEvidenceSnapshot {
  schema_version: 1
  served_at: string
  journal_file_modified_at: string
  journal_last_activity_at: string | null
  classification: 'LIVE'
  source: {
    name: string
    feed: string
    journal: string
    model_input: string
  }
  timestamp_basis: string
  signals_ingested: number | null
  chain_verified: boolean
  genesis: string
  counts: LiveEvidenceCounts
  scorecard: LiveEvidenceScorecard | null
  records: LiveEvidenceRecord[]
}

export interface CachedLiveEvidence {
  cached_at: string
  snapshot: LiveEvidenceSnapshot
}

export type CommanderFeedHealthState =
  | 'connected'
  | 'degraded'
  | 'stale'
  | 'not-active'
  | 'status-unavailable'
  | 'shadow-source'

export interface CommanderFeedHealthSource {
  id: 'usgs' | 'ncs' | 'cwc-wris' | 'imd' | 'bhuvan' | 'open-meteo' | 'firms' | 'openweathermap'
  name: string
  role: string
  state: CommanderFeedHealthState
  lastSuccessfulPollAt: string | null
  lastPredictionEventAt: string | null
  evidenceNote: string
}
