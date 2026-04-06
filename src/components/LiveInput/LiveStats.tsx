import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMatchStore, selectActiveEvents, selectTrackedScore, selectOpponentScore } from '@/store/matchStore'
import { computeAttack, computeDefense, computeGK } from '@/lib/stats/matchStats'
import { AttackTable, DefenseTable, GKTable, TeamStatsTable } from '@/components/stats/StatTables'
import { useMinuteFilter, MinuteFilterBar } from '@/components/stats/MinuteFilter'
import { ShotMap } from '@/components/stats/ShotMap'

type StatsTab = 'attack' | 'defense' | 'gk' | 'team' | 'shotmap'

// ─── Score bar ────────────────────────────────────────────────────────────────

function LiveScoreBar() {
  const trackedScore = useMatchStore(selectTrackedScore)
  const opponentScore = useMatchStore(selectOpponentScore)
  const homeTeam = useMatchStore(s => s.homeTeam)
  const awayTeam = useMatchStore(s => s.awayTeam)
  const match = useMatchStore(s => s.match)
  const period = useMatchStore(s => s.currentPeriod)
  const isTrackedHome = match?.home_team_id === match?.tracked_team_id
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-900 text-white text-sm shrink-0">
      <span className="font-semibold truncate max-w-[30%]">{homeTeam?.name ?? 'Heimalið'}</span>
      <span className="font-bold text-lg tabular-nums">
        {isTrackedHome ? trackedScore : opponentScore} – {isTrackedHome ? opponentScore : trackedScore}
      </span>
      <span className="font-semibold truncate max-w-[30%]">{awayTeam?.name ?? 'Gestir'}</span>
      <span className="text-slate-400 text-xs">Leikhluti {period}</span>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function LiveStats() {
  const [tab, setTab] = useState<StatsTab>('attack')
  const allEvents = useMatchStore(useShallow(selectActiveEvents))
  const trackedPlayers = useMatchStore(useShallow(s => s.trackedPlayers))
  const match = useMatchStore(s => s.match)
  const homeTeam = useMatchStore(s => s.homeTeam)
  const awayTeam = useMatchStore(s => s.awayTeam)
  const trackedTeamId = match?.tracked_team_id ?? ''
  const isTrackedHome = match?.home_team_id === trackedTeamId
  const myTeamName = isTrackedHome ? homeTeam?.name : awayTeam?.name
  const opponentTeamName = isTrackedHome ? awayTeam?.name : homeTeam?.name
  const goalkeepers = useMemo(() => trackedPlayers.filter(p => p.position === 'goalkeeper'), [trackedPlayers])
  const { range, setRange, filterEvents, clear } = useMinuteFilter()
  const events = useMemo(() => filterEvents(allEvents), [allEvents, range]) // eslint-disable-line react-hooks/exhaustive-deps

  const attackStats = useMemo(() => computeAttack(events, trackedPlayers, trackedTeamId), [events, trackedPlayers, trackedTeamId])
  const defenseStats = useMemo(() => computeDefense(events, trackedPlayers, trackedTeamId), [events, trackedPlayers, trackedTeamId])
  const gkStats = useMemo(() => computeGK(events, goalkeepers, trackedTeamId), [events, goalkeepers, trackedTeamId])

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      <LiveScoreBar />
      <div className="flex shrink-0 border-b border-gray-200 bg-white overflow-x-auto">
        {([
          { v: 'attack' as StatsTab, label: 'Sókn' },
          { v: 'defense' as StatsTab, label: 'Vörn' },
          { v: 'gk' as StatsTab, label: 'Markvörður' },
          { v: 'team' as StatsTab, label: 'Liðstölur' },
          { v: 'shotmap' as StatsTab, label: 'Skotakort' },
        ] as const).map(t => (
          <button key={t.v} onPointerDown={() => setTab(t.v)}
            className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap px-3 ${tab === t.v ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab !== 'shotmap' && <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />}
      <div className="flex-1 overflow-auto">
        {tab === 'attack' && <AttackTable rows={attackStats} />}
        {tab === 'defense' && <DefenseTable rows={defenseStats} />}
        {tab === 'gk' && <GKTable rows={gkStats} />}
        {tab === 'team' && <TeamStatsTable events={events} trackedTeamId={trackedTeamId} myTeamName={myTeamName} opponentTeamName={opponentTeamName} />}
        {tab === 'shotmap' && <ShotMap allEvents={allEvents} players={trackedPlayers} trackedTeamId={trackedTeamId} />}
      </div>
    </div>
  )
}
