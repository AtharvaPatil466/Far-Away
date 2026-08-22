import { describe, expect, it } from 'vitest'
import { approvalIsAuditable, commanderReviewRequired, commanderStageForApproval } from './approvalFlow'
import type { CommanderApprovalResult } from '@/services/backendService'
import { goldenDemoAgentTrace } from '../../../lib/goldenDemo'

const confirmed: CommanderApprovalResult = {
  ok: true,
  report_id: 'esc-real',
  action: 'approve',
  approver: 'CDR-TEST',
  dispatched: [{
    id: 'dispatch-1', topic: 'tier3.dispatch', timestamp: '2026-08-22T00:00:00Z',
    reasoning: [], payload: {},
  }],
  audit_record: {
    id: 'dispatch-1', timestamp: '2026-08-22T00:00:00Z', reasoning: [], payload: {},
    _prev: '0'.repeat(64), _hash: 'a'.repeat(64),
  },
}

describe('commander approval presentation', () => {
  it('does not mark Command complete while approval is merely submitting', () => {
    expect(commanderStageForApproval(null, 'submitting')).toBe('waiting')
  })

  it('requires dispatch and audit evidence before treating approval as auditable', () => {
    expect(approvalIsAuditable(confirmed)).toBe(true)
    expect(approvalIsAuditable(null)).toBe(false)
    expect(commanderStageForApproval(confirmed)).toBe('complete')
  })

  it('keeps Golden Demo completion independent from real approval state', () => {
    expect(commanderStageForApproval(null)).toBe('waiting')
    expect(goldenDemoAgentTrace('completed').at(-1)?.state).toBe('complete')
  })
})

describe('COMMAND review-required semantics', () => {
  it('never infers a review requirement from upstream completion alone (empty queue)', () => {
    expect(commanderReviewRequired('waiting', 0)).toBe(false)
    expect(commanderReviewRequired('complete', 0)).toBe(false)
  })

  it('requires review exactly when an escalation awaits the commander', () => {
    expect(commanderReviewRequired('waiting', 1)).toBe(true)
    expect(commanderReviewRequired('waiting', 3)).toBe(true)
  })

  it('counts non-critical escalations as human-authority decisions too', () => {
    // The escalation queue only contains authority-gated actions; priority is
    // presentation, not authority. Two pending HIGH items still need sign-off.
    expect(commanderReviewRequired('waiting', 2)).toBe(true)
  })

  it('clears stale review state once the queue is resolved', () => {
    // After approval/rejection/timeout resolves every item, COMMAND must not
    // stay REVIEW REQUIRED even though upstream stages remain complete.
    expect(commanderReviewRequired(commanderStageForApproval(null), 0)).toBe(false)
  })

  it('completes only on backend-confirmed authorization, regardless of queue size', () => {
    expect(commanderStageForApproval(confirmed)).toBe('complete')
    expect(commanderReviewRequired('complete', 2)).toBe(false)
  })

  it('keeps Golden Demo review progression independent from runtime counts', () => {
    const demo = goldenDemoAgentTrace('commander_review')
    expect(demo.at(-1)?.state).toBe('waiting')
    expect(demo.slice(0, -1).every((stage) => stage.state === 'complete')).toBe(true)
    // Runtime emptiness must not rewrite the demo narrative.
    expect(goldenDemoAgentTrace('completed').at(-1)?.state).toBe('complete')
  })
})
