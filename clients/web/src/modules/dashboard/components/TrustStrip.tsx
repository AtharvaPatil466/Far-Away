import type { SystemStatusSnapshot } from '@/lib/systemStatus'
import { FeedHealthStrip } from './FeedHealthStrip'
import { SystemStatus } from './SystemStatus'

export function TrustStrip({ status }: { status: SystemStatusSnapshot }) {
  return (
    <section className="border-y border-outline-variant" aria-labelledby="trust-strip-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-outline-variant px-3 py-2">
        <h2 id="trust-strip-title" className="font-mono text-label-md uppercase text-on-surface">Trust / source evidence</h2>
        <span className="font-mono text-[10px] uppercase text-on-surface-variant">No optimistic health inference</span>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
        <SystemStatus status={status} />
        <FeedHealthStrip />
      </div>
    </section>
  )
}
