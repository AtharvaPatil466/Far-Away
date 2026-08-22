import type { AuditVerificationResult } from '@/services/backendService'

export type RealLedgerState = 'not-verified' | 'verifying' | 'verified' | 'broken' | 'unavailable'
export const TAMPER_DEMO_SCOPE = 'browser-only' as const

export function stateFromVerification(result: AuditVerificationResult | null): RealLedgerState {
  if (!result?.available) return 'unavailable'
  return result.valid ? 'verified' : 'broken'
}
