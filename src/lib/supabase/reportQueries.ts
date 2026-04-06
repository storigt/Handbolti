import { supabase } from './client'
import { syncPendingEvents } from '@/lib/sync/supabaseSync'
import type { Player } from '@/lib/db/schema'

// ─── Attacking stats (v_player_attacking_stats) ───────────────────────────────

export interface PlayerAttackingRow {
  player_id: string
  match_id: string
  team_id: string
  // Mörk / Skot / Skotnýting%
  shots_attempted: number
  goals: number
  shot_efficiency: number | null
  // Víti
  shots_penalty: number
  goals_penalty: number
  // Horn
  shots_corner: number
  goals_corner: number
  // 9m+
  shots_9m_plus: number
  goals_9m_plus: number
  // 7-8m
  shots_7_8m: number
  goals_7_8m: number
  // 6m
  shots_6m: number
  goals_6m: number
  // Lína
  shots_line: number
  goals_line: number
  // Uppstilltur leikur
  shots_set_play: number
  goals_set_play: number
  // Hraðaupphlaup
  shots_fast_break: number
  goals_fast_break: number
  // Seinni bylgja
  shots_second_wave: number
  goals_second_wave: number
  // 6á6
  shots_6v6: number
  goals_6v6: number
  // Undirtala
  shots_inferiority: number
  goals_inferiority: number
  // Yfirtala
  shots_superiority: number
  goals_superiority: number
  // 7á6
  shots_7v6: number
  goals_7v6: number
  // Sköpuð færi / Stoðsending / Víta sending / Fiskað víti
  chances_created: number
  assists: number
  penalty_assists: number
  drew_penalty: number
  // Tapaður bolti / Sóknarfrákast / Fengnar 2 mín
  turnovers: number
  offensive_rebounds: number
  received_2min: number
}

// ─── Defending stats (v_defensive_actions_by_player) ─────────────────────────

export interface PlayerDefensiveRow {
  player_id: string
  match_id: string
  team_id: string
  // Vinnur / Tapar árás 1á1 / Árás 1á1%
  duels_won: number
  duels_total: number
  // Hár kontakt (9m+)
  high_contact: number
  // Fríkast (foul committed by defender → free throw for attacker)
  fouls_committed: number
  // Stolinn
  interceptions: number
  // Blokk
  blocks: number
  // Frákast (defensive rebound)
  rebounds: number
  // Forced attacker's offensive foul
  drew_offensive_foul: number
  // Víti á
  penalties_conceded: number
  // Gult / 2Mín / Rautt / Værukærð
  yellow_cards: number
  suspensions_2min: number
  red_cards: number
  protests: number
}

// ─── Goalkeeping stats (v_goalkeeper_performance) ────────────────────────────

export interface GoalkeeperRow {
  goalkeeper_player_id: string
  match_id: string
  team_id: string
  // Overall: Varin / Fjöldi skota / Markvarsla%
  shots_faced: number
  saves: number
  goals_conceded: number
  save_pct: number | null
  // Víti: Varin / Skot / Vítavarsla%
  faced_penalty: number
  saved_penalty: number
  // Horn: Varin / Skot / Hornavarsla%
  faced_corner: number
  saved_corner: number
  // 9m+: Varin / Mörk / Varsla 9m+%
  faced_9m_plus: number
  saved_9m_plus: number
  goals_9m_plus: number
  // 7-8m
  faced_7_8m: number
  saved_7_8m: number
  // 6m
  faced_6m: number
  saved_6m: number
  // Lína
  faced_line: number
  saved_line: number
  // Uppstilltur leikur
  faced_set_play: number
  saved_set_play: number
  // Hraðaupphlaup
  faced_fast_break: number
  saved_fast_break: number
  // Seinni bylgja
  faced_second_wave: number
  saved_second_wave: number
  // 6á6
  faced_6v6: number
  saved_6v6: number
  // Undirtala
  faced_inferiority: number
  saved_inferiority: number
  // Yfirtala
  faced_superiority: number
  saved_superiority: number
  // 6á7
  faced_6v7: number
  saved_6v7: number
  // Phase stats (manual)
  empty_phases: number
  positive_responses: number
}

// ─── Supporting types ─────────────────────────────────────────────────────────

export interface FastBreakRow {
  team_id: string
  match_id: string
  fast_break_attempts: number
  fast_break_goals: number
  fast_break_efficiency: number | null
}

export interface MatchReportData {
  players: Player[]
  attacking: PlayerAttackingRow[]
  defensive: PlayerDefensiveRow[]
  goalkeepers: GoalkeeperRow[]
  fastBreak: FastBreakRow[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getMatchReportData(matchId: string, teamId: string): Promise<MatchReportData> {
  const [attacking, defensive, goalkeepers, fastBreak] = await Promise.all([
    supabase.from('v_player_attacking_stats').select('*').eq('match_id', matchId).eq('team_id', teamId),
    supabase.from('v_defensive_actions_by_player').select('*').eq('match_id', matchId).eq('team_id', teamId),
    supabase.from('v_goalkeeper_performance').select('*').eq('match_id', matchId).eq('team_id', teamId),
    supabase.from('v_fast_break_efficiency').select('*').eq('match_id', matchId).eq('team_id', teamId),
  ])

  for (const result of [attacking, defensive, goalkeepers, fastBreak]) {
    if (result.error) throw result.error
  }

  const playerIds = new Set<string>([
    ...(attacking.data ?? []).map(r => r.player_id),
    ...(defensive.data ?? []).map(r => r.player_id),
    ...(goalkeepers.data ?? []).map(r => r.goalkeeper_player_id),
  ])

  const { data: players, error: pErr } = playerIds.size > 0
    ? await supabase.from('players').select('*').in('id', [...playerIds])
    : { data: [], error: null }

  if (pErr) throw pErr

  return {
    players: (players ?? []) as Player[],
    attacking: (attacking.data ?? []) as PlayerAttackingRow[],
    defensive: (defensive.data ?? []) as PlayerDefensiveRow[],
    goalkeepers: (goalkeepers.data ?? []) as GoalkeeperRow[],
    fastBreak: (fastBreak.data ?? []) as FastBreakRow[],
  }
}

// ─── Finalize match ───────────────────────────────────────────────────────────

export async function finalizeMatch(
  matchId: string,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  // Flush any events that were logged offline before writing the final status
  await syncPendingEvents()

  const { error } = await supabase
    .from('matches')
    .update({ status: 'final', home_score: homeScore, away_score: awayScore })
    .eq('id', matchId)

  if (error) throw error
}
