import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  Event,
  EventInsert,
  EventType,
  EventSubType,
  ShotSituation,
  ShotZone,
  Match,
  Team,
  Player,
  Roster,
  InputStep,
} from '@/lib/db/schema'
import { enqueue } from '@/lib/sync/syncQueue'
import { upsertEvent, voidEventWithSync } from '@/lib/sync/supabaseSync'

export interface RosteredPlayer extends Player {
  roster: Roster
}

interface MatchStoreState {
  // Session
  match: Match | null
  homeTeam: Team | null
  awayTeam: Team | null
  trackedPlayers: RosteredPlayer[]
  opponentPlayers: RosteredPlayer[]
  events: Event[]
  currentPeriod: number
  periodStartedAt: string | null
  isOnline: boolean

  // Live input flow
  inputStep: InputStep

  // Actions
  setMatchFinalized: () => void
  clearSession: () => void
  setSession: (data: {
    match: Match
    homeTeam: Team
    awayTeam: Team
    trackedPlayers: RosteredPlayer[]
    opponentPlayers: RosteredPlayer[]
  }) => void
  setOnline: (online: boolean) => void
  startPeriod: (period: number) => void

  // Input flow
  selectPlayer: (playerId: string, teamId: string) => void
  selectEventType: (eventType: EventType) => void
  selectSubType: (subType: EventSubType) => void
  selectContext: (situation: ShotSituation | null) => void
  commitWithZone: (zone: ShotZone | null) => void
  cancelInput: () => void

  // Event management
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
  inputStep: { step: 'idle' },

  setMatchFinalized: () =>
    set(state => ({ match: state.match ? { ...state.match, status: 'final' } : null })),
  clearSession: () =>
    set({ match: null, homeTeam: null, awayTeam: null, trackedPlayers: [], opponentPlayers: [], events: [], inputStep: { step: 'idle' } }),
  setSession: (data) => set({ ...data, events: [], currentPeriod: 1, periodStartedAt: null }),
  setOnline: (online) => set({ isOnline: online }),

  startPeriod: (period) => {
    const { match, currentPeriod } = get()
    if (!match) return
    const now = new Date().toISOString()
    set({ currentPeriod: period, periodStartedAt: now })
    get().commitEvent({
      event_type: 'PERIOD_MARKER',
      sub_type: period === 1 ? 'period_start' : 'period_start',
      period: period,
      player_id: null,
      team_id: match.tracked_team_id,
    })
    void currentPeriod // suppress unused warning
  },

  selectPlayer: (playerId, teamId) =>
    set({ inputStep: { step: 'player_selected', playerId, teamId } }),

  selectEventType: (eventType) => {
    const { inputStep } = get()
    if (inputStep.step !== 'player_selected') return
    set({
      inputStep: {
        step: 'event_type_selected',
        playerId: inputStep.playerId,
        teamId: inputStep.teamId,
        eventType,
      },
    })
  },

  selectSubType: (subType) => {
    const { inputStep } = get()
    if (inputStep.step !== 'event_type_selected') return
    set({
      inputStep: {
        step: 'sub_type_selected',
        playerId: inputStep.playerId,
        teamId: inputStep.teamId,
        eventType: inputStep.eventType,
        subType,
      },
    })
  },

  selectContext: (situation) => {
    const { inputStep } = get()
    if (inputStep.step !== 'sub_type_selected') return
    if (inputStep.eventType === 'SHOT') {
      // For shots: go to context_selected so zone picker can render
      set({
        inputStep: {
          step: 'context_selected',
          playerId: inputStep.playerId,
          teamId: inputStep.teamId,
          eventType: inputStep.eventType,
          subType: inputStep.subType,
          situation,
        },
      })
    } else {
      get().commitEvent({
        event_type: inputStep.eventType,
        sub_type: inputStep.subType,
        player_id: inputStep.playerId,
        team_id: inputStep.teamId,
        situation,
        zone: null,
      })
    }
  },

  commitWithZone: (zone) => {
    const { inputStep } = get()
    if (inputStep.step !== 'context_selected') return
    get().commitEvent({
      event_type: inputStep.eventType,
      sub_type: inputStep.subType,
      player_id: inputStep.playerId,
      team_id: inputStep.teamId,
      situation: inputStep.situation,
      zone,
    })
  },

  cancelInput: () => set({ inputStep: { step: 'idle' } }),

  commitEvent: (overrides = {}) => {
    const { match, currentPeriod, periodStartedAt, events } = get()
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
      wall_clock: now,
      team_id: match.tracked_team_id,
      player_id: null,
      event_type: 'SHOT',
      sub_type: null,
      situation: null,
      zone: null,
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

    // 1. Update local state immediately
    set({ events: [...events, event], inputStep: { step: 'idle' } })

    // 2. Write to IndexedDB sync queue
    void enqueue(event as EventInsert)

    // 3. Try to push to Supabase (non-blocking — failure handled by queue)
    if (navigator.onLine) {
      void upsertEvent(event as EventInsert).catch(() => {
        // Already in queue; will retry on next flush
      })
    }
  },

  undoLast: () => {
    const { events } = get()
    const lastActive = [...events]
      .reverse()
      .find((e) => !e.is_voided)
    if (!lastActive) return
    get().voidEvent(lastActive.client_id)
  },

  voidEvent: (clientId) => {
    set((state) => ({
      events: state.events.map((e) =>
        e.client_id === clientId
          ? { ...e, is_voided: true, voided_at: new Date().toISOString() }
          : e,
      ),
    }))
    void voidEventWithSync(clientId).catch(() => {
      // Void will be retried — local state already reflects it
    })
  },
}))

// ─── Derived selectors ────────────────────────────────────────────────────────

export const selectActiveEvents = (state: MatchStoreState) =>
  state.events.filter((e) => !e.is_voided && !e.is_edited)

export const selectTrackedScore = (state: MatchStoreState) =>
  selectActiveEvents(state).filter(
    (e) => e.event_type === 'SHOT' && e.sub_type === 'goal' && e.team_id === state.match?.tracked_team_id,
  ).length

export const selectOpponentScore = (state: MatchStoreState) =>
  selectActiveEvents(state).filter(
    (e) => e.event_type === 'SHOT' && e.sub_type === 'goal' && e.team_id !== state.match?.tracked_team_id,
  ).length

export const selectActiveSuspensions = (state: MatchStoreState) => {
  const active = selectActiveEvents(state)
  return active
    .filter((e) => e.event_type === 'SUSPENSION' && e.sub_type === '2min')
    .map((e) => ({
      ...e,
      endsAt: e.match_clock !== null
        ? e.match_clock + 120 // 2 minutes in seconds
        : null,
    }))
}
