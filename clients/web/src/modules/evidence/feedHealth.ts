import type { CommanderFeedHealthSource, LiveEvidenceSnapshot } from './types'

const RUNTIME_SOURCES: ReadonlyArray<Pick<CommanderFeedHealthSource, 'id' | 'name' | 'role'>> = [
  { id: 'usgs', name: 'USGS', role: 'Earthquakes' },
  { id: 'ncs', name: 'NCS', role: 'India seismic' },
  { id: 'cwc-wris', name: 'CWC-WRIS', role: 'River gauges' },
  { id: 'imd', name: 'IMD', role: 'Cyclone / rainfall' },
  { id: 'bhuvan', name: 'Bhuvan', role: 'Flood extent' },
  { id: 'open-meteo', name: 'Open-Meteo', role: 'Forecast weather' },
  { id: 'firms', name: 'FIRMS', role: 'Active fire' },
  { id: 'openweathermap', name: 'OpenWeatherMap', role: 'Wind conditions' },
]

function latestPredictionEventAt(snapshot: LiveEvidenceSnapshot): string | null {
  const timestamps = snapshot.records
    .filter((record) => record.kind === 'prediction')
    .map((record) => String(record.payload.issued_at ?? ''))
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))
  return timestamps[0] ?? null
}

/**
 * Build Commander-facing feed provenance without inferring runtime connectivity.
 * The current backend exposes no per-adapter live mode, successful-poll timestamp,
 * or circuit-breaker state. A valid Live Evidence snapshot proves only that a real
 * USGS shadow journal is available; it does not prove the runtime USGS adapter is connected.
 */
export function buildCommanderFeedHealth(
  shadowSnapshot: LiveEvidenceSnapshot | null,
): CommanderFeedHealthSource[] {
  return RUNTIME_SOURCES.map((source) => {
    if (source.id === 'usgs' && shadowSnapshot) {
      return {
        ...source,
        state: 'shadow-source',
        lastSuccessfulPollAt: null,
        lastPredictionEventAt: latestPredictionEventAt(shadowSnapshot),
        evidenceNote: 'Real USGS shadow journal available; runtime poll and commit timestamps are not exposed.',
      }
    }
    return {
      ...source,
      state: 'status-unavailable',
      lastSuccessfulPollAt: null,
      lastPredictionEventAt: null,
      evidenceNote: 'Adapter exists, but current runtime poll evidence is not exposed to the frontend.',
    }
  })
}

export function relativeAge(value: string | null, now = Date.now()): string | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}

export function isStaleEvidence(value: string | null, now = Date.now()): boolean {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && now - timestamp > 86_400_000
}
