import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApiStatus } from '@/hooks/useApiStatus'
import { useEscalations } from '@/hooks/useEscalations'
import { connectWebSocket } from '@/lib/disasterApi'
import { SYNTHETIC_MAP_STATE } from '@/lib/mapTypes'
import type { MapState, EscalationItem } from '@/lib/mapTypes'
import type { SystemStatusSnapshot } from '@/lib/systemStatus'
import {
  GOLDEN_DEMO_ESCALATION,
  GOLDEN_DEMO_STEPS,
  INITIAL_GOLDEN_DEMO_STATE,
  goldenDemoAgentTrace,
  nextGoldenDemoStep,
} from '@/lib/goldenDemo'
import { DeploymentsTable } from './components/DeploymentsTable'
import { AgentTrace, type AgentTraceStage } from './components/AgentTrace'
import { DecisionEvidenceDrawer } from './components/DecisionEvidenceDrawer'
import { GoldenDemoControls } from './components/GoldenDemoControls'
import { IncidentHero, decisionHeadlineFor } from './components/IncidentHero'
import { MissionTelemetry } from './components/MissionTelemetry'
import { DecisionBrief } from './components/DecisionBrief'
import { TrustStrip } from './components/TrustStrip'
import { AuthorizationReceipt } from './components/AuthorizationReceipt'
import { commanderStageForApproval, commanderReviewRequired } from './lib/approvalFlow'
import type { TelemetryWindow } from './components/MissionTelemetry'

/* ------------------------------------------------------------------ helpers */

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

/**
 * Population figure parsed verbatim out of the pending recommendation's own
 * text (memo / evidence). Returns null when no figure exists — never guessed.
 */
function residentsInScope(item: EscalationItem | null): string | null {
  if (!item) return null
  const candidates = [item.memo.recommended, item.decisionEvidence?.recommendedAction, item.memo.situation]
  for (const text of candidates) {
    const match = text?.match(/(\d[\d,]*)\s+(?:\w+\s+)?(?:residents|people|persons|displaced)/i)
    if (match) return match[1]
  }
  return null
}

