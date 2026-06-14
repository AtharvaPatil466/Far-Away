import { useEffect, useMemo, useState } from 'react'
import { useApiStatus } from '@/hooks/useApiStatus'
import { useEscalations } from '@/hooks/useEscalations'
import { connectWebSocket } from '@/lib/disasterApi'
import { SYNTHETIC_MAP_STATE } from '@/lib/mapTypes'
import type { MapState, EscalationItem } from '@/lib/mapTypes'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { LiveMap } from './components/LiveMap'

/* ------------------------------------------------------------------ helpers */

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

const PRIORITY_META: Record<
  EscalationItem['priority'],
  { label: string; border: string; text: string }
> = {
  CRITICAL: { label: 'PRI-1', border: 'border-l-error', text: 'text-error' },
  HIGH: { label: 'PRI-2', border: 'border-l-secondary', text: 'text-secondary' },
  MEDIUM: { label: 'PRI-3', border: 'border-l-outline', text: 'text-on-surface-variant' },
}

const TRIGGER_ICON: Record<string, string> = {
  MANDATORY_EVACUATION: 'crisis_alert',
  CROSS_STATE_RESOURCE: 'local_shipping',
  REQUISITION_INFRASTRUCTURE: 'apartment',
  CRITICAL_INFRASTRUCTURE: 'electric_bolt',
  MEDIA_BROADCAST: 'campaign',
  ARMED_FORCES: 'shield',
}

function countdown(item: EscalationItem, now: number): string {
  if (item.timeoutMs === Infinity) return 'MANUAL'
  const remaining = item.timeoutMs - (now - item.createdAt)
  if (remaining <= 0) return 'EXPIRED'
  const total = Math.floor(remaining / 1000)
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `T-${m}:${s}`
}

/* ---------------------------------------------------------------- bento cards */

const cardBase = 'bg-card border border-outline-variant rounded-xl'

function StatCard({
  label,
  value,
  unit,
  icon,
  iconTone = 'primary',
  children,
}: {
  label: string
  value: string | number
  unit?: string
  icon: string
  iconTone?: 'primary' | 'secondary' | 'outline'
  children: React.ReactNode
}) {
  const toneClass =
    iconTone === 'secondary' ? 'text-secondary' : iconTone === 'outline' ? 'text-outline' : 'text-primary'
  return (
    <div className={cn(cardBase, 'dm-lift flex flex-col gap-2 p-md')}>
      <div className="flex items-start justify-between">
        <span className="text-sm text-on-surface-variant">{label}</span>
        <Icon name={icon} className={cn('text-[18px]', toneClass)} />
      </div>
      <div className="text-3xl font-bold text-on-surface">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-on-surface-variant">{unit}</span>}
      </div>
      <div className="mt-auto">{children}</div>
    </div>
  )
}

