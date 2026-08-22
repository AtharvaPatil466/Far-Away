import { useState, useEffect } from 'react'
import type { EscalationItem } from '../lib/mapTypes'
import { MOCK_ESCALATIONS } from '../data/escalationData'
import type { DataSourceState } from '../lib/systemStatus'
import {
  approveEscalation,
  fetchEscalationsWithSource,
  type CommanderApprovalResult,
} from '../services/backendService'

export function useEscalations() {
  const [escalations, setEscalations] = useState<EscalationItem[]>(MOCK_ESCALATIONS)
  const [dataSource, setDataSource] = useState<DataSourceState>('fallback')
  const [lastAuthorization, setLastAuthorization] = useState<CommanderApprovalResult | null>(null)
  const clearAuthorization = () => setLastAuthorization(null)

  useEffect(() => {
    let cancelled = false
    void fetchEscalationsWithSource().then((result) => {
      if (cancelled) return
      setEscalations(result.data)
      setDataSource(result.source === 'live' ? 'live' : 'fallback')
    })
    return () => { cancelled = true }
  }, [])

  async function approve(id: string): Promise<CommanderApprovalResult | null> {
    if (dataSource !== 'live') return null
    const result = await approveEscalation(id)
    if (!result) return null
    setEscalations(prev => prev.map(e => (
      e.id === id ? { ...e, status: 'APPROVED' as const, resolvedAt: Date.now() } : e
    )))
    setLastAuthorization(result)
    return result
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
    if (dataSource === 'live') return
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
  }, [dataSource])

  const pending = escalations.filter(e => e.status === 'PENDING')
  const resolved = escalations.filter(e => e.status !== 'PENDING')

  return { escalations, pending, resolved, approve, overrideItem, dataSource, lastAuthorization, clearAuthorization }
}
