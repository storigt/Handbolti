import { create } from 'zustand'

// ─── Session persistence ──────────────────────────────────────────────────────

const SAVED_SESSION_KEY = 'handbolti_active_match_v1'

export interface SavedSession {
  matchId: string
  period: number
  matchMinute: number
  lineupPlayerIds: string[]
  lineupId: string | null
}

export function getSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SAVED_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedSession
  } catch { return null }
}

function persistSession(state: MatchStoreState) {
  if (!state.match) return
  const saved: SavedSession = {
    matchId: state.match.id,
    period: state.currentPeriod,
    matchMinute: state.currentMatchMinute,
    lineupPlayerIds: state.currentLineupPlayerIds,
    lineupId: state.currentLineupId,
  }
  localStorage.setItem(SAVED_SESSION_KEY, JSON.stringify(saved))
}

function clearPersistedSession() {
  localStorage.removeItem(SAVED_SESSION_KEY)
}
import { v4 as uuidv4 } from 'uuid'
import type {
  Event,
  EventInsert,
  Match,
  Team,
  Player,
  Roster,
} from '@/lib/db/schema'
import { enqueue, enqueueLineup } from '@/lib/sync/syncQueue'
import { syncPendingEvents } from '@/lib/sync/supabaseSync'

/** Save an event to the offline queue first, then try to upload it.
 *  The queue is the safety net: if the upload fails it is retried later. */
function queueAndSync(event: EventInsert) {
  void enqueue(event)
    .then(() => { if (navigator.onLine) void syncPendingEvents().catch(() => {}) })
    .catch(() => {})
}

export interface RosteredPlayer extends Player {
  roster: Roster
}

interface MatchStoreState {
  // Session data
  match: Match | null
  homeTeam: Team | null
  awayTeam: Team | null
  trackedPlayers: RosteredPlayer[]
  opponentPlayers: RosteredPlayer[]
  events: Event[]
  currentPeriod: number
  periodStartedAt: string | null
  isOnline: boolean

  // Live match context — set by operator during the match
  currentMatchMinute: number
  currentLineupId: string | null
  currentLineupPlayerIds: string[]  // player IDs currently on court

  // Session actions
  setMatchFinalized: () => void
  clearSession: () => void
  setSession: (data: {
    match: Match
    homeTeam: Team
    awayTeam: Team
    trackedPlayers: RosteredPlayer[]
    opponentPlayers: RosteredPlayer[]
  }) => void
  resumeSession: (data: {
    match: Match
    homeTeam: Team
    awayTeam: Team
    trackedPlayers: RosteredPlayer[]
    opponentPlayers: RosteredPlayer[]
    events: Event[]
    period: number
    matchMinute: number
    lineupPlayerIds: string[]
    lineupId: string | null
  }) => void
  setOnline: (online: boolean) => void
  startPeriod: (period: number) => void
  setMatchMinute: (minute: number) => void

  // Lineup / substitution
  initLineup: (playerIds: string[]) => Promise<void>
  logSubstitution: (playerInId: string, playerOutId: string) => Promise<void>

  // Event actions
  logAttack: (teamId: string) => void
  commitEvent: (overrides?: Partial<EventInsert>) => void
  undoLast: () => void
  voidEvent: (clientId: string) => void
}