function QueueItem({ item, now }: { item: EscalationItem; now: number }) {
  const meta = PRIORITY_META[item.priority]
  const icon = TRIGGER_ICON[item.trigger] ?? 'warning'
  return (
    <div
      className={cn(
        'dm-press flex cursor-pointer flex-col gap-1 rounded-r border-l-2 bg-[#1a1a1a] p-3 transition-colors hover:bg-surface-container-high',
        meta.border,
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn('flex items-center gap-1.5 text-code-sm', meta.text)}>
          <Icon name={icon} className="text-[13px]" />
          {meta.label} / {item.trigger.replace(/_/g, ' ')}
        </span>
        <span className="text-code-sm text-[10px] text-on-surface-variant">{countdown(item, now)}</span>
      </div>
      <div className="text-sm font-medium text-on-surface">{item.zone}</div>
      <div className="truncate text-xs text-on-surface-variant">{item.memo.situation}</div>
    </div>
  )
}

const READINESS = [
  { label: 'Naval', icon: 'sailing', pct: 85, tone: 'primary' as const },
  { label: 'Air', icon: 'flight', pct: 42, tone: 'secondary' as const },
  { label: 'Medical', icon: 'local_hospital', pct: 95, tone: 'primary' as const },
  { label: 'Transport', icon: 'fire_truck', pct: 70, tone: 'primary' as const },
]

/* ------------------------------------------------------------------ Dashboard */

export function Dashboard() {
  const { status, setWsState } = useApiStatus()
  const { pending } = useEscalations()
  const [mapState, setMapState] = useState<MapState>(SYNTHETIC_MAP_STATE)
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
  const zoneCoverage = mapState.riskCells.length
    ? Math.round((highRiskZones / mapState.riskCells.length) * 100)
    : 0

  return (
    <div className="dm-scroll h-full overflow-y-auto p-margin">
      <div className="dm-stagger mx-auto grid max-w-[1600px] grid-cols-1 gap-margin pb-xl md:grid-cols-12">
        {/* Left: map + stats */}
        <div className="flex flex-col gap-margin md:col-span-8">
          {/* Operational map */}
          <div className={cn(cardBase, 'flex h-[400px] flex-col overflow-hidden shadow-sm')}>
            <div className="z-10 flex items-center justify-between border-b border-outline-variant bg-card/80 px-md py-sm backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Icon name="public" className="text-[20px] text-primary" />
                <h2 className="text-[16px] font-bold text-on-surface">Operational Overview</h2>
              </div>
              <span
                className={cn(
                  'flex items-center gap-1 rounded border px-2 py-1 text-code-sm text-[11px]',
                  wsLive
                    ? 'border-primary/20 bg-primary/10 text-primary'
                    : 'border-outline-variant bg-surface-container text-on-surface-variant',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', wsLive ? 'animate-pulse bg-primary' : 'bg-outline')} />
                {wsLive ? 'LIVE' : 'RECONNECTING'}
              </span>
            </div>
            <div className="relative flex-1 bg-[#0b0b0b]">
              <LiveMap mapState={mapState} className="absolute inset-0" />
            </div>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-1 gap-margin sm:grid-cols-3">
            <StatCard label="Active Units" value={unitCount} icon="verified_user">
              <div className="flex items-center gap-1">
                <Icon name="trending_up" className="text-[14px] text-primary" />
                <span className="text-code-sm text-[11px] text-primary">{activeUnits} active</span>
              </div>
            </StatCard>
            <StatCard label="Open Incidents" value={pending.length} icon="warning" iconTone="secondary">
              <div className="flex items-center gap-1">
                <Icon name="trending_flat" className="text-[14px] text-outline" />
                <span className="text-code-sm text-[11px] text-on-surface-variant">Monitoring</span>
              </div>
            </StatCard>
            <StatCard label="Zone Coverage" value={zoneCoverage} unit="%" icon="memory" iconTone="outline">
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#262626]">
                <div className="h-full bg-primary" style={{ width: `${zoneCoverage}%` }} />
              </div>
            </StatCard>
          </div>
        </div>

        {/* Right: escalations + readiness */}
        <div className="flex flex-col gap-margin md:col-span-4">
          {/* Escalations queue */}
          <div className={cn(cardBase, 'flex h-[300px] flex-col p-sm')}>
            <div className="mb-sm flex items-center justify-between px-1">
              <h2 className="flex items-center gap-2 text-[16px] font-bold text-on-surface">
                <Icon name="list_alt" className="text-[18px] text-secondary" />
                Escalations Queue
              </h2>
              <span className="rounded border border-error/20 bg-error/10 px-2 py-0.5 text-code-sm text-[11px] text-error">
                {pending.filter((e) => e.priority === 'CRITICAL').length} Critical
              </span>
            </div>
            <div className="dm-scroll flex flex-1 flex-col gap-2 overflow-y-auto pr-2">
              {pending.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-on-surface-variant">
                  <Icon name="task_alt" className="text-[28px] text-primary" />
                  <p className="text-sm">Queue clear</p>
                </div>
              ) : (
                pending.map((item) => <QueueItem key={item.id} item={item} now={now} />)
              )}
            </div>
          </div>

          {/* Resource readiness */}
          <div className={cn(cardBase, 'flex flex-1 flex-col p-md')}>
            <h2 className="mb-md flex items-center gap-2 text-[16px] font-bold text-on-surface">
              <Icon name="bar_chart" className="text-[18px] text-primary" />
              Resource Readiness
            </h2>
            <div className="flex flex-1 items-end justify-around gap-2 pt-4">
              {READINESS.map((r) => (
                <div key={r.label} className="group flex w-full flex-col items-center gap-2">
                  <span
                    className={cn(
                      'text-code-sm text-[10px] text-on-surface-variant transition-colors',
                      r.tone === 'secondary' ? 'group-hover:text-secondary' : 'group-hover:text-primary',
                    )}
                  >
                    {r.pct}%
                  </span>
                  <div className="relative flex h-[120px] w-8 items-end justify-center overflow-hidden rounded-t-sm bg-[#262626]">
                    <div
                      className={cn(
                        'w-full rounded-t-sm shadow-[inset_0_2px_4px_rgba(255,255,255,0.2)]',
                        r.tone === 'secondary' ? 'bg-secondary' : 'bg-primary',
                      )}
                      style={{ height: `${r.pct}%` }}
                    />
                  </div>
                  <Icon
                    name={r.icon}
                    className={cn(
                      'text-[16px] text-on-surface-variant transition-colors',
                      r.tone === 'secondary' ? 'group-hover:text-secondary' : 'group-hover:text-primary',
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
