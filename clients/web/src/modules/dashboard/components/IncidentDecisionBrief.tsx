import type { GoldenDemoStepMeta } from '@/lib/goldenDemo'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'

interface IncidentDecisionBriefProps {
  step: GoldenDemoStepMeta
}

/** Compact operational consequence summary for an active Golden Demo step. */
export function IncidentDecisionBrief({ step }: IncidentDecisionBriefProps) {
  const sections = [
    { label: 'What we know', value: step.whatWeKnow, icon: 'visibility', className: 'border-outline-variant/25 bg-surface' },
    { label: 'System recommendation', value: step.recommendation, icon: 'recommend', className: 'border-primary/25 bg-primary-container/10' },
    { label: 'Cost of waiting', value: step.costOfWaiting, icon: 'schedule', className: 'border-warning/25 bg-warning/5' },
  ]

  return (
    <Card className="shrink-0 overflow-hidden">
      <CardHeader className="flex-wrap">
        <div className="flex items-center gap-2">
          <CardTitle>Incident Decision Brief</CardTitle>
          <Badge variant="warning">Demo / simulation</Badge>
        </div>
        <span className="text-label-md uppercase text-on-surface-variant">{step.title}</span>
      </CardHeader>
      <div className="grid gap-3 p-3 md:grid-cols-3 md:p-4">
        {sections.map((section) => (
          <section key={section.label} className={`rounded border p-3 ${section.className}`}>
            <h3 className="flex items-center gap-1.5 text-label-md uppercase text-on-surface-variant">
              <Icon name={section.icon} className="text-[16px]" />
              {section.label}
            </h3>
            <p className="mt-2 text-body-sm leading-relaxed text-on-surface">{section.value}</p>
          </section>
        ))}
      </div>
    </Card>
  )
}
