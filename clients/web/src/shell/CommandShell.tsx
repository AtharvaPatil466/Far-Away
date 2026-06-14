import { useEffect, useState } from 'react'
import type { UnifiedModuleKey } from './TopNav'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

interface NavItem {
  key: UnifiedModuleKey
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid_view' },
  { key: 'escalation', label: 'Escalations', icon: 'crisis_alert' },
  { key: 'report', label: 'Incidents', icon: 'summarize' },
  { key: 'evidence', label: 'Evidence', icon: 'fact_check' },
  { key: 'field', label: 'Field', icon: 'smartphone' },
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
    <div className="flex h-screen overflow-hidden bg-background font-sans text-on-surface antialiased">
      {/* SideNav — 72px icon rail */}
      <nav className="fixed left-0 top-0 z-50 flex h-full w-[72px] flex-col items-center justify-between border-r border-outline-variant bg-surface-container-lowest py-6">
        <div className="flex w-full flex-col items-center gap-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-container-high text-primary">
            <Icon name="hub" filled className="text-[28px]" />
          </div>

          <div className="flex w-full flex-col gap-2 px-2">
            {NAV_ITEMS.map((item) => {
              const isActive = item.key === activeModule
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-label={item.label}
                  onClick={() => onChange(item.key)}
                  className={cn(
                    'group relative flex aspect-square w-full flex-col items-center justify-center rounded-xl p-2 transition-colors duration-200',
                    isActive
                      ? 'bg-primary-container/10 text-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary',
                    item.key === 'escalation' && flashEscalation && 'animate-pulse bg-secondary/10 text-secondary',
                  )}
                >
                  <Icon name={item.icon} filled={isActive} className="text-[24px]" />
                  <span className="mt-1 text-label-xs text-[10px] leading-none">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-3 px-2">
          {['settings', 'help_outline'].map((icon) => (
            <button
              key={icon}
              type="button"
              className="flex aspect-square w-full items-center justify-center rounded-xl p-2 text-on-surface-variant transition-colors duration-200 hover:bg-surface-container-high hover:text-primary"
            >
              <Icon name={icon} className="text-[24px]" />
            </button>
          ))}
          <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container-high text-label-xs text-on-surface-variant">
            C7
          </div>
        </div>
      </nav>

      {/* Main column */}
      <div className="relative ml-[72px] flex h-screen flex-1 flex-col overflow-hidden bg-background">
        {/* TopAppBar — 80px */}
        <header className="z-40 flex h-20 w-full flex-shrink-0 items-center justify-between border-b border-outline-variant bg-surface-dim px-8">
          <div className="flex h-full items-center gap-6">
            <div className="flex flex-col">
              <h1 className="text-headline-md font-bold tracking-tight text-primary">DisasterMind</h1>
              <span className="text-code-sm text-on-surface-variant">CMD-CNTR-01 · {clock}</span>
            </div>
            <div className="relative ml-2 hidden w-64 lg:block">
              <Icon
                name="search"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
              />
              <input
                type="text"
                placeholder="Search operations..."
                className="w-full rounded-lg border border-outline-variant bg-[#0b0b0b] py-2 pl-10 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={cn(
                'hidden items-center gap-1.5 rounded-full border px-3 py-1 text-code-sm uppercase lg:inline-flex',
                cyclone === 'red'
                  ? 'border-secondary/20 bg-secondary/10 text-secondary'
                  : 'border-warning/20 bg-warning/10 text-warning',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  cyclone === 'red' ? 'animate-pulse bg-secondary' : 'bg-warning',
                )}
              />
              Cyclone Remal
            </span>
            <button className="hidden items-center gap-2 rounded-lg border border-secondary px-4 py-2 text-label-xs text-secondary transition-colors hover:bg-secondary/10 lg:flex">
              <Icon name="campaign" className="text-[16px]" />
              Emergency Broadcast
            </button>
            <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-xs font-bold text-on-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)] transition-colors hover:bg-primary-fixed-dim">
              <Icon name="groups" className="text-[16px]" />
              Deploy Personnel
            </button>
            <div className="ml-1 flex items-center gap-1 border-l border-outline-variant pl-2">
              <button className="relative p-2 text-on-surface-variant transition-colors hover:text-primary">
                <Icon name="notifications" className="text-[20px]" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-secondary" />
              </button>
              <button className="p-2 text-on-surface-variant transition-colors hover:text-primary">
                <Icon name="account_circle" className="text-[20px]" />
              </button>
            </div>
          </div>
        </header>

        {/* Canvas */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
