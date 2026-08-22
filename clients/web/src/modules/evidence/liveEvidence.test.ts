// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheLiveEvidence, readCachedLiveEvidence, verifyLiveEvidence } from './liveEvidence'
import type { LiveEvidenceSnapshot } from './types'

const payload = { id: 'eq-1', probability: 0.2 }
const canonical = '{"id":"eq-1","probability":0.2}'

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function snapshot(): Promise<LiveEvidenceSnapshot> {
  const recordHash = await hash(`shadow-genesis|${canonical}`)
  return {
    schema_version: 1,
    served_at: '2026-08-21T10:00:00Z',
    journal_file_modified_at: '2026-08-21T09:00:00Z',
    journal_last_activity_at: '2026-08-21T08:00:00Z',
    classification: 'LIVE',
    source: { name: 'USGS', feed: 'https://example.test', journal: 'shadow/live.jsonl', model_input: 'live feed' },
    timestamp_basis: 'USGS event time',
    signals_ingested: null,
    chain_verified: true,
    genesis: 'shadow-genesis',
    counts: { records: 1, predictions: 1, outcomes: 0, unresolved: 1, settled: 0 },
    scorecard: { n_predictions: 1, n_resolved: 0, n_unresolved: 1 },
    records: [{ kind: 'prediction', payload, canonical_payload: canonical, hash: recordHash, previous_hash: 'shadow-genesis' }],
  }
}

describe('live evidence cache and verification', () => {
  beforeEach(() => localStorage.clear())

  it('persists only an explicitly supplied successful snapshot', async () => {
    const live = await snapshot()
    cacheLiveEvidence(live, new Date('2026-08-21T10:01:00Z'))
    expect(readCachedLiveEvidence()?.snapshot.records[0].hash).toBe(live.records[0].hash)
    expect(readCachedLiveEvidence()?.cached_at).toBe('2026-08-21T10:01:00.000Z')
  })

  it('rejects malformed cached data', () => {
    localStorage.setItem('disastermind.live-evidence.v1', '{"cached_at":"nope"}')
    expect(readCachedLiveEvidence()).toBeNull()
  })

  it('verifies actual links and detects changed canonical payloads', async () => {
    const live = await snapshot()
    expect(await verifyLiveEvidence(live)).toBe(true)
    live.records[0].canonical_payload = '{"id":"edited"}'
    expect(await verifyLiveEvidence(live)).toBe(false)
  })

  it('does not claim verified when backend disk verification failed', async () => {
    const live = await snapshot()
    live.chain_verified = false
    expect(await verifyLiveEvidence(live)).toBe(false)
  })

  it('tolerates unavailable browser storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('blocked') })
    expect(() => cacheLiveEvidence({} as LiveEvidenceSnapshot)).not.toThrow()
  })
})
