// ─── Enums ────────────────────────────────────────────────────────────────────

export type MatchStatus = 'planned' | 'in_progress' | 'final'
export type CompetitionLevel = 'league' | 'cup' | 'friendly'
export type PlayerPosition = 'goalkeeper' | 'field'

// Event taxonomy
export type EventType =
  | 'SHOT'
  | 'TURNOVER'
  | 'SUSPENSION'
  | 'FOUL'
  | 'GOALKEEPER_ACTION'
  | 'TIMEOUT'
  | 'PERIOD_MARKER'
  | 'SUBSTITUTION'      // player swap → creates new CourtLineup
  | 'DEFENSIVE_ACTION'  // blocks, interceptions, 1v1 duels, high contact, protest
  | 'ATTACKING_ACTION'  // offensive rebounds (Sóknarfrákast)
  | 'ATTACK'            // possession/attack counter (both teams)

export type ShotSubType = 'goal' | 'saved' | 'blocked' | 'post' | 'wide' | 'technical'
export type TurnoverSubType =
  | 'offensive_foul' // sóknarbrot
  | 'bad_pass'       // sendingarmistök
  | 'delay'          // töf
  | 'other'
export type SuspensionSubType = '2min' | 'yellow_card' | 'red_card' | 'blue_card' | 'disqualification'
export type FoulSubType = 'attacking_foul' | '7m_awarded' | 'passive_play_warning' | 'drew_penalty'
export type GoalkeeperSubType = 'save' | 'goal_conceded' | 'parry' | 'missed' | 'empty_phase' | 'positive_response'
export type TimeoutSubType = 'team_timeout' | 'referee_timeout'
export type PeriodMarkerSubType = 'period_start' | 'period_end' | 'match_end'
export type DefensiveActionSubType =
  | 'block'
  | 'interception'        // stolinn
  | 'high_contact'        // hár kontakt (9m+)
  | 'duel_won'            // vinnur árás 1á1
  | 'duel_lost'           // tapar árás 1á1
  | 'rebound'             // frákast — defensive rebound
  | 'drew_offensive_foul' // forced attacker's offensive foul
  | 'opponent_lost_ball'  // andstæðingur tapar bolta
  | 'protest'             // værukærð

export type AttackingActionSubType =
  | 'offensive_rebound' // sóknarfrákast
  | 'drew_suspension'   // fengnar 2 mín — attacking player who drew the suspension

export type EventSubType =
  | ShotSubType
  | TurnoverSubType
  | SuspensionSubType
  | FoulSubType
  | GoalkeeperSubType
  | TimeoutSubType
  | PeriodMarkerSubType
  | DefensiveActionSubType
  | AttackingActionSubType

// ─── Shot classification (three orthogonal groups) ────────────────────────────

/** WHERE on the court the shot came from. One per shot event. */
export type ShotRange =
  | '6m'          // close range (6m line)
  | '7_8m'        // medium range (7–8m)
  | '9m_plus'     // long range (beyond 9m)
  | 'line'        // lína — pivot/line player
  | 'penalty'     // víti — 7-meter penalty
  | 'corner_wing' // horn — wing/corner position

/** Phase of play at time of shot. One per shot event. */
export type PhaseType =
  | 'set_play'    // uppstilltur leikur — regular set offense
  | 'fast_break'  // hraðaupphlaup
  | 'second_wave' // seinni bylgja

/**
 * Numerical advantage/disadvantage at time of event.
 * Perspective is always from the tracked team.
 */
export type NumericalState =
  | '6v6'         // 6á6 — equal numbers
  | 'inferiority' // undirtala — tracked team has fewer players
  | 'superiority' // yfirtala — tracked team has more players
  | '7v6'         // 7á6 — tracked team attacks with 7 field players (GK out)
  | '6v7'         // 6á7 — tracked team's GK faces 7 opponent field players

export type EventLinkType = 'goalkeeper_response' | 'assist' | 'caused_by' | 'penalty_assist'

// Shot zones: 1–9 (EHF 9-zone goal face map), 10 = wide/post, null = blocked
export type ShotZone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

// ─── Database row types (mirrors PostgreSQL schema) ───────────────────────────

export interface Season {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
  created_at: string
}

export interface Competition {
  id: string
  season_id: string
  name: string
  level: CompetitionLevel
  created_at: string
}

export interface Team {
  id: string
  name: string
  short_name: string | null
  home_venue: string | null
  owner_user_id: string | null
  created_at: string
}

export interface Profile {
  id: string
  email: string
  is_approved: boolean
  created_at: string
}

export interface Player {
  id: string
  team_id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: PlayerPosition
  is_active: boolean
  created_at: string
}

export interface Match {
  id: string
  competition_id: string | null
  home_team_id: string
  away_team_id: string
  match_date: string | null
  venue: string | null
  status: MatchStatus
  home_score: number | null
  away_score: number | null
  tracked_team_id: string
  notes: string | null
  created_at: string
}

export interface Roster {
  id: string
  match_id: string
  player_id: string
  team_id: string
  jersey_override: number | null
  is_starter: boolean
  created_at: string
}

/**
 * Snapshot of which players are on court at a given moment.
 * Created at match start (starters) and on every SUBSTITUTION event.
 */
export interface CourtLineup {
  id: string
  match_id: string
  period: number
  match_minute: number
  player_ids: string[] // player UUIDs currently on court
  created_at: string
}