/** Real escalation auto-execute semantics (5-min timeout; human-only never times out). */
function decisionWindowState(item: EscalationItem | null, now: number): TelemetryWindow | null {
  if (!item) return null
  if (item.timeoutMs === Infinity) return { value: 'Human only', tone: 'warning' }
  const remaining = Math.max(0, item.createdAt + item.timeoutMs - now)
  const mm = Math.floor(remaining / 60_000)
  const ss = Math.floor((remaining % 60_000) / 1000)
  return {
    value: `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    tone: remaining <= 60_000 ? 'critical' : remaining <= 120_000 ? 'warning' : 'neutral',
  }
}

const DEMO_AGENT_STAGES: readonly AgentTraceStage[] = [
  { id: 'ingestion', label: 'Ingestion', icon: 'sensors', state: 'complete' },
  { id: 'prediction', label: 'Prediction', icon: 'analytics', state: 'complete' },
  { id: 'cascade', label: 'Cascade', icon: 'account_tree', state: 'complete' },
  { id: 'resource', label: 'Resource', icon: 'inventory_2', state: 'complete' },
  { id: 'routing', label: 'Routing', icon: 'route', state: 'complete' },
  { id: 'commander', label: 'Commander', icon: 'person', state: 'waiting' },
]

/* ------------------------------------------------------------- Dashboard */

export function Dashboard() {
  const { status, setWsState } = useApiStatus()
  const { escalations, pending, approve, overrideItem, dataSource, lastAuthorization, clearAuthorization } = useEscalations()
  const [mapState, setMapState] = useState<MapState>(SYNTHETIC_MAP_STATE)
  const [reviewingItem, setReviewingItem] = useState<EscalationItem | null>(null)
  const [goldenDemo, setGoldenDemo] = useState(INITIAL_GOLDEN_DEMO_STATE)
  const closeDecisionReview = useCallback(() => setReviewingItem(null), [])
  const reviewDecision = useCallback((item: EscalationItem) => {
    clearAuthorization()
    setReviewingItem(item)
  }, [clearAuthorization])
  const now = useNow(1000)

  // ── Live telemetry: drive the map + unit positions from the Group A socket
  useEffect(() => {
    const disconnect = connectWebSocket(
      (message) => {
        if (message.topic === 'tier3.iot_telemetry') {
          const p = message.payload as Record<string, unknown> | undefined
          if (p?.kind === 'gps_beacon') {
            const readings = (p.readings ?? []) as Array<{
              team_id: string
              location: { lat: number; lon: number }
              status?: 'active' | 'staged' | 'distress' | 'offline'
              timestamp: string
            }>
            readings.forEach((r) =>
              setMapState((prev) => ({
                ...prev,
                teams: {
                  ...prev.teams,
                  [r.team_id]: {
                    team_id: r.team_id,
                    location: r.location,
                    status: r.status ?? 'active',
                    timestamp: r.timestamp,
                  },
                },
              })),
            )
          }
        }
        if (message.topic === 'tier2.prediction') {
          const p = message.payload as Record<string, unknown> | undefined
          if (p?.risk_cells) {
            setMapState((prev) => ({ ...prev, riskCells: p.risk_cells as typeof prev.riskCells }))
          }
        }
      },
      (state) => setWsState(state),
    )
    return () => disconnect()
  }, [setWsState])

  // ── GPS drift simulation keeps the map alive when the backend is offline
  useEffect(() => {
    const t = window.setInterval(() => {
      setMapState((prev) => {
        const teams = { ...prev.teams }
        Object.keys(teams).forEach((id) => {
          const maxDelta = id === 'UNIT-C1' ? 0.006 : 0.003
          teams[id] = {
            ...teams[id],
            location: {
              lat: teams[id].location.lat + (Math.random() * 2 - 1) * maxDelta,
              lon: teams[id].location.lon + (Math.random() * 2 - 1) * maxDelta,
            },
          }
        })
        return { ...prev, teams }
      })
    }, 8000)
    return () => window.clearInterval(t)
  }, [])

  const wsLive = status.wsState === 'connected'
  const unitCount = Object.keys(mapState.teams).length
  const activeUnits = Object.values(mapState.teams).filter((t) => t.status === 'active').length
  const highRiskZones = useMemo(
    () => mapState.riskCells.filter((c) => c.probability >= 0.7).length,
    [mapState.riskCells],
  )
  const criticalCount = pending.filter((e) => e.priority === 'CRITICAL').length
  const topCritical = pending.find((item) => item.priority === 'CRITICAL') ?? null
  // Decision-hero content — derived from the real escalation queue, never invented.
  const decisionHeadline = topCritical
    ? decisionHeadlineFor(topCritical.trigger)
    : pending.length
      ? `${pending.length} ${pending.length === 1 ? 'decision awaits' : 'decisions await'} commander review`
      : 'No decisions pending'
  const heroSupporting = topCritical
    ? `${topCritical.zone} — ${topCritical.memo.recommended}`
    : pending.length
      ? `${pending.length} lower-priority ${pending.length === 1 ? 'recommendation is' : 'recommendations are'} queued for review below.`
      : 'No agent recommendation currently crosses a human-authority threshold.'
  const heroEyebrow = dataSource === 'live'
    ? 'Cyclone Remal · Odisha coast · live backend feed'
    : 'Cyclone Remal · Odisha coast · deterministic scenario'
  const scopeResidents = residentsInScope(topCritical)
  const decisionWindow = useMemo(
    () => decisionWindowState(topCritical ?? pending[0] ?? null, now),
    [topCritical, pending, now],
  )
  const mapStatus = wsLive
    ? { label: 'Live map', tone: 'healthy' as const }
    : status.wsState === 'offline'
      ? { label: 'Map channel offline', tone: 'critical' as const }
      : { label: status.wsState === 'connecting' ? 'Map connecting' : 'Map reconnecting', tone: 'degraded' as const }
  const systemStatus: SystemStatusSnapshot = {
    backend: status.backendState,
    dataSource,
    audit: 'unknown',
    agents: status.agentsState,
    feed: 'unknown',
  }
  const goldenDemoMeta = goldenDemo.step === 'idle' ? null : GOLDEN_DEMO_STEPS[goldenDemo.step]
  const commanderStage = commanderStageForApproval(lastAuthorization)
  const traceStages = goldenDemo.step === 'idle'
    ? DEMO_AGENT_STAGES.map((stage) => stage.id === 'commander'
      ? { ...stage, state: commanderStage }
      : stage)
    : goldenDemoAgentTrace(goldenDemo.step)
  // COMMAND presentation reflects the real queue — never upstream completion.
  const humanDecisionPending = commanderReviewRequired(commanderStage, pending.length)
  const clock = new Date(now).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const startGoldenDemo = () => {
    setReviewingItem(null)
    setGoldenDemo({ step: 'incident_detected', decision: 'pending' })
  }

  const advanceGoldenDemo = () => {
    const nextStep = nextGoldenDemoStep(goldenDemo.step)
    setGoldenDemo((current) => ({ ...current, step: nextStep }))
    if (nextStep === 'commander_review') setReviewingItem(GOLDEN_DEMO_ESCALATION)
  }

  const resetGoldenDemo = () => {
    setReviewingItem(null)
    setGoldenDemo(INITIAL_GOLDEN_DEMO_STATE)
  }

  const approveReviewedDecision = async (id: string): Promise<{ ok: boolean; error?: string }> => {
    if (id === GOLDEN_DEMO_ESCALATION.id) {
      setGoldenDemo({ step: 'completed', decision: 'approved' })
      return { ok: true }
    }
    const result = await approve(id)
    if (result) return { ok: true }
    return {
      ok: false,
      error: dataSource === 'live'
        ? 'The backend did not confirm dispatch and audit append. Review remains required.'
        : 'This is fallback decision data. Start the backend and review a live escalation to authorize a real dispatch.',
    }
  }

  const rejectReviewedDecision = (id: string) => {
    if (id === GOLDEN_DEMO_ESCALATION.id) {
      setGoldenDemo((current) => ({ ...current, decision: 'rejected' }))
      return
    }
    overrideItem(id, 'Rejected after decision evidence review')
  }

  return (
    <div className="dm-scroll h-full overflow-y-auto overflow-x-hidden bg-surface">
      <div className="mx-auto w-full max-w-[1600px] px-4 pb-inversa-59 pt-4 md:px-6 md:pt-6 xl:px-8">
        <IncidentHero
          mapState={mapState}
          dataSource={dataSource}
          eyebrow={heroEyebrow}
          headline={decisionHeadline}
          supporting={heroSupporting}
          criticalCount={criticalCount}
          mapStatus={mapStatus}
          clock={clock}
          onReviewCritical={() => topCritical && reviewDecision(topCritical)}
          demoControls={(
            <GoldenDemoControls
              step={goldenDemo.step}
              decision={goldenDemo.decision}
              current={goldenDemoMeta}
              onStart={startGoldenDemo}
              onNext={advanceGoldenDemo}
              onReset={resetGoldenDemo}
              onReviewDecision={() => setReviewingItem(GOLDEN_DEMO_ESCALATION)}
            />
          )}
        />

        <MissionTelemetry
          scopeResidents={scopeResidents}
          pendingDecisions={pending.length}
          criticalPending={criticalCount > 0}
          highRiskZones={highRiskZones}
          decisionWindow={decisionWindow}
        />

        <AgentTrace
          stages={traceStages}
          {...(goldenDemo.step === 'idle' ? { humanDecisionPending } : {})}
        />

        {lastAuthorization && <AuthorizationReceipt result={lastAuthorization} />}

        <DecisionBrief
          escalation={topCritical}
          remainingEscalations={pending.filter((item) => item.id !== topCritical?.id)}
          additionalCritical={Math.max(0, criticalCount - 1)}
          highRiskZones={highRiskZones}
          activeUnits={activeUnits}
          unitCount={unitCount}
          onReview={reviewDecision}
        />

        <TrustStrip status={systemStatus} />

        <section className="pt-inversa-59" aria-labelledby="deployment-log-title">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-outline-variant pb-4">
            <div>
              <p className="font-mono text-label-sm uppercase text-on-surface-variant">Field operations / current roster</p>
              <h2 id="deployment-log-title" className="mt-1 text-[clamp(30px,3.2vw,46px)] font-normal tracking-[-0.03em] text-on-surface">Deployment log</h2>
            </div>
            <span className="font-mono text-label-sm uppercase tabular-nums text-on-surface-variant">
              {escalations.length} events · {unitCount} units
            </span>
          </div>
          <DeploymentsTable teams={mapState.teams} />
        </section>
      </div>

      <DecisionEvidenceDrawer
        item={reviewingItem}
        onClose={closeDecisionReview}
        onApprove={approveReviewedDecision}
        onReject={rejectReviewedDecision}
      />
    </div>
  )
}
