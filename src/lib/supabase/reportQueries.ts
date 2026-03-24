import { supabase } from './client'
import type { Player } from '@/lib/db/schema'

// ─── Types for view results ───────────────────────────────────────────────────

export interface PlayerShotRow {
  player_id: string
  match_id: string
  team_id: string
  shots_attempted: number
  shots_on_target: number
  goals: number
  shot_efficiency: number
  on_target_pct: number
}

export interface PlayerTurnoverRow {
  player_id: string
  match_id: string
  team_id: string
  total_turnovers: number
  bad_passes: number
  lost_dribbles: number
  offensive_fouls: number
}

export interface PlayerSuspensionRow {
  player_id: string
  match_id: string
  team_id: string
  suspensions_2min: number
  minutes_suspended: number
  yellow_cards: number
  red_cards: number
}

export interface GoalkeeperRow {
  goalkeeper_player_id: string
  match_id: string
  team_id: string
  shots_faced: number
  saves: number
  goals_conceded: number
  save_pct: number
}

export interface FastBreakRow {
  team_id: string
  match_id: string
  fast_break_attempts: number
  fast_break_goals: number
  fast_break_efficiency: number
}

export interface SevenMRow {
  player_id: string
  match_id: string
  team_id: string
  attempts_7m: number
  goals_7m: number
  efficiency_7m: number
}

export interface MatchReportData {
  players: Player[]
  shots: PlayerShotRow[]
  turnovers: PlayerTurnoverRow[]
  suspensions: PlayerSuspensionRow[]
  goalkeepers: GoalkeeperRow[]
  fastBreak: FastBreakRow[]
  sevenM: SevenMRow[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getMatchReportData(matchId: string, teamId: string): Promise<MatchReportData> {
  const [shots, turnovers, suspensions, goalkeepers, fastBreak, sevenM] = await Promise.all([
    supabase.from('v_shot_efficiency_by_player').select('*').eq('match_id', matchId).eq('team_id', teamId),
    supabase.from('v_turnovers_by_player').select('*').eq('match_id', matchId).eq('team_id', teamId),
    supabase.from('v_suspensions_by_player').select('*').eq('match_id', matchId).eq('team_id', teamId),
    supabase.from('v_goalkeeper_performance').select('*').eq('match_id', matchId).eq('team_id', teamId),
    supabase.from('v_fast_break_efficiency').select('*').eq('match_id', matchId).eq('team_id', teamId),
    supabase.from('v_7m_efficiency').select('*').eq('match_id', matchId).eq('team_id', teamId),
  ])

  for (const result of [shots, turnovers, suspensions, goalkeepers, fastBreak, sevenM]) {
    if (result.error) throw result.error
  }

  // Collect all unique player IDs across all views
  const playerIds = new Set<string>([
    ...(shots.data ?? []).map(r => r.player_id),
    ...(turnovers.data ?? []).map(r => r.player_id),
    ...(suspensions.data ?? []).map(r => r.player_id),
    ...(goalkeepers.data ?? []).map(r => r.goalkeeper_player_id),
    ...(sevenM.data ?? []).map(r => r.player_id),
  ])

  const { data: players, error: pErr } = playerIds.size > 0
    ? await supabase.from('players').select('*').in('id', [...playerIds])
    : { data: [], error: null }

  if (pErr) throw pErr

  return {
    players: (players ?? []) as Player[],
    shots: (shots.data ?? []) as PlayerShotRow[],
    turnovers: (turnovers.data ?? []) as PlayerTurnoverRow[],
    suspensions: (suspensions.data ?? []) as PlayerSuspensionRow[],
    goalkeepers: (goalkeepers.data ?? []) as GoalkeeperRow[],
    fastBreak: (fastBreak.data ?? []) as FastBreakRow[],
    sevenM: (sevenM.data ?? []) as SevenMRow[],
  }
}

// ─── Finalize match ───────────────────────────────────────────────────────────

export async function finalizeMatch(
  matchId: string,
  trackedTeamId: string,
  homeTeamId: string,
): Promise<void> {
  // Count goals from events directly (source of truth)
  const { data: goalEvents, error } = await supabase
    .from('events')
    .select('team_id')
    .eq('match_id', matchId)
    .eq('event_type', 'SHOT')
    .eq('sub_type', 'goal')
    .eq('is_voided', false)
    .eq('is_edited', false)

  if (error) throw error

  const isTrackedHome = trackedTeamId === homeTeamId
  const trackedGoals = (goalEvents ?? []).filter(e => e.team_id === trackedTeamId).length
  const opponentGoals = (goalEvents ?? []).filter(e => e.team_id !== trackedTeamId).length

  const homeScore = isTrackedHome ? trackedGoals : opponentGoals
  const awayScore = isTrackedHome ? opponentGoals : trackedGoals

  const { error: updateErr } = await supabase
    .from('matches')
    .update({ status: 'final', home_score: homeScore, away_score: awayScore })
    .eq('id', matchId)

  if (updateErr) throw updateErr
}
