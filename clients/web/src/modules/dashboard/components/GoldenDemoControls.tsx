import { Play, RotateCcw, StepForward } from 'lucide-react'
import type { DemoDecision, DemoStep, GoldenDemoStepMeta } from '@/lib/goldenDemo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface GoldenDemoControlsProps {
  step: DemoStep
  decision: DemoDecision
  current: GoldenDemoStepMeta | null
  onStart: () => void
  onNext: () => void
  onReset: () => void
  onReviewDecision: () => void
}

/** Manual controls for the isolated, simulated judging walkthrough. */
export function GoldenDemoControls({ step, decision, current, onStart, onNext, onReset, onReviewDecision }: GoldenDemoControlsProps) {
  const awaitingDecision = step === 'commander_review'
  const complete = step === 'completed'

  return (
    <section aria-label="Golden demo controls" className="w-full border-l-2 border-warning bg-background/90 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-warning">Golden demo / simulation</span>
        <span className={cn('font-mono text-[10px] uppercase', complete ? 'text-success' : current ? 'text-primary' : 'text-on-surface-variant')}>
          {complete ? 'Dispatch authorized' : current ? `Current: ${current.title}` : 'Golden incident demo'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" size="sm" variant="accent" onClick={onStart} disabled={step !== 'idle'}>
            <Play size={15} /> Start Demo
          </Button>
          <Button type="button" size="sm" variant="accent" onClick={onNext} disabled={step === 'idle' || awaitingDecision || complete}>
            <StepForward size={15} /> Next Step
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onReset}>
            <RotateCcw size={15} /> Reset Demo
          </Button>
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-on-surface-variant">
        {complete
          ? 'Simulated commander approval completed the demo lifecycle.'
          : awaitingDecision
            ? decision === 'rejected'
              ? 'Decision rejected in the simulation. Reopen review or reset the demo.'
              : 'Human decision required — review the simulated escalation to continue.'
            : current?.message ?? 'Manual walkthrough only; runtime status remains independent.'}
      </p>
      {awaitingDecision && (
        <Button type="button" size="sm" variant="accent" className="mt-2" onClick={onReviewDecision}>
          Review Decision
        </Button>
      )}
    </section>
  )
}
