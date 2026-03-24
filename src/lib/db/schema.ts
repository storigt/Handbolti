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

export type ShotSubType = 'goal' | 'saved' | 'blocked' | 'post' | 'wide' | 'technical'
export type TurnoverSubType =
  | 'bad_pass'
  | 'lost_dribble'
  | 'offensive_foul'
  | 'stepped'
  | 'double_dribble'
  | 'out_of_bounds'
  | 'shot_clock'
  | 'other'
export type SuspensionSubType = '2min' | 'yellow_card' | 'red_card' | 'blue_card' | 'disqualification'
export type FoulSubType = 'attacking_foul' | '7m_awarded' | 'passive_play_warning'
export type GoalkeeperSubType = 'save' | 'goal_conceded' | 'parry'
export type TimeoutSubType = 'team_timeout' | 'referee_timeout'
export type PeriodMarkerSubType = 'period_start' | 'period_end' | 'match_end'

export type EventSubType =
  | ShotSubType
  | TurnoverSubType
  | SuspensionSubType
  | FoulSubType
  | GoalkeeperSubType
  | TimeoutSubType
  | PeriodMarkerSubType

export type ShotSituation =
  | 'set_offense'
  | 'fast_break'
  | '7m_penalty'
  | 'counter_attack'
  | 'breakthrough'

export type EventLinkType = 'goalkeeper_response' | 'assist' | 'caused_by'

// Shot zones: 1–9 (EHF 9-zone goal face), 10 = wide/post, null = blocked
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

export interface Event {
  id: string // client-generated UUID
  match_id: string
  period: number
  match_clock: number | null // seconds elapsed from period start
  wall_clock: string // ISO 8601 timestamp — set at tap time
  team_id: string
  player_id: string | null
  event_type: EventType
  sub_type: EventSubType | null
  situation: ShotSituation | null
  zone: ShotZone | null
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
  client_id: string // same as id — idempotency key
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

// ─── Derived view types ───────────────────────────────────────────────────────

export interface PlayerShotStats {
  player_id: string
  match_id: string
  shots_attempted: number
  shots_on_target: number
  goals: number
  shot_efficiency: number // goals / shots_attempted
  on_target_pct: number
}

export interface ZoneShotStats {
  zone: ShotZone | null
  situation: ShotSituation | null
  shots_attempted: number
  goals: number
  efficiency: number
}

export interface GoalkeeperStats {
  goalkeeper_player_id: string
  match_id: string
  shots_faced: number
  saves: number
  goals_conceded: number
  save_pct: number
  saves_by_zone: Record<string, number>
}

export interface PlayerTurnoverStats {
  player_id: string
  match_id: string
  total_turnovers: number
  turnovers_by_type: Record<TurnoverSubType, number>
}

export interface PlayerSuspensionStats {
  player_id: string
  match_id: string
  total_2min: number
  total_minutes_suspended: number
  yellow_cards: number
  red_cards: number
}

// ─── UI / store types ─────────────────────────────────────────────────────────

/** Active match session state (lives in Zustand + IndexedDB) */
export interface MatchSession {
  match: Match
  homeTeam: Team
  awayTeam: Team
  trackedPlayers: (Player & { roster: Roster })[]
  opponentPlayers: (Player & { roster: Roster })[]
  events: Event[]
  currentPeriod: number
  periodStartedAt: string | null // wall clock when period started
  isOnline: boolean
}

/** Step in the live input flow */
export type InputStep =
  | { step: 'idle' }
  | { step: 'player_selected'; playerId: string; teamId: string }
  | { step: 'event_type_selected'; playerId: string | null; teamId: string; eventType: EventType }
  | {
      step: 'sub_type_selected'
      playerId: string | null
      teamId: string
      eventType: EventType
      subType: EventSubType
    }
  | {
      step: 'context_selected'
      playerId: string | null
      teamId: string
      eventType: EventType
      subType: EventSubType
      situation: ShotSituation | null
    }
