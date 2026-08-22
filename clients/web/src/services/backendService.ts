import { MOCK_ESCALATIONS } from '../data/escalationData'
import type { EscalationItem } from '../lib/mapTypes'
import type { SourcedResult } from '../lib/systemStatus'

// API base — overridable per environment via VITE_API_BASE_URL (e.g. point at a
// local backend during dev); defaults to the deployed Railway instance.
export const BACKEND_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://far-away-production.up.railway.app'

const BASE_URL = BACKEND_BASE_URL

// ── Internal types for backend wire format ──────────────────────────────────

interface BackendMessage {
  id: string
  type: string
  summary?: string
  description?: string
  severity?: string
  timestamp: string
  incident_id?: string
}

export interface AlertItem {
  id: string
  headline: string
  severity: 'RED' | 'ORANGE' | 'YELLOW'
  type: string
  district: string
  timestamp: string
  source: 'live' | 'fallback'
}

// ── Mock fallback data ──────────────────────────────────────────────────────

export const MOCK_ALERTS: AlertItem[] = [
  {
    id: 'live-alert-001',
    headline: 'Cyclone Remal — Landfall imminent, T-6h. Winds 165 kmph.',
    severity: 'RED',
    type: 'CYCLONE',
    district: 'Jagatsinghpur',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    source: 'fallback',
  },
  {
    id: 'live-alert-002',
    headline: 'Storm surge warning — 2.1m above normal tide. Evacuate coastal belt.',
    severity: 'RED',
    type: 'STORM_SURGE',
    district: 'Kendrapara',
    timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    source: 'fallback',
  },
  {
    id: 'live-alert-003',
    headline: 'Mahanadi in spate — gauge at 91.2%. Flash flood risk HIGH.',
    severity: 'ORANGE',
    type: 'FLOOD',
    district: 'Cuttack',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    source: 'fallback',
  },
]

function mapBackendMessageToAlert(msg: BackendMessage): AlertItem {
  const sev = (msg.severity ?? 'ORANGE').toUpperCase()
  return {
    id: msg.id,
    headline: msg.summary ?? msg.description ?? 'No details',
    severity: sev === 'RED' ? 'RED' : sev === 'YELLOW' ? 'YELLOW' : 'ORANGE',
    type: msg.type.toUpperCase(),
    district: msg.incident_id ?? 'Unknown',
    timestamp: msg.timestamp,
    source: 'live',
  }
}

// ── REST helpers ──────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/healthz`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchEscalationsWithSource(): Promise<SourcedResult<EscalationItem[]>> {
  try {
    const res = await fetch(`${BASE_URL}/escalations`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error('non-200')
    const data = await res.json() as unknown
    // data may be an array directly or wrapped — handle both
    if (Array.isArray(data)) return { data: data as EscalationItem[], source: 'live' }
    const wrapped = data as Record<string, unknown>
    return { data: (wrapped.items ?? wrapped.escalations ?? []) as EscalationItem[], source: 'live' }
  } catch {
    return { data: MOCK_ESCALATIONS, source: 'fallback' }
  }
}

/** Backwards-compatible data-only helper. Use `fetchEscalationsWithSource` for provenance. */
export async function fetchEscalations(): Promise<EscalationItem[]> {
  return (await fetchEscalationsWithSource()).data
}

export async function fetchRecentAlertsWithSource(): Promise<SourcedResult<AlertItem[]>> {
  try {
    const res = await fetch(`${BASE_URL}/recent?limit=20`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error('non-200')
    const data = await res.json() as unknown
    const messages: BackendMessage[] = Array.isArray(data) ? data as BackendMessage[] : (data as Record<string, unknown>).messages as BackendMessage[] ?? []
    return {
      data: messages
      .filter(m => m.type === 'alert')
      .map(mapBackendMessageToAlert),
      source: 'live',
    }
  } catch {
    return { data: MOCK_ALERTS, source: 'fallback' }
  }
}

/** Backwards-compatible data-only helper. Use `fetchRecentAlertsWithSource` for provenance. */
export async function fetchRecentAlerts(): Promise<AlertItem[]> {
  return (await fetchRecentAlertsWithSource()).data
}

export async function approveEscalation(
  reportId: string,
  approver = 'CDR-SOHAM'
): Promise<boolean> {
  try {
    const res = await fetch(
      `${BASE_URL}/escalations/${reportId}/approve?approver=${approver}`,
      { method: 'POST', signal: AbortSignal.timeout(6000) }
    )
    return res.ok
  } catch {
    return false
  }
}

export async function rejectEscalation(
  reportId: string,
  approver = 'CDR-SOHAM',
  note = ''
): Promise<boolean> {
  try {
    const res = await fetch(
      `${BASE_URL}/escalations/${reportId}/reject?approver=${approver}&note=${encodeURIComponent(note)}`,
      { method: 'POST', signal: AbortSignal.timeout(6000) }
    )
    return res.ok
  } catch {
    return false
  }
}
