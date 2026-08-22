import { useEffect, useState } from 'react'
import type { UnifiedModuleKey } from './TopNav'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { AuditFooter } from '@/components/AuditFooter'

interface NavItem {
  key: UnifiedModuleKey
  label: string
  icon: string
}

/** Primary rail — maps the Deep Midnight icon rail onto the real modules. */
const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid_view' },
  { key: 'escalation', label: 'Escalations', icon: 'list_alt' },
  { key: 'report', label: 'Incidents', icon: 'description' },
  { key: 'evidence', label: 'Evidence', icon: 'fact_check' },
  { key: 'field', label: 'Field Ops', icon: 'map' },
]

const formatClock = (date: Date) =>
  date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

interface CommandShellProps {
  activeModule: UnifiedModuleKey
  onChange: (module: UnifiedModuleKey) => void
  children: React.ReactNode
}

export function CommandShell({ activeModule, onChange, children }: CommandShellProps) {
  const [clock, setClock] = useState(() => formatClock(new Date()))
  const [cyclone, setCyclone] = useState<'red' | 'amber'>('red')
  const [flashEscalation, setFlashEscalation] = useState(false)

  useEffect(() => {
    const t = window.setInterval(() => setClock(formatClock(new Date())), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const onAmber = () => setCyclone('amber')
    const onRed = () => setCyclone('red')
    let timeout: number
    const onFlash = () => {
      setFlashEscalation(true)
      timeout = window.setTimeout(() => setFlashEscalation(false), 3000)
    }
    window.addEventListener('cyclone-badge-amber', onAmber)
    window.addEventListener('cyclone-badge-red', onRed)
    window.addEventListener('flash-escalation-tab', onFlash)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('cyclone-badge-amber', onAmber)
      window.removeEventListener('cyclone-badge-red', onRed)
      window.removeEventListener('flash-escalation-tab', onFlash)
    }
  }, [])

  return (
    <div className="h-screen w-full overflow-hidden bg-background text-on-surface antialiased">
      {/* ── SideNavBar — 72px icon rail ──────────────────────────────── */}
      <nav className="fixed left-0 top-0 z-50 flex h-full w-[72px] flex-col items-center border-r border-outline-variant bg-surface-container-lowest py-6">
        <div className="flex w-full flex-1 flex-col items-center gap-8">
          <button
            type="button"
            onClick={() => onChange('dashboard')}
            aria-label="DisasterMind home"
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-high text-primary transition-[background-color,transform] hover:bg-surface-container-highest active:scale-90"
          >
            <Icon name="hub" filled className="text-[28px]" />
          </button>

          <div className="flex w-full flex-col gap-3 px-2">
            {NAV_ITEMS.map((item) => {
              const isActive = item.key === activeModule
              const flashing = item.key === 'escalation' && flashEscalation
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChange(item.key)}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    'group relative flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl transition-all duration-150 active:scale-90',
                    isActive
                      ? 'scale-95 bg-primary-container/10 text-primary'
                      : 'text-on-surface-variant hover:-translate-y-px hover:bg-surface-container-high hover:text-primary',
                    flashing && 'animate-pulse bg-error/10 text-error',
                  )}
                >
                  <Icon name={item.icon} filled={isActive} className="text-[24px]" />
                  <span className="text-[10px] font-semibold leading-none opacity-70">
                    {item.label.split(' ')[0]}
                  </span>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-4 px-2">
          <button
            type="button"
            aria-label="Settings"
            className="flex aspect-square w-full items-center justify-center rounded-xl text-on-surface-variant transition-[background-color,color,transform] hover:bg-surface-container-high hover:text-primary active:scale-90"
          >
            <Icon name="settings" className="text-[22px]" />
          </button>
          <button
            type="button"
            aria-label="Support"
            className="flex aspect-square w-full items-center justify-center rounded-xl text-on-surface-variant transition-[background-color,color,transform] hover:bg-surface-container-high hover:text-primary active:scale-90"
          >
            <Icon name="help_outline" className="text-[22px]" />
          </button>
          <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container-high text-label-sm text-on-surface-variant">
            C7
          </div>
        </div>
      </nav>

      {/* ── Main column ──────────────────────────────────────────────── */}
      <div className="ml-[72px] flex h-screen flex-col">
        {/* TopAppBar — 80px */}
        <header className="relative z-40 flex h-20 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-dim px-8">
          {/* Brand + search */}
          <div className="flex h-full items-center gap-8">
            <div className="flex flex-col justify-center">
              <h1 className="text-headline-md font-bold tracking-tight text-primary">DisasterMind</h1>
              <span className="font-mono text-code-sm text-on-surface-variant">CMD-CNTR-01</span>
            </div>
            <div className="relative hidden w-64 lg:block">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
              />
              <input
                type="text"
                placeholder="Search operations…"
                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pl-10 pr-4 text-body-sm text-on-surface transition-colors placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-code-sm tabular-nums text-on-surface-variant xl:inline">
              {clock} IST
            </span>
            <span
              className={cn(
                'hidden items-center gap-2 rounded-lg border px-3 py-1.5 text-label-xs uppercase lg:inline-flex',
                cyclone === 'red'
                  ? 'border-secondary/40 bg-secondary/10 text-secondary'
                  : 'border-warning/40 bg-warning/10 text-warning',
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  cyclone === 'red' ? 'animate-pulse bg-secondary' : 'bg-warning',
                )}
              />
              Cyclone Remal — Active
            </span>
            <button
              type="button"
              className="hidden items-center gap-2 rounded-lg border border-secondary px-4 py-2 text-label-xs uppercase text-secondary transition-[background-color,transform] hover:bg-secondary/10 active:scale-[0.97] lg:flex"
            >
              <Icon name="campaign" className="text-[16px]" />
              Emergency Broadcast
            </button>
            <button
              type="button"
              onClick={() => onChange('escalation')}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-xs font-bold uppercase text-on-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] transition-[filter,transform] hover:brightness-110 active:scale-[0.97]"
            >
              <Icon name="groups" className="text-[16px]" />
              Deploy Personnel
            </button>
            <div className="ml-1 flex items-center gap-1 border-l border-outline-variant pl-2">
              <button
                type="button"
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-primary"
              >
                <Icon name="notifications" className="text-[20px]" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-secondary" />
              </button>
            </div>
          </div>
        </header>

        {/* Canvas */}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

        {/* Always-visible ledger status: settled/pending counters, feed
            liveness, external anchor, and chain integrity as separate lights. */}
        <AuditFooter />
      </div>
    </div>
  )
}
