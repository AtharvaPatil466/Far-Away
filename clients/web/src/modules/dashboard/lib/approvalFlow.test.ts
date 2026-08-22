import { describe, expect, it } from 'vitest'
import { approvalIsAuditable, commanderStageForApproval } from './approvalFlow'
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
