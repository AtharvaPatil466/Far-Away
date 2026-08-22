import { cn } from '@/lib/utils'

export type AgentStageState = 'complete' | 'active' | 'waiting' | 'error'

export interface AgentTraceStage {
  id: string
  label: string
  icon: string
  state: AgentStageState
}

interface AgentTraceProps {
  stages: readonly AgentTraceStage[]
  className?: string
  /**
   * Explicit pending-human-decision signal for the COMMAND stage. When provided,
   * it replaces the positional inference (waiting + upstream complete); omit it
   * to keep the demo-trace narrative behaviour unchanged.
   */
  humanDecisionPending?: boolean
}

const STATE_META: Record<
  AgentStageState,
  { label: string; marker: string; labelClass: string; line: string }
> = {
  complete: {
    label: 'Complete',
    marker: 'border-primary bg-primary',
    labelClass: 'text-on-surface',
    line: 'border-on-surface/55',
  },
  active: {
    label: 'Active',
    marker: 'border-primary bg-background outline outline-1 outline-offset-2 outline-primary/40',
    labelClass: 'text-primary',
    line: 'border-primary',
  },
  waiting: {
    label: 'Waiting',
    marker: 'border-outline-variant bg-background',
    labelClass: 'text-on-surface-variant',
    line: 'border-outline-variant',
  },
  error: {
    label: 'Blocked',
    marker: 'border-error bg-error',
    labelClass: 'text-error',
    line: 'border-error',
  },
}

const COMMANDER_REVIEW_META = {
  label: 'Review required',
  marker: 'border-warning bg-warning',
  labelClass: 'text-warning',
  line: 'border-warning',
}

const COMMANDER_READY_META = {
  ...STATE_META.waiting,
  label: 'Ready',
}

const DISPLAY_LABELS: Record<string, string> = {
  ingestion: 'Ingest',
  prediction: 'Predict',
  cascade: 'Cascade',
  resource: 'Resource',
  routing: 'Route',
  commander: 'Command',
}

/** A compact, data-driven view of the multi-agent decision pipeline. */
export function AgentTrace({ stages, className, humanDecisionPending }: AgentTraceProps) {
  return (
    <section className={cn('shrink-0 py-inversa-21', className)} aria-labelledby="agent-trace-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-label-sm uppercase text-on-surface-variant">Autonomous coordination path</p>
          <h2 id="agent-trace-title" className="mt-1 text-[29px] font-normal tracking-[-0.03em] text-on-surface">Agent pipeline</h2>
        </div>
        <span className="font-mono text-label-sm uppercase text-on-surface-variant">{stages.length} stages / human authority retained</span>
      </div>

      <ol className="grid grid-cols-2 gap-x-0 gap-y-7 sm:grid-cols-3 lg:grid-cols-6" aria-label="Agent processing stages">
          {stages.map((stage, index) => {
            const upstreamComplete = stage.id === 'commander'
              && stages.slice(0, index).every((priorStage) => priorStage.state === 'complete')
            const commanderWaiting = stage.id === 'commander' && stage.state === 'waiting'
            const reviewRequired = commanderWaiting
              && (humanDecisionPending ?? upstreamComplete)
            const meta = commanderWaiting
              ? reviewRequired ? COMMANDER_REVIEW_META : COMMANDER_READY_META
              : STATE_META[stage.state]

            return (
              <li key={stage.id} className={cn('relative border-t pt-4', meta.line)}>
                <span className={cn('absolute -top-[5px] left-0 h-[9px] w-[9px] rounded-full border', meta.marker)} aria-hidden="true" />
                <span className={cn('block font-mono text-label-md uppercase tracking-[0.08em]', meta.labelClass)}>
                  {DISPLAY_LABELS[stage.id] ?? stage.label}
                </span>
                <span className={cn('mt-2 block font-mono text-[10px] uppercase', meta.labelClass)}>{meta.label}</span>
              </li>
            )
          })}
      </ol>
    </section>
  )
}
