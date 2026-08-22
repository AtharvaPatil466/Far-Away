import type { EscalationItem } from '@/lib/mapTypes'
import type { AgentTraceStage } from '@/modules/dashboard/components/AgentTrace'

export type DemoStep =
  | 'idle'
  | 'incident_detected'
  | 'prediction'
  | 'cascade'
  | 'resource_plan'
  | 'routing'
  | 'commander_review'
  | 'completed'

export type DemoDecision = 'pending' | 'approved' | 'rejected'

export interface GoldenDemoState {
  step: DemoStep
  decision: DemoDecision
}

export interface GoldenDemoStepMeta {
  title: string
  message: string
  traceStates: readonly AgentTraceStage['state'][]
  whatWeKnow: string
  recommendation: string
  costOfWaiting: string
}

const AGENT_NAMES: ReadonlyArray<Pick<AgentTraceStage, 'id' | 'label' | 'icon'>> = [
  { id: 'ingestion', label: 'Ingestion', icon: 'sensors' },
  { id: 'prediction', label: 'Prediction', icon: 'analytics' },
  { id: 'cascade', label: 'Cascade', icon: 'account_tree' },
  { id: 'resource', label: 'Resource', icon: 'inventory_2' },
  { id: 'routing', label: 'Routing', icon: 'route' },
  { id: 'commander', label: 'Commander', icon: 'person' },
]

export const GOLDEN_DEMO_STEPS: Record<Exclude<DemoStep, 'idle'>, GoldenDemoStepMeta> = {
  incident_detected: {
    title: 'Incident detected',
    message: 'M6.4 earthquake detected near Bhubaneswar',
    traceStates: ['active', 'waiting', 'waiting', 'waiting', 'waiting', 'waiting'],
    whatWeKnow: 'M6.4 earthquake detected near Bhubaneswar.',
    recommendation: 'Activate rapid impact assessment pipeline.',
    costOfWaiting: 'Every minute delays field prioritisation and damage assessment.',
  },
  prediction: {
    title: 'Prediction',
    message: 'Impact model estimates severe damage probability: 82%',
    traceStates: ['complete', 'active', 'waiting', 'waiting', 'waiting', 'waiting'],
    whatWeKnow: 'Severe damage probability: 82%. Highest exposure is near dense urban blocks.',
    recommendation: 'Prioritise hospital and high-density impact zones.',
    costOfWaiting: 'Unprioritised teams may be sent to lower-risk areas.',
  },
  cascade: {
    title: 'Cascade',
    message: 'Aftershock risk elevated; hospital access corridor vulnerable',
    traceStates: ['complete', 'complete', 'active', 'waiting', 'waiting', 'waiting'],
    whatWeKnow: 'Aftershock probability is elevated. The primary hospital corridor is vulnerable.',
    recommendation: 'Protect medical access and prepare alternate routes.',
    costOfWaiting: 'Secondary disruption could isolate critical care.',
  },
  resource_plan: {
    title: 'Resource plan',
    message: 'Deploy 4 rescue teams, 2 medical units, 6 transport assets',
    traceStates: ['complete', 'complete', 'complete', 'active', 'waiting', 'waiting'],
    whatWeKnow: 'Rescue teams, medical units, and transport assets are available for allocation.',
    recommendation: 'Deploy 4 rescue teams, 2 medical units, and 6 transport assets.',
    costOfWaiting: 'Resource contention increases as more incidents arrive.',
  },
  routing: {
    title: 'Routing',
    message: 'Primary route blocked; alternate corridor selected',
    traceStates: ['complete', 'complete', 'complete', 'complete', 'active', 'waiting'],
    whatWeKnow: 'The primary corridor is blocked.',
    recommendation: 'Use the alternate route and reroute field assets.',
    costOfWaiting: 'Response delay grows while teams remain on the blocked route.',
  },
  commander_review: {
    title: 'Commander review',
    message: 'Mandatory evacuation recommendation exceeds authority threshold',
    traceStates: ['complete', 'complete', 'complete', 'complete', 'complete', 'waiting'],
    whatWeKnow: 'The evacuation recommendation exceeds the authority threshold.',
    recommendation: 'Human commander must approve or reject.',
    costOfWaiting: 'Decision delay reduces available evacuation lead time.',
  },
  completed: {
    title: 'Dispatch authorized',
    message: 'Commander approval recorded — deployment authorization issued',
    traceStates: ['complete', 'complete', 'complete', 'complete', 'complete', 'complete'],
    whatWeKnow: 'Commander approved the action.',
    recommendation: 'Dispatch authorised.',
    costOfWaiting: 'No pending command decision.',
  },
}

const NEXT_STEP: Record<DemoStep, DemoStep> = {
  idle: 'incident_detected',
  incident_detected: 'prediction',
  prediction: 'cascade',
  cascade: 'resource_plan',
  resource_plan: 'routing',
  routing: 'commander_review',
  commander_review: 'commander_review',
  completed: 'completed',
}

export const INITIAL_GOLDEN_DEMO_STATE: GoldenDemoState = { step: 'idle', decision: 'pending' }

export function nextGoldenDemoStep(step: DemoStep): DemoStep {
  return NEXT_STEP[step]
}

export function goldenDemoAgentTrace(step: Exclude<DemoStep, 'idle'>): readonly AgentTraceStage[] {
  return AGENT_NAMES.map((agent, index) => ({ ...agent, state: GOLDEN_DEMO_STEPS[step].traceStates[index] }))
}

/** Local-only escalation used by the judging walkthrough; it is never sent to the backend. */
export const GOLDEN_DEMO_ESCALATION: EscalationItem = {
  id: 'DEMO-EQ-001',
  trigger: 'MANDATORY_EVACUATION',
  zone: 'Golden Demo — Bhubaneswar East',
  priority: 'CRITICAL',
  memo: {
    situation: 'Simulated M6.4 earthquake impacts the Bhubaneswar corridor. Hospital access and evacuation capacity require commander review.',
    recommended: 'Authorize a mandatory evacuation for 12,400 residents in the affected eastern corridor.',
    riskIfYes: 'Controlled evacuation will strain transport capacity while aftershock monitoring continues.',
    riskIfNo: 'Residents may remain exposed if damaged buildings and hospital access routes deteriorate.',
  },
  decisionEvidence: {
    source: 'demo',
    riskScore: 82,
    confidence: 88,
    recommendedAction: 'Authorize mandatory evacuation for 12,400 residents in the affected eastern corridor.',
    authorityLevel: 'HUMAN APPROVAL REQUIRED',
    authorityRule: 'Mandatory evacuation > 10,000 residents',
    topFactors: [
      { label: 'Severe damage probability', impact: '+28%' },
      { label: 'Aftershock exposure', impact: '+22%' },
      { label: 'Hospital access risk', impact: '+19%' },
      { label: 'Population in corridor', impact: '+13%' },
    ],
    riskIfApproved: 'Transport capacity will be strained while aftershock monitoring continues.',
    riskIfRejected: 'Residents may remain exposed if damaged buildings and hospital access routes deteriorate.',
    agentPath: ['Ingestion', 'Prediction', 'Cascade', 'Resource', 'Routing', 'Commander'],
  },
  createdAt: 0,
  timeoutMs: Infinity,
  status: 'PENDING',
}
