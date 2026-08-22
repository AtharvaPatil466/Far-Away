import { useState, useEffect } from 'react'
import type { EscalationItem } from '../lib/mapTypes'
import { MOCK_ESCALATIONS } from '../data/escalationData'
import type { DataSourceState } from '../lib/systemStatus'

export function useEscalations() {
  const [escalations, setEscalations] = useState<EscalationItem[]>(MOCK_ESCALATIONS)
  // This dashboard hook intentionally seeds static demo scenarios; expose that provenance to the UI.
  const dataSource: DataSourceState = 'fallback'

  function approve(id: string) {
    setEscalations(prev =>
      prev.map(e =>
        e.id === id ? { ...e, status: 'APPROVED' as const, resolvedAt: Date.now() } : e
      )
    )
  }

  function overrideItem(id: string, reason: string) {
    setEscalations(prev =>
      prev.map(e =>
        e.id === id
          ? { ...e, status: 'OVERRIDDEN' as const, overrideReason: reason, resolvedAt: Date.now() }
          : e
      )
    )
  }

  // Auto-execute pending non-human-only escalations when countdown hits 0
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setEscalations(prev =>
        prev.map(e => {
          if (
            e.status === 'PENDING' &&
            e.timeoutMs !== Infinity &&
            now - e.createdAt >= e.timeoutMs
          ) {
            return { ...e, status: 'AUTO_EXECUTED' as const, resolvedAt: now }
          }
          return e
        })
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const pending = escalations.filter(e => e.status === 'PENDING')
  const resolved = escalations.filter(e => e.status !== 'PENDING')

  return { escalations, pending, resolved, approve, overrideItem, dataSource }
}
