import { useState, useMemo } from 'react'
import type { Event, Player } from '@/lib/db/schema'
import type { MatchWithTeams } from '@/lib/supabase/dashboardQueries'
import { buildCSV, downloadCSV, type ExportStatsType } from '@/lib/stats/exportCsv'
import { MinuteInput } from './MinuteFilter'
import type { MinuteRange } from './MinuteFilter'

interface Props {
  onClose: () => void
  allEvents: Event[]
  players: Player[]
  matches: MatchWithTeams[]
  trackedTeamId: string
  trackedTeamName: string
}

export function ExportModal({ onClose, allEvents, players, matches, trackedTeamId, trackedTeamName }: Props) {
  const [statsType, setStatsType] = useState<ExportStatsType>('attack')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set())
  const [minuteRange, setMinuteRange] = useState<MinuteRange>({ from: null, to: null })
  const [includeTotals, setIncludeTotals] = useState(true)

  const relevantPlayers = useMemo(() =>
    statsType === 'gk'
      ? players.filter(p => p.position === 'goalkeeper')
      : players.filter(p => p.position !== 'goalkeeper'),
    [players, statsType],
  )

  function togglePlayer(id: string) {
    setSelectedPlayerIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleMatch(id: string) {
    setSelectedMatchIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function handleDownload() {
    // Filter events by selected matches
    let events = allEvents
    if (selectedMatchIds.size > 0) {
      events = events.filter(e => selectedMatchIds.has(e.match_id))
    }

    // Filter by minute range
    if (minuteRange.from !== null || minuteRange.to !== null) {
      events = events.filter(e => {
        const m = e.match_minute
        if (m === null || m === undefined) return true
        if (minuteRange.from !== null && m < minuteRange.from) return false
        if (minuteRange.to !== null && m > minuteRange.to) return false
        return true
      })
    }

    // Filter players
    let exportPlayers = relevantPlayers
    if (selectedPlayerIds.size > 0) {
      exportPlayers = exportPlayers.filter(p => selectedPlayerIds.has(p.id))
    }

    const csv = buildCSV(events, exportPlayers, trackedTeamId, statsType, includeTotals)

    const typeLabel = statsType === 'attack' ? 'sokn' : statsType === 'defense' ? 'vorn' : 'markvordur'
    const matchLabel = selectedMatchIds.size > 0 ? `_${selectedMatchIds.size}leikir` : '_allir'
    const minuteLabel = minuteRange.from !== null || minuteRange.to !== null
      ? `_${minuteRange.from ?? 0}-${minuteRange.to ?? 90}min`
      : ''
    const filename = `${trackedTeamName}_${typeLabel}${matchLabel}${minuteLabel}.csv`
      .replace(/\s+/g, '_')
      .toLowerCase()

    downloadCSV(csv, filename)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-bold text-gray-900">Hlaða niður CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Stats type */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tegund talna</p>
            <div className="flex gap-2">
              {(['attack', 'defense', 'gk'] as ExportStatsType[]).map(t => (
                <button
                  key={t}
                  onClick={() => { setStatsType(t); setSelectedPlayerIds(new Set()) }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    statsType === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {t === 'attack' ? 'Sókn' : t === 'defense' ? 'Vörn' : 'Markvörður'}
                </button>
              ))}
            </div>
          </section>

          {/* Minute range */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tímabil (mínútur)</p>
            <div className="flex items-center gap-3">
              <MinuteInput
                label="Frá"
                value={minuteRange.from}
                onChange={v => setMinuteRange(r => ({ ...r, from: v }))}
              />
              <span className="text-gray-400">–</span>
              <MinuteInput
                label="Til"
                value={minuteRange.to}
                onChange={v => setMinuteRange(r => ({ ...r, to: v }))}
              />
              {(minuteRange.from !== null || minuteRange.to !== null) && (
                <button
                  onClick={() => setMinuteRange({ from: null, to: null })}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Hreinsa
                </button>
              )}
            </div>
          </section>

          {/* Players */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {statsType === 'gk' ? 'Markmenn' : 'Leikmenn'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedPlayerIds(new Set())}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Allir
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setSelectedPlayerIds(new Set(relevantPlayers.map(p => p.id)))}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Velja alla
                </button>
              </div>
            </div>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-36 overflow-y-auto">
              {relevantPlayers.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">Engir leikmenn</p>
              ) : relevantPlayers.map(p => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedPlayerIds.size === 0 || selectedPlayerIds.has(p.id)}
                    onChange={() => {
                      if (selectedPlayerIds.size === 0) {
                        // Currently "all" — start excluding this one by selecting all others
                        const others = new Set(relevantPlayers.filter(x => x.id !== p.id).map(x => x.id))
                        setSelectedPlayerIds(others)
                      } else {
                        togglePlayer(p.id)
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">
                    {p.jersey_number != null ? <span className="text-gray-400 text-xs mr-1">#{p.jersey_number}</span> : null}
                    {p.first_name} {p.last_name}
                  </span>
                </label>
              ))}
            </div>
            {selectedPlayerIds.size > 0 && (
              <p className="text-xs text-blue-600 mt-1">{selectedPlayerIds.size} valinn/valin</p>
            )}
          </section>

          {/* Matches */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Leikir</p>
              <div className="flex gap-2">
                <button onClick={() => setSelectedMatchIds(new Set())} className="text-xs text-blue-600 hover:underline">
                  Allir
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setSelectedMatchIds(new Set(matches.map(m => m.id)))}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Velja alla
                </button>
              </div>
            </div>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
              {matches.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">Engir leikir</p>
              ) : matches.map(m => {
                const isHome = m.home_team_id === trackedTeamId
                const opponent = isHome ? m.away_team : m.home_team
                const scored = isHome ? m.home_score : m.away_score
                const against = isHome ? m.away_score : m.home_score
                const date = m.match_date
                  ? new Date(m.match_date).toLocaleDateString('is-IS', { day: 'numeric', month: 'short' })
                  : ''
                const checked = selectedMatchIds.size === 0 || selectedMatchIds.has(m.id)
                return (
                  <label key={m.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (selectedMatchIds.size === 0) {
                          const others = new Set(matches.filter(x => x.id !== m.id).map(x => x.id))
                          setSelectedMatchIds(others)
                        } else {
                          toggleMatch(m.id)
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700 flex-1">
                      vs {opponent?.name ?? '?'}
                    </span>
                    <span className="text-xs text-gray-400 tabular-nums">
                      {scored ?? '?'}–{against ?? '?'} · {date}
                    </span>
                  </label>
                )
              })}
            </div>
            {selectedMatchIds.size > 0 && (
              <p className="text-xs text-blue-600 mt-1">{selectedMatchIds.size} leikur/leikir valinn/valin</p>
            )}
          </section>

          {/* Options */}
          <section>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTotals}
                onChange={e => setIncludeTotals(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Hafa með samtals línu</span>
            </label>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Hætta við
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 active:bg-blue-700"
          >
            Hlaða niður
          </button>
        </div>
      </div>
    </div>
  )
}
