import { useState } from 'react'
import type { CommanderApprovalResult } from '@/services/backendService'

const shortHash = (value: string) => `${value.slice(0, 12)}…`

export function AuthorizationReceipt({ result }: { result: CommanderApprovalResult }) {
  const [expanded, setExpanded] = useState(false)
  const dispatch = result.dispatched[0]
  const audit = result.audit_record
  const order = dispatch.payload.order as Record<string, unknown> | undefined

  return (
    <section className="border-y border-outline-variant py-inversa-29" aria-labelledby="authorization-title" aria-live="polite">
      <div className="grid gap-7 md:grid-cols-3">
        <div>
          <p className="font-mono text-label-sm uppercase text-on-surface-variant">Human decision</p>
          <h2 id="authorization-title" className="mt-2 text-[clamp(28px,3vw,42px)] font-normal uppercase text-primary">Approved</h2>
          <p className="mt-2 font-mono text-[10px] uppercase text-on-surface-variant">{result.report_id}</p>
        </div>
        <div className="border-outline-variant md:border-l md:pl-7">
          <p className="font-mono text-label-sm uppercase text-on-surface-variant">Dispatch</p>
          <p className="mt-2 font-mono text-headline-sm uppercase text-on-surface">Authorized</p>
          <p className="mt-2 text-body-sm text-on-surface-variant">
            {typeof order?.team_id === 'string' ? order.team_id : 'Field order'}
            {typeof order?.site === 'string' ? ` · ${order.site}` : ''}
          </p>
        </div>
        <div className="border-outline-variant md:border-l md:pl-7">
          <p className="font-mono text-label-sm uppercase text-on-surface-variant">Audit record</p>
          <p className="mt-2 font-mono text-headline-sm text-on-surface">{audit.id}</p>
          <p className="mt-1 font-mono text-label-sm uppercase text-on-surface-variant">Hash {shortHash(audit._hash)}</p>
          <button type="button" className="mt-4 font-mono text-label-sm uppercase text-primary hover:underline" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Hide evidence' : 'View evidence →'}
          </button>
        </div>
      </div>
      {expanded && (
        <dl className="mt-7 grid gap-4 border-t border-outline-variant pt-5 font-mono text-label-sm sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="uppercase text-on-surface-variant">Approver</dt><dd className="mt-1 text-on-surface">{result.approver}</dd></div>
          <div><dt className="uppercase text-on-surface-variant">Committed</dt><dd className="mt-1 text-on-surface">{audit.timestamp}</dd></div>
          <div><dt className="uppercase text-on-surface-variant">Previous hash</dt><dd className="mt-1 break-all text-on-surface">{audit._prev}</dd></div>
          <div><dt className="uppercase text-on-surface-variant">Entry hash</dt><dd className="mt-1 break-all text-on-surface">{audit._hash}</dd></div>
        </dl>
      )}
    </section>
  )
}
