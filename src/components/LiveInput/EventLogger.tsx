import { useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  useMatchStore,
  selectActiveEvents, selectTrackedScore, selectOpponentScore,
} from '@/store/matchStore'
import type { RosteredPlayer } from '@/store/matchStore'
import { finalizeMatch } from '@/lib/supabase/reportQueries'
import type { ShotRange, PhaseType, NumericalState, ShotZone, EventInsert } from '@/lib/db/schema'

// ─── Local flow state ─────────────────────────────────────────────────────────

type FlowStep =
  | { s: 'idle' }
  | { s: 'category'; pid: string; tid: string }
  // ── Attack ──────────────────────────────────────────────────────────────────
  | { s: 'atk_sub'; pid: string; tid: string }
  | { s: 'atk_shot_origin'; pid: string; tid: string }
  | { s: 'atk_shot_range'; pid: string; tid: string; origin: string }
  | { s: 'atk_shot_phase'; pid: string; tid: string; origin: string; range: ShotRange }
  | { s: 'atk_shot_numerical'; pid: string; tid: string; origin: string; range: ShotRange; phase: PhaseType }
  | { s: 'atk_shot_assist'; pid: string; tid: string; origin: string; range: ShotRange; phase: PhaseType; numerical: NumericalState }
  | { s: 'atk_shot_vitasending'; pid: string; tid: string; origin: string; phase: PhaseType; numerical: NumericalState }
  | { s: 'atk_shot_fiskad_viti'; pid: string; tid: string; origin: string; phase: PhaseType; numerical: NumericalState; vitasendingId: string | null }
  | { s: 'atk_shot_zone'; pid: string; tid: string; origin: string; range: ShotRange; phase: PhaseType; numerical: NumericalState; assistId: string | null; vitasendingId: string | null; fiskadVitiId: string | null }
  | { s: 'atk_shot_outcome'; pid: string; tid: string; origin: string; range: ShotRange; phase: PhaseType; numerical: NumericalState; assistId: string | null; vitasendingId: string | null; fiskadVitiId: string | null; zone: ShotZone }
  | { s: 'atk_shot_hand_up'; pid: string; tid: string; origin: string; range: ShotRange; phase: PhaseType; numerical: NumericalState; assistId: string | null; vitasendingId: string | null; fiskadVitiId: string | null; zone: ShotZone; subType: 'goal' | 'saved' }
  | { s: 'atk_other'; pid: string; tid: string }
  | { s: 'atk_turnover'; pid: string; tid: string }
  // ── GK ──────────────────────────────────────────────────────────────────────
  | { s: 'gk_sub'; pid: string; tid: string }
  | { s: 'gk_shot_origin'; pid: string; tid: string }
  | { s: 'gk_shot_range'; pid: string; tid: string; origin: string }
  | { s: 'gk_shot_phase'; pid: string; tid: string; origin: string; range: ShotRange }
  | { s: 'gk_shot_numerical'; pid: string; tid: string; origin: string; range: ShotRange; phase: PhaseType }
  | { s: 'gk_shot_zone'; pid: string; tid: string; origin: string; range: ShotRange; phase: PhaseType; numerical: NumericalState }
  | { s: 'gk_shot_outcome'; pid: string; tid: string; origin: string; range: ShotRange; phase: PhaseType; numerical: NumericalState; zone: ShotZone }
  | { s: 'gk_shot_hand_up'; pid: string; tid: string; origin: string; range: ShotRange; phase: PhaseType; numerical: NumericalState; zone: ShotZone; subType: 'save' | 'goal_conceded' }
  | { s: 'gk_other'; pid: string; tid: string }
  // ── Defense ─────────────────────────────────────────────────────────────────
  | { s: 'def_sub'; pid: string; tid: string }
  | { s: 'def_brot_type'; pid: string; tid: string }
  | { s: 'def_brot_card'; pid: string; tid: string; foulSub: 'attacking_foul' | '7m_awarded' }
  | { s: 'def_other'; pid: string; tid: string }
  | { s: 'def_duel_outcome'; pid: string; tid: string }
  | { s: 'def_refsing'; pid: string; tid: string }
  // ── Substitution ─────────────────────────────────────────────────────────────
  | { s: 'sub_pick_in' }
  | { s: 'sub_pick_out'; playerInId: string }

// ─── Option data ──────────────────────────────────────────────────────────────

const RANGES: { v: ShotRange; label: string }[] = [
  { v: 'penalty',     label: 'Víti' },
  { v: 'corner_wing', label: 'Horn' },
  { v: '9m_plus',     label: '9m+' },
  { v: '7_8m',        label: '7–8m' },
  { v: '6m',          label: '6m' },
  { v: 'line',        label: 'Lína' },
]

const PHASES: { v: PhaseType; label: string }[] = [
  { v: 'fast_break',  label: 'Hraðaupphlaup' },
  { v: 'second_wave', label: 'Seinni bylgja' },
  { v: 'set_play',    label: 'Uppstilltur leikur' },
]

const ATK_NUMERICALS: { v: NumericalState; label: string }[] = [
  { v: '6v6',         label: '6 á 6' },
  { v: 'inferiority', label: 'Undirtala' },
  { v: 'superiority', label: 'Yfirtala' },
  { v: '7v6',         label: '7 á 6' },
]

const GK_NUMERICALS: { v: NumericalState; label: string }[] = [
  { v: '6v6',         label: '6 á 6' },
  { v: 'inferiority', label: 'Undirtala' },
  { v: 'superiority', label: 'Yfirtala' },
  { v: '6v7',         label: '6 á 7' },
]