export const useMatchStore = create<MatchStoreState>((set, get) => ({
  match: null,
  homeTeam: null,
  awayTeam: null,
  trackedPlayers: [],
  opponentPlayers: [],
  events: [],
  currentPeriod: 1,
  periodStartedAt: null,
  isOnline: navigator.onLine,
  currentMatchMinute: 0,
  currentLineupId: null,
  currentLineupPlayerIds: [],

  setMatchFinalized: () => {
    clearPersistedSession()
    set(state => ({ match: state.match ? { ...state.match, status: 'final' } : null }))
  },

  clearSession: () => {
    clearPersistedSession()
    set({
      match: null,
      homeTeam: null,
      awayTeam: null,
      trackedPlayers: [],
      opponentPlayers: [],
      events: [],
      currentMatchMinute: 0,
      currentLineupId: null,
      currentLineupPlayerIds: [],
    })
  },

  setSession: (data) => {
    const starterIds = data.trackedPlayers
      .filter(p => p.roster.is_starter)
      .map(p => p.id)
    set({ ...data, events: [], currentPeriod: 1, periodStartedAt: null, currentMatchMinute: 0, currentLineupId: null, currentLineupPlayerIds: starterIds })
  },

  resumeSession: (data) => {
    set({
      match: data.match,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      trackedPlayers: data.trackedPlayers,
      opponentPlayers: data.opponentPlayers,
      events: data.events,
      currentPeriod: data.period,
      periodStartedAt: null,
      currentMatchMinute: data.matchMinute,
      currentLineupId: data.lineupId,
      currentLineupPlayerIds: data.lineupPlayerIds,
    })
  },

  setOnline: (online) => set({ isOnline: online }),

  startPeriod: (period) => {
    const { match } = get()
    if (!match) return
    const now = new Date().toISOString()
    set({ currentPeriod: period, periodStartedAt: now })
    get().commitEvent({
      event_type: 'PERIOD_MARKER',
      sub_type: 'period_start',
      period,
      player_id: null,
      team_id: match.tracked_team_id,
    })
  },

  setMatchMinute: (minute) => set({ currentMatchMinute: minute }),

  initLineup: async (playerIds) => {
    const { match, currentPeriod, currentMatchMinute } = get()
    if (!match) return
    // Lineup id is generated here so events can reference it right away, even
    // offline. The row is queued and uploaded before any event that uses it.
    const lineupId = uuidv4()
    set({ currentLineupPlayerIds: playerIds, currentLineupId: lineupId })
    await enqueueLineup({ id: lineupId, match_id: match.id, period: currentPeriod, match_minute: currentMatchMinute, player_ids: playerIds })
    if (navigator.onLine) void syncPendingEvents().catch(() => {})
  },

  logSubstitution: async (playerInId, playerOutId) => {
    const { match, currentPeriod, currentMatchMinute, currentLineupPlayerIds } = get()
    if (!match) return

    const newPlayerIds = currentLineupPlayerIds
      .filter(id => id !== playerOutId)
      .concat(playerInId)

    // Update local state immediately so the panel reflects the change at once.
    // The new lineup gets a client-generated id and is queued for upload, so
    // the substitution is recorded even when offline.
    const lineupId = uuidv4()
    set({ currentLineupPlayerIds: newPlayerIds, currentLineupId: lineupId })
    await enqueueLineup({ id: lineupId, match_id: match.id, period: currentPeriod, match_minute: currentMatchMinute, player_ids: newPlayerIds })

    get().commitEvent({
      event_type: 'SUBSTITUTION',
      sub_type: null,
      player_id: playerInId,
      team_id: match.tracked_team_id,
      context: { player_out_id: playerOutId },
      lineup_id: lineupId,
    })
  },

  logAttack: (teamId) => {
    get().commitEvent({ event_type: 'ATTACK', player_id: null, team_id: teamId })
  },

  commitEvent: (overrides = {}) => {
    const { match, currentPeriod, periodStartedAt, events, currentMatchMinute, currentLineupId } = get()
    if (!match) return

    const now = new Date().toISOString()
    const matchClockSecs = periodStartedAt
      ? Math.floor((Date.now() - new Date(periodStartedAt).getTime()) / 1000)
      : null

    const clientId = uuidv4()
    const event: Event = {
      id: clientId,
      client_id: clientId,
      match_id: match.id,
      period: currentPeriod,
      match_clock: matchClockSecs,
      match_minute: currentMatchMinute,
      wall_clock: now,
      team_id: match.tracked_team_id,
      player_id: null,
      event_type: 'SHOT',
      sub_type: null,
      shot_range: null,
      phase_type: null,
      numerical_state: null,
      zone: null,
      lineup_id: currentLineupId,
      context: {},
      is_voided: false,
      void_reason: null,
      voided_at: null,
      voided_by: null,
      is_edited: false,
      replaced_by: null,
      original_id: null,
      created_by: null,
      created_at: now,
      synced_at: null,
      ...overrides,
    }

    set({ events: [...events, event] })
    queueAndSync(event as EventInsert)
  },

  undoLast: () => {
    const { events } = get()
    const lastActive = [...events].reverse().find(e => !e.is_voided)
    if (!lastActive) return
    get().voidEvent(lastActive.client_id)
  },

  voidEvent: (clientId) => {
    const target = get().events.find(e => e.client_id === clientId)
    if (!target || target.is_voided) return
    const voided: Event = {
      ...target,
      is_voided: true,
      void_reason: 'operator_undo',
      voided_at: new Date().toISOString(),
    }
    set(state => ({
      events: state.events.map(e => (e.client_id === clientId ? voided : e)),
    }))
    // Queue the voided version (replacing any unsent original) and upload it.
    // Upserting the full row works whether or not the original already reached
    // the server, and the queue keeps it safe if we're offline.
    queueAndSync(voided as EventInsert)
  },
}))

// Auto-persist the active match session to localStorage on every state change
useMatchStore.subscribe((state) => {
  if (state.match && state.match.status === 'in_progress') {
    persistSession(state)
  }
})

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectActiveEvents = (state: MatchStoreState) =>
  state.events.filter(e => !e.is_voided && !e.is_edited)

export const selectTrackedScore = (state: MatchStoreState) =>
  selectActiveEvents(state).filter(
    e => e.event_type === 'SHOT' && e.sub_type === 'goal' && e.team_id === state.match?.tracked_team_id,
  ).length

export const selectOpponentScore = (state: MatchStoreState) =>
  selectActiveEvents(state).filter(e => {
    const trackedId = state.match?.tracked_team_id
    return (
      // Opponent scored via attacking flow
      (e.event_type === 'SHOT' && e.sub_type === 'goal' && e.team_id !== trackedId) ||
      // Opponent scored via GK flow (goal_conceded on tracked GK)
      (e.event_type === 'GOALKEEPER_ACTION' && e.sub_type === 'goal_conceded' && e.team_id === trackedId)
    )
  }).length

export const selectActiveSuspensions = (state: MatchStoreState) =>
  selectActiveEvents(state).filter(e => e.event_type === 'SUSPENSION' && e.sub_type === '2min')
