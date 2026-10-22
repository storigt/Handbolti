// DEV ONLY — loaded from main.tsx when import.meta.env.DEV and ?preview=home.
// Renders the real HomeScreen with fictional sample data (no Supabase calls),
// so the design can be inspected without signing in to production data.
//   ?preview=home            a season in progress, with a live match saved
//   ?preview=home&state=new  a brand-new account with no team yet
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomeScreen } from '@/pages/Home/HomeScreen'
import type { MatchWithTeams } from '@/lib/supabase/dashboardQueries'
import type { Team, Match, Event, Player } from '@/lib/db/schema'

const TEAM_ID = 'preview-team'
const team = (id: string, name: string, owner: string | null = 'me'): Team => ({
  id, name, short_name: null, home_venue: null, owner_user_id: owner, is_archived: false, created_at: '2026-08-01',
})
const ours = team(TEAM_ID, 'HK Norðri')
const second = team('preview-team-2', 'HK Norðri U18')

// Fictional season: [date, opponent, home?, goals for, goals against]
const ROWS: [string, string, boolean, number, number][] = [
  ['2026-09-05', 'UMF Austri', true, 24, 22],
  ['2026-09-12', 'KA Vestri', false, 27, 29],
  ['2026-09-19', 'ÍF Suðri', true, 22, 22],
  ['2026-09-26', 'Fram Hekla', false, 30, 24],
  ['2026-10-03', 'UMF Austri', false, 26, 23],
  ['2026-10-10', 'HK Esja', true, 25, 28],
  ['2026-10-17', 'KA Vestri', true, 29, 26],
  ['2026-10-24', 'ÍF Suðri', false, 28, 25],
]
const competition = { id: 'c1', season_id: 's1', name: 'Úrvalsdeild', level: 'league' as const, created_at: '2026-08-01' }
const matches: MatchWithTeams[] = ROWS.map(([date, opp, home, gf, ga], i) => {
  const o = team(`opp-${i}`, opp, null)
  return {
    id: `m${i}`, competition_id: 'c1', match_date: date, venue: null, status: 'final' as const, notes: null, created_at: date,
    tracked_team_id: TEAM_ID,
    home_team_id: home ? TEAM_ID : o.id, away_team_id: home ? o.id : TEAM_ID,
    home_score: home ? gf : ga, away_score: home ? ga : gf,
    home_team: home ? ours : o, away_team: home ? o : ours, competition,
  }
}).reverse()

// Last match (m7, 28–25): shots by player [id, first name, jersey, goals, shots]
const SCORERS: [string, string, number, number, number][] = [
  ['p1', 'Einar', 13, 7, 11], ['p2', 'Kári', 9, 6, 12], ['p3', 'Snorri', 21, 6, 7],
  ['p4', 'Hlynur', 4, 4, 8], ['p5', 'Atli', 2, 3, 5], ['p6', 'Breki', 17, 2, 4],
]
const players: Player[] = SCORERS.map(([id, first, jersey]) => ({
  id, team_id: TEAM_ID, first_name: first, last_name: '', jersey_number: jersey, position: 'field', is_active: true, created_at: '2026-08-01',
}))
const lastEvents = SCORERS.flatMap(([id, , , g, s]) => Array.from({ length: s }, (_, i) => ({
  id: `${id}-${i}`, client_id: `${id}-${i}`, match_id: 'm7', team_id: TEAM_ID, player_id: id,
  event_type: 'SHOT', sub_type: i < g ? 'goal' : 'saved', is_voided: false, is_edited: false,
}) as unknown as Event))

const liveMatch: Match = {
  id: 'live', competition_id: 'c1', home_team_id: TEAM_ID, away_team_id: 'opp-live', match_date: '2026-10-31', venue: null,
  status: 'in_progress', home_score: null, away_score: null, tracked_team_id: TEAM_ID, notes: null, created_at: '2026-10-31',
}

export function HomePreview() {
  const params = new URLSearchParams(location.search)
  const fresh = params.get('state') === 'new'
  const [client] = useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    qc.setQueryData(['my-teams'], fresh ? [] : [ours, second])
    if (!fresh) {
      qc.setQueryData(['match-history', TEAM_ID], matches)
      qc.setQueryData(['match-events', ['m7']], lastEvents)
      qc.setQueryData(['players', TEAM_ID], players)
      qc.setQueryData(['live-match', 'live'], { match: liveMatch, opponent: 'HK Esja' })
      try {
        localStorage.setItem('handbolti_active_match_v1', JSON.stringify({ matchId: 'live', period: 2, matchMinute: 38, lineupPlayerIds: [], lineupId: null }))
      } catch { /* preview only */ }
    } else {
      try { localStorage.removeItem('handbolti_active_match_v1') } catch { /* preview only */ }
    }
    return qc
  })
  const noop = () => {}
  return (
    <QueryClientProvider client={client}>
      <HomeScreen
        teamId={fresh ? null : TEAM_ID}
        isAdmin={!fresh}
        userEmail="thjalfari@nordri.example"
        hasSavedMatch={!fresh}
        onNewMatch={noop} onResumeMatch={noop} onDashboard={noop} onAdmin={noop} onSignOut={noop}
      />
    </QueryClientProvider>
  )
}
