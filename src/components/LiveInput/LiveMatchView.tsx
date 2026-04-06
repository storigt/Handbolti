import { useState } from 'react'
import { EventLogger } from './EventLogger'
import { LiveStats } from './LiveStats'

type Tab = 'input' | 'stats'

export function LiveMatchView() {
  const [tab, setTab] = useState<Tab>('input')

  return (
    <div className="flex flex-col h-screen">
      <div className="flex shrink-0 bg-slate-800">
        <button
          onPointerDown={() => setTab('input')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
            tab === 'input' ? 'bg-blue-600 text-white' : 'text-slate-400'
          }`}
        >
          Skráning
        </button>
        <button
          onPointerDown={() => setTab('stats')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
            tab === 'stats' ? 'bg-blue-600 text-white' : 'text-slate-400'
          }`}
        >
          Tölfræði
        </button>
      </div>
      <div className="flex-1 overflow-hidden min-h-0">
        {tab === 'input' ? <EventLogger /> : <LiveStats />}
      </div>
    </div>
  )
}
