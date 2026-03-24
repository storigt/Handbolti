import { supabase } from './client'
import type { Team, Player, Match, Roster, Season, Competition, MatchInsert, RosterInsert } from '@/lib/db/schema'

// ─── Teams ────────────────────────────────────────────────────────────────────

export async function getTeams(): Promise<Team[]> {
  const { data, error } = await supabase.from('teams').select('*').order('name')
  if (error) throw error
  return data
}

export async function createTeam(team: Omit<Team, 'id' | 'created_at'>): Promise<Team> {
  const { data, error } = await supabase.from('teams').insert(team).select().single()
  if (error) throw error
  return data
}

export async function upsertTeamByName(name: string, shortName?: string): Promise<Team> {
  const { data: existing } = await supabase
    .from('teams')
    .select('*')
    .ilike('name', name.trim())
    .maybeSingle()
  if (existing) return existing

  return createTeam({ name: name.trim(), short_name: shortName?.trim() ?? null, home_venue: null })
}

// ─── Players ──────────────────────────────────────────────────────────────────

export async function getPlayersByTeam(teamId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('jersey_number')
  if (error) throw error
  return data
}

export async function createPlayer(player: Omit<Player, 'id' | 'created_at'>): Promise<Player> {
  const { data, error } = await supabase.from('players').insert(player).select().single()
  if (error) throw error
  return data
}

export async function updatePlayer(id: string, updates: Partial<Player>): Promise<Player> {
  const { data, error } = await supabase.from('players').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ─── Seasons ──────────────────────────────────────────────────────────────────

export async function getSeasons(): Promise<Season[]> {
  const { data, error } = await supabase.from('seasons').select('*').order('start_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createSeason(name: string): Promise<Season> {
  const year = new Date().getFullYear()
  const { data, error } = await supabase
    .from('seasons')
    .insert({ name, start_date: `${year}-07-01`, end_date: `${year + 1}-06-30` })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getOrCreateCurrentSeason(): Promise<Season> {
  const seasons = await getSeasons()
  if (seasons.length > 0) return seasons[0]
  const year = new Date().getFullYear()
  return createSeason(`${year}/${year + 1}`)
}

// ─── Competitions ─────────────────────────────────────────────────────────────

export async function getCompetitions(seasonId?: string): Promise<Competition[]> {
  let query = supabase.from('competitions').select('*').order('name')
  if (seasonId) query = query.eq('season_id', seasonId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createCompetition(
  seasonId: string,
  name: string,
  level: Competition['level'],
): Promise<Competition> {
  const { data, error } = await supabase
    .from('competitions')
    .insert({ season_id: seasonId, name, level })
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Matches ──────────────────────────────────────────────────────────────────

export async function getMatches(trackedTeamId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('tracked_team_id', trackedTeamId)
    .order('match_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createMatch(match: MatchInsert): Promise<Match> {
  const { data, error } = await supabase.from('matches').insert(match).select().single()
  if (error) throw error
  return data
}

export async function updateMatchStatus(
  matchId: string,
  status: Match['status'],
): Promise<void> {
  const { error } = await supabase.from('matches').update({ status }).eq('id', matchId)
  if (error) throw error
}

// ─── Rosters ─────────────────────────────────────────────────────────────────

export async function createRosterEntries(entries: RosterInsert[]): Promise<Roster[]> {
  const { data, error } = await supabase.from('rosters').insert(entries).select()
  if (error) throw error
  return data
}

export async function getRoster(matchId: string): Promise<(Roster & { player: Player })[]> {
  // Fetch rosters and players in two queries to avoid PostgREST join ambiguity
  const { data: rosters, error: rErr } = await supabase
    .from('rosters')
    .select('*')
    .eq('match_id', matchId)
  if (rErr) throw rErr

  if (!rosters || rosters.length === 0) return []

  const playerIds = rosters.map(r => r.player_id)
  const { data: players, error: pErr } = await supabase
    .from('players')
    .select('*')
    .in('id', playerIds)
  if (pErr) throw pErr

  const playerMap = Object.fromEntries((players ?? []).map(p => [p.id, p]))

  return rosters.map(r => ({
    ...(r as Roster),
    player: playerMap[r.player_id] as Player,
  }))
}

// ─── Settings (tracked team) ──────────────────────────────────────────────────
// We store the tracked team ID in localStorage for simplicity.
// Phase 2: move to a proper user profile table.

const TRACKED_TEAM_KEY = 'handbolti_tracked_team_id'

export function getTrackedTeamId(): string | null {
  return localStorage.getItem(TRACKED_TEAM_KEY)
}

export function setTrackedTeamId(id: string): void {
  localStorage.setItem(TRACKED_TEAM_KEY, id)
}
