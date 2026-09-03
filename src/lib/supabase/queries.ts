import { supabase } from './client'
import type { Team, Player, Match, Roster, Season, Competition, MatchInsert, RosterInsert, Profile } from '@/lib/db/schema'

// ─── Teams ────────────────────────────────────────────────────────────────────

export async function getTeams(): Promise<Team[]> {
  const { data, error } = await supabase.from('teams').select('*').order('name')
  if (error) throw error
  return data
}

export async function createTeam(team: Omit<Team, 'id' | 'created_at' | 'owner_user_id' | 'is_archived'>): Promise<Team> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('teams')
    .insert({ ...team, owner_user_id: user?.id ?? null })
    .select()
    .single()
  if (error) throw error
  return data
}

// Counts matches each team is involved in (as tracked, home, or away) — used to
// decide whether a team is safe to delete.
export async function getTeamMatchCounts(teamIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(teamIds.map(id => [id, 0]))
  if (teamIds.length === 0) return counts

  const filter = teamIds
    .map(id => `home_team_id.eq.${id},away_team_id.eq.${id},tracked_team_id.eq.${id}`)
    .join(',')
  const { data, error } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id, tracked_team_id')
    .or(filter)
  if (error) throw error

  for (const m of data ?? []) {
    for (const id of new Set([m.home_team_id, m.away_team_id, m.tracked_team_id])) {
      if (id in counts) counts[id]++
    }
  }
  return counts
}

export async function deleteTeam(teamId: string): Promise<void> {
  // players cascade on team delete at the DB level, but delete explicitly to be safe.
  await supabase.from('players').delete().eq('team_id', teamId)
  const { error } = await supabase.from('teams').delete().eq('id', teamId)
  if (error) throw error
}

export async function upsertTeamByName(name: string, shortName?: string): Promise<Team> {
  const { data: existing } = await supabase
    .from('teams')
    .select('*')
    .ilike('name', name.trim())
    .maybeSingle()
  if (existing) return existing

  // Opponent teams are created without owner so any user can read them
  const { data, error } = await supabase
    .from('teams')
    .insert({ name: name.trim(), short_name: shortName?.trim() ?? null, home_venue: null, owner_user_id: null })
    .select()
    .single()
  if (error) throw error
  return data
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

export async function getMyTeams(): Promise<Team[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('owner_user_id', user.id)
    .eq('is_archived', false)
    .order('name')
  if (error) throw error
  return data
}

export async function getArchivedTeams(): Promise<Team[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('owner_user_id', user.id)
    .eq('is_archived', true)
    .order('name')
  if (error) throw error
  return data
}

// Hides a team from all pickers/lists without touching its data — used for
// teams that already have match history, where a hard delete isn't safe.
export async function archiveTeam(teamId: string): Promise<void> {
  const { error } = await supabase.from('teams').update({ is_archived: true }).eq('id', teamId)
  if (error) throw error
}

export async function restoreTeam(teamId: string): Promise<void> {
  const { error } = await supabase.from('teams').update({ is_archived: false }).eq('id', teamId)
  if (error) throw error
}

export async function getMatchById(matchId: string): Promise<Match | null> {
  const { data } = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle()
  return data
}

export async function getTeamById(teamId: string): Promise<Team | null> {
  const { data } = await supabase.from('teams').select('*').eq('id', teamId).maybeSingle()
  return data
}

export async function getMatchEvents(matchId: string): Promise<import('@/lib/db/schema').Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as import('@/lib/db/schema').Event[]
}

// ─── Auth / profiles ──────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return data
}

export async function checkIsAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}

export interface ProfileWithTeam extends Profile {
  teamName: string | null
}

export async function getAllProfiles(): Promise<ProfileWithTeam[]> {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!profiles) return []

  const mainTeamIds = [...new Set(profiles.map(p => p.tracked_team_id).filter((id): id is string => !!id))]
  const { data: teams } = mainTeamIds.length > 0
    ? await supabase.from('teams').select('id, name').in('id', mainTeamIds)
    : { data: [] }

  const teamById: Record<string, string> = {}
  for (const t of teams ?? []) {
    teamById[t.id] = t.name
  }

  return profiles.map(p => ({ ...p, teamName: p.tracked_team_id ? teamById[p.tracked_team_id] ?? null : null }))
}

export async function setApproval(userId: string, approved: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_approved: approved }).eq('id', userId)
  if (error) throw error
}

export async function updateTeam(id: string, updates: { name?: string; short_name?: string | null; home_venue?: string | null }): Promise<Team> {
  const { data, error } = await supabase.from('teams').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteMatch(matchId: string): Promise<void> {
  // Delete child records in order (no cascade on events/event_links/court_lineups)
  await supabase.from('event_links').delete().eq('match_id', matchId)
  await supabase.from('events').delete().eq('match_id', matchId)
  await supabase.from('court_lineups').delete().eq('match_id', matchId)
  // rosters cascade, but delete explicitly to be safe
  await supabase.from('rosters').delete().eq('match_id', matchId)
  const { error } = await supabase.from('matches').delete().eq('id', matchId)
  if (error) throw error
}

export async function updateProfileTeam(teamId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('profiles').update({ tracked_team_id: teamId }).eq('id', user.id)
}
