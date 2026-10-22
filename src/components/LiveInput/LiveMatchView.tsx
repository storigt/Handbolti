import { useEffect, useState } from 'react'
import { EventLogger } from './EventLogger'
import { LiveStats } from './LiveStats'
import { useT } from '@/lib/i18n/lang'

type Tab = 'input' | 'stats'

export function LiveMatchView() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('input')
  useScreenAwake()
  const tabs: { v: Tab; label: string }[] = [
    { v: 'input', label: t({ en: 'Logging', is: 'Skráning' }) },
    { v: 'stats', label: t({ en: 'Live stats', is: 'Tölfræði' }) },
  ]

  return (
    <div className="flex flex-col h-svh bg-ground">
      <div className="flex shrink-0 bg-ink p-1 gap-1" role="tablist">
        {tabs.map(x => (
          <button
            key={x.v}
            role="tab"
            aria-selected={tab === x.v}
            onPointerDown={() => setTab(x.v)}
            className={`flex-1 h-9 rounded-md text-[14px] font-medium transition-colors ${
              tab === x.v ? 'bg-white text-ink' : 'text-white/70 hover:text-white'
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden min-h-0">
        {tab === 'input' ? <EventLogger /> : <LiveStats />}
      </div>
    </div>
  )
}

/**
 * Keep the tablet's screen on while a match is being logged, so it never locks
 * between two events. Browsers drop the lock when the page is hidden, so it is
 * asked for again whenever the page comes back. Unsupported browsers: no-op.
 */
function useScreenAwake() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> }
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock
    if (!wl) return
    let sentinel: Sentinel | null = null
    let alive = true
    const ask = () => {
      if (document.visibilityState !== 'visible') return
      wl.request('screen').then(s => { if (alive) sentinel = s; else s.release() }).catch(() => { /* denied or unsupported */ })
    }
    ask()
    document.addEventListener('visibilitychange', ask)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', ask)
      sentinel?.release().catch(() => {})
    }
  }, [])
}
