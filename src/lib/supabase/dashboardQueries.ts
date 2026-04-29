import { supabase } from './client'
import type { Match, Team, Competition, Season, Event, CourtLineup } from '@/lib/db/schema'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatchWithTeams extends Match {
  home_team: Team
  away_team: Team
  competition: Competition | null
}

export interface PlayerSeasonRow {
  player_id: string
  first_name: string
  last_name: string
  position: string
  team_id: string
  season_id: string | null
  competition_id: string | null
  matches_played: number
  // shooting totals
  total_goals: number
  total_shots: number
  season_shot_efficiency: number | null
  // shooting by range / phase (from materialized view)
  total_goals_penalty: number
  total_shots_penalty: number
  total_goals_fast_break: number
  total_shots_fast_break: number
  // discipline
  total_turnovers: number
  total_suspensions_2min: number
  total_yellow_cards: number
  total_red_cards: number
}

export interface MatchSummaryRow {
  match_id: string
  match_date: string | null
  home_team_id: string
  away_team_id: string
  status: string
  team_id: string
  team_name: string
  goals: number
  shots_attempted: number
  shot_efficiency: number | null
  fast_break_goals: number
  fast_break_attempts: number
  fast_break_efficiency: number | null
  total_turnovers: number
  suspensions_2min: number
}

// Matches v_goalkeeper_performance exactly (same view used for both report and dashboard)
export interface GoalkeeperSeasonRow {
  goalkeeper_player_id: string
  match_id: string
  team_id: string
  shots_faced: number
  saves: number
  goals_conceded: number
  save_pct: number | null
  faced_penalty: number
  saved_penalty: number
  faced_corner: number
  saved_corner: number
  faced_9m_plus: number
  saved_9m_plus: number
  goals_9m_plus: number
  faced_7_8m: number
  saved_7_8m: number
  faced_6m: number
  saved_6m: number
  faced_line: number
  saved_line: number
  faced_set_play: number
  saved_set_play: number
  faced_fast_break: number
  saved_fast_break: number
  faced_second_wave: number
  saved_second_wave: number
  faced_6v6: number
  saved_6v6: number
  faced_inferiority: number
  saved_inferiority: number
  faced_superiority: number
  saved_superiority: number
  faced_6v7: number
  saved_6v7: number
  empty_phases: number
  positive_responses: number
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getMatchHistory(trackedTeamId: string): Promise<MatchWithTeams[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*, home_team:teams!home_team_id(*), away_team:teams!away_team_id(*), competition:competitions(*)')
    .eq('tracked_team_id', trackedTeamId)
    .eq('status', 'final')
    .order('match_date', { ascending: false })
  if (error) throw error
  return data as MatchWithTeams[]
}

export async function getSeasonPlayerTotals(
  trackedTeamId: string,
  seasonId?: string,
  competitionId?: string,
): Promise<PlayerSeasonRow[]> {
  let query = supabase
    .from('v_season_player_totals')
    .select('*')
    .eq('team_id', trackedTeamId)

  if (seasonId) query = query.eq('season_id', seasonId)
  if (competitionId) query = query.eq('competition_id', competitionId)

  const { data, error } = await query.order('total_goals', { ascending: false })
  if (error) throw error
  return (data ?? []) as PlayerSeasonRow[]
}

export async function getMatchSummaries(
  trackedTeamId: string,
  seasonId?: string,
): Promise<MatchSummaryRow[]> {
  const { data, error } = await supabase
    .from('v_match_summary')
    .select('*')
    .eq('team_id', trackedTeamId)
  if (error) throw error

  let rows = (data ?? []) as MatchSummaryRow[]

  if (seasonId) {
    const { data: compData } = await supabase
      .from('competitions')
      .select('id')
      .eq('season_id', seasonId)
    const compIds = new Set((compData ?? []).map(c => c.id))

    const { data: seasonMatches } = await supabase
      .from('matches')
      .select('id')
      .eq('tracked_team_id', trackedTeamId)
      .eq('status', 'final')
      .in('competition_id', [...compIds])
    const matchIds = new Set((seasonMatches ?? []).map((m: { id: string }) => m.id))
    rows = rows.filter(r => matchIds.has(r.match_id))
  }

  return rows
}

export async function getGoalkeeperSeasonStats(
  trackedTeamId: string,
  matchIds?: string[],
): Promise<GoalkeeperSeasonRow[]> {
  let query = supabase
    .from('v_goalkeeper_performance')
    .select('*')
    .eq('team_id', trackedTeamId)

  if (matchIds && matchIds.length > 0) {
    query = query.in('match_id', matchIds)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as GoalkeeperSeasonRow[]
}

export async function getSeasonsForTeam(trackedTeamId: string): Promise<Season[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('competition:competitions(season:seasons(*))')
    .eq('tracked_team_id', trackedTeamId)
    .eq('status', 'final')
    .not('competition_id', 'is', null)
  if (error) throw error

  const seen = new Set<string>()
  const seasons: Season[] = []
  for (const row of (data ?? []) as unknown as { competition: { season: Season } | null }[]) {
    const s = row.competition?.season
    if (s && !seen.has(s.id)) {
      seen.add(s.id)
      seasons.push(s)
    }
  }
  return seasons.sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))
}

export async function getMatchEventsForMatches(matchIds: string[]): Promise<Event[]> {
  if (matchIds.length === 0) return []
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .in('match_id', matchIds)
    .eq('is_voided', false)
    .eq('is_edited', false)
  if (error) throw error
  return (data ?? []) as Event[]
}

export async function getLineupsForMatches(matchIds: string[]): Promise<CourtLineup[]> {
  if (matchIds.length === 0) return []
  const { data, error } = await supabase
    .from('court_lineups')
    .select('*')
    .in('match_id', matchIds)
  if (error) throw error
  return (data ?? []) as CourtLineup[]
}

export async function getCompetitionsForTeam(
  trackedTeamId: string,
  seasonId?: string,
): Promise<Competition[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('competition:competitions(*)')
    .eq('tracked_team_id', trackedTeamId)
    .eq('status', 'final')
    .not('competition_id', 'is', null)
  if (error) throw error

  const seen = new Set<string>()
  const competitions: Competition[] = []
  for (const row of (data ?? []) as unknown as { competition: Competition | null }[]) {
    const c = row.competition
    if (c && !seen.has(c.id)) {
      if (!seasonId || c.season_id === seasonId) {
        seen.add(c.id)
        competitions.push(c)
      }
    }
  }
  return competitions
}
