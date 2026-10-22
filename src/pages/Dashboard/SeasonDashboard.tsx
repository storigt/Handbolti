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
import { getPlayersByTeam, getMyTeams, updateTeam, updatePlayer, createPlayer, deleteMatch, setTrackedTeamId, updateProfileTeam } from '@/lib/supabase/queries'
import { computeAttack, computeDefense, computeGK, computeOriginDirectionBreakdown } from '@/lib/stats/matchStats'
import { AttackTable, DefenseTable, GKTable, TeamStatsTable, ViewModeToggle } from '@/components/stats/StatTables'
import { OriginDirectionTable } from '@/components/stats/OriginDirectionTable'
import { useMinuteFilter, MinuteFilterBar } from '@/components/stats/MinuteFilter'
import { ShotMap } from '@/components/stats/ShotMap'
import { ExportModal } from '@/components/stats/ExportModal'
import { computeIndices } from '@/lib/stats/indices'
import { IndexPanel } from '@/components/stats/IndexPanel'
import { evaluateIndices, type IndexDef } from '@/lib/stats/indexDefs'
import { useIndexStore } from '@/store/indexStore'
import { AppBar, Button, Card, EmptyLine, Input, Label, Select, Spinner, Tabs } from '@/components/ui'
import { useLang, useT } from '@/lib/i18n/lang'
import { T } from '@/lib/i18n/terms'
import { ManageTeamsList } from '@/components/team/ManageTeamsList'
import type { Team, Player, CourtLineup } from '@/lib/db/schema'
import { GrofTab } from './GrofTab'
import { InsightsTab } from './InsightsTab'

type Tab = 'overview' | 'attack' | 'defense' | 'gk' | 'shotmap' | 'indices' | 'grof' | 'insights' | 'players' | 'matches'
type StatsSubTab = 'attack' | 'defense' | 'gk' | 'shotmap' | 'indices'
type DrillSubTab = StatsSubTab | 'players'

interface Props {
  trackedTeam: Team
  onNewMatch: () => void
  onEditMatch: (matchId: string) => void
  onMainTeamChanged: (teamId: string) => void
}

