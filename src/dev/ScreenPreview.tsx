// DEV ONLY — loaded from main.tsx when import.meta.env.DEV and ?preview=<screen>.
// Renders real screens with FICTIONAL sample data so they can be inspected
// without signing in. Nothing here can reach the database: the live logger is
// forced offline (its events stay in this browser's local queue), and every
// query is pre-filled so no request is made.
//   ?preview=logger | stats | report | dashboard | setup | admin | login (&mode=signup|magic) | insights
//   (insights reads an export from .taste-skill/insight-data/, which is gitignored; it shows a note if absent)
import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Event, Player, Team, Match, Roster } from '@/lib/db/schema'
import type { MatchWithTeams } from '@/lib/supabase/dashboardQueries'
import { useMatchStore, type RosteredPlayer } from '@/store/matchStore'
import { PLAYERS, SHOTS, GK_SHOTS } from '@/pages/Landing/sample'
import { LiveMatchView } from '@/components/LiveInput/LiveMatchView'
import { MatchReport } from '@/pages/Report/MatchReport'
import { SeasonDashboard } from '@/pages/Dashboard/SeasonDashboard'
import { MatchSetupWizard } from '@/pages/Setup/MatchSetupWizard'
import { AdminPage } from '@/pages/Admin/AdminPage'
import { LoginPage, type AuthMode } from '@/pages/Auth/LoginPage'
import { InsightsTab } from '@/pages/Dashboard/InsightsTab'
import { useEffect } from 'react'
import type { ProfileWithTeam } from '@/lib/supabase/queries'

// Keep the logger from ever syncing: report offline for the whole preview.
try { Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }) } catch { /* preview only */ }

const TEAM_ID = 'preview-team'
const OPP_ID = 'preview-opp'
const team = (id: string, name: string, short: string | null, owner: string | null): Team => ({
  id, name, short_name: short, home_venue: null, owner_user_id: owner, is_archived: false, created_at: '2026-08-01',
})
const ours = team(TEAM_ID, 'HK Norðri', 'HKN', 'me')
const opp = team(OPP_ID, 'ÍF Suðri', 'ÍFS', null)

const players: Player[] = PLAYERS.map(p => ({
  id: p.id, team_id: TEAM_ID, first_name: p.name, last_name: p.name, jersey_number: p.jersey,
  position: p.position, is_active: true, created_at: '2026-08-01',
}))

let seq = 0
function ev(matchId: string, minute: number, part: Partial<Event>): Event {
  seq++
  const id = `ev-${matchId}-${seq}`
  return {
    id, client_id: id, match_id: matchId, period: minute < 30 ? 1 : 2, match_clock: null, match_minute: minute,
    wall_clock: '2026-10-24T18:00:00Z', team_id: TEAM_ID, player_id: null, event_type: 'SHOT', sub_type: null,
    shot_range: null, phase_type: 'set_play', numerical_state: '6v6', zone: null, lineup_id: 'lineup-1', context: {},
    is_voided: false, void_reason: null, voided_at: null, voided_by: null, is_edited: false, replaced_by: null,
    original_id: null, created_by: null, created_at: '2026-10-24T18:00:00Z', synced_at: null, ...part,
  }
}