const ORIGINS: { v: string; label: string }[] = [
  { v: 'left_wing',    label: 'Vinstra Horn' },
  { v: 'left_center',  label: 'Vinstri Skytta' },
  { v: 'center',       label: 'Vinstri Miðja' },
  { v: 'right_center', label: 'Hægri Miðja' },
  { v: 'right_wing',   label: 'Hægri Skytta' },
  { v: 'line',         label: 'Hægra Horn' },
  { v: 'other',        label: 'Annað (Árás)' },
]

const ORIGIN_LABEL: Record<string, string> = {
  left_wing: 'Vinstra Horn', left_center: 'Vinstri Skytta', center: 'Vinstri Miðja',
  right_center: 'Hægri Miðja', right_wing: 'Hægri Skytta', line: 'Hægra Horn', other: 'Annað (Árás)',
}

const RANGE_LABEL: Record<ShotRange, string> = {
  penalty: 'Víti', corner_wing: 'Horn', '9m_plus': '9m+',
  '7_8m': '7–8m', '6m': '6m', line: 'Lína',
}
const PHASE_LABEL: Record<PhaseType, string> = {
  fast_break: 'Hraðaupphlaup', second_wave: 'Seinni bylgja', set_play: 'Uppstilltur leikur',
}
const NUMERICAL_LABEL: Record<NumericalState, string> = {
  '6v6': '6á6', inferiority: 'Undirtala', superiority: 'Yfirtala', '7v6': '7á6', '6v7': '6á7',
}

// ─── Primitive UI helpers ─────────────────────────────────────────────────────

function Btn({ label, color = 'bg-slate-700', onTap, size = 'md', full = false }: {
  label: string; color?: string; onTap: () => void; size?: 'sm' | 'md' | 'lg'; full?: boolean
}) {
  const sz = size === 'lg' ? 'py-5 text-lg' : size === 'sm' ? 'py-2 text-sm' : 'py-4 text-base'
  return (
    <button
      onPointerDown={onTap}
      className={`${color} ${full ? 'w-full' : ''} text-white font-semibold rounded-xl ${sz} px-3
        active:scale-95 transition-transform select-none`}
    >
      {label}
    </button>
  )
}

function Breadcrumb({ items }: { items: (string | undefined)[] }) {
  const parts = items.filter(Boolean) as string[]
  if (!parts.length) return null
  return (
    <div className="flex gap-1 flex-wrap mb-3">
      {parts.map((p, i) => (
        <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p}</span>
      ))}
    </div>
  )
}

function StepTitle({ children }: { children: string }) {
  return <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{children}</p>
}

function PlayerPickerGrid({ players, onPick, onNone, noneLabel = 'Enginn' }: {
  players: RosteredPlayer[]
  onPick: (id: string) => void
  onNone: () => void
  noneLabel?: string
}) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {players.map(p => (
          <button
            key={p.id}
            onPointerDown={() => onPick(p.id)}
            className="flex flex-col items-center py-2 px-1 rounded-xl border-2 border-gray-200 bg-white
              hover:border-blue-400 active:scale-95 transition-transform"
          >
            <span className="text-lg font-bold leading-none">{p.jersey_number ?? '?'}</span>
            <span className="text-xs text-gray-500 truncate w-full text-center mt-0.5">{p.last_name}</span>
          </button>
        ))}
      </div>
      <button
        onPointerDown={onNone}
        className="w-full py-2 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-400
          bg-gray-50 active:scale-95 transition-transform"
      >
        {noneLabel}
      </button>
    </div>
  )
}

