import type { CommanderApprovalResult } from '@/services/backendService'

export type ApprovalSubmission = 'idle' | 'submitting'

export function commanderStageForApproval(
  confirmed: CommanderApprovalResult | null,
  _submission: ApprovalSubmission = 'idle',
): 'complete' | 'waiting' {
  return confirmed ? 'complete' : 'waiting'
}

export function approvalIsAuditable(result: CommanderApprovalResult | null): result is CommanderApprovalResult {
  return Boolean(result?.ok && result.dispatched.length && result.audit_record?._hash)
}
