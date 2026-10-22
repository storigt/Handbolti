import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMatchStore, selectActiveEvents, selectTrackedScore, selectOpponentScore } from '@/store/matchStore'
import { computeAttack, computeDefense, computeGK } from '@/lib/stats/matchStats'
import { AttackTable, DefenseTable, GKTable, TeamStatsTable } from '@/components/stats/StatTables'
import { useMinuteFilter, MinuteFilterBar } from '@/components/stats/MinuteFilter'
import { ShotMap } from '@/components/stats/ShotMap'
import { computeIndices } from '@/lib/stats/indices'
import { IndexPanel } from '@/components/stats/IndexPanel'
import { MatchFlow } from '@/components/stats/MatchFlow'
import { useT } from '@/lib/i18n/lang'
import { T } from '@/lib/i18n/terms'
import { Tabs } from '@/components/ui'

type StatsTab = 'attack' | 'defense' | 'gk' | 'team' | 'flow' | 'shotmap' | 'indices'

// ─── Score bar ────────────────────────────────────────────────────────────────

function LiveScoreBar() {
  const t = useT()
  const trackedScore = useMatchStore(selectTrackedScore)
  const opponentScore = useMatchStore(selectOpponentScore)
  const homeTeam = useMatchStore(s => s.homeTeam)
  const awayTeam = useMatchStore(s => s.awayTeam)
  const match = useMatchStore(s => s.match)
  const period = useMatchStore(s => s.currentPeriod)
  const isTrackedHome = match?.home_team_id === match?.tracked_team_id
  return (
    <div className="flex items-center gap-3 px-4 h-12 bg-ink text-white shrink-0">
      <span className="flex-1 min-w-0 truncate text-right font-medium">{homeTeam?.name ?? t(T.home)}</span>
      <span className="text-[22px] font-semibold num whitespace-nowrap">
        {isTrackedHome ? trackedScore : opponentScore}<span className="text-white/50 mx-1">–</span>{isTrackedHome ? opponentScore : trackedScore}
      </span>
      <span className="flex-1 min-w-0 truncate font-medium">{awayTeam?.name ?? t(T.away)}</span>
      <span className="text-white/70 text-[13px] whitespace-nowrap">{t(T.period)} {period}</span>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function LiveStats() {
  const t = useT()
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
  const indices = useMemo(() => computeIndices(events, trackedTeamId), [events, trackedTeamId])
  const minuteFiltered = range.from !== null || range.to !== null

  return (
    <div className="flex flex-col h-full bg-ground overflow-hidden">
      <LiveScoreBar />
      <div className="bg-white px-2 shrink-0">
        <Tabs<StatsTab> value={tab} onChange={setTab} label={t({ en: 'Live stats', is: 'Tölfræði' })} options={[
          { v: 'attack', label: t(T.attack) },
          { v: 'defense', label: t(T.defence) },
          { v: 'gk', label: t(T.goalkeeper) },
          { v: 'team', label: t(T.teamStats) },
          { v: 'flow', label: t({ en: 'Flow', is: 'Gangur' }) },
          { v: 'shotmap', label: t(T.shotMap) },
          { v: 'indices', label: t(T.indices) },
        ]} />
      </div>
      {tab !== 'shotmap' && tab !== 'flow' && <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />}
      <div className="flex-1 overflow-auto bg-white">
        {tab === 'attack' && <AttackTable rows={attackStats} />}
        {tab === 'defense' && <DefenseTable rows={defenseStats} />}
        {tab === 'gk' && <GKTable rows={gkStats} />}
        {tab === 'team' && <TeamStatsTable events={events} trackedTeamId={trackedTeamId} myTeamName={myTeamName} opponentTeamName={opponentTeamName} />}
        {tab === 'flow' && <div className="pt-4"><MatchFlow events={allEvents} trackedTeamId={trackedTeamId} myName={myTeamName} oppName={opponentTeamName} /></div>}
        {tab === 'shotmap' && <ShotMap allEvents={allEvents} players={trackedPlayers} trackedTeamId={trackedTeamId} />}
        {tab === 'indices' && <IndexPanel breakdown={indices} minuteFiltered={minuteFiltered} />}
      </div>
    </div>
  )
}
