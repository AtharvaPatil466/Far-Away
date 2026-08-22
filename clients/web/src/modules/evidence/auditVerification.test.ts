import { describe, expect, it } from 'vitest'
import { stateFromVerification, TAMPER_DEMO_SCOPE } from './auditVerification'

describe('real ledger verification', () => {
  it('reports verified and broken only from backend verification evidence', () => {
    expect(stateFromVerification({ valid: true, available: true, entries_checked: 4, head_hash: 'abc', failure_index: null })).toBe('verified')
    expect(stateFromVerification({ valid: false, available: true, entries_checked: 2, head_hash: 'abc', failure_index: 3 })).toBe('broken')
    expect(stateFromVerification(null)).toBe('unavailable')
  })

  it('keeps the tamper demonstration browser-only', () => {
    expect(TAMPER_DEMO_SCOPE).toBe('browser-only')
  })
})
