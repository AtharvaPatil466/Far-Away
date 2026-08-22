// Mirrors disastermind/models/reconcile.py. Additive only.
export interface Alternative {
  value: unknown
  source: string
  obs_id: string
  observed_at: string
  delta: number | null
  beyond_tolerance: boolean
}

export interface FieldSelection {
  field: string
  value: unknown
  source: string
  obs_id: string
  observed_at: string
  rule: 'authority' | 'recency' | 'corroboration' | 'retracted' | 'unresolved'
  reason: string
  corroboration: number
  contested: boolean
  unresolved: boolean
  alternatives: Alternative[]
}

export interface Change {
  field: string
  before: unknown
  after: unknown
  rule: string
  rule_reason: string
  kind: string
  contested: boolean
}

export type RevisionKind = 'UPDATE' | 'CONFLICT' | 'LATE_CORRECTION' | 'RETRACTION'

export interface Revision {
  seq: number
  at: string
  causing_obs_id: string
  source: string
  kind: RevisionKind
  changes: Change[]
  classification: 'MEANINGFUL' | 'MINOR'
  reason: string
  recommendation_before: string
  recommendation_after: string
}

export interface ObservationRecord {
  obs_id: string
  source: string
  source_event_id: string
  observed_at: string
  received_at: string
  payload: Record<string, unknown>
  content_hash: string
  is_retraction: boolean
}

export interface ProvenanceDoc {
  incident_id: string
  counts: {
    total: number
    meaningful: number
    minor: number
    suppressed_by_toggle: number
    by_kind: Record<string, number>
  }
  canonical: {
    incident_id: string
    recommendation: string
    p_event: number
    fields: Record<string, FieldSelection>
    contested_fields: string[]
    unresolved_fields: string[]
  }
  revisions: Revision[]
  observations: ObservationRecord[]
  policy: string
}
