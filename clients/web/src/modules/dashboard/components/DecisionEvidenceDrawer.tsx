import { useEffect, useRef, useState } from 'react'
import type { EscalationItem } from '@/lib/mapTypes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

interface DecisionEvidenceDrawerProps {
  item: EscalationItem | null
  onClose: () => void
  onApprove: (id: string) => Promise<{ ok: boolean; error?: string }>
  onReject: (id: string) => void
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function DecisionEvidenceDrawer({ item, onClose, onApprove, onReject }: DecisionEvidenceDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const [evidenceRequested, setEvidenceRequested] = useState(false)
  const [approvalState, setApprovalState] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [approvalError, setApprovalError] = useState('')

  useEffect(() => {
    if (!item) return

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openerRef.current?.focus()
    }
  }, [item, onClose])

  useEffect(() => {
    setEvidenceRequested(false)
    setApprovalState('idle')
    setApprovalError('')
  }, [item?.id])

  if (!item) return null

  const evidence = item.decisionEvidence
  const isDemoEvidence = evidence?.source === 'demo'
  const displayEvidence = evidence ?? {
    source: 'live' as const,
    riskScore: 0,
    confidence: 0,
    recommendedAction: item.memo.recommended,
    authorityLevel: 'EVIDENCE PENDING',
    authorityRule: 'No authority rule received',
    topFactors: [],
    riskIfApproved: item.memo.riskIfYes,
    riskIfRejected: item.memo.riskIfNo,
    agentPath: [],
  }

  const approveDecision = async () => {
    setApprovalState('submitting')
    setApprovalError('')
    const result = await onApprove(item.id)
    if (result.ok) {
      onClose()
      return
    }
    setApprovalState('error')
    setApprovalError(result.error ?? 'Approval was not confirmed. This decision remains under review.')
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close decision evidence"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-scrim/70"
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-evidence-title"
        className="relative flex h-full w-full max-w-xl flex-col border-l border-outline-variant/40 bg-surface-container shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/20 bg-surface-container-high px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="decision-evidence-title" className="text-headline-sm text-primary">Decision Evidence</h2>
              {isDemoEvidence && <Badge variant="warning">Demo evidence</Badge>}
            </div>
            <p className="mt-1 text-body-sm text-on-surface-variant">{item.zone} · {item.id}</p>
          </div>
          <Button ref={closeButtonRef} type="button" variant="ghost" size="icon" aria-label="Close decision evidence" onClick={onClose}>
            <Icon name="close" />
          </Button>
        </div>

        <div className="dm-scroll flex-1 overflow-y-auto px-5 py-4">
          {isDemoEvidence && (
            <div className="mb-4 flex gap-2 rounded border border-warning/25 bg-warning/10 p-3 text-body-sm text-on-surface-variant">
              <Icon name="science" className="shrink-0 text-[18px] text-warning" />
              <p>Demo evidence for review UX only — this is not live backend output.</p>
            </div>
          )}

          <section className="grid grid-cols-2 gap-3" aria-label="Decision summary">
            <EvidenceMetric label="Risk score" value={displayEvidence.riskScore ? `${displayEvidence.riskScore}%` : 'Pending'} tone="critical" />
            <EvidenceMetric label="Confidence" value={displayEvidence.confidence ? `${displayEvidence.confidence}%` : 'Pending'} />
          </section>

          <EvidenceSection label="Recommended action">
            <p className="text-body-md text-on-surface">{displayEvidence.recommendedAction}</p>
          </EvidenceSection>

          <section className="mt-5 grid gap-3 rounded border border-outline-variant/25 bg-surface p-3">
            <EvidenceRow label="Authority level" value={displayEvidence.authorityLevel} emphasized />
            <EvidenceRow label="Authority rule triggered" value={displayEvidence.authorityRule} />
          </section>

          <EvidenceSection label="Top contributing factors">
            {displayEvidence.topFactors.length ? (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {displayEvidence.topFactors.map((factor) => (
                  <li key={factor.label} className="flex items-center justify-between rounded border border-outline-variant/20 bg-surface px-3 py-2 text-body-sm">
                    <span className="text-on-surface">{factor.label}</span>
                    <span className="font-mono text-label-md text-error">{factor.impact}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-body-sm text-on-surface-variant">No factor evidence received.</p>}
          </EvidenceSection>

          <EvidenceSection label="Decision impact">
            <div className="grid gap-3">
              <div className="rounded border border-success/20 bg-success-container/15 p-3">
                <p className="text-label-sm uppercase text-success">Risk if approved</p>
                <p className="mt-1 text-body-sm text-on-surface">{displayEvidence.riskIfApproved}</p>
              </div>
              <div className="rounded border border-error/20 bg-error-container/15 p-3">
                <p className="text-label-sm uppercase text-error">Risk if rejected</p>
                <p className="mt-1 text-body-sm text-on-surface">{displayEvidence.riskIfRejected}</p>
              </div>
            </div>
          </EvidenceSection>

          <EvidenceSection label="Agent path">
            {displayEvidence.agentPath.length ? (
              <p className="rounded border border-outline-variant/25 bg-surface px-3 py-2 font-mono text-body-sm text-primary">
                {displayEvidence.agentPath.join(' → ')}
              </p>
            ) : <p className="text-body-sm text-on-surface-variant">Agent path has not been received.</p>}
          </EvidenceSection>

          {evidenceRequested && (
            <p className="mt-5 rounded border border-primary/25 bg-primary-container/20 p-3 text-body-sm text-on-surface" role="status">
              More evidence requested locally. No backend request has been sent.
            </p>
          )}
          {approvalState === 'error' && (
            <p className="mt-5 border border-error/40 bg-error-container/15 p-3 text-body-sm text-error" role="alert">
              {approvalError}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-outline-variant/20 bg-surface-container-high p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={approvalState === 'submitting'} onClick={() => setEvidenceRequested(true)}>
            Request More Evidence
          </Button>
          <Button type="button" variant="destructive" disabled={approvalState === 'submitting'} onClick={() => { onReject(item.id); onClose() }}>
            Reject
          </Button>
          <Button type="button" variant="accent" disabled={approvalState === 'submitting'} onClick={() => void approveDecision()}>
            {approvalState === 'submitting' ? 'Authorizing…' : 'Approve'}
          </Button>
        </div>
      </aside>
    </div>
  )
}

function EvidenceMetric({ label, value, tone }: { label: string; value: string; tone?: 'critical' }) {
  return (
    <div className="rounded border border-outline-variant/25 bg-surface p-3">
      <p className="text-label-sm uppercase text-on-surface-variant">{label}</p>
      <p className={cn('mt-1 font-mono text-headline-sm', tone === 'critical' ? 'text-error' : 'text-primary')}>{value}</p>
    </div>
  )
}

function EvidenceRow({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div>
      <p className="text-label-sm uppercase text-on-surface-variant">{label}</p>
      <p className={cn('mt-1 text-body-sm', emphasized ? 'font-bold text-secondary' : 'text-on-surface')}>{value}</p>
    </div>
  )
}

function EvidenceSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-label-md uppercase text-on-surface-variant">{label}</h3>
      {children}
    </section>
  )
}
