import { useEffect, useState } from 'react'
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'

/**
 * How far the evacuation assumptions can be wrong before the answer changes.
 *
 * The clearance/compliance/casualty rates are planning assumptions, not
 * agency-calibrated numbers, and the technical report says so. This chart is
 * the quantitative answer to the follow-up: each assumption is swept across a
 * plausible range, the REAL decision function is re-run at every point, and the
 * flip point is marked. Slack is the story -- an assumption the decision never
 * flips on does not need calibrating.
 */
interface Point {
  value: number
  recommendation: string
  expected_moved: number
  net_lives_saved: number
  break_even_p: number
}

interface Sweep {
  parameter: string
  label: string
  unit: string
  baseline: number
  flip_points: number[]
  insensitive: boolean
  points: Point[]
}

interface Report {
  zone: string
  population: number
  baseline: { recommendation: string; p_event: number; break_even_p: number }
  sweeps: Sweep[]
}

/** ORDER = 1, anything else = 0. A step line makes the flip unmissable. */
const ordered = (rec: string) => (rec === 'ORDER_BY_DEADLINE' ? 1 : 0)

function slack(sweep: Sweep): string {
  if (sweep.insensitive) return 'no flip in range'
  const flip = sweep.flip_points[0]
  if (!flip || !sweep.baseline) return `flips at ${flip}`
  const ratio = sweep.baseline > flip ? sweep.baseline / flip : flip / sweep.baseline
  return `${ratio.toFixed(1)}x margin from baseline`
}

export function SensitivityChart() {
  const [report, setReport] = useState<Report | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/'
    fetch(`${base}data/sensitivity.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: Report) => setReport(d))
      .catch(() => setFailed(true))
  }, [])

  if (failed) return <p className="evidence-empty">Sensitivity sweep unavailable.</p>
  if (!report) return null

  return (
    <div className="sensitivity">
      <header>
        <h3>Decision sensitivity — {report.zone}</h3>
        <p>
          Each assumption swept across its plausible range, with the real decision
          function re-run at every point. The dashed line marks where the
          recommendation flips. Baseline: <strong>{report.baseline.recommendation}</strong>{' '}
          at p={report.baseline.p_event}.
        </p>
      </header>

      {report.sweeps.map((sweep) => (
        <section key={sweep.parameter} className="sensitivity-sweep">
          <h4>
            {sweep.label} <span className="unit">({sweep.unit})</span>
            <span className={sweep.insensitive ? 'tag tag-flat' : 'tag tag-flip'}>
              {slack(sweep)}
            </span>
          </h4>

          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={sweep.points} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="value" tick={{ fontSize: 11 }} />
              <YAxis
                domain={[0, 1]} ticks={[0, 1]} width={54} tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => (v === 1 ? 'ORDER' : 'HOLD')}
              />
              <Tooltip
                formatter={(_v, _n, item) => {
                  const p = item?.payload as Point | undefined
                  return p ? [`${p.recommendation} · ${p.expected_moved.toLocaleString()} moved`, ''] : ['', '']
                }}
                labelFormatter={(v) => `${sweep.label}: ${v}`}
              />
              <Line
                type="stepAfter" dataKey={(p: Point) => ordered(p.recommendation)}
                stroke="currentColor" strokeWidth={2} dot={false} isAnimationActive={false}
                name="decision"
              />
              {sweep.flip_points.map((f) => (
                <ReferenceLine key={f} x={f} strokeDasharray="4 3" strokeWidth={1.5} />
              ))}
              <ReferenceLine x={sweep.baseline} strokeOpacity={0.45} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      ))}

      {/* The cry-wolf sweep never flips the recommendation, which reads as
          reassuring until you look at how many people actually move. Saying so
          explicitly is the difference between a limitation and a blind spot. */}
      <footer className="sensitivity-note">
        An insensitive recommendation is not the same as an insensitive outcome:
        across the cry-wolf range the order never changes while expected turnout
        falls by roughly three quarters.
      </footer>
    </div>
  )
}
