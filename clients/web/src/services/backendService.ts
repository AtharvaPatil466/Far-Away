import { MOCK_ESCALATIONS } from '../data/escalationData'
import type { EscalationItem, EscalationTrigger } from '../lib/mapTypes'
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

interface BackendPendingEscalation {
  report_id: string
  trigger?: string | null
  human_only?: boolean
  deadline_epoch?: number
  created_epoch?: number
  status?: string
  priority?: string
  incident_id?: string | null
  reasoning?: string[]
  order?: Record<string, unknown>
  summary?: string
}

export interface AuditRecord {
  id: string
  incident_id?: string | null
  timestamp: string
  reasoning: string[]
  payload: Record<string, unknown>
  _prev: string
  _hash: string
}

export interface CommanderApprovalResult {
  ok: true
  report_id: string
  action: 'approve'
  approver: string
  dispatched: BackendDispatchRecord[]
  audit_record: AuditRecord
}

export interface BackendDispatchRecord {
  id: string
  topic: string
  incident_id?: string | null
  timestamp: string
  reasoning: string[]
  payload: Record<string, unknown>
}

export interface AuditVerificationResult {
  valid: boolean
  available: boolean
  entries_checked: number
  head_hash: string | null
  failure_index: number | null
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
    if (Array.isArray(data)) return { data: mapPendingEscalations(data as BackendPendingEscalation[]), source: 'live' }
    const wrapped = data as Record<string, unknown>
    const rows = (wrapped.items ?? wrapped.escalations ?? []) as BackendPendingEscalation[]
    return { data: mapPendingEscalations(rows), source: 'live' }
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

const TRIGGER_MAP: Record<string, EscalationTrigger> = {
  cross_state_resource_request: 'CROSS_STATE_RESOURCE',
  military_asset_deployment: 'MILITARY_ASSET',
  mandatory_evacuation_gt_10000: 'MANDATORY_EVACUATION',
  requisition_private_infrastructure: 'REQUISITION_INFRASTRUCTURE',
  media_broadcast_order: 'MEDIA_BROADCAST',
  international_aid_request: 'INTERNATIONAL_AID',
  declare_state_of_emergency: 'STATE_OF_EMERGENCY',
  armed_forces_in_civil_situation: 'ARMED_FORCES',
  critical_national_infrastructure: 'CRITICAL_INFRASTRUCTURE',
}

function mapPendingEscalations(rows: BackendPendingEscalation[]): EscalationItem[] {
  return rows.flatMap((row) => {
    const trigger = TRIGGER_MAP[row.trigger ?? '']
    return trigger ? [mapPendingEscalation(row, trigger)] : []
  })
}

function mapPendingEscalation(row: BackendPendingEscalation, trigger: EscalationTrigger): EscalationItem {
  const order = row.order ?? {}
  const site = typeof order.site === 'string' ? order.site : row.incident_id ?? 'Incident context unavailable'
  const reason = typeof order.reason === 'string' ? order.reason : ''
  const createdAt = typeof row.created_epoch === 'number' ? row.created_epoch * 1000 : Date.now()
  const deadline = typeof row.deadline_epoch === 'number' ? row.deadline_epoch * 1000 : createdAt + 300_000
  const recommended = typeof order.body === 'string'
    ? order.body
    : reason || 'Authorize the pending field order through Commander authority.'
  return {
    id: row.report_id,
    trigger,
    zone: site,
    priority: row.priority === 'HIGH' ? 'HIGH' : row.priority === 'MEDIUM' ? 'MEDIUM' : 'CRITICAL',
    memo: {
      situation: row.summary || reason || 'A backend field order requires human authority.',
      recommended,
      riskIfYes: 'Operational consequences are limited to the field order returned by the backend.',
      riskIfNo: 'The field order remains pending; no dispatch is authorized.',
    },
    decisionEvidence: {
      source: 'live',
      riskScore: 0,
      confidence: 0,
      recommendedAction: recommended,
      authorityLevel: 'HUMAN APPROVAL REQUIRED',
      authorityRule: row.trigger ?? 'Authority rule not supplied',
      topFactors: [],
      riskIfApproved: 'The pending field order is dispatched through the existing command path.',
      riskIfRejected: 'The field order is rejected and no dispatch is created.',
      agentPath: [],
    },
    createdAt,
    timeoutMs: row.human_only ? Infinity : Math.max(0, deadline - createdAt),
    status: 'PENDING',
  }
}

export async function approveEscalation(
  reportId: string,
  approver = 'CDR-SOHAM'
): Promise<CommanderApprovalResult | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/escalations/${encodeURIComponent(reportId)}/approve?approver=${encodeURIComponent(approver)}`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': `commander-${reportId}` },
        signal: AbortSignal.timeout(6000),
      }
    )
    if (!res.ok) return null
    const result = await res.json() as Partial<CommanderApprovalResult>
    if (!result.ok || !result.audit_record || !result.dispatched?.length) return null
    return result as CommanderApprovalResult
  } catch {
    return null
  }
}

export async function verifyAuditLedger(): Promise<AuditVerificationResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/audit/verify`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    return await res.json() as AuditVerificationResult
  } catch {
    return null
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