function ZoneGrid({ onZone, onBlocked, onWide, onPost }: {
  onZone: (z: ShotZone) => void
  onBlocked?: () => void
  onWide: () => void
  onPost: () => void
}) {
  const zones: ShotZone[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const labels: Record<number, string> = {
    1: 'Efst V', 2: 'Efst M', 3: 'Efst H',
    4: 'Miðj V', 5: 'Miðj M', 6: 'Miðj H',
    7: 'Neðst V', 8: 'Neðst M', 9: 'Neðst H',
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-3 gap-1">
        {zones.map(z => (
          <button
            key={z}
            onPointerDown={() => onZone(z)}
            className="h-14 rounded-xl border-2 border-green-300 bg-green-50 text-xs font-semibold
              text-green-800 hover:bg-green-100 active:scale-95 transition-transform"
          >
            {labels[z]}
          </button>
        ))}
      </div>
      <div className={`grid ${onBlocked ? 'grid-cols-3' : 'grid-cols-2'} gap-1 mt-1`}>
        {onBlocked && (
          <button onPointerDown={onBlocked}
            className="py-3 rounded-xl border-2 border-slate-300 bg-slate-50 text-xs font-semibold text-slate-600
              active:scale-95 transition-transform">
            Blokkað
          </button>
        )}
        <button onPointerDown={onPost}
          className="py-3 rounded-xl border-2 border-yellow-300 bg-yellow-50 text-xs font-semibold text-yellow-700
            active:scale-95 transition-transform">
          Stöng
        </button>
        <button onPointerDown={onWide}
          className="py-3 rounded-xl border-2 border-yellow-300 bg-yellow-50 text-xs font-semibold text-yellow-700
            active:scale-95 transition-transform">
          Framhjá
        </button>
      </div>
    </div>
  )
}

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

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
    <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-2 h-14 shrink-0">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
        <span className="text-xs text-slate-400">{isOnline ? 'Live' : 'Offline'}</span>
      </div>
      <div className="flex items-center gap-4 text-2xl font-bold tabular-nums">
        <span>{homeTeam?.name ?? 'Heimalið'}</span>
        <span>
          {isTrackedHome ? trackedScore : opponentScore}
          {' – '}
          {isTrackedHome ? opponentScore : trackedScore}
        </span>
        <span>{awayTeam?.name ?? 'Gestir'}</span>
      </div>
      <span className="text-sm text-slate-400">Leikhluti {period}</span>
    </div>
  )
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function TopBar({ flow, setFlow }: { flow: FlowStep; setFlow: (f: FlowStep) => void }) {
  const match = useMatchStore(s => s.match)
  const minute = useMatchStore(s => s.currentMatchMinute)
  const setMinute = useMatchStore(s => s.setMatchMinute)
  const logAttack = useMatchStore(s => s.logAttack)
  const undoLast = useMatchStore(s => s.undoLast)
  const setMatchFinalized = useMatchStore(s => s.setMatchFinalized)
  const trackedScore = useMatchStore(selectTrackedScore)
  const opponentScore = useMatchStore(selectOpponentScore)
  const events = useMatchStore(useShallow(selectActiveEvents))
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!match) return null
  const opponentTeamId = match.tracked_team_id === match.home_team_id ? match.away_team_id : match.home_team_id
  const trackedAttacks = events.filter(e => e.event_type === 'ATTACK' && e.team_id === match.tracked_team_id).length
  const opponentAttacks = events.filter(e => e.event_type === 'ATTACK' && e.team_id === opponentTeamId).length

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 border-b border-slate-200 flex-wrap shrink-0">

      {/* Minute counter */}
      <div className="flex items-center gap-0.5 bg-white rounded-lg border border-gray-300 overflow-hidden">
        <button onPointerDown={() => setMinute(Math.max(0, minute - 1))}
          className="px-2 py-1.5 text-base font-bold text-gray-600 hover:bg-gray-100 active:scale-95">−</button>
        <span className="w-9 text-center font-bold text-sm tabular-nums">{minute}'</span>
        <button onPointerDown={() => setMinute(minute + 1)}
          className="px-2 py-1.5 text-base font-bold text-gray-600 hover:bg-gray-100 active:scale-95">+</button>
      </div>

      {/* Attack counters */}
      <button onPointerDown={() => logAttack(match.tracked_team_id)}
        className="flex items-center gap-1.5 bg-green-600 text-white rounded-lg px-3 py-1.5 text-sm font-semibold
          active:scale-95 transition-transform select-none">
        Sókn
        <span className="bg-green-800 rounded-full w-5 h-5 flex items-center justify-center text-xs tabular-nums">
          {trackedAttacks}
        </span>
      </button>
      <button onPointerDown={() => logAttack(opponentTeamId)}
        className="flex items-center gap-1.5 bg-orange-500 text-white rounded-lg px-3 py-1.5 text-sm font-semibold
          active:scale-95 transition-transform select-none">
        Vörn
        <span className="bg-orange-700 rounded-full w-5 h-5 flex items-center justify-center text-xs tabular-nums">
          {opponentAttacks}
        </span>
      </button>

      {/* Substitution */}
      <button onPointerDown={() => setFlow({ s: 'sub_pick_in' })}
        className="bg-slate-600 text-white rounded-lg px-3 py-1.5 text-sm font-semibold
          active:scale-95 transition-transform select-none">
        Skipti
      </button>

      {/* Undo */}
      <button onPointerDown={undoLast}
        className="bg-red-100 text-red-700 border border-red-200 rounded-lg px-3 py-1.5 text-sm font-semibold
          active:scale-95 transition-transform select-none">
        Undo
      </button>

      {/* End match */}
      {confirming ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Ljúka leik?</span>
          <button
            onPointerDown={async () => {
              setLoading(true)
              try {
                const isTrackedHome = match.home_team_id === match.tracked_team_id
                const homeScore = isTrackedHome ? trackedScore : opponentScore
                const awayScore = isTrackedHome ? opponentScore : trackedScore
                await finalizeMatch(match.id, homeScore, awayScore)
                setMatchFinalized()
              } finally { setLoading(false) }
            }}
            disabled={loading}
            className="bg-green-600 text-white rounded-lg px-3 py-1.5 text-sm font-semibold active:scale-95">
            {loading ? '…' : 'Já'}
          </button>
          <button onPointerDown={() => setConfirming(false)}
            className="bg-gray-200 text-gray-700 rounded-lg px-3 py-1.5 text-sm active:scale-95">
            Nei
          </button>
        </div>
      ) : (
        <button onPointerDown={() => setConfirming(true)}
          className="bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm font-semibold
            active:scale-95 transition-transform select-none">
          Ljúka
        </button>
      )}

      {/* Cancel current flow */}
      {flow.s !== 'idle' && (
        <button onPointerDown={() => setFlow({ s: 'idle' })}
          className="ml-auto bg-gray-200 text-gray-600 rounded-lg px-3 py-1.5 text-sm
            active:scale-95 transition-transform select-none">
          Hætta við
        </button>
      )}
    </div>
  )
}

// ─── RecentEventsFeed ─────────────────────────────────────────────────────────

