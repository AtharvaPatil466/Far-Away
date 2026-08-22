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

/**
 * Presenter tooling for the deterministic walkthrough. Deliberately styled as
 * secondary chrome — the product surface is the decision pipeline behind it.
 */
export function GoldenDemoControls({ step, decision, current, onStart, onNext, onReset, onReviewDecision }: GoldenDemoControlsProps) {
  const awaitingDecision = step === 'commander_review'
  const complete = step === 'completed'

  return (
    <section aria-label="Deterministic demo controls" className="w-full border border-outline-variant bg-background/90 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">Demo controls</span>
        <span className="font-mono text-[10px] uppercase text-on-surface-variant">·</span>
        <span className={cn('font-mono text-[10px] uppercase', complete ? 'text-success' : current ? 'text-primary' : 'text-on-surface-variant')}>
          {complete ? 'Walkthrough complete' : current ? `Current: ${current.title}` : 'Deterministic walkthrough'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={onStart} disabled={step !== 'idle'}>
            <Play size={15} /> Start Demo
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onNext} disabled={step === 'idle' || awaitingDecision || complete}>
            <StepForward size={15} /> Next Step
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onReset}>
            <RotateCcw size={15} /> Reset
          </Button>
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-on-surface-variant">
        {complete
          ? 'Simulated commander approval completed the walkthrough lifecycle.'
          : awaitingDecision
            ? decision === 'rejected'
              ? 'Decision rejected in the simulation. Reopen review or reset the demo.'
              : 'Human decision required — review the simulated escalation to continue.'
            : current?.message ?? 'Local deterministic scenario only; runtime status remains independent.'}
      </p>
      {awaitingDecision && (
        <Button type="button" size="sm" variant="accent" className="mt-2" onClick={onReviewDecision}>
          Review Decision
        </Button>
      )}
    </section>
  )
}