/** One match's events built from the landing page's sample match. */
function matchEvents(matchId: string): Event[] {
  const list: Event[] = []
  for (const s of SHOTS) {
    list.push(ev(matchId, s.minute, {
      player_id: s.playerId, event_type: 'SHOT', sub_type: s.outcome, shot_range: s.range, zone: s.zone,
      phase_type: s.minute % 9 === 0 ? 'fast_break' : 'set_play',
      context: { attack_origin: ['left_wing', 'left_center', 'center', 'right_center', 'right_wing', 'line'][s.minute % 6], attack_direction: ['left', 'right', 'neither'][s.minute % 3], hand_up: s.minute % 2 === 0 },
    }))
  }
  GK_SHOTS.forEach((g, i) => {
    list.push(ev(matchId, (i * 3) % 60, {
      player_id: g.keeperId, event_type: 'GOALKEEPER_ACTION', sub_type: g.saved ? 'save' : 'goal_conceded',
      shot_range: g.range === 'wing' ? 'corner_wing_left' : g.range, zone: g.zone,
    }))
  })
  const def: [string, string][] = [['hlynur', 'block'], ['kari', 'interception'], ['einar', 'duel_won'], ['snorri', 'duel_lost'], ['atli', 'rebound'], ['hlynur', 'duel_won']]
  def.forEach(([pid, sub], i) => list.push(ev(matchId, 5 + i * 8, { player_id: pid, event_type: 'DEFENSIVE_ACTION', sub_type: sub as Event['sub_type'] })))
  list.push(ev(matchId, 21, { player_id: 'hlynur', event_type: 'SUSPENSION', sub_type: '2min' }))
  list.push(ev(matchId, 33, { player_id: 'kari', event_type: 'TURNOVER', sub_type: 'bad_pass' }))
  for (let i = 0; i < 52; i++) list.push(ev(matchId, i, { event_type: 'ATTACK', team_id: i % 2 ? OPP_ID : TEAM_ID }))
  return list
}

const competition = { id: 'c1', season_id: 's1', name: 'Úrvalsdeild', level: 'league' as const, created_at: '2026-08-01' }
const SEASON_ROWS: [string, string, boolean, number, number][] = [
  ['2026-10-24', 'ÍF Suðri', false, 28, 25], ['2026-10-17', 'KA Vestri', true, 29, 26], ['2026-10-10', 'HK Esja', true, 25, 28],
  ['2026-10-03', 'UMF Austri', false, 26, 23], ['2026-09-26', 'Fram Hekla', false, 30, 24], ['2026-09-19', 'ÍF Suðri', true, 22, 22],
]
const matches: MatchWithTeams[] = SEASON_ROWS.map(([date, name, home, gf, ga], i) => {
  const o = team(`opp-${i}`, name, null, null)
  return {
    id: `m${i}`, competition_id: 'c1', match_date: date, venue: null, status: 'final' as const, notes: null, created_at: date,
    tracked_team_id: TEAM_ID, home_team_id: home ? TEAM_ID : o.id, away_team_id: home ? o.id : TEAM_ID,
    home_score: home ? gf : ga, away_score: home ? ga : gf, home_team: home ? ours : o, away_team: home ? o : ours, competition,
  }
})
const allEvents = matches.flatMap(m => matchEvents(m.id))
const lineups = matches.map(m => ({ id: 'lineup-1', match_id: m.id, period: 1, match_minute: 0, player_ids: ['kari', 'hlynur', 'einar', 'atli', 'breki', 'snorri', 'haukur'], created_at: '2026-10-24' }))

const liveMatch: Match = {
  id: 'live', competition_id: 'c1', home_team_id: TEAM_ID, away_team_id: OPP_ID, match_date: '2026-10-31T18:00:00Z',
  venue: 'Norðurhöll', status: 'in_progress', home_score: null, away_score: null, tracked_team_id: TEAM_ID, notes: null, created_at: '2026-10-31',
}
const roster = (p: Player, starter: boolean): RosteredPlayer => ({
  ...p, roster: { id: `r-${p.id}`, match_id: 'live', player_id: p.id, team_id: p.team_id, jersey_override: null, is_starter: starter, created_at: '2026-10-31' } as Roster,
})

function seedStore(final: boolean) {
  const starters = new Set(['kari', 'hlynur', 'einar', 'atli', 'breki', 'snorri', 'haukur'])
  const tracked = players.map(p => roster(p, starters.has(p.id)))
  useMatchStore.setState({
    match: { ...liveMatch, status: final ? 'final' : 'in_progress' },
    homeTeam: ours, awayTeam: opp, trackedPlayers: tracked, opponentPlayers: [],
    events: matchEvents('live').map(e => ({ ...e, match_id: 'live' })),
    currentPeriod: 2, currentMatchMinute: 38, currentLineupId: 'lineup-1',
    currentLineupPlayerIds: [...starters],
  })
}

