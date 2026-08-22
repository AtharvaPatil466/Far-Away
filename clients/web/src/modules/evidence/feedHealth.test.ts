import { describe, expect, it } from 'vitest'
import { buildCommanderFeedHealth, isStaleEvidence, relativeAge } from './feedHealth'
import type { LiveEvidenceSnapshot } from './types'

function snapshot(): LiveEvidenceSnapshot {
  return {
    schema_version: 1,
    served_at: '2026-08-22T06:00:00Z',
    journal_file_modified_at: '2026-08-20T06:00:00Z',
    journal_last_activity_at: '2026-08-19T06:00:00Z',
    classification: 'LIVE',
    source: { name: 'USGS', feed: 'https://example.test/usgs', journal: 'shadow/usgs_season.jsonl', model_input: 'USGS M4.5+' },
    timestamp_basis: 'Event timestamp; commit time not retained.',
    signals_ingested: null,
    chain_verified: true,
    genesis: 'shadow-genesis',
    counts: { records: 2, predictions: 2, outcomes: 0, unresolved: 2, settled: 0 },
    scorecard: null,
    records: [
      { kind: 'prediction', payload: { issued_at: '2026-08-18T06:00:00Z' }, canonical_payload: '{}', hash: 'a', previous_hash: 'shadow-genesis' },
      { kind: 'prediction', payload: { issued_at: '2026-08-19T06:00:00Z' }, canonical_payload: '{}', hash: 'b', previous_hash: 'a' },
    ],
  }
}

describe('Commander feed health provenance', () => {
  it('never infers connected status when runtime poll evidence is unavailable', () => {
    const sources = buildCommanderFeedHealth(null)
    expect(sources).toHaveLength(8)
    expect(sources.every((source) => source.state === 'status-unavailable')).toBe(true)
    expect(sources.every((source) => source.lastSuccessfulPollAt === null)).toBe(true)
  })

  it('classifies valid USGS evidence as a shadow source, not a connected runtime feed', () => {
    const sources = buildCommanderFeedHealth(snapshot())
    const usgs = sources.find((source) => source.id === 'usgs')
    expect(usgs?.state).toBe('shadow-source')
    expect(usgs?.lastSuccessfulPollAt).toBeNull()
    expect(usgs?.lastPredictionEventAt).toBe('2026-08-19T06:00:00Z')
    expect(sources.some((source) => source.state === 'connected')).toBe(false)
  })

  it('formats and flags evidence age without creating a timestamp', () => {
    const now = Date.parse('2026-08-22T06:00:00Z')
    expect(relativeAge('2026-08-22T05:58:00Z', now)).toBe('2m ago')
    expect(relativeAge(null, now)).toBeNull()
    expect(isStaleEvidence('2026-08-20T06:00:00Z', now)).toBe(true)
    expect(isStaleEvidence(null, now)).toBe(false)
  })
})
