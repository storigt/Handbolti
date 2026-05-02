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
  getLineupsForMatches,
  type MatchWithTeams,
} from '@/lib/supabase/dashboardQueries'
import { getPlayersByTeam, updateTeam, updatePlayer, createPlayer, deleteMatch } from '@/lib/supabase/queries'
import { computeAttack, computeDefense, computeGK } from '@/lib/stats/matchStats'
import { AttackTable, DefenseTable, GKTable, TeamStatsTable, ViewModeToggle } from '@/components/stats/StatTables'
import { useMinuteFilter, MinuteFilterBar } from '@/components/stats/MinuteFilter'
import { ShotMap } from '@/components/stats/ShotMap'
import { ExportModal } from '@/components/stats/ExportModal'
import { computeIndices } from '@/lib/stats/indices'
import { IndexPanel } from '@/components/stats/IndexPanel'
import { Card, Spinner } from '@/components/ui'
import type { Team, Player, CourtLineup } from '@/lib/db/schema'
import { GrofTab } from './GrofTab'

type Tab = 'overview' | 'attack' | 'defense' | 'gk' | 'shotmap' | 'indices' | 'grof' | 'players' | 'matches'
type StatsSubTab = 'attack' | 'defense' | 'gk' | 'shotmap' | 'indices'
type DrillSubTab = StatsSubTab | 'players'

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
  const [drillSubTab, setDrillSubTab] = useState<DrillSubTab>('attack')

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

  // matchSummaries kept for potential future use and ExportModal compatibility
  useQuery({
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

  // Match objects for active (chip-filtered) matches
  const activeMatches = useMemo(() => {
    if (selectedMatchIds.size === 0) return filteredMatches
    return filteredMatches.filter(m => selectedMatchIds.has(m.id))
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

  const { data: lineups = [] } = useQuery({
    queryKey: ['lineups', activeMatchIds],
    queryFn: () => getLineupsForMatches(activeMatchIds),
    enabled: activeMatchIds.length > 0,
  })

  const { data: drillLineups = [] } = useQuery({
    queryKey: ['lineups', drillMatchId ? [drillMatchId] : []],
    queryFn: () => getLineupsForMatches(drillMatchId ? [drillMatchId] : []),
    enabled: !!drillMatchId,
  })

  const goalkeepers = useMemo(() => allPlayers.filter(p => p.position === 'goalkeeper'), [allPlayers])

  // Overview stats — based on chip-filtered activeMatches (score data from match rows)
  const summary = useMemo(() => {
    const played = activeMatches.length
    const conceded = activeMatches.reduce((s, m) => {
      const isHome = m.home_team_id === trackedTeam.id
      return s + ((isHome ? m.away_score : m.home_score) ?? 0)
    }, 0)
    const wins = activeMatches.filter(m => {
      const isHome = m.home_team_id === trackedTeam.id
      const scored = isHome ? (m.home_score ?? 0) : (m.away_score ?? 0)
      const against = isHome ? (m.away_score ?? 0) : (m.home_score ?? 0)
      return scored > against
    }).length
    return { played, wins, losses: played - wins, conceded }
  }, [activeMatches, trackedTeam.id])


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
    { id: 'grof', label: 'Gröf' },
    { id: 'players', label: 'Leikmenn Inná' },
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
        lineups={drillLineups}
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

      {/* Match chips — shown on stat + overview tabs */}
      {(tab === 'overview' || tab === 'attack' || tab === 'defense' || tab === 'gk' || tab === 'shotmap' || tab === 'indices' || tab === 'grof' || tab === 'players') && filteredMatches.length > 0 && (
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
            <OverviewTab
              summary={summary}
              filteredMatches={activeMatches}
              events={events}
              lineups={lineups}
              allPlayers={allPlayers}
              trackedTeamId={trackedTeam.id}
              loadingMatches={loadingMatches}
            />
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
            matchCount={activeMatchIds.length}
          />
        )}

        {tab === 'shotmap' && (
          <ShotMapTab
            events={events}
            players={allPlayers}
            trackedTeamId={trackedTeam.id}
            matchCount={activeMatchIds.length}
            loading={loadingEvents || loadingPlayers}
          />
        )}

        {tab === 'indices' && (
          loadingEvents
            ? <div className="flex justify-center py-12"><Spinner /></div>
            : <div className="max-w-2xl mx-auto">
                <IndicesTab events={events} trackedTeamId={trackedTeam.id} hasMatches={activeMatchIds.length > 0} />
              </div>
        )}

        {tab === 'grof' && (
          <GrofTab
            events={events}
            players={allPlayers}
            matches={filteredMatches}
            trackedTeamId={trackedTeam.id}
          />
        )}

        {tab === 'players' && (
          <PlayersOnTab
            allPlayers={allPlayers}
            events={events}
            lineups={lineups}
            goalkeepers={goalkeepers}
            trackedTeamId={trackedTeam.id}
            myTeamName={trackedTeam.name}
            loading={loadingEvents || loadingPlayers}
            hasMatches={filteredMatches.length > 0}
          />
        )}

        {tab === 'matches' && (
          <div className="max-w-3xl mx-auto px-4">
            <MatchesTab
              matches={filteredMatches}
              trackedTeamId={trackedTeam.id}
              onDrillDown={id => { setDrillMatchId(id); setDrillSubTab('attack' as DrillSubTab) }}
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

const INDEX_META: { key: keyof import('@/lib/stats/indices').IndexBreakdown; label: string; color: string }[] = [
  { key: 'GIQI',   label: 'GIQI',    color: '#2563eb' },
  { key: 'DQIdef', label: 'DQIdef',  color: '#dc2626' },
  { key: 'DQIoff', label: 'DQIoff',  color: '#16a34a' },
  { key: 'ELI',    label: 'ELI',     color: '#7c3aed' },
  { key: 'FI',     label: 'FI',      color: '#d97706' },
  { key: 'GKI',    label: 'GKI',     color: '#0891b2' },
]

// Index over time (per 10-min window) — GKI excluded (its segment data is less reliable without per-minute GK events)
const TIME_INDEX_META = INDEX_META.filter(m => m.key !== 'GKI') as { key: 'GIQI' | 'DQIdef' | 'DQIoff' | 'ELI' | 'FI'; label: string; color: string }[]

const MINUTE_WINDOWS = [
  { label: '0–10', from: 0, to: 10 },
  { label: '10–20', from: 10, to: 20 },
  { label: '20–30', from: 20, to: 30 },
  { label: '30–40', from: 30, to: 40 },
  { label: '40–50', from: 40, to: 50 },
  { label: '50–60', from: 50, to: 60 },
]

function OverviewTab({
  summary,
  filteredMatches,
  events,
  lineups,
  allPlayers,
  trackedTeamId,
  loadingMatches,
}: {
  summary: { played: number; wins: number; losses: number; conceded: number }
  filteredMatches: MatchWithTeams[]
  events: import('@/lib/db/schema').Event[]
  lineups: CourtLineup[]
  allPlayers: Player[]
  trackedTeamId: string
  loadingMatches: boolean
}) {
  // Goals and shot efficiency computed from events (reliable, includes wide/post shots)
  const { ourGoals, shotEff } = useMemo(() => {
    const ourShots = events.filter(e => e.event_type === 'SHOT' && e.team_id === trackedTeamId)
    const ourGoals = ourShots.filter(e => e.sub_type === 'goal').length
    return {
      ourGoals,
      shotEff: ourShots.length > 0 ? Math.round(ourGoals / ourShots.length * 100) : 0,
    }
  }, [events, trackedTeamId])

  // Per-match index trend (chronological)
  const indexTrend = useMemo(() => {
    return [...filteredMatches].reverse().map(m => {
      const matchEvents = events.filter(e => e.match_id === m.id)
      const idx = computeIndices(matchEvents, trackedTeamId)
      const opponent = m.home_team_id === trackedTeamId ? m.away_team : m.home_team
      return {
        name: opponent?.short_name ?? opponent?.name?.slice(0, 6) ?? '?',
        GIQI: Math.round(idx.GIQI),
        DQIdef: Math.round(idx.DQIdef),
        DQIoff: Math.round(idx.DQIoff),
        ELI: Math.round(idx.ELI),
        FI: Math.round(idx.FI),
        GKI: Math.round(idx.GKI),
      }
    })
  }, [filteredMatches, events, trackedTeamId])

  // Top player per index (based on lineup-filtered events)
  const topPlayers = useMemo(() => {
    if (lineups.length === 0 || allPlayers.length === 0 || events.length === 0) return null
    const playerResults = allPlayers.flatMap(player => {
      const validLineupIds = new Set(
        lineups.filter(l => l.player_ids.includes(player.id)).map(l => l.id)
      )
      const pe = events.filter(e => e.lineup_id != null && validLineupIds.has(e.lineup_id as string))
      if (pe.length < 5) return []   // skip players with too few data points
      const idx = computeIndices(pe, trackedTeamId)
      return [{ player, idx }]
    })
    if (playerResults.length === 0) return null
    return INDEX_META.map(({ key, label, color }) => {
      const best = playerResults.reduce((a, b) => (idx_val(b.idx, key) > idx_val(a.idx, key) ? b : a))
      return { key, label, color, player: best.player, value: Math.round(idx_val(best.idx, key)) }
    })
  }, [lineups, allPlayers, events, trackedTeamId])

  if (loadingMatches) return <div className="flex justify-center py-12"><Spinner /></div>

  if (summary.played === 0) {
    return (
      <Card className="p-8 text-center text-gray-500">
        <p className="text-lg font-medium mb-1">Engir leikir skráðir</p>
        <p className="text-sm">Kláraðu leik til að sjá tímabilstölur hér.</p>
      </Card>
    )
  }

  const goalsPerGame = summary.played > 0 ? (ourGoals / summary.played).toFixed(1) : '—'
  const concededPerGame = summary.played > 0 ? (summary.conceded / summary.played).toFixed(1) : '—'

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Leikir" value={summary.played} />
        <SummaryCard label="Sigrar" value={summary.wins} highlight />
        <SummaryCard label="Tap" value={summary.losses} />
        <SummaryCard label="Mörk á leik" value={goalsPerGame} highlight />
        <SummaryCard label="Mörk á okkur á leik" value={concededPerGame} />
        <SummaryCard label="Meðalskotnýting" value={`${shotEff}%`} highlight={shotEff >= 50} />
      </div>

      {/* Index trend charts */}
      {indexTrend.length >= 2 && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">Indexar yfir tíma</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {INDEX_META.map(({ key, label, color }) => (
              <Card key={key} className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{label}</h3>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={indexTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip formatter={(v) => [`${v}`, label]} />
                    <Line
                      type="monotone"
                      dataKey={key as string}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 3, fill: color }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Top player per index */}
      {topPlayers && (
        <div>
          <h2 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">Besti leikmaður á velli — per index</h2>
          <Card className="overflow-hidden">
            <div className="divide-y divide-gray-100">
              {topPlayers.map(({ label, color, player, value }) => (
                <div key={label} className="flex items-center px-4 py-3 gap-3">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded text-white shrink-0 w-16 text-center"
                    style={{ backgroundColor: color }}
                  >
                    {label}
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-800">
                    {player.first_name} {player.last_name}
                  </span>
                  <span className="text-sm font-bold text-gray-600 tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

function idx_val(idx: import('@/lib/stats/indices').IndexBreakdown, key: keyof import('@/lib/stats/indices').IndexBreakdown): number {
  return idx[key] as number
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
  tab, events, allPlayers, goalkeepers, trackedTeamId, myTeamName, loading, hasMatches, matchCount,
}: {
  tab: 'attack' | 'defense' | 'gk'
  events: import('@/lib/db/schema').Event[]
  allPlayers: Player[]
  goalkeepers: Player[]
  trackedTeamId: string
  myTeamName?: string
  loading: boolean
  hasMatches: boolean
  matchCount: number
}) {
  const [viewMode, setViewMode] = useState<'total' | 'average'>('total')
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
      <div className="flex items-center justify-end px-4 py-2 bg-white border-b border-gray-100">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </div>
      <div className="overflow-x-auto px-2 pt-3 space-y-3">
        <TeamStatsTable events={filtered} trackedTeamId={trackedTeamId} myTeamName={myTeamName} opponentTeamName="Andstæðingar" />
        {tab === 'attack' && <AttackTable rows={attackRows} matchCount={matchCount} viewMode={viewMode} />}
        {tab === 'defense' && <DefenseTable rows={defenseRows} matchCount={matchCount} viewMode={viewMode} />}
        {tab === 'gk' && <GKTable rows={gkRows} matchCount={matchCount} viewMode={viewMode} />}
      </div>
    </div>
  )
}

// ─── Shot map tab ─────────────────────────────────────────────────────────────

function ShotMapTab({
  events, players, trackedTeamId, matchCount, loading,
}: {
  events: import('@/lib/db/schema').Event[]
  players: Player[]
  trackedTeamId: string
  matchCount: number
  loading: boolean
}) {
  const [viewMode, setViewMode] = useState<'total' | 'average'>('total')
  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>
  return (
    <div>
      <div className="flex items-center justify-end px-4 py-2 bg-white border-b border-gray-100">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </div>
      <ShotMap allEvents={events} players={players} trackedTeamId={trackedTeamId} viewMode={viewMode} matchCount={matchCount} />
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

  // Per-10-minute trend — always uses raw events (not minute-filtered), ignores events without match_minute
  const minuteTrend = useMemo(() => {
    return MINUTE_WINDOWS.map(({ label, from, to }) => {
      const windowEvents = events.filter(e => {
        const m = e.match_minute
        return m != null && m >= from && m < to
      })
      if (windowEvents.length === 0) {
        return { label, GIQI: null, DQIdef: null, DQIoff: null, ELI: null, FI: null }
      }
      const idx = computeIndices(windowEvents, trackedTeamId)
      return {
        label,
        GIQI: Math.round(idx.GIQI),
        DQIdef: Math.round(idx.DQIdef),
        DQIoff: Math.round(idx.DQIoff),
        ELI: Math.round(idx.ELI),
        FI: Math.round(idx.FI),
      }
    })
  }, [events, trackedTeamId])

  const hasMinuteTrend = minuteTrend.some(d =>
    TIME_INDEX_META.some(m => d[m.key] !== null)
  )

  if (!hasMatches) {
    return <Card className="p-8 text-center text-gray-500">Engir leikir í þessari síu.</Card>
  }

  return (
    <>
      <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
      <IndexPanel breakdown={indices} minuteFiltered={minuteFiltered} />

      {hasMinuteTrend && (
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Indexar eftir leiktíma</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TIME_INDEX_META.map(({ key, label, color }) => (
              <Card key={key} className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{label} — per 10 mín</h3>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={minuteTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip formatter={(v) => [`${v}`, label]} />
                    <Line
                      type="monotone"
                      dataKey={key}
                      stroke={color}
                      strokeWidth={2}
                      dot={{ r: 3, fill: color }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            ))}
          </div>
        </div>
      )}
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
  events, lineups, allPlayers, goalkeepers, trackedTeamId, myTeamName, opponentName,
  header, subHeader, loading, onBack, subTab, setSubTab,
}: {
  events: import('@/lib/db/schema').Event[]
  lineups: CourtLineup[]
  allPlayers: Player[]
  goalkeepers: Player[]
  trackedTeamId: string
  myTeamName?: string
  opponentName?: string
  header: string
  subHeader: string
  loading: boolean
  onBack: () => void
  subTab: DrillSubTab
  setSubTab: (t: DrillSubTab) => void
}) {
  const { range, setRange, filterEvents, clear } = useMinuteFilter()
  const filtered = useMemo(() => filterEvents(events), [events, range]) // eslint-disable-line react-hooks/exhaustive-deps
  const attackRows = useMemo(() => computeAttack(filtered, allPlayers, trackedTeamId), [filtered, allPlayers, trackedTeamId])
  const defenseRows = useMemo(() => computeDefense(filtered, allPlayers, trackedTeamId), [filtered, allPlayers, trackedTeamId])
  const gkRows = useMemo(() => computeGK(filtered, goalkeepers, trackedTeamId), [filtered, goalkeepers, trackedTeamId])
  const indices = useMemo(() => computeIndices(filtered, trackedTeamId), [filtered, trackedTeamId])
  const minuteFiltered = range.from !== null || range.to !== null

  const DRILL_TABS: { id: DrillSubTab; label: string }[] = [
    { id: 'attack', label: 'Sókn' },
    { id: 'defense', label: 'Vörn' },
    { id: 'gk', label: 'Markvörður' },
    { id: 'shotmap', label: 'Skotkort' },
    { id: 'indices', label: 'Indexar' },
    { id: 'players', label: 'Leikmenn Inná' },
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
      ) : subTab === 'players' ? (
        <PlayersOnTab
          allPlayers={allPlayers}
          events={events}
          lineups={lineups}
          goalkeepers={goalkeepers}
          trackedTeamId={trackedTeamId}
          myTeamName={myTeamName}
          loading={false}
          hasMatches={events.length > 0}
        />
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

// ─── Players On-Court tab ─────────────────────────────────────────────────────

function PlayersOnTab({
  allPlayers, events, lineups, goalkeepers, trackedTeamId, myTeamName, loading, hasMatches,
}: {
  allPlayers: Player[]
  events: import('@/lib/db/schema').Event[]
  lineups: CourtLineup[]
  goalkeepers: Player[]
  trackedTeamId: string
  myTeamName?: string
  loading: boolean
  hasMatches: boolean
}) {
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [subTab, setSubTab] = useState<StatsSubTab>('attack')
  const [viewMode, setViewMode] = useState<'total' | 'average'>('total')
  const { range, setRange, filterEvents, clear } = useMinuteFilter()

  function togglePlayer(id: string) {
    setSelectedPlayerIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  // Events whose lineup contained ALL selected players
  const playerFilteredEvents = useMemo(() => {
    if (selectedPlayerIds.length === 0) return []
    const validLineupIds = new Set(
      lineups
        .filter(l => selectedPlayerIds.every(pid => l.player_ids.includes(pid)))
        .map(l => l.id)
    )
    return events.filter(e => e.lineup_id != null && validLineupIds.has(e.lineup_id as string))
  }, [events, lineups, selectedPlayerIds])

  const filtered = useMemo(() => filterEvents(playerFilteredEvents), [playerFilteredEvents, range]) // eslint-disable-line react-hooks/exhaustive-deps
  const attackRows = useMemo(() => computeAttack(filtered, allPlayers, trackedTeamId), [filtered, allPlayers, trackedTeamId])
  const defenseRows = useMemo(() => computeDefense(filtered, allPlayers, trackedTeamId), [filtered, allPlayers, trackedTeamId])
  const gkRows = useMemo(() => computeGK(filtered, goalkeepers, trackedTeamId), [filtered, goalkeepers, trackedTeamId])
  const indices = useMemo(() => computeIndices(filtered, trackedTeamId), [filtered, trackedTeamId])
  const minuteFiltered = range.from !== null || range.to !== null
  const playerMatchCount = useMemo(
    () => new Set(playerFilteredEvents.map(e => e.match_id)).size || 1,
    [playerFilteredEvents],
  )

  const SUB_TABS: { id: StatsSubTab; label: string }[] = [
    { id: 'attack', label: 'Sókn' },
    { id: 'defense', label: 'Vörn' },
    { id: 'gk', label: 'Markvörður' },
    { id: 'shotmap', label: 'Skotkort' },
    { id: 'indices', label: 'Indexar' },
  ]

  const gks = allPlayers.filter(p => p.position === 'goalkeeper')
  const fields = allPlayers.filter(p => p.position === 'field')

  if (!hasMatches) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <Card className="p-8 text-center text-gray-500">Engir leikir í þessari síu.</Card>
      </div>
    )
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      {/* Player picker */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-700">Veldu leikmenn:</p>
          {selectedPlayerIds.length > 0 && (
            <button
              onClick={() => setSelectedPlayerIds([])}
              className="text-xs text-blue-600 hover:underline"
            >
              Hreinsa val
            </button>
          )}
        </div>
        <div className="space-y-2">
          {gks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {gks.map(p => {
                const selected = selectedPlayerIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium border transition-colors ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded font-semibold">GK</span>
                    {p.jersey_number != null ? `#${p.jersey_number} ` : ''}{p.last_name}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {fields.map(p => {
              const selected = selectedPlayerIds.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlayer(p.id)}
                  className={`px-2.5 py-1 rounded-full text-sm font-medium border transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {p.jersey_number != null ? `#${p.jersey_number} ` : ''}{p.last_name}
                </button>
              )
            })}
          </div>
        </div>
      </Card>

      {/* No players selected */}
      {selectedPlayerIds.length === 0 && (
        <Card className="p-8 text-center text-gray-400">
          <p className="font-medium mb-1">Enginn leikmaður valinn</p>
          <p className="text-sm">Veldu leikmann til að sjá tölfræði þegar hann er á velli.</p>
        </Card>
      )}

      {/* Players selected but no matching events */}
      {selectedPlayerIds.length > 0 && playerFilteredEvents.length === 0 && (
        <Card className="p-8 text-center text-gray-400">
          <p className="font-medium mb-1">Engar tölur fundust</p>
          <p className="text-sm">Engar skráðar aðgerðir þegar þessir leikmenn eru allir á velli samtímis.</p>
        </Card>
      )}

      {/* Stats */}
      {selectedPlayerIds.length > 0 && playerFilteredEvents.length > 0 && (
        <>
          <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-x-auto -mx-0">
            {SUB_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id)}
                className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap px-3 ${
                  subTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {subTab === 'shotmap' ? (
            <div>
              <div className="flex items-center justify-end px-4 py-2 bg-white border-b border-gray-100">
                <ViewModeToggle mode={viewMode} onChange={setViewMode} />
              </div>
              <ShotMap allEvents={playerFilteredEvents} players={allPlayers} trackedTeamId={trackedTeamId} viewMode={viewMode} matchCount={playerMatchCount} />
            </div>
          ) : subTab === 'indices' ? (
            <>
              <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
              <IndexPanel breakdown={indices} minuteFiltered={minuteFiltered} />
            </>
          ) : (
            <>
              <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
              <div className="flex items-center justify-end px-4 py-2 bg-white border-b border-gray-100">
                <ViewModeToggle mode={viewMode} onChange={setViewMode} />
              </div>
              <div className="overflow-x-auto space-y-3">
                <TeamStatsTable events={filtered} trackedTeamId={trackedTeamId} myTeamName={myTeamName} opponentTeamName="Andstæðingar" />
                {subTab === 'attack' && <AttackTable rows={attackRows} matchCount={playerMatchCount} viewMode={viewMode} />}
                {subTab === 'defense' && <DefenseTable rows={defenseRows} matchCount={playerMatchCount} viewMode={viewMode} />}
                {subTab === 'gk' && <GKTable rows={gkRows} matchCount={playerMatchCount} viewMode={viewMode} />}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── Edit team modal ──────────────────────────────────────────────────────────

interface DraftPlayer {
  id: string | null  // null = new player
  first_name: string
  last_name: string
  jersey_number: string
  position: Player['position']
  is_active: boolean
}

function emptyDraft(): DraftPlayer {
  return { id: null, first_name: '', last_name: '', jersey_number: '', position: 'field', is_active: true }
}

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
  const queryClient = useQueryClient()
  const [name, setName] = useState(team.name)
  const [shortName, setShortName] = useState(team.short_name ?? '')
  const [homeVenue, setHomeVenue] = useState(team.home_venue ?? '')
  const [players, setPlayers] = useState<DraftPlayer[]>([])
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [savingPlayers, setSavingPlayers] = useState(false)

  const { data: loadedPlayers = [] } = useQuery({
    queryKey: ['players-all', team.id],
    queryFn: async () => {
      const { data, error } = await (await import('@/lib/supabase/client')).supabase
        .from('players').select('*').eq('team_id', team.id).order('jersey_number')
      if (error) throw error
      return data as Player[]
    },
  })

  // Initialise draft from loaded players (once)
  const [initialised, setInitialised] = useState(false)
  if (!initialised && loadedPlayers.length > 0) {
    setPlayers(loadedPlayers.map(p => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      jersey_number: p.jersey_number?.toString() ?? '',
      position: p.position,
      is_active: p.is_active,
    })))
    setInitialised(true)
  }

  function updateDraft(idx: number, field: keyof DraftPlayer, value: string | boolean) {
    setPlayers(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  function addRow() {
    setPlayers(prev => [...prev, emptyDraft()])
  }

  async function savePlayers() {
    setSavingPlayers(true)
    setPlayerError(null)
    try {
      for (const p of players) {
        const payload = {
          first_name: p.first_name.trim(),
          last_name: p.last_name.trim(),
          jersey_number: p.jersey_number ? parseInt(p.jersey_number) : null,
          position: p.position,
          is_active: p.is_active,
        }
        if (p.id) {
          await updatePlayer(p.id, payload)
        } else if (p.first_name.trim() || p.last_name.trim()) {
          await createPlayer({ ...payload, team_id: team.id })
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['players', team.id] })
      await queryClient.invalidateQueries({ queryKey: ['players-all', team.id] })
    } catch (e) {
      setPlayerError(e instanceof Error ? e.message : 'Villa við að vista leikmenn')
    } finally {
      setSavingPlayers(false)
    }
  }

  const inputCls = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Breyta liði</h2>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
          {/* Team details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Liðsupplýsingar</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Nafn liðs *</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Skammstöfun</label>
                <input value={shortName} onChange={e => setShortName(e.target.value)} maxLength={6} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Heimavöllur</label>
                <input value={homeVenue} onChange={e => setHomeVenue(e.target.value)} placeholder="t.d. Laugardalshöll" className={inputCls} />
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              onClick={() => onSave({ name, short_name: shortName, home_venue: homeVenue })}
              disabled={!name.trim() || saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Vista…' : 'Vista liðsupplýsingar'}
            </button>
          </div>

          {/* Players */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Leikmenn</h3>

            {/* Header row */}
            <div className="grid grid-cols-[52px_1fr_1fr_64px_40px] gap-2 text-xs font-medium text-gray-400 px-1">
              <span>#</span><span>Fornafn</span><span>Eftirnafn</span><span>Staða</span><span />
            </div>

            {players.map((p, i) => (
              <div
                key={p.id ?? `new-${i}`}
                className={`grid grid-cols-[52px_1fr_1fr_64px_40px] gap-2 items-center ${!p.is_active ? 'opacity-40' : ''}`}
              >
                <input
                  type="number"
                  value={p.jersey_number}
                  onChange={e => updateDraft(i, 'jersey_number', e.target.value)}
                  placeholder="#"
                  min={1} max={99}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  value={p.first_name}
                  onChange={e => updateDraft(i, 'first_name', e.target.value)}
                  placeholder="Fornafn"
                  className={inputCls}
                />
                <input
                  value={p.last_name}
                  onChange={e => updateDraft(i, 'last_name', e.target.value)}
                  placeholder="Eftirnafn"
                  className={inputCls}
                />
                <select
                  value={p.position}
                  onChange={e => updateDraft(i, 'position', e.target.value)}
                  className="px-1 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="field">Útl.</option>
                  <option value="goalkeeper">MV</option>
                </select>
                <button
                  onClick={() => p.id
                    ? updateDraft(i, 'is_active', !p.is_active)
                    : setPlayers(prev => prev.filter((_, idx) => idx !== i))
                  }
                  className="text-gray-300 hover:text-red-400 text-lg leading-none transition-colors"
                  title={p.is_active ? 'Gera óvirkan' : 'Gera virkan'}
                >
                  {p.id ? (p.is_active ? '×' : '↺') : '×'}
                </button>
              </div>
            ))}

            <button
              onClick={addRow}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              + Bæta við leikmann
            </button>

            {playerError && <p className="text-xs text-red-600">{playerError}</p>}
            <button
              onClick={savePlayers}
              disabled={savingPlayers}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              {savingPlayers ? 'Vista…' : 'Vista leikmenn'}
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Loka
          </button>
        </div>
      </div>
    </div>
  )
}
