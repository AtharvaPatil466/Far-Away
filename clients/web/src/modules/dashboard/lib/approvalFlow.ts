import type { CommanderApprovalResult } from '@/services/backendService'
import type { AgentStageState } from '../components/AgentTrace'

export type ApprovalSubmission = 'idle' | 'submitting'

export function commanderStageForApproval(
  confirmed: CommanderApprovalResult | null,
  _submission: ApprovalSubmission = 'idle',
): 'complete' | 'waiting' {
  return confirmed ? 'complete' : 'waiting'
}

/**
 * A human decision is pending only when an escalation actually awaits review.
 * Upstream agent completion NEVER implies a pending command decision.
 */
export function commanderReviewRequired(
  stageState: AgentStageState,
  pendingHumanDecisions: number,
): boolean {
  return stageState === 'waiting' && pendingHumanDecisions > 0
}

export function approvalIsAuditable(result: CommanderApprovalResult | null): result is CommanderApprovalResult {
  return Boolean(result?.ok && result.dispatched.length && result.audit_record?._hash)
}