export interface Event {
  id: string         // client-generated UUID
  client_id: string  // same as id — idempotency key
  match_id: string
  period: number
  match_clock: number | null  // seconds elapsed from period start (auto-computed)
  match_minute: number | null // operator-set game minute
  wall_clock: string          // ISO 8601 timestamp — set at tap time
  team_id: string
  player_id: string | null
  event_type: EventType
  sub_type: EventSubType | null
  // Shot classification (three independent groups — all nullable for non-SHOT events)
  shot_range: ShotRange | null
  phase_type: PhaseType | null
  numerical_state: NumericalState | null
  zone: ShotZone | null  // EHF goal face zone (WHERE IN THE GOAL the shot went)
  lineup_id: string | null  // court_lineups.id at time of event
  context: Record<string, unknown>
  is_voided: boolean
  void_reason: string | null
  voided_at: string | null
  voided_by: string | null
  is_edited: boolean
  replaced_by: string | null
  original_id: string | null
  created_by: string | null
  created_at: string
  synced_at: string | null
}

export interface EventLink {
  id: string
  match_id: string
  primary_event_id: string
  linked_event_id: string
  link_type: EventLinkType
  created_at: string
}

// ─── Insert types (omit server-generated fields) ─────────────────────────────

export type EventInsert = Omit<Event, 'created_at' | 'synced_at'> & {
  created_at?: string
  synced_at?: string | null
}

export type MatchInsert = Omit<Match, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type RosterInsert = Omit<Roster, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type CourtLineupInsert = Omit<CourtLineup, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

// ─── Derived view types ───────────────────────────────────────────────────────

export interface PlayerShotStats {
  player_id: string
  match_id: string
  team_id: string
  // totals
  shots_attempted: number
  shots_on_target: number
  goals: number
  shot_efficiency: number
  // by shot_range
  shots_penalty: number
  goals_penalty: number
  shots_corner: number
  goals_corner: number
  shots_9m_plus: number
  goals_9m_plus: number
  shots_7_8m: number
  goals_7_8m: number
  shots_6m: number
  goals_6m: number
  shots_line: number
  goals_line: number
  // by phase_type
  shots_fast_break: number
  goals_fast_break: number
  shots_second_wave: number
  goals_second_wave: number
  // by numerical_state
  shots_6v6: number
  goals_6v6: number
  shots_inferiority: number
  goals_inferiority: number
  shots_superiority: number
  goals_superiority: number
  shots_7v6: number
  goals_7v6: number
  // by phase_type
  shots_set_play: number
  goals_set_play: number
}

export interface ZoneShotStats {
  zone: ShotZone | null
  shot_range: ShotRange | null
  phase_type: PhaseType | null
  shots_attempted: number
  goals: number
  efficiency: number
}

export interface GoalkeeperStats {
  goalkeeper_player_id: string
  match_id: string
  team_id: string
  // overall — Varin / Fjöldi skota / Markvarsla%
  shots_faced: number
  saves: number
  goals_conceded: number
  save_pct: number | null
  // by shot_range
  faced_penalty: number
  saved_penalty: number
  faced_corner: number
  saved_corner: number
  faced_9m_plus: number
  saved_9m_plus: number
  goals_9m_plus: number      // Mörk 9m+ (goals conceded from 9m+)
  faced_7_8m: number
  saved_7_8m: number
  faced_6m: number
  saved_6m: number
  faced_line: number
  saved_line: number
  // by phase_type
  faced_set_play: number
  saved_set_play: number
  faced_fast_break: number
  saved_fast_break: number
  faced_second_wave: number
  saved_second_wave: number
  // by numerical_state
  faced_6v6: number
  saved_6v6: number
  faced_inferiority: number
  saved_inferiority: number
  faced_superiority: number
  saved_superiority: number
  faced_6v7: number          // 6á7 — GK faces 7 field players
  saved_6v7: number
  // phase stats (manual button taps by operator)
  empty_phases: number       // tómar fasar
  positive_responses: number // jákvæð viðbrögð
}

export interface PlayerTurnoverStats {
  player_id: string
  match_id: string
  total_turnovers: number
  offensive_fouls: number  // sóknarbrot
  bad_passes: number       // sendingarmistök
  delays: number           // töf
  other_turnovers: number
}

export interface PlayerSuspensionStats {
  player_id: string
  match_id: string
  suspensions_2min: number
  minutes_suspended: number
  yellow_cards: number
  red_cards: number
  blue_cards: number
  disqualifications: number
}

export interface PlayerDefensiveStats {
  player_id: string
  match_id: string
  team_id: string
  // 1á1 duels
  duels_won: number
  duels_total: number
  // defensive actions
  high_contact: number       // hár kontakt (9m+)
  fouls_committed: number    // fríkast — foul committed by defender
  interceptions: number      // stolinn
  blocks: number              // blokk
  rebounds: number            // frákast — defensive rebound
  drew_offensive_foul: number // forced attacker's offensive foul
  penalties_conceded: number  // víti á
  // discipline
  yellow_cards: number        // gult
  suspensions_2min: number    // 2mín
  red_cards: number           // rautt
  protests: number            // værukærð
}

export interface LineupStats {
  lineup_id: string
  match_id: string
  player_ids: string[]
  period: number
  team_id: string
  shots: number
  goals: number
  turnovers: number
  shot_efficiency: number
}