export function ScreenPreview({ screen }: { screen: string }) {
  const [client] = useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, enabled: false } } })
    const ids = matches.map(m => m.id)
    qc.setQueryData(['my-teams'], [ours, team('preview-team-2', 'HK Norðri U18', null, 'me')])
    qc.setQueryData(['archived-teams'], [])
    qc.setQueryData(['team-match-counts', `${TEAM_ID},preview-team-2`], { [TEAM_ID]: 6, 'preview-team-2': 0 })
    qc.setQueryData(['seasons-for-team', TEAM_ID], [{ id: 's1', name: '2026/2027', start_date: '2026-07-01', end_date: '2027-06-30', created_at: '2026-07-01' }])
    qc.setQueryData(['competitions-for-team', TEAM_ID, ''], [competition])
    qc.setQueryData(['match-history', TEAM_ID], matches)
    qc.setQueryData(['match-summaries', TEAM_ID, ''], [])
    qc.setQueryData(['players', TEAM_ID], players)
    qc.setQueryData(['match-events', ids], allEvents)
    qc.setQueryData(['match-events-all', ids], allEvents)
    qc.setQueryData(['lineups', ids], lineups)
    qc.setQueryData(['admin', 'profiles'], [
      { id: 'u1', email: 'thjalfari@nordri.example', is_approved: false, tracked_team_id: null, created_at: '2026-10-20', teamName: null },
      { id: 'u2', email: 'greining@sudri.example', is_approved: false, tracked_team_id: null, created_at: '2026-10-18', teamName: null },
      { id: 'u3', email: 'thjalfari@esja.example', is_approved: true, tracked_team_id: 't3', created_at: '2026-09-02', teamName: 'HK Esja' },
    ] satisfies ProfileWithTeam[])
    return qc
  })
  const [ready] = useState(() => { if (screen === 'logger' || screen === 'stats' || screen === 'report') seedStore(screen === 'report'); return true })
  const noop = () => {}
  let body: ReactNode = null
  if (!ready) body = null
  else if (screen === 'logger') body = <LiveMatchView />
  else if (screen === 'stats') body = <LiveMatchView key="stats" />
  else if (screen === 'report') body = <MatchReport onNewMatch={noop} onDashboard={noop} />
  else if (screen === 'dashboard') body = <SeasonDashboard trackedTeam={ours} onNewMatch={noop} onEditMatch={noop} onMainTeamChanged={noop} />
  else if (screen === 'setup') body = <MatchSetupWizard initialTeamId={TEAM_ID} onMatchStarted={noop} onCancel={noop} />
  else if (screen === 'admin') body = <AdminPage onBack={noop} />
  else if (screen === 'insights') body = <InsightsPreview />
  else if (screen === 'login') body = <LoginPage onBack={noop} initialMode={(new URLSearchParams(location.search).get('mode') as AuthMode) || 'signin'} />
  return <QueryClientProvider client={client}>{body}</QueryClientProvider>
}

/** Insight tab on a local data export (never committed). */
function InsightsPreview() {
  const [data, setData] = useState<{ events: Event[]; players: Player[]; lineups: import('@/lib/db/schema').CourtLineup[]; matches: MatchWithTeams[] } | null | 'missing'>(null)
  useEffect(() => {
    const get = (f: string) => fetch(`/.taste-skill/insight-data/${f}.json`).then(r => { if (!r.ok) throw new Error(f); return r.json() })
    Promise.all(['events', 'players', 'lineups', 'matches'].map(get))
      .then(([events, players, lineups, matches]) => setData({ events, players, lineups, matches }))
      .catch(() => setData('missing'))
  }, [])
  if (data === 'missing') return <p className="p-6">No export in .taste-skill/insight-data/ — showing nothing.</p>
  if (!data) return null
  const team = data.matches[0]?.tracked_team_id ?? ''
  return (
    <div className="min-h-svh bg-ground text-ink">
      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8">
        <InsightsTab events={data.events} players={data.players} lineups={data.lineups} matches={data.matches} trackedTeamId={team} loading={false} />
      </main>
    </div>
  )
}
