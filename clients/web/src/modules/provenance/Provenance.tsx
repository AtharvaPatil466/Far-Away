import { useEffect, useState } from 'react'

import './provenance.css'
import type { FieldSelection, ProvenanceDoc, Revision } from './types'

/**
 * Incident provenance — what each source said, what we believe, and why.
 *
 * The meaningful-only toggle is the centre of this view. Switching it does not
 * merely hide rows: it states how many were suppressed and on what grounds, so
 * the definition of "meaningful" is auditable from the screen rather than
 * taken on trust.
 */
const KIND_LABEL: Record<Revision['kind'], string> = {
  UPDATE: 'UPDATE',
  CONFLICT: 'CONFLICT',
  LATE_CORRECTION: 'LATE',
  RETRACTION: 'RETRACTED',
}

function clock(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`
}

const show = (v: unknown) => (v === null || v === undefined ? '—' : String(v))

function summarise(rev: Revision) {
  if (!rev.changes.length) return 'no canonical change'
  return rev.changes
    .map((c) => `${c.field} ${show(c.before)} → ${show(c.after)}`)
    .join(' · ')
}

function RevisionDetail({ rev, doc }: { rev: Revision; doc: ProvenanceDoc }) {
  const cause = doc.observations.find((o) => o.obs_id === rev.causing_obs_id)
  return (
    <div className="prov-detail">
      {rev.changes.map((c) => (
        <div key={c.field} className="prov-diff">
          <strong>{c.field}</strong>{' '}
          <span className="before">{show(c.before)}</span> → <strong>{show(c.after)}</strong>
          <div className="prov-why">selected by <strong>{c.rule}</strong> — {c.rule_reason}</div>
        </div>
      ))}
      <dl>
        <dt>classified</dt><dd><strong>{rev.classification}</strong> — {rev.reason}</dd>
        <dt>caused by</dt>
        <dd>
          {rev.causing_obs_id} · {rev.source}
          {cause && ` · observed ${cause.observed_at} · received ${cause.received_at}`}
        </dd>
        {cause && (<><dt>payload</dt><dd>{JSON.stringify(cause.payload)}</dd></>)}
        <dt>recommendation</dt>
        <dd>
          {rev.recommendation_before === rev.recommendation_after
            ? `unchanged (${rev.recommendation_after})`
            : `${rev.recommendation_before} → ${rev.recommendation_after}`}
        </dd>
      </dl>
    </div>
  )
}

function WhyField({ sel }: { sel: FieldSelection }) {
  return (
    <div className="prov-field">
      <h4>
        {sel.field}
        <span className="prov-selected">{show(sel.value)}</span>
        <span className="prov-tag">{sel.rule}</span>
        {sel.unresolved && <span className="prov-tag">UNRESOLVED</span>}
        {sel.contested && !sel.unresolved && <span className="prov-tag">CONTESTED</span>}
      </h4>
      <div className="prov-why">
        {sel.reason}
        {sel.corroboration > 1 && ` · corroborated by ${sel.corroboration} sources`}
      </div>
      {sel.alternatives.map((a) => (
        <div key={a.obs_id} className={`prov-alt ${a.beyond_tolerance ? 'flagged' : ''}`}>
          <span>{a.source}</span>
          <span>{show(a.value)}</span>
          {a.delta !== null && <span>Δ{a.delta}</span>}
          <span>{a.beyond_tolerance ? 'beyond tolerance — kept visible' : 'within tolerance'}</span>
        </div>
      ))}
    </div>
  )
}

export function Provenance() {
  const [doc, setDoc] = useState<ProvenanceDoc | null>(null)
  const [failed, setFailed] = useState(false)
  const [meaningfulOnly, setMeaningfulOnly] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/'
    fetch(`${base}data/provenance.json`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: ProvenanceDoc) => setDoc(d))
      .catch(() => setFailed(true))
  }, [])

  if (failed) return <div className="prov">Provenance view unavailable — run `make provenance`.</div>
  if (!doc) return null

  const rows = meaningfulOnly
    ? doc.revisions.filter((r) => r.classification === 'MEANINGFUL')
    : doc.revisions
  const hidden = doc.counts.total - rows.length

  return (
    <div className="prov">
      <div className="prov-head">
        <h2>INCIDENT PROVENANCE</h2>
        <span className="prov-id">{doc.incident_id}</span>
        <div className="prov-counts">
          <span className="prov-count on">{doc.counts.total} revisions</span>
          <span className="prov-count on">{doc.counts.meaningful} meaningful</span>
          <span className="prov-count">{doc.counts.minor} minor</span>
          <span className="prov-count">{doc.observations.length} observations</span>
        </div>
      </div>

      {/* The strongest available demonstration of "meaningful": the control
          reports what it removed and why, instead of quietly shortening a list. */}
      <button className="prov-toggle" onClick={() => setMeaningfulOnly((v) => !v)}>
        <strong>{meaningfulOnly ? '☑ MEANINGFUL ONLY' : '☐ MEANINGFUL ONLY'}</strong>
        <span className="prov-suppressed">
          {meaningfulOnly
            ? `hiding ${hidden} MINOR revision${hidden === 1 ? '' : 's'} — sub-tolerance jitter, ` +
              `provenance-only changes and late arrivals that did not alter canonical state. ` +
              `Nothing was discarded; switch back to inspect them.`
            : `showing all ${doc.counts.total}. ${doc.counts.minor} would be suppressed as MINOR.`}
        </span>
      </button>

      <div className="prov-rows">
        {rows.map((rev) => {
          const cls = [
            'prov-row',
            rev.classification === 'MEANINGFUL' ? 'meaningful' : 'minor',
            rev.kind === 'RETRACTION' ? 'retraction' : '',
            rev.kind === 'LATE_CORRECTION' ? 'late' : '',
            rev.kind === 'CONFLICT' ? 'conflict' : '',
            open === rev.seq ? 'open' : '',
          ].join(' ')
          return (
            <div key={rev.seq}>
              <button className={cls} onClick={() => setOpen(open === rev.seq ? null : rev.seq)}>
                <span className="t">{clock(rev.at)}</span>
                <span className="src">{rev.source}</span>
                <span className="what">{summarise(rev)}</span>
                <span className="prov-tag">{KIND_LABEL[rev.kind]}</span>
                <span className="prov-why">{rev.reason}</span>
                {rev.recommendation_before !== rev.recommendation_after && (
                  <span className="prov-rec">
                    ▶ {rev.recommendation_before} → <strong>{rev.recommendation_after}</strong>
                  </span>
                )}
              </button>
              {open === rev.seq && <RevisionDetail rev={rev} doc={doc} />}
            </div>
          )
        })}
      </div>

      <h3 style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
        WHY — per field · current recommendation <strong>{doc.canonical.recommendation}</strong>
      </h3>
      <div className="prov-fields">
        {Object.values(doc.canonical.fields).map((sel) => (
          <WhyField key={sel.field} sel={sel} />
        ))}
      </div>

      <details>
        <summary style={{ cursor: 'pointer', fontSize: '0.8rem' }}>ACTIVE POLICY</summary>
        <div className="prov-policy">{doc.policy}</div>
      </details>
    </div>
  )
}
