import { useState, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  getMatchHistory,
  getMatchSummaries,
  getSeasonsForTeam,
  getCompetitionsForTeam,
  getMatchEventsForMatches,
  type MatchWithTeams,
} from '@/lib/supabase/dashboardQueries'
import { getPlayersByTeam, updateTeam, deleteMatch } from '@/lib/supabase/queries'
import { computeAttack, computeDefense, computeGK } from '@/lib/stats/matchStats'
import { AttackTable, DefenseTable, GKTable, TeamStatsTable } from '@/components/stats/StatTables'
import { useMinuteFilter, MinuteFilterBar } from '@/components/stats/MinuteFilter'
import { ShotMap } from '@/components/stats/ShotMap'
import { ExportModal } from '@/components/stats/ExportModal'
import { computeIndices } from '@/lib/stats/indices'
import { IndexPanel } from '@/components/stats/IndexPanel'
import { Card, Spinner } from '@/components/ui'
import type { Team, Player } from '@/lib/db/schema'

type Tab = 'overview' | 'attack' | 'defense' | 'gk' | 'shotmap' | 'matches' | 'indices'
type StatsSubTab = 'attack' | 'defense' | 'gk' | 'shotmap' | 'indices'

interface Props {
  trackedTeam: Team
  onNewMatch: () => void
  onEditMatch: (matchId: string) => void
}