function RecentEventsFeed() {
  const events = useMatchStore(useShallow(selectActiveEvents))
  const trackedPlayers = useMatchStore(s => s.trackedPlayers)
  const voidEvent = useMatchStore(s => s.voidEvent)
  const recent = [...events].reverse().slice(0, 8)
  if (!recent.length) return null
  function playerLabel(pid: string | null) {
    if (!pid) return '—'
    const p = trackedPlayers.find(p => p.id === pid)
    return p ? `#${p.jersey_number ?? '?'} ${p.last_name}` : `…${pid.slice(-4)}`
  }
  return (
    <div className="bg-slate-800 px-2 py-1.5 flex gap-2 overflow-x-auto shrink-0">
      {recent.map(e => (
        <button
          key={e.client_id}
          onPointerDown={() => voidEvent(e.client_id)}
          title="Tap to void"
          className="flex-shrink-0 flex items-center gap-1 bg-slate-700 hover:bg-red-700 text-white text-xs
            rounded-lg px-2 py-1 active:scale-95 transition-all"
        >
          <span className="font-medium">{e.event_type.replace(/_/g, ' ')}</span>
          {e.sub_type && <span className="text-slate-300">· {e.sub_type.replace(/_/g, ' ')}</span>}
          <span className="text-slate-400">{playerLabel(e.player_id)}</span>
        </button>
      ))}
    </div>
  )
}

// ─── FlowPanel ────────────────────────────────────────────────────────────────

