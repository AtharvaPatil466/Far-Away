import { useEffect, useState } from 'react'
import { CheckCircle2, RefreshCcw, ScanSearch, ShieldAlert, ShieldCheck } from 'lucide-react'

interface AuditEventPayload {
  number: number
  type: string
  timestamp: string
  detail: string
}

interface AuditEvent extends AuditEventPayload {
  previousHash: string
  hash: string
}

type VerificationState = 'loading' | 'unverified' | 'verifying' | 'intact' | 'tampered'

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

const DEMO_EVENTS: readonly AuditEventPayload[] = [
  { number: 1, type: 'Incident detected', timestamp: '2025-05-26T10:14:02Z', detail: 'Flood threshold exceeded in Zone 7.' },
  { number: 2, type: 'Prediction generated', timestamp: '2025-05-26T10:14:18Z', detail: 'Inundation risk scored at 92%.' },
  { number: 3, type: 'Resource plan created', timestamp: '2025-05-26T10:14:31Z', detail: 'Evacuation transport and shelters allocated.' },
  { number: 4, type: 'Commander review requested', timestamp: '2025-05-26T10:14:42Z', detail: 'Human approval required for mandatory evacuation.' },
  { number: 5, type: 'Decision approved', timestamp: '2025-05-26T10:15:07Z', detail: 'Commander approved evacuation order.' },
]

function canonical(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function buildDemoChain(): Promise<AuditEvent[]> {
  let previousHash = GENESIS_HASH
  const chain: AuditEvent[] = []
  for (const event of DEMO_EVENTS) {
    const hash = await sha256(`${previousHash}|${canonical(event)}`)
    chain.push({ ...event, previousHash, hash })
    previousHash = hash
  }
  return chain
}

async function firstInvalidEvent(events: readonly AuditEvent[]): Promise<number | null> {
  let previousHash = GENESIS_HASH
  for (const event of events) {
    const payload: AuditEventPayload = {
      number: event.number,
      type: event.type,
      timestamp: event.timestamp,
      detail: event.detail,
    }
    const expectedHash = await sha256(`${previousHash}|${canonical(payload)}`)
    if (event.previousHash !== previousHash || event.hash !== expectedHash) return event.number
    previousHash = event.hash
  }
  return null
}

const hashPrefix = (hash: string) => `${hash.slice(0, 12)}…`

/** Local, deterministic demonstration of a tamper-evident SHA-256 audit chain. */
export function AuditIntegrity() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [verification, setVerification] = useState<VerificationState>('loading')
  const [invalidEvent, setInvalidEvent] = useState<number | null>(null)

  const resetDemo = async () => {
    setVerification('loading')
    setInvalidEvent(null)
    setEvents(await buildDemoChain())
    setVerification('unverified')
  }

  useEffect(() => {
    void resetDemo()
  }, [])

  const verifyChain = async () => {
    setVerification('verifying')
    const invalid = await firstInvalidEvent(events)
    setInvalidEvent(invalid)
    setVerification(invalid === null ? 'intact' : 'tampered')
  }

  const simulateTamper = () => {
    setEvents((current) => current.map((event) => (
      event.number === 3
        ? { ...event, detail: 'Evacuation transport allocation changed after approval.' }
        : event
    )))
    setInvalidEvent(null)
    setVerification('unverified')
  }

  const verificationMessage = verification === 'intact'
    ? 'CHAIN INTACT — local demo records re-hashed successfully.'
    : verification === 'tampered'
      ? `TAMPERING DETECTED at event #${invalidEvent}.`
      : verification === 'verifying'
        ? 'Verifying local hash links…'
        : 'NOT VERIFIED / DEMO ONLY'

  return (
    <div className="evidence-pane audit-pane">
      <div className="evidence-head">
        <h2>Audit Integrity</h2>
        <p className="evidence-sub">
          The real backend uses a SHA-256 hash chain; this panel demonstrates how retroactive edits are detected.
        </p>
      </div>

      <p className="sample-banner">Demo audit chain — frontend simulation</p>

      <div className={`audit-verification audit-${verification}`} role="status" aria-live="polite">
        {verification === 'intact' ? <ShieldCheck size={19} /> : verification === 'tampered' ? <ShieldAlert size={19} /> : <ScanSearch size={19} />}
        <div>
          <strong>{verificationMessage}</strong>
          <span> No backend verification endpoint was called.</span>
        </div>
      </div>

      <div className="audit-actions" aria-label="Audit demo controls">
        <button type="button" className="audit-action audit-verify" onClick={() => void verifyChain()} disabled={verification === 'loading' || verification === 'verifying'}>
          <CheckCircle2 size={15} /> Verify Chain
        </button>
        <button type="button" className="audit-action audit-tamper" onClick={simulateTamper} disabled={verification === 'loading'}>
          <ShieldAlert size={15} /> Simulate Tamper
        </button>
        <button type="button" className="audit-action audit-reset" onClick={() => void resetDemo()} disabled={verification === 'loading'}>
          <RefreshCcw size={15} /> Reset Demo
        </button>
      </div>

      <div className="audit-chain" aria-label="Local demo audit hash chain">
        {events.map((event) => {
          const isInvalid = verification === 'tampered' && event.number === invalidEvent
          return (
            <article key={event.number} className={`audit-event ${isInvalid ? 'audit-event-tampered' : ''}`}>
              <div className="audit-event-number">#{event.number}</div>
              <div className="audit-event-main">
                <h3>{event.type}</h3>
                <p>{event.detail}</p>
              </div>
              <dl className="audit-event-meta">
                <div><dt>Timestamp</dt><dd>{event.timestamp.replace('T', ' ').replace('Z', ' UTC')}</dd></div>
                <div><dt>Hash</dt><dd>{hashPrefix(event.hash)}</dd></div>
                <div><dt>Previous hash</dt><dd>{event.number === 1 ? 'GENESIS' : hashPrefix(event.previousHash)}</dd></div>
              </dl>
            </article>
          )
        })}
      </div>

      <p className="honesty-note">
        <strong>How the demo works:</strong> each local event is canonicalized and hashed with the preceding hash.
        Simulate Tamper changes only an already-hashed browser record, so the next verification identifies the first broken link.
        Global audit status remains unknown until a real backend verification result is available.
      </p>
    </div>
  )
}
