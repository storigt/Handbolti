import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMatchStore, selectActiveEvents, selectTrackedScore, selectOpponentScore, selectActiveSuspensions } from '@/store/matchStore'
import { finalizeMatch } from '@/lib/supabase/reportQueries'
import type { EventType, EventSubType, ShotSituation, ShotZone } from '@/lib/db/schema'

// ─── Player tile ──────────────────────────────────────────────────────────────

function PlayerTile({ name, jersey, isSelected, onSelect }: {
  playerId: string
  name: string
  jersey: number | null
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onPointerDown={onSelect}
      className={`
        flex flex-col items-center justify-center
        rounded-lg border-2 p-2 min-h-[72px] min-w-[72px]
        text-sm font-semibold select-none
        active:scale-95 transition-transform
        ${isSelected
          ? 'bg-blue-600 border-blue-700 text-white'
          : 'bg-white border-gray-300 text-gray-800 hover:border-blue-400'
        }
      `}
    >
      <span className="text-xl font-bold leading-none">{jersey ?? '?'}</span>
      <span className="mt-1 text-xs truncate max-w-[64px]">{name}</span>
    </button>
  )
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionButton({ label, color, onSelect }: {
  label: string
  color: string
  onSelect: () => void
}) {
  return (
    <button
      onPointerDown={onSelect}
      className={`
        px-4 py-4 rounded-lg text-white font-semibold text-base min-h-[56px]
        active:scale-95 transition-transform select-none ${color}
      `}
    >
      {label}
    </button>
  )
}

// ─── Zone picker ──────────────────────────────────────────────────────────────

const ZONE_LABELS: Record<number, string> = {
  1: 'Top L', 2: 'Top C', 3: 'Top R',
  4: 'Mid L', 5: 'Mid C', 6: 'Mid R',
  7: 'Bot L', 8: 'Bot C', 9: 'Bot R',
  10: 'Wide',
}

function ZonePicker({ onSelect }: { onSelect: (zone: ShotZone | null) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-600">Shot zone (optional)</p>
      <div className="grid grid-cols-3 gap-1 w-[220px]">
        {([1, 2, 3, 4, 5, 6, 7, 8, 9] as ShotZone[]).map((z) => (
          <button
            key={z}
            onPointerDown={() => onSelect(z)}
            className="h-14 rounded border-2 border-gray-300 bg-white text-xs font-semibold hover:border-blue-400 active:scale-95 transition-transform"
          >
            {ZONE_LABELS[z]}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <button
          onPointerDown={() => onSelect(10)}
          className="flex-1 h-10 rounded border-2 border-yellow-400 bg-yellow-50 text-xs font-semibold active:scale-95 transition-transform"
        >
          Wide / Post
        </button>
        <button
          onPointerDown={() => onSelect(null)}
          className="flex-1 h-10 rounded border-2 border-gray-200 bg-gray-50 text-xs text-gray-500 active:scale-95 transition-transform"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

// ─── Event type config ────────────────────────────────────────────────────────

const EVENT_TYPES: Array<{ type: EventType; label: string; color: string }> = [
  { type: 'SHOT',              label: 'Shot',        color: 'bg-green-600 hover:bg-green-700' },
  { type: 'TURNOVER',          label: 'Turnover',    color: 'bg-orange-500 hover:bg-orange-600' },
  { type: 'SUSPENSION',        label: 'Suspension',  color: 'bg-red-600 hover:bg-red-700' },
  { type: 'FOUL',              label: 'Foul',        color: 'bg-yellow-500 hover:bg-yellow-600' },
  { type: 'GOALKEEPER_ACTION', label: 'GK Action',   color: 'bg-purple-600 hover:bg-purple-700' },
  { type: 'TIMEOUT',           label: 'Timeout',     color: 'bg-gray-600 hover:bg-gray-700' },
]

const SUB_TYPES: Record<EventType, Array<{ sub: EventSubType; label: string }>> = {
  SHOT: [
    { sub: 'goal',      label: 'Goal' },
    { sub: 'saved',     label: 'Saved' },
    { sub: 'blocked',   label: 'Blocked' },
    { sub: 'post',      label: 'Post' },
    { sub: 'wide',      label: 'Wide' },
    { sub: 'technical', label: 'Technical' },
  ],
  TURNOVER: [
    { sub: 'bad_pass',       label: 'Bad pass' },
    { sub: 'lost_dribble',   label: 'Lost dribble' },
    { sub: 'offensive_foul', label: 'Off. foul' },
    { sub: 'stepped',        label: 'Stepped' },
    { sub: 'double_dribble', label: 'Dbl. dribble' },
    { sub: 'out_of_bounds',  label: 'Out of bounds' },
    { sub: 'shot_clock',     label: 'Shot clock' },
    { sub: 'other',          label: 'Other' },
  ],
  SUSPENSION: [
    { sub: '2min',             label: '2 min' },
    { sub: 'yellow_card',      label: 'Yellow card' },
    { sub: 'red_card',         label: 'Red card' },
    { sub: 'blue_card',        label: 'Blue card' },
    { sub: 'disqualification', label: 'DQ' },
  ],
  FOUL: [
    { sub: 'attacking_foul',      label: 'Att. foul' },
    { sub: '7m_awarded',          label: '7m awarded' },
    { sub: 'passive_play_warning', label: 'Passive play' },
  ],
  GOALKEEPER_ACTION: [
    { sub: 'save',          label: 'Save' },
    { sub: 'goal_conceded', label: 'Goal conceded' },
    { sub: 'parry',         label: 'Parry' },
  ],
  TIMEOUT: [
    { sub: 'team_timeout',    label: 'Team timeout' },
    { sub: 'referee_timeout', label: 'Ref timeout' },
  ],
  PERIOD_MARKER: [],
}

const SITUATIONS: Array<{ value: ShotSituation; label: string }> = [
  { value: 'set_offense',   label: 'Set offense' },
  { value: 'fast_break',    label: 'Fast break' },
  { value: '7m_penalty',    label: '7 metre' },
  { value: 'counter_attack', label: 'Counter' },
  { value: 'breakthrough',  label: 'Breakthrough' },
]

// ─── Score display ────────────────────────────────────────────────────────────

function ScoreBar() {
  const match = useMatchStore(s => s.match)
  const homeTeam = useMatchStore(s => s.homeTeam)
  const awayTeam = useMatchStore(s => s.awayTeam)
  const trackedScore = useMatchStore(selectTrackedScore)
  const opponentScore = useMatchStore(selectOpponentScore)
  const period = useMatchStore(s => s.currentPeriod)
  const isOnline = useMatchStore(s => s.isOnline)

  const isTrackedHome = match?.tracked_team_id === match?.home_team_id

  return (
    <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-2 h-14">
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
        <span className="text-xs text-slate-400">{isOnline ? 'Live' : 'Offline'}</span>
      </div>
      <div className="flex items-center gap-4 text-2xl font-bold tabular-nums">
        <span>{homeTeam?.short_name ?? 'HME'}</span>
        <span>
          {isTrackedHome ? trackedScore : opponentScore}
          {' – '}
          {isTrackedHome ? opponentScore : trackedScore}
        </span>
        <span>{awayTeam?.short_name ?? 'AWY'}</span>
      </div>
      <span className="text-sm text-slate-400">P{period}</span>
    </div>
  )
}

// ─── Recent events feed ───────────────────────────────────────────────────────

function RecentEventsFeed() {
  const events = useMatchStore(useShallow(selectActiveEvents))
  const trackedPlayers = useMatchStore(s => s.trackedPlayers)
  const voidEvent = useMatchStore(s => s.voidEvent)

  const recent = [...events].reverse().slice(0, 5)

  function getPlayerLabel(playerId: string | null) {
    if (!playerId) return '—'
    const p = trackedPlayers.find(p => p.id === playerId)
    return p ? `#${p.jersey_number ?? '?'} ${p.last_name}` : `…${playerId.slice(-4)}`
  }

  if (recent.length === 0) return null

  return (
    <div className="bg-slate-800 px-2 py-1 flex gap-2 overflow-x-auto">
      {recent.map(event => (
        <button
          key={event.client_id}
          onPointerDown={() => voidEvent(event.client_id)}
          className="flex-shrink-0 flex items-center gap-1 bg-slate-700 hover:bg-red-700 text-white text-xs rounded px-2 py-1 active:scale-95 transition-all"
          title="Tap to void"
        >
          <span className="font-medium">{event.event_type.replace('_', ' ')}</span>
          {event.sub_type && <span className="text-slate-300">· {event.sub_type.replace(/_/g, ' ')}</span>}
          <span className="text-slate-400">{getPlayerLabel(event.player_id)}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Suspension tracker ───────────────────────────────────────────────────────

function SuspensionTracker() {
  const suspensions = useMatchStore(useShallow(selectActiveSuspensions))
  const trackedPlayers = useMatchStore(s => s.trackedPlayers)
  const periodStartedAt = useMatchStore(s => s.periodStartedAt)

  if (suspensions.length === 0) return null

  const nowSecs = periodStartedAt
    ? Math.floor((Date.now() - new Date(periodStartedAt).getTime()) / 1000)
    : 0

  return (
    <div className="flex gap-2 px-2 py-1 bg-red-950 overflow-x-auto">
      {suspensions.map(susp => {
        const player = trackedPlayers.find(p => p.id === susp.player_id)
        const remaining = susp.endsAt !== null ? Math.max(0, (susp.endsAt as number) - nowSecs) : null
        const mins = remaining !== null ? Math.floor(remaining / 60) : null
        const secs = remaining !== null ? remaining % 60 : null
        return (
          <div key={susp.client_id} className="flex-shrink-0 flex items-center gap-1 text-xs text-red-200">
            <span className="font-bold">#{player?.jersey_number ?? '?'}</span>
            {remaining !== null && (
              <span className="tabular-nums">
                {mins}:{String(secs).padStart(2, '0')}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main EventLogger ─────────────────────────────────────────────────────────

function FinalizeButton() {
  const match = useMatchStore(s => s.match)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const setMatchFinalized = useMatchStore(s => s.setMatchFinalized)

  if (!match) return null

  if (confirming) {
    return (
      <div className="flex gap-1 items-center">
        <span className="text-xs text-gray-600">End match?</span>
        <button
          onPointerDown={async () => {
            setLoading(true)
            try {
              await finalizeMatch(match.id, match.tracked_team_id, match.home_team_id)
              setMatchFinalized()
            } finally {
              setLoading(false)
            }
          }}
          className="px-2 py-1 text-xs rounded bg-green-600 text-white font-semibold active:scale-95"
          disabled={loading}
        >
          {loading ? '…' : 'Yes'}
        </button>
        <button
          onPointerDown={() => setConfirming(false)}
          className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-700 active:scale-95"
        >
          No
        </button>
      </div>
    )
  }

  return (
    <button
      onPointerDown={() => setConfirming(true)}
      className="px-3 py-1 text-xs rounded bg-slate-700 text-white font-semibold active:scale-95 transition-transform"
    >
      End match
    </button>
  )
}

export function EventLogger() {
  const trackedPlayers = useMatchStore(s => s.trackedPlayers)
  const opponentPlayers = useMatchStore(s => s.opponentPlayers)
  const inputStep = useMatchStore(s => s.inputStep)
  const selectPlayer = useMatchStore(s => s.selectPlayer)
  const selectEventType = useMatchStore(s => s.selectEventType)
  const selectSubType = useMatchStore(s => s.selectSubType)
  const selectContext = useMatchStore(s => s.selectContext)
  const commitWithZone = useMatchStore(s => s.commitWithZone)
  const cancelInput = useMatchStore(s => s.cancelInput)
  const undoLast = useMatchStore(s => s.undoLast)
  const match = useMatchStore(s => s.match)

  const selectedPlayerId = inputStep.step !== 'idle' && 'playerId' in inputStep
    ? inputStep.playerId
    : null

  return (
    <div className="flex flex-col h-screen bg-gray-100 select-none">
      <ScoreBar />
      <SuspensionTracker />

      {/* Undo bar */}
      <div className="flex items-center justify-between px-4 py-1 bg-slate-100 border-b border-slate-200">
        <span className="text-xs text-slate-500">
          {inputStep.step === 'idle' ? 'Select player' : `Step: ${inputStep.step.replace(/_/g, ' ')}`}
        </span>
        <div className="flex gap-2">
          {inputStep.step !== 'idle' && (
            <button
              onPointerDown={cancelInput}
              className="px-3 py-1 text-xs rounded bg-gray-300 text-gray-700 active:scale-95 transition-transform"
            >
              Cancel
            </button>
          )}
          <button
            onPointerDown={undoLast}
            className="px-3 py-1 text-xs rounded bg-red-100 text-red-700 font-semibold active:scale-95 transition-transform"
          >
            UNDO
          </button>
          <FinalizeButton />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: roster */}
        <div className="w-[200px] bg-white border-r border-gray-200 flex flex-col overflow-y-auto p-2 gap-1 shrink-0">
          <p className="text-xs font-semibold text-slate-500 px-1 pt-1">TRACKED</p>
          {trackedPlayers.map(p => (
            <PlayerTile
              key={p.id}
              playerId={p.id}
              name={p.last_name}
              jersey={p.jersey_number}
              isSelected={selectedPlayerId === p.id}
              onSelect={() => selectPlayer(p.id, p.team_id)}
            />
          ))}
          {opponentPlayers.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-500 px-1 pt-2">OPPONENT</p>
              {opponentPlayers.map(p => (
                <PlayerTile
                  key={p.id}
                  playerId={p.id}
                  name={p.last_name}
                  jersey={p.jersey_number}
                  isSelected={selectedPlayerId === p.id}
                  onSelect={() => selectPlayer(p.id, p.team_id)}
                />
              ))}
            </>
          )}
          {/* Unattributed option for team events */}
          {match && (
            <PlayerTile
              playerId="__team__"
              name="Team"
              jersey={null}
              isSelected={selectedPlayerId === '__team__'}
              onSelect={() => selectPlayer('__team__', match.tracked_team_id)}
            />
          )}
        </div>

        {/* Right panel: action buttons */}
        <div className="flex-1 p-4 overflow-y-auto">
          {inputStep.step === 'idle' && (
            <p className="text-gray-400 text-sm mt-4">← Select a player to log an event</p>
          )}

          {inputStep.step === 'player_selected' && (
            <div className="grid grid-cols-2 gap-3">
              {EVENT_TYPES.map(({ type, label, color }) => (
                <ActionButton
                  key={type}
                  label={label}
                  color={color}
                  onSelect={() => selectEventType(type)}
                />
              ))}
            </div>
          )}

          {inputStep.step === 'event_type_selected' && (
            <div className="grid grid-cols-2 gap-3">
              {SUB_TYPES[inputStep.eventType].map(({ sub, label }) => (
                <ActionButton
                  key={sub}
                  label={label}
                  color="bg-slate-700 hover:bg-slate-800"
                  onSelect={() => selectSubType(sub)}
                />
              ))}
            </div>
          )}

          {inputStep.step === 'sub_type_selected' && inputStep.eventType === 'SHOT' && (
            <div className="flex flex-col gap-4">
              {/* Situation */}
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">Situation (optional)</p>
                <div className="flex flex-wrap gap-2">
                  {SITUATIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onPointerDown={() => selectContext(value)}
                      className="px-3 py-2 rounded border-2 border-gray-300 bg-white text-sm font-medium hover:border-blue-400 active:scale-95 transition-transform"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onPointerDown={() => selectContext(null)}
                    className="px-3 py-2 rounded border-2 border-gray-200 bg-gray-50 text-sm text-gray-400 active:scale-95 transition-transform"
                  >
                    Skip
                  </button>
                </div>
              </div>
            </div>
          )}

          {inputStep.step === 'sub_type_selected' && inputStep.eventType !== 'SHOT' && (
            // Non-shot events commit immediately after sub_type — no context needed
            <div className="flex items-center justify-center h-32">
              <button
                onPointerDown={() => selectContext(null)}
                className="px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-xl active:scale-95 transition-transform"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Zone picker overlay for shots after situation */}
      {inputStep.step === 'context_selected' && inputStep.eventType === 'SHOT' && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="bg-white rounded-xl p-4 shadow-xl">
            <ZonePicker onSelect={commitWithZone} />
          </div>
        </div>
      )}

      <RecentEventsFeed />
    </div>
  )
}

// Allow "team" player selection to map to null player_id
// This is handled in the store: player_id = '__team__' → null
