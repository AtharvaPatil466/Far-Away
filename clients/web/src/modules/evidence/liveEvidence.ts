import { BACKEND_BASE_URL } from '../../services/backendService'
import type { CachedLiveEvidence, LiveEvidenceSnapshot } from './types'

const CACHE_KEY = 'disastermind.live-evidence.v1'

function isSnapshot(value: unknown): value is LiveEvidenceSnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LiveEvidenceSnapshot>
  return candidate.schema_version === 1
    && candidate.classification === 'LIVE'
    && typeof candidate.served_at === 'string'
    && typeof candidate.chain_verified === 'boolean'
    && typeof candidate.genesis === 'string'
    && Array.isArray(candidate.records)
    && candidate.records.every((record) => (
      (record.kind === 'prediction' || record.kind === 'outcome')
      && typeof record.hash === 'string'
      && typeof record.previous_hash === 'string'
      && typeof record.canonical_payload === 'string'
      && !!record.payload
    ))
    && !!candidate.counts
}

export async function fetchLiveEvidence(): Promise<LiveEvidenceSnapshot> {
  const response = await fetch(`${BACKEND_BASE_URL}/evidence/live`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
  })
  if (!response.ok) throw new Error(`Live evidence endpoint returned HTTP ${response.status}`)
  const body: unknown = await response.json()
  if (!isSnapshot(body)) throw new Error('Live evidence endpoint returned an invalid snapshot')
  return body
}

export function readCachedLiveEvidence(): CachedLiveEvidence | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as Partial<CachedLiveEvidence>
    if (typeof cached.cached_at !== 'string' || !isSnapshot(cached.snapshot)) return null
    if (!Number.isFinite(Date.parse(cached.cached_at))) return null
    return cached as CachedLiveEvidence
  } catch {
    return null
  }
}

export function cacheLiveEvidence(snapshot: LiveEvidenceSnapshot, cachedAt = new Date()): void {
  try {
    const cached: CachedLiveEvidence = { cached_at: cachedAt.toISOString(), snapshot }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // Storage can be blocked or full. The successful live snapshot remains usable
    // for this session; the UI never substitutes demo data.
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Re-hash every canonical payload and link in the actual fetched/cached snapshot. */
export async function verifyLiveEvidence(snapshot: LiveEvidenceSnapshot): Promise<boolean> {
  let previous = snapshot.genesis
  for (const record of snapshot.records) {
    if (record.previous_hash !== previous) return false
    const computed = await sha256(`${previous}|${record.canonical_payload}`)
    if (computed !== record.hash) return false
    previous = record.hash
  }
  return snapshot.chain_verified
}

export function predictionId(payload: Record<string, unknown>): string {
  return String(payload.id ?? payload.prediction_id ?? 'UNKNOWN')
}
