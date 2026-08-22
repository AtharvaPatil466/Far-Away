import { useEffect, useState } from 'react'
import type { UnifiedModuleKey } from './TopNav'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

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
      <nav className="fixed left-0 top-0 z-50 flex h-full w-[72px] flex-col items-center border-r border-outline-variant bg-surface py-6">
        <div className="flex w-full flex-1 flex-col items-center gap-8">
          <button
            type="button"
            onClick={() => onChange('dashboard')}
            aria-label="DisasterMind home"
            className="flex h-12 w-12 items-center justify-center rounded border border-outline-variant bg-surface text-primary transition-colors hover:border-primary"
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
                    'group relative flex aspect-square w-full flex-col items-center justify-center gap-1 rounded transition-colors duration-150',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
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
            className="flex aspect-square w-full items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
          >
            <Icon name="settings" className="text-[22px]" />
          </button>
          <button
            type="button"
            aria-label="Support"
            className="flex aspect-square w-full items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
          >
            <Icon name="help_outline" className="text-[22px]" />
          </button>
          <div className="mt-1 flex h-10 w-10 items-center justify-center rounded border border-outline-variant bg-surface font-mono text-label-sm text-on-surface-variant">
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
              <h1 className="text-headline-md font-normal tracking-[-0.03em] text-on-surface">DisasterMind</h1>
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
                className="w-full rounded border border-outline-variant bg-transparent py-2 pl-10 pr-4 text-body-sm text-on-surface transition-colors placeholder:text-on-surface-variant focus:border-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary"
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
                'hidden items-center gap-2 rounded border px-3 py-1.5 font-mono text-label-xs uppercase lg:inline-flex',
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
              className="hidden items-center gap-2 rounded border border-secondary px-4 py-2 font-mono text-label-xs uppercase text-secondary transition-colors hover:bg-secondary/10 lg:flex"
            >
              <Icon name="campaign" className="text-[16px]" />
              Emergency Broadcast
            </button>
            <button
              type="button"
              onClick={() => onChange('escalation')}
              className="flex items-center gap-2 rounded bg-primary px-4 py-2 font-mono text-label-xs font-bold uppercase text-on-primary transition-colors hover:bg-primary-fixed-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
      </div>
    </div>
  )
}