export function SeasonDashboard({ trackedTeam, onNewMatch, onEditMatch }: Props) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [seasonId, setSeasonId] = useState<string>('')
  const [competitionId, setCompetitionId] = useState<string>('')
  // multi-match chip filter (empty = all)
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set())
  const [showExport, setShowExport] = useState(false)
  const [showEditTeam, setShowEditTeam] = useState(false)
  // drill-down into a single match from Leikir tab
  const [drillMatchId, setDrillMatchId] = useState<string | null>(null)
  const [drillSubTab, setDrillSubTab] = useState<StatsSubTab>('attack')

  const editTeamMutation = useMutation({
    mutationFn: (updates: { name: string; short_name: string; home_venue: string }) =>
      updateTeam(trackedTeam.id, {
        name: updates.name.trim(),
        short_name: updates.short_name.trim() || null,
        home_venue: updates.home_venue.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teams'] })
      setShowEditTeam(false)
    },
  })

  const deleteMatchMutation = useMutation({
    mutationFn: deleteMatch,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['match-history'] })
      void queryClient.invalidateQueries({ queryKey: ['match-summaries'] })
    },
    onError: (err) => {
      alert(`Tókst ekki að eyða leik: ${err instanceof Error ? err.message : 'Óþekkt villa'}`)
    },
  })

  const { data: seasons = [] } = useQuery({
    queryKey: ['seasons-for-team', trackedTeam.id],
    queryFn: () => getSeasonsForTeam(trackedTeam.id),
  })

  const { data: competitions = [] } = useQuery({
    queryKey: ['competitions-for-team', trackedTeam.id, seasonId],
    queryFn: () => getCompetitionsForTeam(trackedTeam.id, seasonId || undefined),
  })

  const { data: matches = [], isLoading: loadingMatches } = useQuery({
    queryKey: ['match-history', trackedTeam.id],
    queryFn: () => getMatchHistory(trackedTeam.id),
  })

  const { data: matchSummaries = [] } = useQuery({
    queryKey: ['match-summaries', trackedTeam.id, seasonId],
    queryFn: () => getMatchSummaries(trackedTeam.id, seasonId || undefined),
  })

  const { data: allPlayers = [], isLoading: loadingPlayers } = useQuery({
    queryKey: ['players', trackedTeam.id],
    queryFn: () => getPlayersByTeam(trackedTeam.id),
  })

  // Season/competition filter
  const filteredMatches = useMemo(() => {
    let m = matches
    if (competitionId) m = m.filter(x => x.competition_id === competitionId)
    else if (seasonId) m = m.filter(x => x.competition?.season_id === seasonId)
    return m
  }, [matches, seasonId, competitionId])

  // The matches to use for the stats panel (chip filter on top of season filter)
  const activeMatchIds = useMemo(() => {
    const base = filteredMatches.map(m => m.id)
    if (selectedMatchIds.size === 0) return base
    return base.filter(id => selectedMatchIds.has(id))
  }, [filteredMatches, selectedMatchIds])

  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['match-events', activeMatchIds],
    queryFn: () => getMatchEventsForMatches(activeMatchIds),
    enabled: activeMatchIds.length > 0,
  })

  // All events for filtered matches — used by ExportModal
  const allFilteredMatchIds = useMemo(() => filteredMatches.map(m => m.id), [filteredMatches])
  const { data: allFilteredEvents = [] } = useQuery({
    queryKey: ['match-events-all', allFilteredMatchIds],
    queryFn: () => getMatchEventsForMatches(allFilteredMatchIds),
    enabled: allFilteredMatchIds.length > 0,
  })

  // For drill-down: events for a single match
  const { data: drillEvents = [], isLoading: loadingDrill } = useQuery({
    queryKey: ['match-events', drillMatchId ? [drillMatchId] : []],
    queryFn: () => getMatchEventsForMatches(drillMatchId ? [drillMatchId] : []),
    enabled: !!drillMatchId,
  })

  const goalkeepers = useMemo(() => allPlayers.filter(p => p.position === 'goalkeeper'), [allPlayers])

  // Overview stats
  const summary = useMemo(() => {
    const teamSummaries = matchSummaries.filter(s => s.team_id === trackedTeam.id)
    const played = filteredMatches.length
    const goals = teamSummaries.reduce((s, r) => s + (r.goals ?? 0), 0)
    const shots = teamSummaries.reduce((s, r) => s + (r.shots_attempted ?? 0), 0)
    const conceded = filteredMatches.reduce((s, m) => {
      const isHome = m.home_team_id === trackedTeam.id
      return s + ((isHome ? m.away_score : m.home_score) ?? 0)
    }, 0)
    const wins = filteredMatches.filter(m => {
      const isHome = m.home_team_id === trackedTeam.id
      const scored = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0)
      const against = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0)
      return scored > against
    }).length
    return {
      played, wins, losses: played - wins, goals, conceded,
      shotEff: shots > 0 ? Math.round(goals / shots * 100) : 0,
    }
  }, [filteredMatches, matchSummaries, trackedTeam.id])

  const trendData = useMemo(() => {
    return [...filteredMatches]
      .reverse()
      .map(m => {
        const s = matchSummaries.find(r => r.match_id === m.id && r.team_id === trackedTeam.id)
        const opponent = m.home_team_id === trackedTeam.id ? m.away_team : m.home_team
        return {
          name: opponent?.short_name ?? opponent?.name?.slice(0, 6) ?? '?',
          shotEff: s?.shot_efficiency ?? 0,
          goals: s?.goals ?? 0,
        }
      })
  }, [filteredMatches, matchSummaries, trackedTeam.id])

  function toggleMatchChip(id: string) {
    setSelectedMatchIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Yfirlit' },
    { id: 'attack', label: 'Sókn' },
    { id: 'defense', label: 'Vörn' },
    { id: 'gk', label: 'Markvörður' },
    { id: 'shotmap', label: 'Skotkort' },
    { id: 'indices', label: 'Indexar' },
    { id: 'matches', label: 'Leikir' },
  ]

  // If drill-down is active, show match detail view
  if (drillMatchId) {
    const drillMatch = matches.find(m => m.id === drillMatchId)
    const opponent = drillMatch
      ? (drillMatch.home_team_id === trackedTeam.id ? drillMatch.away_team : drillMatch.home_team)
      : null
    const isHome = drillMatch?.home_team_id === trackedTeam.id
    const trackedScore = isHome ? drillMatch?.home_score : drillMatch?.away_score
    const opponentScore = isHome ? drillMatch?.away_score : drillMatch?.home_score
    const date = drillMatch?.match_date
      ? new Date(drillMatch.match_date).toLocaleDateString('is-IS', { day: 'numeric', month: 'short', year: 'numeric' })
      : ''

    return (
      <DrillDownView
        events={drillEvents}
        allPlayers={allPlayers}
        goalkeepers={goalkeepers}
        trackedTeamId={trackedTeam.id}
        myTeamName={trackedTeam.name}
        opponentName={opponent?.name}
        header={`vs ${opponent?.name ?? '?'}`}
        subHeader={`${date} · ${trackedScore ?? '?'}–${opponentScore ?? '?'}`}
        loading={loadingDrill}
        onBack={() => setDrillMatchId(null)}
        subTab={drillSubTab}
        setSubTab={setDrillSubTab}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{trackedTeam.name}</h1>
            <p className="text-slate-400 text-sm">Tímabilsyfirlit</p>
          </div>
          <button
            onClick={() => setShowEditTeam(true)}
            className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded border border-slate-600 hover:border-slate-400 transition-colors shrink-0"
          >
            Breyta lið
          </button>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowExport(true)}
            className="px-3 py-2 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-600 font-medium"
          >
            ↓ CSV
          </button>
          <button
            onClick={onNewMatch}
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-600 font-medium"
          >
            ← Heim
          </button>
        </div>
      </div>

      {showEditTeam && (
        <EditTeamModal
          team={trackedTeam}
          onSave={(updates) => editTeamMutation.mutate(updates)}
          onClose={() => setShowEditTeam(false)}
          saving={editTeamMutation.isPending}
          error={editTeamMutation.error instanceof Error ? editTeamMutation.error.message : null}
        />
      )}

      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          allEvents={allFilteredEvents}
          players={allPlayers}
          matches={filteredMatches}
          trackedTeamId={trackedTeam.id}
          trackedTeamName={trackedTeam.name}
        />
      )}

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap gap-3 items-center">
        <select
          value={seasonId}
          onChange={e => { setSeasonId(e.target.value); setCompetitionId(''); setSelectedMatchIds(new Set()) }}
          className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Öll tímabil</option>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={competitionId}
          onChange={e => { setCompetitionId(e.target.value); setSelectedMatchIds(new Set()) }}
          className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Allar keppnir</option>
          {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(seasonId || competitionId) && (
          <button
            onClick={() => { setSeasonId(''); setCompetitionId(''); setSelectedMatchIds(new Set()) }}
            className="text-sm text-blue-600 hover:underline"
          >
            Hreinsa síu
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Match chips — shown on stat tabs */}
      {(tab === 'attack' || tab === 'defense' || tab === 'gk' || tab === 'shotmap' || tab === 'indices') && filteredMatches.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto">
          <span className="text-xs text-gray-400 self-center shrink-0">Sía leiki:</span>
          {filteredMatches.map(m => {
            const isHome = m.home_team_id === trackedTeam.id
            const opponent = isHome ? m.away_team : m.home_team
            const selected = selectedMatchIds.has(m.id)
            return (
              <button
                key={m.id}
                onClick={() => toggleMatchChip(m.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                  selected
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                {opponent?.name ?? '?'}
                {' '}
                {(isHome ? m.home_score : m.away_score) ?? '?'}–{(isHome ? m.away_score : m.home_score) ?? '?'}
              </button>
            )
          })}
          {selectedMatchIds.size > 0 && (
            <button onClick={() => setSelectedMatchIds(new Set())} className="text-xs text-blue-600 hover:underline self-center shrink-0">
              Hreinsa
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="py-4">
        {tab === 'overview' && (
          <div className="max-w-5xl mx-auto px-4 space-y-6">
            <OverviewTab summary={summary} trendData={trendData} loadingMatches={loadingMatches} />
          </div>
        )}

        {(tab === 'attack' || tab === 'defense' || tab === 'gk') && (
          <StatsTab
            tab={tab}
            events={events}
            allPlayers={allPlayers}
            goalkeepers={goalkeepers}
            trackedTeamId={trackedTeam.id}
            myTeamName={trackedTeam.name}
            loading={loadingEvents || loadingPlayers}
            hasMatches={filteredMatches.length > 0}
          />
        )}

        {tab === 'shotmap' && (
          loadingEvents || loadingPlayers
            ? <div className="flex justify-center py-12"><Spinner /></div>
            : <ShotMap allEvents={events} players={allPlayers} trackedTeamId={trackedTeam.id} />
        )}

        {tab === 'indices' && (
          loadingEvents
            ? <div className="flex justify-center py-12"><Spinner /></div>
            : <div className="max-w-2xl mx-auto">
                <IndicesTab events={events} trackedTeamId={trackedTeam.id} hasMatches={filteredMatches.length > 0} />
              </div>
        )}

        {tab === 'matches' && (
          <div className="max-w-3xl mx-auto px-4">
            <MatchesTab
              matches={filteredMatches}
              trackedTeamId={trackedTeam.id}
              onDrillDown={id => { setDrillMatchId(id); setDrillSubTab('attack') }}
              onEditMatch={onEditMatch}
              onDeleteMatch={id => deleteMatchMutation.mutate(id)}
              deletingMatchId={deleteMatchMutation.isPending ? (deleteMatchMutation.variables as string) : null}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  summary,
  trendData,
  loadingMatches,
}: {
  summary: { played: number; wins: number; losses: number; goals: number; conceded: number; shotEff: number }
  trendData: { name: string; shotEff: number; goals: number }[]
  loadingMatches: boolean
}) {
  if (loadingMatches) return <div className="flex justify-center py-12"><Spinner /></div>

  if (summary.played === 0) {
    return (
      <Card className="p-8 text-center text-gray-500">
        <p className="text-lg font-medium mb-1">Engir leikir skráðir</p>
        <p className="text-sm">Kláraðu leik til að sjá tímabilstölur hér.</p>
      </Card>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Leikir" value={summary.played} />
        <SummaryCard label="Sigrar" value={summary.wins} highlight />
        <SummaryCard label="Tap" value={summary.losses} />
        <SummaryCard label="Mörk" value={summary.goals} />
        <SummaryCard label="Mörk á okkur" value={summary.conceded} />
        <SummaryCard label="Skotnýting" value={`${summary.shotEff}%`} highlight={summary.shotEff >= 50} />
      </div>

      {trendData.length >= 2 && (
        <Card className="p-4">
          <h2 className="font-semibold text-gray-800 mb-4">Skotnýting á leik</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip formatter={(v) => [`${v}%`, 'Skotnýting']} />
              <Line type="monotone" dataKey="shotEff" stroke="#2563eb" strokeWidth={2} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {trendData.length >= 2 && (
        <Card className="p-4">
          <h2 className="font-semibold text-gray-800 mb-4">Mörk á leik</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [v, 'Mörk']} />
              <Line type="monotone" dataKey="goals" stroke="#16a34a" strokeWidth={2} dot={{ r: 4, fill: '#16a34a' }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </>
  )
}

function SummaryCard({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <Card className={`p-4 text-center ${highlight ? 'bg-blue-50 border-blue-100' : ''}`}>
      <p className={`text-2xl font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </Card>
  )
}

// ─── Stats tab (attack / defense / gk) ───────────────────────────────────────

function StatsTab({
  tab, events, allPlayers, goalkeepers, trackedTeamId, myTeamName, loading, hasMatches,
}: {
  tab: 'attack' | 'defense' | 'gk'
  events: import('@/lib/db/schema').Event[]
  allPlayers: Player[]
  goalkeepers: Player[]
  trackedTeamId: string
  myTeamName?: string
  loading: boolean
  hasMatches: boolean
}) {
  const { range, setRange, filterEvents, clear } = useMinuteFilter()
  const filtered = useMemo(() => filterEvents(events), [events, range]) // eslint-disable-line react-hooks/exhaustive-deps
  const attackRows = useMemo(() => computeAttack(filtered, allPlayers, trackedTeamId), [filtered, allPlayers, trackedTeamId])
  const defenseRows = useMemo(() => computeDefense(filtered, allPlayers, trackedTeamId), [filtered, allPlayers, trackedTeamId])
  const gkRows = useMemo(() => computeGK(filtered, goalkeepers, trackedTeamId), [filtered, goalkeepers, trackedTeamId])

  if (!hasMatches) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <Card className="p-8 text-center text-gray-500">Engir leikir í þessari síu.</Card>
      </div>
    )
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="space-y-0">
      <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
      <div className="overflow-x-auto px-2 pt-3 space-y-3">
        <TeamStatsTable events={filtered} trackedTeamId={trackedTeamId} myTeamName={myTeamName} opponentTeamName="Andstæðingar" />
        {tab === 'attack' && <AttackTable rows={attackRows} />}
        {tab === 'defense' && <DefenseTable rows={defenseRows} />}
        {tab === 'gk' && <GKTable rows={gkRows} />}
      </div>
    </div>
  )
}

// ─── Indices tab ──────────────────────────────────────────────────────────────

function IndicesTab({
  events, trackedTeamId, hasMatches,
}: {
  events: import('@/lib/db/schema').Event[]
  trackedTeamId: string
  hasMatches: boolean
}) {
  const { range, setRange, filterEvents, clear } = useMinuteFilter()
  const filtered = useMemo(() => filterEvents(events), [events, range]) // eslint-disable-line react-hooks/exhaustive-deps
  const indices = useMemo(() => computeIndices(filtered, trackedTeamId), [filtered, trackedTeamId])
  const minuteFiltered = range.from !== null || range.to !== null

  if (!hasMatches) {
    return <Card className="p-8 text-center text-gray-500">Engir leikir í þessari síu.</Card>
  }

  return (
    <>
      <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
      <IndexPanel breakdown={indices} minuteFiltered={minuteFiltered} />
    </>
  )
}

// ─── Matches tab ──────────────────────────────────────────────────────────────

function MatchesTab({
  matches,
  trackedTeamId,
  onDrillDown,
  onEditMatch,
  onDeleteMatch,
  deletingMatchId,
}: {
  matches: MatchWithTeams[]
  trackedTeamId: string
  onDrillDown: (matchId: string) => void
  onEditMatch: (matchId: string) => void
  onDeleteMatch: (matchId: string) => void
  deletingMatchId: string | null
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (matches.length === 0) {
    return (
      <Card className="p-8 text-center text-gray-500">
        Engir leikir skráðir.
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-gray-100">
        {matches.map(m => {
          const isHome = m.home_team_id === trackedTeamId
          const trackedScore = isHome ? m.home_score : m.away_score
          const opponentScore = isHome ? m.away_score : m.home_score
          const opponent = isHome ? m.away_team : m.home_team
          const won = (trackedScore ?? 0) > (opponentScore ?? 0)
          const lost = (trackedScore ?? 0) < (opponentScore ?? 0)
          const date = m.match_date
            ? new Date(m.match_date).toLocaleDateString('is-IS', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Óþekkt dagsetning'
          const isDeleting = deletingMatchId === m.id
          const isConfirming = confirmDeleteId === m.id

          return (
            <div key={m.id} className="flex items-center px-4 py-3 gap-2 hover:bg-gray-50 transition-colors">
              <button
                onClick={() => onDrillDown(m.id)}
                className="flex items-center gap-3 flex-1 text-left min-w-0"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${won ? 'bg-green-500' : lost ? 'bg-red-400' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">vs {opponent?.name ?? '?'}</p>
                  <p className="text-xs text-gray-500">{date} · {isHome ? 'Heima' : 'Útleikur'}{m.competition ? ` · ${m.competition.name}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-lg font-bold tabular-nums ${won ? 'text-green-700' : lost ? 'text-red-600' : 'text-gray-700'}`}>
                    {trackedScore ?? '?'} – {opponentScore ?? '?'}
                  </p>
                  <p className={`text-xs font-medium ${won ? 'text-green-600' : lost ? 'text-red-500' : 'text-gray-400'}`}>
                    {won ? 'S' : lost ? 'T' : 'J'} · Sjá tölur →
                  </p>
                </div>
              </button>
              <button
                onClick={() => onEditMatch(m.id)}
                className="shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                Breyta
              </button>
              {isConfirming ? (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { onDeleteMatch(m.id); setConfirmDeleteId(null) }}
                    disabled={isDeleting}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {isDeleting ? '…' : 'Eyða?'}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                  >
                    Hætta við
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(m.id)}
                  className="shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors"
                >
                  Eyða
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Drill-down view (single match) ──────────────────────────────────────────

function DrillDownView({
  events, allPlayers, goalkeepers, trackedTeamId, myTeamName, opponentName,
  header, subHeader, loading, onBack, subTab, setSubTab,
}: {
  events: import('@/lib/db/schema').Event[]
  allPlayers: Player[]
  goalkeepers: Player[]
  trackedTeamId: string
  myTeamName?: string
  opponentName?: string
  header: string
  subHeader: string
  loading: boolean
  onBack: () => void
  subTab: StatsSubTab
  setSubTab: (t: StatsSubTab) => void
}) {
  const { range, setRange, filterEvents, clear } = useMinuteFilter()
  const filtered = useMemo(() => filterEvents(events), [events, range]) // eslint-disable-line react-hooks/exhaustive-deps
  const attackRows = useMemo(() => computeAttack(filtered, allPlayers, trackedTeamId), [filtered, allPlayers, trackedTeamId])
  const defenseRows = useMemo(() => computeDefense(filtered, allPlayers, trackedTeamId), [filtered, allPlayers, trackedTeamId])
  const gkRows = useMemo(() => computeGK(filtered, goalkeepers, trackedTeamId), [filtered, goalkeepers, trackedTeamId])
  const indices = useMemo(() => computeIndices(filtered, trackedTeamId), [filtered, trackedTeamId])
  const minuteFiltered = range.from !== null || range.to !== null

  const DRILL_TABS: { id: StatsSubTab; label: string }[] = [
    { id: 'attack', label: 'Sókn' },
    { id: 'defense', label: 'Vörn' },
    { id: 'gk', label: 'Markvörður' },
    { id: 'shotmap', label: 'Skotkort' },
    { id: 'indices', label: 'Indexar' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-lg">←</button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{header}</p>
          <p className="text-slate-400 text-xs">{subHeader}</p>
        </div>
      </div>
      <div className="flex border-b border-gray-200 bg-white overflow-x-auto">
        {DRILL_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap px-3 ${subTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : subTab === 'shotmap' ? (
        <ShotMap allEvents={events} players={allPlayers} trackedTeamId={trackedTeamId} />
      ) : subTab === 'indices' ? (
        <div className="max-w-2xl mx-auto">
          <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
          <div className="px-4 py-2">
            <IndexPanel breakdown={indices} minuteFiltered={minuteFiltered} />
          </div>
        </div>
      ) : (
        <div className="space-y-0">
          <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
          <div className="overflow-x-auto px-2 pt-3 space-y-3">
            <TeamStatsTable events={filtered} trackedTeamId={trackedTeamId} myTeamName={myTeamName} opponentTeamName={opponentName} />
            {subTab === 'attack' && <AttackTable rows={attackRows} />}
            {subTab === 'defense' && <DefenseTable rows={defenseRows} />}
            {subTab === 'gk' && <GKTable rows={gkRows} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Edit team modal ──────────────────────────────────────────────────────────

function EditTeamModal({
  team,
  onSave,
  onClose,
  saving,
  error,
}: {
  team: Team
  onSave: (updates: { name: string; short_name: string; home_venue: string }) => void
  onClose: () => void
  saving: boolean
  error: string | null
}) {
  const [name, setName] = useState(team.name)
  const [shortName, setShortName] = useState(team.short_name ?? '')
  const [homeVenue, setHomeVenue] = useState(team.home_venue ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Breyta liði</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nafn liðs *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skammstöfun (3–4 stafir)</label>
            <input
              value={shortName}
              onChange={e => setShortName(e.target.value)}
              maxLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Heimavöllur</label>
            <input
              value={homeVenue}
              onChange={e => setHomeVenue(e.target.value)}
              placeholder="t.d. Laugardalshöll"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Hætta við
          </button>
          <button
            onClick={() => onSave({ name, short_name: shortName, home_venue: homeVenue })}
            disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Vista…' : 'Vista'}
          </button>
        </div>
      </div>
    </div>
  )
}