function FlowPanel({ flow, setFlow }: { flow: FlowStep; setFlow: (f: FlowStep) => void }) {
  const match = useMatchStore(s => s.match)
  const trackedPlayers = useMatchStore(s => s.trackedPlayers)
  const lineupPlayerIds = useMatchStore(s => s.currentLineupPlayerIds)
  const commitEvent = useMatchStore(s => s.commitEvent)
  const logSubstitution = useMatchStore(s => s.logSubstitution)

  const onCourt = trackedPlayers.filter(p => lineupPlayerIds.includes(p.id))
  const onBench  = trackedPlayers.filter(p => !lineupPlayerIds.includes(p.id))

  const opponentTeamId = match
    ? (match.tracked_team_id === match.home_team_id ? match.away_team_id : match.home_team_id)
    : ''

  function done(o: Partial<EventInsert>) {
    commitEvent(o)
    setFlow({ s: 'idle' })
  }

  function playerLabel(pid: string) {
    const p = trackedPlayers.find(p => p.id === pid)
    return p ? `#${p.jersey_number} ${p.last_name}` : '?'
  }

  // ── idle ─────────────────────────────────────────────────────────────────────
  if (flow.s === 'idle') {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm select-none">
        ← Veldu leikmann til að hefja skráningu
      </div>
    )
  }

  // ── category ─────────────────────────────────────────────────────────────────
  if (flow.s === 'category') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Veldu flokk</StepTitle>
        <div className="grid grid-cols-3 gap-3">
          <Btn color="bg-green-600"  label="Sókn"      size="lg" onTap={() => setFlow({ s: 'atk_sub', pid, tid })} />
          <Btn color="bg-blue-600"   label="Vörn"       size="lg" onTap={() => setFlow({ s: 'def_sub', pid, tid })} />
          <Btn color="bg-purple-600" label="Markmaður"  size="lg" onTap={() => setFlow({ s: 'gk_sub',  pid, tid })} />
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ATTACK
  // ════════════════════════════════════════════════════════════════════════════

  if (flow.s === 'atk_sub') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Sókn → veldu aðgerð</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          <Btn color="bg-green-600" label="Skot"  size="lg" onTap={() => setFlow({ s: 'atk_shot_origin', pid, tid })} />
          <Btn color="bg-green-700" label="Annað" size="lg" onTap={() => setFlow({ s: 'atk_other', pid, tid })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_origin') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Hvaðan kom árásin?</StepTitle>
        <div className="grid grid-cols-3 gap-3">
          {ORIGINS.map(({ v, label }) => (
            <Btn key={v} color="bg-green-600" label={label} size="lg"
              onTap={() => setFlow({ s: 'atk_shot_range', pid, tid, origin: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_range') {
    const { pid, tid, origin } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin]]} />
        <StepTitle>Hvaðan kom skotið?</StepTitle>
        <div className="grid grid-cols-3 gap-3">
          {RANGES.map(({ v, label }) => (
            <Btn key={v} color="bg-green-600" label={label} size="lg"
              onTap={() => setFlow({ s: 'atk_shot_phase', pid, tid, origin, range: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_phase') {
    const { pid, tid, origin, range } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range]]} />
        <StepTitle>Tegund sóknar</StepTitle>
        <div className="grid grid-cols-3 gap-3">
          {PHASES.map(({ v, label }) => (
            <Btn key={v} color="bg-green-600" label={label}
              onTap={() => setFlow({ s: 'atk_shot_numerical', pid, tid, origin, range, phase: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_numerical') {
    const { pid, tid, origin, range, phase } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range], PHASE_LABEL[phase]]} />
        <StepTitle>Leiktala</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          {ATK_NUMERICALS.map(({ v, label }) => (
            <Btn key={v} color="bg-green-600" label={label}
              onTap={() => setFlow({ s: 'atk_shot_assist', pid, tid, origin, range, phase, numerical: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_assist') {
    const { pid, tid, origin, range, phase, numerical } = flow
    const isPenalty = range === 'penalty'
    const others = trackedPlayers.filter(p => p.id !== pid)

    if (isPenalty) {
      return (
        <div className="p-4">
          <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range], PHASE_LABEL[phase], NUMERICAL_LABEL[numerical]]} />
          <StepTitle>Vítasending — hverjir sendi?</StepTitle>
          <PlayerPickerGrid
            players={others}
            noneLabel="Enginn"
            onPick={(id) => setFlow({ s: 'atk_shot_fiskad_viti', pid, tid, origin, phase, numerical, vitasendingId: id })}
            onNone={() => setFlow({ s: 'atk_shot_fiskad_viti', pid, tid, origin, phase, numerical, vitasendingId: null })}
          />
        </div>
      )
    }

    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range], PHASE_LABEL[phase], NUMERICAL_LABEL[numerical]]} />
        <StepTitle>Hver átti stoðsendinguna?</StepTitle>
        <PlayerPickerGrid
          players={others}
          noneLabel="Enginn"
          onPick={(id) => setFlow({ s: 'atk_shot_zone', pid, tid, origin, range, phase, numerical, assistId: id, vitasendingId: null, fiskadVitiId: null })}
          onNone={() => setFlow({ s: 'atk_shot_zone', pid, tid, origin, range, phase, numerical, assistId: null, vitasendingId: null, fiskadVitiId: null })}
        />
      </div>
    )
  }

  if (flow.s === 'atk_shot_fiskad_viti') {
    const { pid, tid, origin, phase, numerical, vitasendingId } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], 'Víti', PHASE_LABEL[phase], NUMERICAL_LABEL[numerical], vitasendingId ? `Vítasending: ${playerLabel(vitasendingId)}` : undefined]} />
        <StepTitle>Fiskað víti — hverjum var gert víti á?</StepTitle>
        <PlayerPickerGrid
          players={trackedPlayers}
          noneLabel="Enginn"
          onPick={(id) => setFlow({ s: 'atk_shot_zone', pid, tid, origin, range: 'penalty', phase, numerical, assistId: null, vitasendingId, fiskadVitiId: id })}
          onNone={() => setFlow({ s: 'atk_shot_zone', pid, tid, origin, range: 'penalty', phase, numerical, assistId: null, vitasendingId, fiskadVitiId: null })}
        />
      </div>
    )
  }

  if (flow.s === 'atk_shot_zone') {
    const { pid, tid, origin, range, phase, numerical, assistId, vitasendingId, fiskadVitiId } = flow

    function commitOffTarget(subType: 'blocked' | 'wide' | 'post') {
      const ctx: Record<string, unknown> = { attack_origin: origin }
      if (assistId) ctx.assist_player_id = assistId
      else if (vitasendingId) ctx.assist_player_id = vitasendingId
      done({
        event_type: 'SHOT',
        player_id: pid,
        team_id: tid,
        sub_type: subType,
        shot_range: range,
        phase_type: phase,
        numerical_state: numerical,
        zone: null,
        context: ctx,
      })
    }

    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range], PHASE_LABEL[phase], NUMERICAL_LABEL[numerical]]} />
        <StepTitle>Hvert fór skotið?</StepTitle>
        <ZoneGrid
          onZone={(z) => setFlow({ s: 'atk_shot_outcome', pid, tid, origin, range, phase, numerical, assistId, vitasendingId, fiskadVitiId, zone: z })}
          onBlocked={() => commitOffTarget('blocked')}
          onWide={() => commitOffTarget('wide')}
          onPost={() => commitOffTarget('post')}
        />
      </div>
    )
  }

  if (flow.s === 'atk_shot_outcome') {
    const { pid, tid, origin, range, phase, numerical, assistId, vitasendingId, fiskadVitiId, zone } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range], PHASE_LABEL[phase], NUMERICAL_LABEL[numerical]]} />
        <StepTitle>Niðurstaða</StepTitle>
        <div className="grid grid-cols-2 gap-4">
          <Btn color="bg-green-600" label="Mark"  size="lg"
            onTap={() => setFlow({ s: 'atk_shot_hand_up', pid, tid, origin, range, phase, numerical, assistId, vitasendingId, fiskadVitiId, zone, subType: 'goal' })} />
          <Btn color="bg-slate-600" label="Varið" size="lg"
            onTap={() => setFlow({ s: 'atk_shot_hand_up', pid, tid, origin, range, phase, numerical, assistId, vitasendingId, fiskadVitiId, zone, subType: 'saved' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_hand_up') {
    const { pid, tid, origin, range, phase, numerical, assistId, vitasendingId, fiskadVitiId, zone, subType } = flow

    function commitShot(handUp: boolean) {
      const ctx: Record<string, unknown> = { attack_origin: origin, hand_up: handUp }
      if (assistId) ctx.assist_player_id = assistId
      else if (vitasendingId) ctx.assist_player_id = vitasendingId
      commitEvent({
        event_type: 'SHOT',
        player_id: pid,
        team_id: tid,
        sub_type: subType,
        shot_range: range,
        phase_type: phase,
        numerical_state: numerical,
        zone,
        context: ctx,
      })
      if (range === 'penalty' && fiskadVitiId) {
        commitEvent({
          event_type: 'FOUL',
          player_id: null,
          team_id: opponentTeamId,
          sub_type: '7m_awarded',
          context: { fouled_player_id: fiskadVitiId },
        })
      }
      setFlow({ s: 'idle' })
    }

    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range], subType === 'goal' ? 'Mark' : 'Varið']} />
        <StepTitle>Höndin uppi?</StepTitle>
        <div className="grid grid-cols-2 gap-4">
          <Btn color="bg-green-600" label="Já"  size="lg" onTap={() => commitShot(true)} />
          <Btn color="bg-slate-600" label="Nei" size="lg" onTap={() => commitShot(false)} />
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_other') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Annað — sókn</StepTitle>
        <div className="grid grid-cols-1 gap-3">
          <Btn color="bg-green-700" label="Tapaður bolti"  onTap={() => setFlow({ s: 'atk_turnover', pid, tid })} />
          <Btn color="bg-green-700" label="Sóknarfrákast"
            onTap={() => done({ event_type: 'ATTACKING_ACTION', player_id: pid, team_id: tid, sub_type: 'offensive_rebound' })} />
          <Btn color="bg-green-700" label="Fengnar 2 mín"
            onTap={() => done({ event_type: 'ATTACKING_ACTION', player_id: pid, team_id: tid, sub_type: 'drew_suspension' })} />
          <Btn color="bg-purple-700" label="3 mörk í röð"
            onTap={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: opponentTeamId, sub_type: 'empty_phase' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_turnover') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Tapaður bolti — tegund</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          <Btn color="bg-orange-600" label="Sóknarbrot"      onTap={() => done({ event_type: 'TURNOVER', player_id: pid, team_id: tid, sub_type: 'offensive_foul' })} />
          <Btn color="bg-orange-600" label="Sendingarmistök" onTap={() => done({ event_type: 'TURNOVER', player_id: pid, team_id: tid, sub_type: 'bad_pass' })} />
          <Btn color="bg-orange-600" label="Töf"             onTap={() => done({ event_type: 'TURNOVER', player_id: pid, team_id: tid, sub_type: 'delay' })} />
          <Btn color="bg-orange-500" label="Annað"           onTap={() => done({ event_type: 'TURNOVER', player_id: pid, team_id: tid, sub_type: 'other' })} />
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GOALKEEPING
  // ════════════════════════════════════════════════════════════════════════════

  if (flow.s === 'gk_sub') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Markmaður → veldu aðgerð</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          <Btn color="bg-purple-600" label="Skot"  size="lg" onTap={() => setFlow({ s: 'gk_shot_origin', pid, tid })} />
          <Btn color="bg-purple-700" label="Annað" size="lg" onTap={() => setFlow({ s: 'gk_other', pid, tid })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_origin') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Hvaðan kom árásin?</StepTitle>
        <div className="grid grid-cols-3 gap-3">
          {ORIGINS.map(({ v, label }) => (
            <Btn key={v} color="bg-purple-600" label={label} size="lg"
              onTap={() => setFlow({ s: 'gk_shot_range', pid, tid, origin: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_range') {
    const { pid, tid, origin } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin]]} />
        <StepTitle>Hvaðan kom skotið frá?</StepTitle>
        <div className="grid grid-cols-3 gap-3">
          {RANGES.map(({ v, label }) => (
            <Btn key={v} color="bg-purple-600" label={label} size="lg"
              onTap={() => setFlow({ s: 'gk_shot_phase', pid, tid, origin, range: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_phase') {
    const { pid, tid, origin, range } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range]]} />
        <StepTitle>Tegund sóknar</StepTitle>
        <div className="grid grid-cols-3 gap-3">
          {PHASES.map(({ v, label }) => (
            <Btn key={v} color="bg-purple-600" label={label}
              onTap={() => setFlow({ s: 'gk_shot_numerical', pid, tid, origin, range, phase: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_numerical') {
    const { pid, tid, origin, range, phase } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range], PHASE_LABEL[phase]]} />
        <StepTitle>Leiktala</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          {GK_NUMERICALS.map(({ v, label }) => (
            <Btn key={v} color="bg-purple-600" label={label}
              onTap={() => setFlow({ s: 'gk_shot_zone', pid, tid, origin, range, phase, numerical: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_zone') {
    const { pid, tid, origin, range, phase, numerical } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range], PHASE_LABEL[phase], NUMERICAL_LABEL[numerical]]} />
        <StepTitle>Hvert fór skotið?</StepTitle>
        <ZoneGrid
          onZone={(z) => setFlow({ s: 'gk_shot_outcome', pid, tid, origin, range, phase, numerical, zone: z })}
          onWide={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: 'missed', shot_range: range, phase_type: phase, numerical_state: numerical, context: { attack_origin: origin } })}
          onPost={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: 'missed', shot_range: range, phase_type: phase, numerical_state: numerical, context: { attack_origin: origin } })}
        />
      </div>
    )
  }

  if (flow.s === 'gk_shot_outcome') {
    const { pid, tid, origin, range, phase, numerical, zone } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range], PHASE_LABEL[phase], NUMERICAL_LABEL[numerical]]} />
        <StepTitle>Niðurstaða</StepTitle>
        <div className="grid grid-cols-2 gap-4">
          <Btn color="bg-purple-600" label="Varin" size="lg"
            onTap={() => setFlow({ s: 'gk_shot_hand_up', pid, tid, origin, range, phase, numerical, zone, subType: 'save' })} />
          <Btn color="bg-red-600"    label="Mark"  size="lg"
            onTap={() => setFlow({ s: 'gk_shot_hand_up', pid, tid, origin, range, phase, numerical, zone, subType: 'goal_conceded' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_hand_up') {
    const { pid, tid, origin, range, phase, numerical, zone, subType } = flow
    return (
      <div className="p-4">
        <Breadcrumb items={[ORIGIN_LABEL[origin], RANGE_LABEL[range], subType === 'save' ? 'Varin' : 'Mark']} />
        <StepTitle>Höndin uppi?</StepTitle>
        <div className="grid grid-cols-2 gap-4">
          <Btn color="bg-green-600" label="Já"  size="lg"
            onTap={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: subType, shot_range: range, phase_type: phase, numerical_state: numerical, zone, context: { attack_origin: origin, hand_up: true } })} />
          <Btn color="bg-slate-600" label="Nei" size="lg"
            onTap={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: subType, shot_range: range, phase_type: phase, numerical_state: numerical, zone, context: { attack_origin: origin, hand_up: false } })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_other') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Annað — markmaður</StepTitle>
        <div className="grid grid-cols-1 gap-3">
          <Btn color="bg-purple-600" label="Tómur fasi (3 mörk á okkur í röð)"
            onTap={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: 'empty_phase' })} />
          <Btn color="bg-purple-600" label="Jákvæð viðbrögð"
            onTap={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: 'positive_response' })} />
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DEFENSE
  // ════════════════════════════════════════════════════════════════════════════

  if (flow.s === 'def_sub') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Vörn → veldu flokk</StepTitle>
        <div className="grid grid-cols-3 gap-3">
          <Btn color="bg-blue-600"  label="Brot"    size="lg" onTap={() => setFlow({ s: 'def_brot_type', pid, tid })} />
          <Btn color="bg-blue-600"  label="Annað"   size="lg" onTap={() => setFlow({ s: 'def_other', pid, tid })} />
          <Btn color="bg-blue-600"  label="Refsing" size="lg" onTap={() => setFlow({ s: 'def_refsing', pid, tid })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'def_brot_type') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Brot — tegund</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          <Btn color="bg-blue-600" label="Fríkast" size="lg"
            onTap={() => setFlow({ s: 'def_brot_card', pid, tid, foulSub: 'attacking_foul' })} />
          <Btn color="bg-blue-600" label="Víti"    size="lg"
            onTap={() => setFlow({ s: 'def_brot_card', pid, tid, foulSub: '7m_awarded' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'def_brot_card') {
    const { pid, tid, foulSub } = flow

    function commitBrot(card: '2min' | 'yellow_card' | 'red_card' | null) {
      commitEvent({ event_type: 'FOUL', player_id: pid, team_id: tid, sub_type: foulSub })
      if (card) {
        commitEvent({ event_type: 'SUSPENSION', player_id: pid, team_id: tid, sub_type: card })
      }
      setFlow({ s: 'idle' })
    }

    return (
      <div className="p-4">
        <Breadcrumb items={[foulSub === 'attacking_foul' ? 'Fríkast' : 'Víti']} />
        <StepTitle>Refsing</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          <Btn color="bg-yellow-500" label="Gult spjald" onTap={() => commitBrot('yellow_card')} />
          <Btn color="bg-red-600"    label="2 mín"       onTap={() => commitBrot('2min')} />
          <Btn color="bg-red-800"    label="Rautt spjald" onTap={() => commitBrot('red_card')} />
          <Btn color="bg-gray-400"   label="Ekkert"       onTap={() => commitBrot(null)} />
        </div>
      </div>
    )
  }

  if (flow.s === 'def_other') {
    const { pid, tid } = flow
    const defAction = (sub: string) =>
      done({ event_type: 'DEFENSIVE_ACTION', player_id: pid, team_id: tid, sub_type: sub as never })

    return (
      <div className="p-4">
        <StepTitle>Annað — vörn</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          <Btn color="bg-blue-600" label="Árás 1 á 1"      onTap={() => setFlow({ s: 'def_duel_outcome', pid, tid })} />
          <Btn color="bg-blue-600" label="Hár Kontakt"      onTap={() => defAction('high_contact')} />
          <Btn color="bg-blue-600" label="Stolinn bolti"    onTap={() => defAction('interception')} />
          <Btn color="bg-blue-600" label="Blokk"            onTap={() => defAction('block')} />
          <Btn color="bg-blue-600" label="Frákast"              onTap={() => defAction('rebound')} />
          <Btn color="bg-blue-600" label="Fiskuð sóknarbrot"  onTap={() => defAction('drew_offensive_foul')} />
          <Btn color="bg-blue-600" label="Andstæðingur tapar bolta" onTap={() => defAction('opponent_lost_ball')} />
          <Btn color="bg-blue-600" label="Værukærð"            onTap={() => defAction('protest')} />
        </div>
      </div>
    )
  }

  if (flow.s === 'def_duel_outcome') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Árás 1 á 1 — niðurstaða</StepTitle>
        <div className="grid grid-cols-2 gap-4">
          <Btn color="bg-blue-600" label="Vann"   size="lg"
            onTap={() => done({ event_type: 'DEFENSIVE_ACTION', player_id: pid, team_id: tid, sub_type: 'duel_won' })} />
          <Btn color="bg-blue-400" label="Tapaði" size="lg"
            onTap={() => done({ event_type: 'DEFENSIVE_ACTION', player_id: pid, team_id: tid, sub_type: 'duel_lost' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'def_refsing') {
    const { pid, tid } = flow
    return (
      <div className="p-4">
        <StepTitle>Refsing</StepTitle>
        <div className="grid grid-cols-2 gap-3">
          <Btn color="bg-yellow-500" label="Gult spjald"
            onTap={() => done({ event_type: 'SUSPENSION', player_id: pid, team_id: tid, sub_type: 'yellow_card' })} />
          <Btn color="bg-red-600"    label="2 mín"
            onTap={() => done({ event_type: 'SUSPENSION', player_id: pid, team_id: tid, sub_type: '2min' })} />
          <Btn color="bg-red-800"    label="Rautt spjald"
            onTap={() => done({ event_type: 'SUSPENSION', player_id: pid, team_id: tid, sub_type: 'red_card' })} />
          <Btn color="bg-blue-500"   label="Blátt spjald"
            onTap={() => done({ event_type: 'SUSPENSION', player_id: pid, team_id: tid, sub_type: 'blue_card' })} />
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUBSTITUTION
  // ════════════════════════════════════════════════════════════════════════════

  if (flow.s === 'sub_pick_in') {
    const bench = onBench.length > 0 ? onBench : trackedPlayers
    return (
      <div className="p-4">
        <StepTitle>Skipti — kemur INN</StepTitle>
        <PlayerPickerGrid
          players={bench}
          noneLabel="Hætta við"
          onPick={(id) => setFlow({ s: 'sub_pick_out', playerInId: id })}
          onNone={() => setFlow({ s: 'idle' })}
        />
      </div>
    )
  }

  if (flow.s === 'sub_pick_out') {
    const { playerInId } = flow
    const court = onCourt.length > 0 ? onCourt : trackedPlayers.filter(p => p.id !== playerInId)
    return (
      <div className="p-4">
        <StepTitle>Skipti — fer ÚT</StepTitle>
        <PlayerPickerGrid
          players={court}
          noneLabel="Hætta við"
          onPick={async (id) => {
            await logSubstitution(playerInId, id)
            setFlow({ s: 'idle' })
          }}
          onNone={() => setFlow({ s: 'idle' })}
        />
      </div>
    )
  }

  return null
}

// ─── EventLogger ─────────────────────────────────────────────────────────────

export function EventLogger() {
  const trackedPlayers = useMatchStore(s => s.trackedPlayers)
  const opponentPlayers = useMatchStore(s => s.opponentPlayers)
  const lineupPlayerIds = useMatchStore(s => s.currentLineupPlayerIds)
  const currentLineupId = useMatchStore(s => s.currentLineupId)
  const initLineup = useMatchStore(s => s.initLineup)
  const [flow, setFlow] = useState<FlowStep>({ s: 'idle' })

  // Create the initial court_lineups row from starters on first mount
  useEffect(() => {
    if (currentLineupId === null && lineupPlayerIds.length > 0) {
      void initLineup(lineupPlayerIds)
    }
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedPid = 'pid' in flow ? flow.pid : null

  function selectPlayer(pid: string, tid: string) {
    setFlow({ s: 'category', pid, tid })
  }

  return (
    <div className="flex flex-col h-full bg-gray-100 select-none overflow-hidden">
      <ScoreBar />
      <TopBar flow={flow} setFlow={setFlow} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: player panel */}
        <div className="w-[180px] bg-white border-r border-gray-200 flex flex-col overflow-y-auto p-2 gap-1 shrink-0">
          <p className="text-xs font-semibold text-slate-500 px-1 pt-1 uppercase tracking-wide">Á velli</p>
          {trackedPlayers.filter(p => lineupPlayerIds.includes(p.id)).map(p => (
            <button
              key={p.id}
              onPointerDown={() => selectPlayer(p.id, p.team_id)}
              className={`
                flex flex-col items-center justify-center rounded-xl border-2 p-2 min-h-[68px]
                text-sm font-semibold select-none active:scale-95 transition-transform
                ${selectedPid === p.id
                  ? 'bg-blue-600 border-blue-700 text-white'
                  : 'bg-white border-gray-300 text-gray-800 hover:border-blue-400'
                }
              `}
            >
              <span className="text-xl font-bold leading-none">{p.jersey_number ?? '?'}</span>
              <span className="mt-0.5 text-xs truncate max-w-[64px]">{p.last_name}</span>
            </button>
          ))}

          {trackedPlayers.some(p => !lineupPlayerIds.includes(p.id)) && (
            <p className="text-xs font-semibold text-slate-400 px-1 pt-2 uppercase tracking-wide">Á bekk</p>
          )}
          {trackedPlayers.filter(p => !lineupPlayerIds.includes(p.id)).map(p => (
            <button
              key={p.id}
              onPointerDown={() => selectPlayer(p.id, p.team_id)}
              className={`
                flex flex-col items-center justify-center rounded-xl border-2 p-2 min-h-[68px]
                text-sm font-semibold select-none active:scale-95 transition-transform
                ${selectedPid === p.id
                  ? 'bg-blue-600 border-blue-700 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:border-blue-300'
                }
              `}
            >
              <span className="text-xl font-bold leading-none">{p.jersey_number ?? '?'}</span>
              <span className="mt-0.5 text-xs truncate max-w-[64px]">{p.last_name}</span>
            </button>
          ))}

          {opponentPlayers.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-400 px-1 pt-2 uppercase tracking-wide">Andstæðingar</p>
              {opponentPlayers.map(p => (
                <button
                  key={p.id}
                  onPointerDown={() => selectPlayer(p.id, p.team_id)}
                  className={`
                    flex flex-col items-center justify-center rounded-xl border-2 p-2 min-h-[68px]
                    text-sm font-semibold select-none active:scale-95 transition-transform
                    ${selectedPid === p.id
                      ? 'bg-orange-500 border-orange-600 text-white'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-orange-300'
                    }
                  `}
                >
                  <span className="text-xl font-bold leading-none">{p.jersey_number ?? '?'}</span>
                  <span className="mt-0.5 text-xs truncate max-w-[64px]">{p.last_name}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Right: flow panel */}
        <div className="flex-1 overflow-y-auto">
          <FlowPanel flow={flow} setFlow={setFlow} />
        </div>
      </div>

      <RecentEventsFeed />
    </div>
  )
}
