import type { GpsReading } from '@/lib/mapTypes'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

const TEAM_META: Record<string, { type: string; base: string }> = {
  'UNIT-A1': { type: 'Rescue · NDRF', base: 'Puri Coast' },
  'UNIT-A2': { type: 'Medical Response', base: 'Puri South' },
  'UNIT-B1': { type: 'Evac Transport', base: 'Balasore Hub' },
  'UNIT-B2': { type: 'Structural Eng.', base: 'Balasore North' },
  'UNIT-C1': { type: 'Supply Drops', base: 'Cuttack Relief' },
}

type StatusMeta = { label: string; dot: string; text: string; border: string; pulse?: boolean }

const SUCCESS: StatusMeta = { label: 'Deployed', dot: 'bg-success', text: 'text-success', border: 'border-success/30' }
const ENROUTE: StatusMeta = { label: 'En Route', dot: 'bg-warning', text: 'text-warning', border: 'border-warning/30' }
const CRITICAL: StatusMeta = { label: 'Critical', dot: 'bg-error', text: 'text-error', border: 'border-error/30', pulse: true }
const IDLE: StatusMeta = { label: 'Standby', dot: 'bg-outline', text: 'text-on-surface-variant', border: 'border-outline-variant/40' }
const OFFLINE: StatusMeta = { label: 'Offline', dot: 'bg-outline', text: 'text-on-surface-variant', border: 'border-outline-variant/40' }

// Keyed loosely so BOTH the UI's mock statuses (active/staged/distress/offline)
// and the live backend GPS-beacon statuses (idle/enroute/onsite/returning, the
// field STATUS_FLOW) resolve. Unknown values fall back to OFFLINE rather than
// crashing the row.
const STATUS_META: Record<string, StatusMeta> = {
  // UI mock statuses
  active: SUCCESS,
  staged: ENROUTE,
  distress: CRITICAL,
  offline: OFFLINE,
  // live backend statuses (disastermind STATUS_FLOW)
  onsite: SUCCESS,
  enroute: ENROUTE,
  returning: ENROUTE,
  idle: IDLE,
}

function elapsed(timestamp: string): string {
  const start = new Date(timestamp).getTime()
  if (Number.isNaN(start)) return '—'
  const mins = Math.max(0, Math.floor((Date.now() - start) / 60000))
  if (mins < 60) return `${mins}m`
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}h ${String(mins % 60).padStart(2, '0')}m`
}

export function DeploymentsTable({ teams }: { teams: Record<string, GpsReading> }) {
  const rows = Object.values(teams)

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-outline-variant bg-transparent hover:bg-transparent">
            <TableHead className="font-mono">Unit ID</TableHead>
            <TableHead className="font-mono">Assignment</TableHead>
            <TableHead className="font-mono">Sector</TableHead>
            <TableHead className="font-mono">Status</TableHead>
            <TableHead className="text-right font-mono">Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((team) => {
            const meta = TEAM_META[team.team_id] ?? {
              type: 'Field Unit',
              base: team.location
                ? `${team.location.lat.toFixed(2)}, ${team.location.lon.toFixed(2)}`
                : '—',
            }
            const status = STATUS_META[team.status] ?? OFFLINE
            return (
              <TableRow key={team.team_id} className="border-outline-variant/70 bg-transparent hover:bg-surface-container/40">
                <TableCell className="font-mono text-data-mono tabular-nums text-on-surface">
                  {team.team_id}
                </TableCell>
                <TableCell className="text-on-surface">{meta.type}</TableCell>
                <TableCell className="text-on-surface-variant">{meta.base}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 font-mono text-label-sm uppercase',
                      status.text,
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', status.dot, status.pulse && 'animate-pulse')} />
                    {status.label}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-data-mono tabular-nums text-on-surface-variant">
                  {elapsed(team.timestamp)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