export function SeasonDashboard({ trackedTeam: mainTeam, onNewMatch, onEditMatch, onMainTeamChanged }: Props) {
  const t = useT()
  const lang = useLang(st => st.lang)
  const locale = lang === 'is' ? 'is-IS' : 'en-GB'
  const queryClient = useQueryClient()

  const { data: myTeams = [] } = useQuery({
    queryKey: ['my-teams'],
    queryFn: getMyTeams,
  })
  const [focusTeamId, setFocusTeamId] = useState(mainTeam.id)
  const trackedTeam = myTeams.find(tm => tm.id === focusTeamId) ?? mainTeam

  const [tab, setTab] = useState<Tab>('overview')
  const [seasonId, setSeasonId] = useState<string>('')
  const [competitionId, setCompetitionId] = useState<string>('')
  // multi-match chip filter (empty = all)
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set())
  const [showExport, setShowExport] = useState(false)
  const [showEditTeam, setShowEditTeam] = useState(false)
  const [showManageTeams, setShowManageTeams] = useState(false)
  // drill-down into a single match from Leikir tab
  const [drillMatchId, setDrillMatchId] = useState<string | null>(null)
  const [drillSubTab, setDrillSubTab] = useState<DrillSubTab>('attack')

  function handleFocusTeamChange(teamId: string) {
    setFocusTeamId(teamId)
    setSeasonId('')
    setCompetitionId('')
    setSelectedMatchIds(new Set())
    setDrillMatchId(null)
  }

  function handleSetAsMainTeam() {
    setTrackedTeamId(trackedTeam.id)
    void updateProfileTeam(trackedTeam.id)
    onMainTeamChanged(trackedTeam.id)
  }

  const editTeamMutation = useMutation({
    mutationFn: (updates: { name: string; short_name: string; home_venue: string }) =>
      updateTeam(trackedTeam.id, {
        name: updates.name.trim(),
        short_name: updates.short_name.trim() || null,
        home_venue: updates.home_venue.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teams'] })
      void queryClient.invalidateQueries({ queryKey: ['my-teams'] })
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
      alert(`${t({ en: 'Could not delete the match', is: 'Tókst ekki að eyða leik' })}: ${err instanceof Error ? err.message : t({ en: 'Unknown error', is: 'Óþekkt villa' })}`)
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
    { id: 'overview', label: t(T.overview) },
    { id: 'attack', label: t(T.attack) },
    { id: 'defense', label: t(T.defence) },
    { id: 'gk', label: t(T.goalkeeper) },
    { id: 'shotmap', label: t(T.shotMap) },
    { id: 'indices', label: t(T.indices) },
    { id: 'grof', label: t(T.charts) },
    { id: 'insights', label: t({ en: 'Insight', is: 'Innsýn' }) },
    { id: 'players', label: t({ en: 'Lineups', is: 'Leikmenn inná' }) },
    { id: 'matches', label: t(T.matches) },
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
      ? new Date(drillMatch.match_date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
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
        header={`${t({ en: 'vs', is: 'gegn' })} ${opponent?.name ?? '?'}`}
        subHeader={`${date} · ${trackedScore ?? '?'}–${opponentScore ?? '?'}`}
        loading={loadingDrill}
        onBack={() => setDrillMatchId(null)}
        subTab={drillSubTab}
        setSubTab={setDrillSubTab}
      />
    )
  }

  const filtersActive = !!(seasonId || competitionId)
  const showChips = tab !== 'matches' && filteredMatches.length > 0

  return (
    <div className="min-h-svh bg-ground text-ink">
      <AppBar title={trackedTeam.name} onBack={onNewMatch} backLabel={t({ en: 'Home', is: 'Heim' })} width="max-w-[1280px]" />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8 flex flex-col gap-4">
        {/* Title row: the team, its actions */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {myTeams.length > 1 ? (
              <h1 className="inline-block align-middle mr-2">
              <label>
                <span className="sr-only">{t(T.team)}</span>
                <select
                  value={focusTeamId}
                  onChange={e => handleFocusTeamChange(e.target.value)}
                  className="text-[24px] font-semibold bg-transparent border-0 -ml-1 pl-1 pr-8 max-w-full truncate rounded-md hover:bg-[#e8eaee] focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                >
                  {myTeams.map(team => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              </h1>
            ) : (
              <h1 className="text-[24px] font-semibold leading-tight truncate">{trackedTeam.name}</h1>
            )}
            {trackedTeam.id === mainTeam.id && myTeams.length > 1 && (
              <span className="inline-block align-middle text-[12px] font-medium px-2 py-0.5 rounded bg-white border border-line">{t({ en: 'Main team', is: 'Aðallið' })}</span>
            )}
            <p className="text-[15px] text-muted mt-1 num">
              {t({ en: 'Season dashboard', is: 'Tölur tímabilsins' })} · {activeMatches.length} {activeMatches.length === 1 ? t({ en: 'match', is: 'leikur' }) : t({ en: 'matches', is: 'leikir' })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {trackedTeam.id !== mainTeam.id && (
              <Button variant="ghost" onClick={handleSetAsMainTeam}>{t({ en: 'Make main team', is: 'Gera að aðalliði' })}</Button>
            )}
            <Button variant="secondary" onClick={() => setShowEditTeam(true)}>{t({ en: 'Edit team', is: 'Breyta liði' })}</Button>
            <Button variant="secondary" onClick={() => setShowManageTeams(true)}>{t({ en: 'Manage teams', is: 'Stjórna liðum' })}</Button>
            <Button variant="primary" onClick={() => setShowExport(true)}>{t({ en: 'Export CSV', is: 'Sækja CSV' })}</Button>
          </div>
        </div>

        {/* Scope: season and competition */}
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={seasonId} aria-label={t(T.season)} className="!w-auto !h-9 !text-[14px]"
            onChange={e => { setSeasonId(e.target.value); setCompetitionId(''); setSelectedMatchIds(new Set()) }}>
            <option value="">{t(T.allSeasons)}</option>
            {seasons.map(se => <option key={se.id} value={se.id}>{se.name}</option>)}
          </Select>
          <Select value={competitionId} aria-label={t(T.competition)} className="!w-auto !h-9 !text-[14px]"
            onChange={e => { setCompetitionId(e.target.value); setSelectedMatchIds(new Set()) }}>
            <option value="">{t(T.allCompetitions)}</option>
            {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {filtersActive && (
            <button type="button" onClick={() => { setSeasonId(''); setCompetitionId(''); setSelectedMatchIds(new Set()) }}
              className="text-[14px] text-muted hover:text-ink underline underline-offset-4">
              {t({ en: 'Clear filters', is: 'Hreinsa síu' })}
            </button>
          )}
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

      {showManageTeams && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="manage-h">
          <div className="bg-ground rounded-xl shadow-[0_24px_48px_rgba(0,0,0,0.22)] w-full max-w-lg max-h-[90vh] flex flex-col overscroll-contain">
            <div className="px-6 pt-5 pb-4 border-b border-line flex items-start justify-between gap-3 bg-white rounded-t-xl">
              <div>
                <h2 id="manage-h" className="text-[18px] font-semibold">{t({ en: 'Manage teams', is: 'Stjórna liðum' })}</h2>
                <p className="text-[14px] text-muted mt-1">
                  {t({
                    en: 'Rename, hide or add a team. A team with match history is hidden rather than deleted, so its data is kept. Your main team cannot be hidden.',
                    is: 'Endurnefndu, feldu eða bættu við liði. Lið með leikjasögu er falið en ekki eytt, svo gögnin haldast. Aðalliðið er ekki hægt að fela.',
                  })}
                </p>
              </div>
              <button type="button" onClick={() => setShowManageTeams(false)} aria-label={t(T.close)}
                className="w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-[#f5f6f8] flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5">
              <ManageTeamsList mainTeamId={mainTeam.id} />
            </div>
          </div>
        </div>
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

      {/* Tabs and the match filter */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 mt-4">
        <Tabs<Tab> value={tab} onChange={setTab} options={TABS.map(x => ({ v: x.id, label: x.label }))} label={t({ en: 'Dashboard sections', is: 'Hlutar' })} />
        {showChips && (
          <div className="flex items-center gap-2 py-3 overflow-x-auto sm:flex-wrap sm:overflow-visible [scrollbar-width:thin]">
            <span className="text-[13px] text-muted shrink-0">{t({ en: 'Matches', is: 'Leikir' })}</span>
            {filteredMatches.map(m => {
              const isHome = m.home_team_id === trackedTeam.id
              const opponent = isHome ? m.away_team : m.home_team
              const selected = selectedMatchIds.has(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleMatchChip(m.id)}
                  className={`h-8 px-2.5 rounded-md text-[13px] whitespace-nowrap border transition-colors ${
                    selected ? 'bg-[#111214] text-white border-[#111214]' : 'bg-white text-ink border-line hover:border-[#9aa0a8]'
                  }`}
                >
                  {opponent?.name ?? '?'} <span className={`num ${selected ? 'text-white/75' : 'text-muted'}`}>{(isHome ? m.home_score : m.away_score) ?? '?'}–{(isHome ? m.away_score : m.home_score) ?? '?'}</span>
                </button>
              )
            })}
            {selectedMatchIds.size > 0 && (
              <button type="button" onClick={() => setSelectedMatchIds(new Set())} className="text-[13px] text-muted hover:text-ink underline underline-offset-4 shrink-0">
                {t({ en: 'Show all', is: 'Sýna alla' })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4 pb-16">
        {tab === 'overview' && (
          <OverviewTab
            summary={summary}
            filteredMatches={activeMatches}
            events={events}
            lineups={lineups}
            allPlayers={allPlayers}
            trackedTeamId={trackedTeam.id}
            loadingMatches={loadingMatches}
          />
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
            : <div className="max-w-3xl">
                <IndicesTab events={events} trackedTeamId={trackedTeam.id} hasMatches={activeMatchIds.length > 0} />
              </div>
        )}

        {tab === 'grof' && (
          <GrofTab
            events={events}
            players={allPlayers}
            matches={activeMatches}
            trackedTeamId={trackedTeam.id}
          />
        )}

        {tab === 'insights' && (
          <InsightsTab
            events={events}
            players={allPlayers}
            lineups={lineups}
            matches={activeMatches}
            trackedTeamId={trackedTeam.id}
            loading={loadingEvents || loadingPlayers}
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
          <div className="max-w-3xl">
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

const INDEX_COLOR = '#1f2de6'

/** Index values (by key) for a set of events, under the user's index definitions. */
function indexValues(defs: IndexDef[], events: import('@/lib/db/schema').Event[], trackedTeamId: string) {
  return evaluateIndices(defs, computeIndices(events, trackedTeamId).raw)
}

/** Visible indices, and those of them that make sense per 10 minutes (not whole-match keeper segments). */
function useVisibleIndices(events: import('@/lib/db/schema').Event[], trackedTeamId: string) {
  const defs = useIndexStore(s => s.defs)
  return useMemo(() => {
    const visible = defs.filter(d => !d.hidden)
    const ev = indexValues(defs, events, trackedTeamId)
    return { defs, visible, perTime: visible.filter(d => !ev.byId[d.id]?.usesSegments) }
  }, [defs, events, trackedTeamId])
}

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
  const t = useT()
  // Goals and shot efficiency computed from events (reliable, includes wide/post shots)
  const { ourGoals, shotEff } = useMemo(() => {
    const ourShots = events.filter(e => e.event_type === 'SHOT' && e.team_id === trackedTeamId)
    const ourGoals = ourShots.filter(e => e.sub_type === 'goal').length
    return {
      ourGoals,
      shotEff: ourShots.length > 0 ? Math.round(ourGoals / ourShots.length * 100) : 0,
    }
  }, [events, trackedTeamId])

  const { defs, visible } = useVisibleIndices(events, trackedTeamId)

  // Per-match index trend (chronological)
  const indexTrend = useMemo(() => {
    return [...filteredMatches].reverse().map(m => {
      const matchEvents = events.filter(e => e.match_id === m.id)
      const { values } = indexValues(defs, matchEvents, trackedTeamId)
      const opponent = m.home_team_id === trackedTeamId ? m.away_team : m.home_team
      const row: Record<string, string | number> = { name: opponent?.short_name ?? opponent?.name?.slice(0, 6) ?? '?' }
      for (const d of visible) row[d.key] = Math.round(values[d.key] ?? 0)
      return row
    })
  }, [filteredMatches, events, trackedTeamId, defs, visible])

  // Top player per index (based on lineup-filtered events)
  const topPlayers = useMemo(() => {
    if (lineups.length === 0 || allPlayers.length === 0 || events.length === 0) return null
    const playerResults = allPlayers.flatMap(player => {
      const validLineupIds = new Set(
        lineups.filter(l => l.player_ids.includes(player.id)).map(l => l.id)
      )
      const pe = events.filter(e => e.lineup_id != null && validLineupIds.has(e.lineup_id as string))
      if (pe.length < 5) return []   // skip players with too few data points
      return [{ player, ev: indexValues(defs, pe, trackedTeamId) }]
    })
    if (playerResults.length === 0) return null
    return visible.flatMap(d => {
      const ok = playerResults.filter(r => r.ev.byId[d.id]?.value != null)
      if (ok.length === 0) return []
      const val = (r: typeof ok[number]) => r.ev.values[d.key]
      const best = ok.reduce((a, b) => ((d.higherIsBetter ? val(b) > val(a) : val(b) < val(a)) ? b : a))
      return [{ key: d.key, label: d.key, player: best.player, value: Math.round(val(best)) }]
    })
  }, [lineups, allPlayers, events, trackedTeamId, defs, visible])

  if (loadingMatches) return <div className="flex justify-center py-12"><Spinner /></div>

  if (summary.played === 0) {
    return (
      <EmptyLine>{t({ en: 'No finished matches in this filter yet. Finish a match to see season numbers here.', is: 'Engir kláraðir leikir í þessari síu. Kláraðu leik til að sjá tölur tímabilsins hér.' })}</EmptyLine>
    )
  }

  const goalsPerGame = summary.played > 0 ? (ourGoals / summary.played).toFixed(1) : '—'
  const concededPerGame = summary.played > 0 ? (summary.conceded / summary.played).toFixed(1) : '—'

  return (
    <>
      {/* Summary: one strip of figures */}
      <dl className="bg-white border border-line rounded-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4 p-5">
        <SummaryCard label={t(T.matches)} value={summary.played} />
        <SummaryCard label={t({ en: 'Won', is: 'Sigrar' })} value={summary.wins} highlight />
        <SummaryCard label={t({ en: 'Not won', is: 'Ekki sigur' })} value={summary.losses} />
        <SummaryCard label={t({ en: 'Goals per match', is: 'Mörk á leik' })} value={goalsPerGame} />
        <SummaryCard label={t({ en: 'Conceded per match', is: 'Mörk á okkur á leik' })} value={concededPerGame} />
        <SummaryCard label={t(T.shootingPct)} value={`${shotEff}%`} />
      </dl>

      {/* Index trend charts */}
      {indexTrend.length >= 2 && visible.length > 0 && (
        <div>
          <h2 className="text-[16px] font-medium mb-3 mt-2">{t({ en: 'Indices match by match', is: 'Vísitölur eftir leikjum' })}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visible.map(({ key }) => (
              <Card key={key} className="p-4">
                <h3 className="text-[15px] font-medium mb-3">{key}</h3>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={indexTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e5e5e5" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5d6470' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#5d6470' }} domain={[0, 100]} ticks={[0, 50, 100]} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => [`${v}`, key]} contentStyle={{ borderRadius: 6, border: '1px solid #e3e6ea', fontSize: 13 }} />
                    <Line type="linear" dataKey={key} stroke={INDEX_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
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
          <h2 className="text-[16px] font-medium mb-3 mt-2">{t({ en: 'Best player on court, per index', is: 'Besti leikmaður á velli, eftir vísitölu' })}</h2>
          <Card className="overflow-hidden">
            <div className="divide-y divide-[#eef0f2]">
              {topPlayers.map(({ label, player, value }) => (
                <div key={label} className="flex items-center px-4 min-h-[48px] gap-3">
                  <span className="text-[13px] font-medium w-16 shrink-0 text-muted">{label}</span>
                  <span className="flex-1 text-[15px]">
                    <span className="text-muted num inline-block min-w-[28px]">{player.jersey_number ?? ''}</span>{player.first_name} {player.last_name}
                  </span>
                  <span className="text-[15px] font-semibold num">{value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

function SummaryCard({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={`text-[26px] font-medium leading-tight num ${highlight ? 'text-accent' : ''}`}>{value}</dd>
    </div>
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
  const t = useT()
  const [viewMode, setViewMode] = useState<'total' | 'average'>('total')
  const { range, setRange, filterEvents, clear } = useMinuteFilter()
  const filtered = useMemo(() => filterEvents(events), [events, range]) // eslint-disable-line react-hooks/exhaustive-deps
  const attackRows = useMemo(() => computeAttack(filtered, allPlayers, trackedTeamId), [filtered, allPlayers, trackedTeamId])
  const defenseRows = useMemo(() => computeDefense(filtered, allPlayers, trackedTeamId), [filtered, allPlayers, trackedTeamId])
  const gkRows = useMemo(() => computeGK(filtered, goalkeepers, trackedTeamId), [filtered, goalkeepers, trackedTeamId])

  const shotOriginRows = useMemo(() => computeOriginDirectionBreakdown(
    filtered,
    e => e.event_type === 'SHOT' && e.team_id === trackedTeamId,
    e => e.sub_type === 'goal',
  ), [filtered, trackedTeamId])
  const turnoverOriginRows = useMemo(() => computeOriginDirectionBreakdown(
    filtered,
    e => e.event_type === 'TURNOVER' && e.team_id === trackedTeamId,
  ), [filtered, trackedTeamId])
  const foulOriginRows = useMemo(() => computeOriginDirectionBreakdown(
    filtered,
    e => e.event_type === 'FOUL' && e.team_id === trackedTeamId
      && (e.sub_type === 'attacking_foul' || e.sub_type === '7m_awarded'),
  ), [filtered, trackedTeamId])
  const defActionOriginRows = useMemo(() => computeOriginDirectionBreakdown(
    filtered,
    e => e.event_type === 'DEFENSIVE_ACTION' && e.team_id === trackedTeamId,
  ), [filtered, trackedTeamId])
  const gkOriginRows = useMemo(() => computeOriginDirectionBreakdown(
    filtered,
    e => e.event_type === 'GOALKEEPER_ACTION' && e.team_id === trackedTeamId
      && (e.sub_type === 'save' || e.sub_type === 'goal_conceded' || e.sub_type === 'missed'),
    e => e.sub_type === 'save',
  ), [filtered, trackedTeamId])

  if (!hasMatches) {
    return <EmptyLine>{t({ en: 'No matches in this filter.', is: 'Engir leikir í þessari síu.' })}</EmptyLine>
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  return (
    <div className="space-y-4">
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 pr-4 border-b border-line">
          <div className="flex-1 min-w-0 [&>div]:border-b-0"><MinuteFilterBar range={range} setRange={setRange} onClear={clear} /></div>
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        </div>
        <TeamStatsTable events={filtered} trackedTeamId={trackedTeamId} myTeamName={myTeamName} opponentTeamName={t({ en: 'Opponents', is: 'Andstæðingar' })} />
      </div>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        {tab === 'attack' && <AttackTable rows={attackRows} matchCount={matchCount} viewMode={viewMode} />}
        {tab === 'defense' && <DefenseTable rows={defenseRows} matchCount={matchCount} viewMode={viewMode} />}
        {tab === 'gk' && <GKTable rows={gkRows} matchCount={matchCount} viewMode={viewMode} />}
      </div>

        {tab === 'attack' && (
          <>
            <OriginDirectionTable title={t({ en: 'Shots by origin and direction', is: 'Skot eftir uppruna og átt' })} rows={shotOriginRows} successLabel={t(T.goals)} />
            <OriginDirectionTable title={t({ en: 'Turnovers by origin and direction', is: 'Tapaðir boltar eftir uppruna og átt' })} rows={turnoverOriginRows} />
          </>
        )}
        {tab === 'defense' && (
          <>
            <OriginDirectionTable title={t({ en: 'Fouls by origin and direction', is: 'Brot eftir uppruna og átt' })} rows={foulOriginRows} />
            <OriginDirectionTable title={t({ en: 'Other defence by origin and direction', is: 'Önnur varnaratvik eftir uppruna og átt' })} rows={defActionOriginRows} />
          </>
        )}
        {tab === 'gk' && (
          <OriginDirectionTable title={t({ en: 'Shots on the keeper by origin and direction', is: 'Skot á markmann eftir uppruna og átt' })} rows={gkOriginRows} successLabel={t(T.saves)} />
        )}
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
    <div className="bg-white border border-line rounded-lg overflow-hidden">
      <div className="flex items-center justify-end px-4 py-2.5 border-b border-line">
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
  const t = useT()
  const { range, setRange, filterEvents, clear } = useMinuteFilter()
  const filtered = useMemo(() => filterEvents(events), [events, range]) // eslint-disable-line react-hooks/exhaustive-deps
  const indices = useMemo(() => computeIndices(filtered, trackedTeamId), [filtered, trackedTeamId])
  const minuteFiltered = range.from !== null || range.to !== null

  const { defs, perTime } = useVisibleIndices(events, trackedTeamId)

  // Per-10-minute trend — always uses raw events (not minute-filtered), ignores events without match_minute
  const minuteTrend = useMemo(() => {
    return MINUTE_WINDOWS.map(({ label, from, to }) => {
      const windowEvents = events.filter(e => {
        const m = e.match_minute
        return m != null && m >= from && m < to
      })
      const row: Record<string, string | number | null> = { label }
      if (windowEvents.length === 0) {
        for (const d of perTime) row[d.key] = null
        return row
      }
      const { values } = indexValues(defs, windowEvents, trackedTeamId)
      for (const d of perTime) row[d.key] = Math.round(values[d.key] ?? 0)
      return row
    })
  }, [events, trackedTeamId, defs, perTime])

  const hasMinuteTrend = minuteTrend.some(d =>
    perTime.some(m => d[m.key] !== null)
  )

  if (!hasMatches) {
    return <EmptyLine>{t({ en: 'No matches in this filter.', is: 'Engir leikir í þessari síu.' })}</EmptyLine>
  }

  return (
    <>
      <div className="bg-white border border-line rounded-lg overflow-hidden">
        <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
        <IndexPanel breakdown={indices} minuteFiltered={minuteFiltered} />
      </div>

      {hasMinuteTrend && (
        <div className="py-6 space-y-4">
          <h2 className="text-[16px] font-medium">{t({ en: 'Indices by match time', is: 'Vísitölur eftir leiktíma' })}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {perTime.map(({ key }) => (
              <Card key={key} className="p-4">
                <h3 className="text-[15px] font-medium mb-3">{key} <span className="text-muted font-normal">· {t({ en: 'per 10 min', is: 'á 10 mín' })}</span></h3>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={minuteTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e5e5e5" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5d6470' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#5d6470' }} domain={[0, 100]} ticks={[0, 50, 100]} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => [`${v}`, key]} contentStyle={{ borderRadius: 6, border: '1px solid #e3e6ea', fontSize: 13 }} />
                    <Line type="linear" dataKey={key} stroke={INDEX_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} />
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
  const t = useT()
  const lang = useLang(st => st.lang)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (matches.length === 0) {
    return <EmptyLine>{t({ en: 'No finished matches yet.', is: 'Engir kláraðir leikir enn.' })}</EmptyLine>
  }

  const small = 'h-8 px-2.5 rounded-md text-[13px] font-medium transition-colors shrink-0 disabled:opacity-50'

  return (
    <Card className="overflow-hidden">
      <ul>
        {matches.map(m => {
          const isHome = m.home_team_id === trackedTeamId
          const trackedScore = isHome ? m.home_score : m.away_score
          const opponentScore = isHome ? m.away_score : m.home_score
          const opponent = isHome ? m.away_team : m.home_team
          const won = (trackedScore ?? 0) > (opponentScore ?? 0)
          const lost = (trackedScore ?? 0) < (opponentScore ?? 0)
          const date = m.match_date
            ? new Date(m.match_date).toLocaleDateString(lang === 'is' ? 'is-IS' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : t({ en: 'No date', is: 'Engin dagsetning' })
          const isDeleting = deletingMatchId === m.id
          const isConfirming = confirmDeleteId === m.id
          const resultWord = won ? t({ en: 'Win', is: 'Sigur' }) : lost ? t({ en: 'Loss', is: 'Tap' }) : t({ en: 'Draw', is: 'Jafntefli' })

          return (
            <li key={m.id} className="flex items-center px-4 min-h-[64px] py-2 gap-2 border-t border-[#eef0f2] first:border-t-0 hover:bg-[#f8f9fa] transition-colors">
              <button type="button" onClick={() => onDrillDown(m.id)} className="flex items-center gap-3 flex-1 text-left min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium truncate">{t({ en: 'vs', is: 'gegn' })} {opponent?.name ?? '?'}</p>
                  <p className="text-[13px] text-muted truncate">{date} · {isHome ? t(T.home) : t(T.away)}{m.competition ? ` · ${m.competition.name}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-[18px] font-semibold num ${won ? 'text-accent' : ''}`}>{trackedScore ?? '?'}–{opponentScore ?? '?'}</p>
                  <p className="text-[12px] text-muted">{resultWord}</p>
                </div>
              </button>
              <button type="button" onClick={() => onEditMatch(m.id)} className={`${small} text-muted hover:text-ink hover:bg-[#eef0f3]`}>
                {t({ en: 'Edit', is: 'Breyta' })}
              </button>
              {isConfirming ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => { onDeleteMatch(m.id); setConfirmDeleteId(null) }} disabled={isDeleting}
                    className={`${small} bg-[#c4242a] text-white`}>
                    {isDeleting ? '…' : t({ en: 'Delete match', is: 'Eyða leik' })}
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(null)} className={`${small} text-muted hover:text-ink`}>{t(T.cancel)}</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDeleteId(m.id)} className={`${small} text-muted hover:text-[#c4242a] hover:bg-[#ffedea]`}>
                  {t(T.delete)}
                </button>
              )}
            </li>
          )
        })}
      </ul>
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

  const t = useT()
  const DRILL_TABS: { id: DrillSubTab; label: string }[] = [
    { id: 'attack', label: t(T.attack) },
    { id: 'defense', label: t(T.defence) },
    { id: 'gk', label: t(T.goalkeeper) },
    { id: 'shotmap', label: t(T.shotMap) },
    { id: 'indices', label: t(T.indices) },
    { id: 'players', label: t({ en: 'Lineups', is: 'Leikmenn inná' }) },
  ]

  return (
    <div className="min-h-svh bg-ground text-ink">
      <AppBar title={header} onBack={onBack} backLabel={t({ en: 'Season', is: 'Tímabil' })} width="max-w-[1280px]" />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8 flex flex-col gap-4">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight">{header}</h1>
          <p className="text-[15px] text-muted mt-1 num">{subHeader}</p>
        </div>
        <Tabs<DrillSubTab> value={subTab} onChange={setSubTab} options={DRILL_TABS.map(x => ({ v: x.id, label: x.label }))} />
      </div>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4 pb-16">
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
          <div className="bg-white border border-line rounded-lg overflow-hidden">
            <ShotMap allEvents={events} players={allPlayers} trackedTeamId={trackedTeamId} />
          </div>
        ) : subTab === 'indices' ? (
          <div className="max-w-3xl bg-white border border-line rounded-lg overflow-hidden">
            <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
            <IndexPanel breakdown={indices} minuteFiltered={minuteFiltered} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white border border-line rounded-lg overflow-hidden">
              <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
              <TeamStatsTable events={filtered} trackedTeamId={trackedTeamId} myTeamName={myTeamName} opponentTeamName={opponentName} />
            </div>
            <div className="bg-white border border-line rounded-lg overflow-hidden">
              {subTab === 'attack' && <AttackTable rows={attackRows} />}
              {subTab === 'defense' && <DefenseTable rows={defenseRows} />}
              {subTab === 'gk' && <GKTable rows={gkRows} />}
            </div>
          </div>
        )}
      </div>
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
  const t = useT()
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
    { id: 'attack', label: t(T.attack) },
    { id: 'defense', label: t(T.defence) },
    { id: 'gk', label: t(T.goalkeeper) },
    { id: 'shotmap', label: t(T.shotMap) },
    { id: 'indices', label: t(T.indices) },
  ]

  const gks = allPlayers.filter(p => p.position === 'goalkeeper')
  const fields = allPlayers.filter(p => p.position === 'field')

  if (!hasMatches) {
    return <EmptyLine>{t({ en: 'No matches in this filter.', is: 'Engir leikir í þessari síu.' })}</EmptyLine>
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  const chip = (p: Player, gk: boolean) => {
    const selected = selectedPlayerIds.includes(p.id)
    return (
      <button key={p.id} type="button" aria-pressed={selected} onClick={() => togglePlayer(p.id)}
        className={`h-9 flex items-center gap-1.5 px-3 rounded-md text-[14px] border transition-colors ${
          selected ? 'bg-[#111214] text-white border-[#111214]' : 'bg-white text-ink border-line hover:border-[#9aa0a8]'
        }`}>
        {p.jersey_number != null && <span className={`num ${selected ? 'text-white/75' : 'text-muted'}`}>{p.jersey_number}</span>}
        {p.last_name}
        {gk && <span className={`text-[12px] ${selected ? 'text-white/75' : 'text-muted'}`}>{t({ en: 'GK', is: 'MM' })}</span>}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-[16px] font-medium">{t({ en: 'Who is on court?', is: 'Hverjir eru inná?' })}</h2>
          {selectedPlayerIds.length > 0 && (
            <button type="button" onClick={() => setSelectedPlayerIds([])} className="text-[13px] text-muted hover:text-ink underline underline-offset-4">
              {t({ en: 'Clear', is: 'Hreinsa val' })}
            </button>
          )}
        </div>
        <p className="text-[14px] text-muted mb-4">{t({ en: 'Pick players to see the numbers only while all of them were on court together.', is: 'Veldu leikmenn til að sjá tölurnar aðeins þegar allir voru inná samtímis.' })}</p>
        <div className="space-y-2">
          {gks.length > 0 && <div className="flex flex-wrap gap-2">{gks.map(p => chip(p, true))}</div>}
          <div className="flex flex-wrap gap-2">{fields.map(p => chip(p, false))}</div>
        </div>
      </Card>

      {selectedPlayerIds.length === 0 && (
        <EmptyLine>{t({ en: 'No players picked yet.', is: 'Enginn leikmaður valinn.' })}</EmptyLine>
      )}

      {selectedPlayerIds.length > 0 && playerFilteredEvents.length === 0 && (
        <EmptyLine>{t({ en: 'Nothing was logged while all of these players were on court together.', is: 'Ekkert var skráð á meðan allir þessir leikmenn voru inná samtímis.' })}</EmptyLine>
      )}

      {selectedPlayerIds.length > 0 && playerFilteredEvents.length > 0 && (
        <div className="space-y-4">
          <Tabs<StatsSubTab> value={subTab} onChange={setSubTab} options={SUB_TABS.map(x => ({ v: x.id, label: x.label }))} />

          {subTab === 'shotmap' ? (
            <div className="bg-white border border-line rounded-lg overflow-hidden">
              <div className="flex items-center justify-end px-4 py-2.5 border-b border-line">
                <ViewModeToggle mode={viewMode} onChange={setViewMode} />
              </div>
              <ShotMap allEvents={playerFilteredEvents} players={allPlayers} trackedTeamId={trackedTeamId} viewMode={viewMode} matchCount={playerMatchCount} />
            </div>
          ) : subTab === 'indices' ? (
            <div className="bg-white border border-line rounded-lg overflow-hidden">
              <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
              <IndexPanel breakdown={indices} minuteFiltered={minuteFiltered} />
            </div>
          ) : (
            <>
              <div className="bg-white border border-line rounded-lg overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 pr-4 border-b border-line">
                  <div className="flex-1 min-w-0 [&>div]:border-b-0"><MinuteFilterBar range={range} setRange={setRange} onClear={clear} /></div>
                  <ViewModeToggle mode={viewMode} onChange={setViewMode} />
                </div>
                <TeamStatsTable events={filtered} trackedTeamId={trackedTeamId} myTeamName={myTeamName} opponentTeamName={t({ en: 'Opponents', is: 'Andstæðingar' })} />
              </div>
              <div className="bg-white border border-line rounded-lg overflow-hidden">
                {subTab === 'attack' && <AttackTable rows={attackRows} matchCount={playerMatchCount} viewMode={viewMode} />}
                {subTab === 'defense' && <DefenseTable rows={defenseRows} matchCount={playerMatchCount} viewMode={viewMode} />}
                {subTab === 'gk' && <GKTable rows={gkRows} matchCount={playerMatchCount} viewMode={viewMode} />}
              </div>
            </>
          )}
        </div>
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
      setPlayerError(e instanceof Error ? e.message : t({ en: 'Could not save the players.', is: 'Villa við að vista leikmenn.' }))
    } finally {
      setSavingPlayers(false)
    }
  }

  const t = useT()
  const colHead = 'text-[12px] text-muted px-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true" aria-labelledby="edit-team-h">
      <div className="bg-white rounded-xl shadow-[0_24px_48px_rgba(0,0,0,0.22)] w-full max-w-2xl max-h-[90vh] flex flex-col overscroll-contain">
        <div className="px-6 pt-5 pb-4 border-b border-line flex items-center justify-between">
          <h2 id="edit-team-h" className="text-[18px] font-semibold">{t({ en: 'Edit team', is: 'Breyta liði' })}</h2>
          <button type="button" onClick={onClose} aria-label={t(T.close)} className="w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-[#f5f6f8] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-8">
          <section className="space-y-4">
            <h3 className="text-[16px] font-medium">{t({ en: 'Team details', is: 'Upplýsingar um lið' })}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="et-name">{t({ en: 'Team name', is: 'Nafn liðs' })}</Label>
                <Input id="et-name" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="et-short">{t({ en: 'Short name', is: 'Skammstöfun' })}</Label>
                <Input id="et-short" value={shortName} onChange={e => setShortName(e.target.value)} maxLength={6} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="et-venue">{t({ en: 'Home venue', is: 'Heimavöllur' })}</Label>
                <Input id="et-venue" value={homeVenue} onChange={e => setHomeVenue(e.target.value)} autoComplete="off"
                  placeholder={t({ en: 'e.g. Laugardalshöll', is: 't.d. Laugardalshöll' })} />
              </div>
            </div>
            {error && <p className="text-[14px] text-[#c4242a]" role="alert">{error}</p>}
            <Button onClick={() => onSave({ name, short_name: shortName, home_venue: homeVenue })} disabled={!name.trim() || saving}>
              {saving ? t(T.saving) : t({ en: 'Save team details', is: 'Vista upplýsingar' })}
            </Button>
          </section>

          <section className="space-y-3">
            <h3 className="text-[16px] font-medium">{t(T.players)}</h3>
            <div className="grid grid-cols-[56px_1fr_1fr_112px_40px] gap-2">
              <span className={colHead}>#</span>
              <span className={colHead}>{t({ en: 'First name', is: 'Fornafn' })}</span>
              <span className={colHead}>{t({ en: 'Last name', is: 'Eftirnafn' })}</span>
              <span className={colHead}>{t({ en: 'Position', is: 'Staða' })}</span>
              <span />
            </div>

            {players.map((p, i) => (
              <div key={p.id ?? `new-${i}`} className={`grid grid-cols-[56px_1fr_1fr_112px_40px] gap-2 items-center ${!p.is_active ? 'opacity-50' : ''}`}>
                <Input type="number" inputMode="numeric" value={p.jersey_number} onChange={e => updateDraft(i, 'jersey_number', e.target.value)}
                  placeholder="#" min={1} max={99} className="text-center px-1 num" aria-label="#" />
                <Input value={p.first_name} onChange={e => updateDraft(i, 'first_name', e.target.value)} autoComplete="off"
                  aria-label={t({ en: 'First name', is: 'Fornafn' })} />
                <Input value={p.last_name} onChange={e => updateDraft(i, 'last_name', e.target.value)} autoComplete="off"
                  aria-label={t({ en: 'Last name', is: 'Eftirnafn' })} />
                <Select value={p.position} onChange={e => updateDraft(i, 'position', e.target.value)} aria-label={t({ en: 'Position', is: 'Staða' })}>
                  <option value="field">{t({ en: 'Court', is: 'Útileikm.' })}</option>
                  <option value="goalkeeper">{t({ en: 'Goalkeeper', is: 'Markmaður' })}</option>
                </Select>
                <button
                  type="button"
                  onClick={() => p.id ? updateDraft(i, 'is_active', !p.is_active) : setPlayers(prev => prev.filter((_, idx) => idx !== i))}
                  className="w-9 h-9 rounded-md text-muted hover:text-ink hover:bg-[#f5f6f8] flex items-center justify-center text-[13px]"
                  aria-label={p.id ? (p.is_active ? t({ en: 'Mark inactive', is: 'Gera óvirkan' }) : t({ en: 'Mark active', is: 'Gera virkan' })) : t({ en: 'Remove row', is: 'Fjarlægja línu' })}
                  title={p.id ? (p.is_active ? t({ en: 'Mark inactive', is: 'Gera óvirkan' }) : t({ en: 'Mark active', is: 'Gera virkan' })) : t({ en: 'Remove row', is: 'Fjarlægja línu' })}
                >
                  {p.id && !p.is_active
                    ? <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.5M3 3v2.5h2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    : <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>}
                </button>
              </div>
            ))}

            <button type="button" onClick={addRow}
              className="w-full h-11 border border-dashed border-[#9aa0a8] rounded-lg text-[14px] text-muted hover:border-ink hover:text-ink transition-colors">
              {t({ en: 'Add player', is: 'Bæta við leikmanni' })}
            </button>

            {playerError && <p className="text-[14px] text-[#c4242a]" role="alert">{playerError}</p>}
            <Button onClick={savePlayers} disabled={savingPlayers}>
              {savingPlayers ? t(T.saving) : t({ en: 'Save players', is: 'Vista leikmenn' })}
            </Button>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-line flex justify-end">
          <Button variant="secondary" onClick={onClose}>{t(T.close)}</Button>
        </div>
      </div>
    </div>
  )
}
