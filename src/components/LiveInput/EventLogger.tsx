// Live event logger — the courtside tablet screen.
// The flow (steps, their order, the buttons in each step and what each commits)
// is unchanged from earlier versions so operators keep their muscle memory;
// only the look and the language are new. Categories keep a colour each so
// they read apart at a glance: attack cobalt, defence ink, goalkeeper green,
// turnovers orange.
import { useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  useMatchStore,
  selectActiveEvents, selectTrackedScore, selectOpponentScore,
} from '@/store/matchStore'
import type { RosteredPlayer } from '@/store/matchStore'
import { finalizeMatch } from '@/lib/supabase/reportQueries'
import type { ShotRange, PhaseType, NumericalState, ShotZone, EventInsert } from '@/lib/db/schema'
import { ORIGINS, ORIGIN_LABEL, DIRECTIONS, DIRECTION_LABEL, type AttackDirection } from '@/lib/attackContext'
import { useT, type Text } from '@/lib/i18n/lang'
import { T, EVENT_TEXT, SUB_TEXT } from '@/lib/i18n/terms'
import { LangToggle } from '@/components/ui'

// ─── Local flow state ─────────────────────────────────────────────────────────

type TurnoverSubType = 'offensive_foul' | 'bad_pass' | 'delay' | 'other'

type FlowStep =
  | { s: 'idle' }
  | { s: 'category'; pid: string; tid: string }
  // ── Attack ──────────────────────────────────────────────────────────────────
  | { s: 'atk_sub'; pid: string; tid: string }
  | { s: 'atk_shot_origin'; pid: string; tid: string }
  | { s: 'atk_shot_direction'; pid: string; tid: string; origin: string }
  | { s: 'atk_shot_range'; pid: string; tid: string; origin: string; direction: AttackDirection }
  | { s: 'atk_shot_phase'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange }
  | { s: 'atk_shot_numerical'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange; phase: PhaseType }
  | { s: 'atk_shot_assist'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange; phase: PhaseType; numerical: NumericalState }
  | { s: 'atk_shot_vitasending'; pid: string; tid: string; origin: string; phase: PhaseType; numerical: NumericalState }
  | { s: 'atk_shot_fiskad_viti'; pid: string; tid: string; origin: string; direction: AttackDirection; phase: PhaseType; numerical: NumericalState; vitasendingId: string | null }
  | { s: 'atk_shot_zone'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange; phase: PhaseType; numerical: NumericalState; assistId: string | null; vitasendingId: string | null; fiskadVitiId: string | null }
  | { s: 'atk_shot_outcome'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange; phase: PhaseType; numerical: NumericalState; assistId: string | null; vitasendingId: string | null; fiskadVitiId: string | null; zone: ShotZone }
  | { s: 'atk_shot_hand_up'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange; phase: PhaseType; numerical: NumericalState; assistId: string | null; vitasendingId: string | null; fiskadVitiId: string | null; zone: ShotZone; subType: 'goal' | 'saved' }
  | { s: 'atk_other'; pid: string; tid: string }
  | { s: 'atk_turnover'; pid: string; tid: string }
  | { s: 'atk_turnover_origin'; pid: string; tid: string; subType: TurnoverSubType }
  | { s: 'atk_turnover_direction'; pid: string; tid: string; subType: TurnoverSubType; origin: string }
  // ── GK ──────────────────────────────────────────────────────────────────────
  | { s: 'gk_sub'; pid: string; tid: string }
  | { s: 'gk_shot_origin'; pid: string; tid: string }
  | { s: 'gk_shot_direction'; pid: string; tid: string; origin: string }
  | { s: 'gk_shot_range'; pid: string; tid: string; origin: string; direction: AttackDirection }
  | { s: 'gk_shot_phase'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange }
  | { s: 'gk_shot_numerical'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange; phase: PhaseType }
  | { s: 'gk_shot_zone'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange; phase: PhaseType; numerical: NumericalState }
  | { s: 'gk_shot_outcome'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange; phase: PhaseType; numerical: NumericalState; zone: ShotZone }
  | { s: 'gk_shot_hand_up'; pid: string; tid: string; origin: string; direction: AttackDirection; range: ShotRange; phase: PhaseType; numerical: NumericalState; zone: ShotZone; subType: 'save' | 'goal_conceded' }
  | { s: 'gk_other'; pid: string; tid: string }
  // ── Defense ─────────────────────────────────────────────────────────────────
  | { s: 'def_sub'; pid: string; tid: string }
  | { s: 'def_brot_type'; pid: string; tid: string }
  | { s: 'def_brot_origin'; pid: string; tid: string; foulSub: 'attacking_foul' | '7m_awarded' }
  | { s: 'def_brot_direction'; pid: string; tid: string; foulSub: 'attacking_foul' | '7m_awarded'; origin: string }
  | { s: 'def_brot_card'; pid: string; tid: string; foulSub: 'attacking_foul' | '7m_awarded'; origin: string; direction: AttackDirection }
  | { s: 'def_other'; pid: string; tid: string }
  | { s: 'def_other_origin'; pid: string; tid: string; sub: string }
  | { s: 'def_other_direction'; pid: string; tid: string; sub: string; origin: string }
  | { s: 'def_duel_outcome'; pid: string; tid: string }
  | { s: 'def_refsing'; pid: string; tid: string }
  // ── Substitution ─────────────────────────────────────────────────────────────
  | { s: 'sub_pick_in' }
  | { s: 'sub_pick_out'; playerInId: string }

// ─── Option data ──────────────────────────────────────────────────────────────

const RANGES: { v: ShotRange; label: Text }[] = [
  { v: 'penalty',           label: { en: '7 m penalty', is: 'Víti' } },
  { v: 'corner_wing_left',  label: T.leftWing },
  { v: 'corner_wing_right', label: T.rightWing },
  { v: '9m_plus',           label: T.nineM },
  { v: '7_8m',              label: T.sevenEight },
  { v: '6m',                label: T.sixM },
  { v: 'line',              label: T.line },
]

const PHASES: { v: PhaseType; label: Text }[] = [
  { v: 'fast_break',  label: T.fastBreak },
  { v: 'second_wave', label: T.secondWave },
  { v: 'set_play',    label: T.setPlay },
]

const ATK_NUMERICALS: { v: NumericalState; label: Text }[] = [
  { v: '6v6',         label: T.s6v6 },
  { v: 'inferiority', label: T.inferiority },
  { v: 'superiority', label: T.superiority },
  { v: '7v6',         label: T.s7v6 },
]

const GK_NUMERICALS: { v: NumericalState; label: Text }[] = [
  { v: '6v6',         label: T.s6v6 },
  { v: 'inferiority', label: T.inferiority },
  { v: 'superiority', label: T.superiority },
  { v: '6v7',         label: T.s6v7 },
]

const RANGE_LABEL: Record<ShotRange, Text> = {
  penalty: { en: '7 m', is: 'Víti' }, '9m_plus': T.nineM,
  '7_8m': T.sevenEight, '6m': T.sixM, line: T.line,
  corner_wing_left: T.leftWing, corner_wing_right: T.rightWing,
  corner_wing: T.wing, // legacy — pre-016 shots, no side recorded
}
const PHASE_LABEL: Record<PhaseType, Text> = {
  fast_break: T.fastBreak, second_wave: T.secondWave, set_play: T.setPlay,
}
const NUMERICAL_LABEL: Record<NumericalState, Text> = {
  '6v6': T.s6v6, inferiority: T.inferiority, superiority: T.superiority, '7v6': T.s7v6, '6v7': T.s6v7,
}

// Category colours (solid fills, white labels; all pass 4.5:1)
const C = {
  attack: 'bg-accent',
  attackDeep: 'bg-[#1824c0]',
  defence: 'bg-[#111214]',
  defenceSoft: 'bg-[#3a3f47]',
  keeper: 'bg-[#1f7a4d]',
  keeperDeep: 'bg-[#17603c]',
  turnover: 'bg-[#c2410c]',
  yellow: 'bg-[#b8860b]',
  red: 'bg-[#c4242a]',
  redDeep: 'bg-[#8f1a1f]',
  blue: 'bg-[#1d5fbf]',
  neutral: 'bg-[#5d6470]',
}

// ─── Primitive UI helpers ─────────────────────────────────────────────────────

function Btn({ label, color = C.defenceSoft, onTap, size = 'md', full = false }: {
  label: string; color?: string; onTap: () => void; size?: 'sm' | 'md' | 'lg'; full?: boolean
}) {
  const sz = size === 'lg'
    ? 'min-h-[48px] text-[15px] sm:min-h-[64px] sm:text-[17px] md:min-h-[76px] md:text-[19px]'
    : size === 'sm'
    ? 'min-h-[36px] text-[13px] sm:min-h-[40px] sm:text-[14px]'
    : 'min-h-[44px] text-[14px] sm:min-h-[52px] sm:text-[16px] md:min-h-[60px]'
  return (
    <button
      onPointerDown={onTap}
      className={`${color} ${full ? 'w-full' : ''} text-white font-medium rounded-lg ${sz} px-2 sm:px-3 leading-tight
        active:scale-[0.96] active:brightness-110 transition-transform select-none`}
    >
      {label}
    </button>
  )
}

function Breadcrumb({ items }: { items: (string | undefined)[] }) {
  const parts = items.filter(Boolean) as string[]
  if (!parts.length) return null
  return (
    <div className="flex gap-1.5 flex-wrap mb-3">
      {parts.map((p, i) => (
        <span key={i} className="text-[13px] bg-white border border-line text-ink px-2 py-0.5 rounded">{p}</span>
      ))}
    </div>
  )
}

function StepTitle({ children }: { children: string }) {
  return <p className="text-[15px] sm:text-[17px] font-semibold text-ink mb-3">{children}</p>
}

function PlayerPickerGrid({ players, onPick, onNone, noneLabel }: {
  players: RosteredPlayer[]
  onPick: (id: string) => void
  onNone: () => void
  noneLabel: string
}) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {players.map(p => (
          <button
            key={p.id}
            onPointerDown={() => onPick(p.id)}
            className="flex flex-col items-center py-2 sm:py-2.5 px-1 rounded-lg border border-[#cdd2d9] bg-white
              hover:border-ink active:scale-95 active:bg-[#111214] active:text-white transition-transform"
          >
            <span className="text-[18px] sm:text-[20px] font-semibold leading-none num">{p.jersey_number ?? '?'}</span>
            <span className="text-[12px] sm:text-[13px] text-muted truncate w-full text-center mt-1">{p.last_name}</span>
          </button>
        ))}
      </div>
      <button
        onPointerDown={onNone}
        className="w-full min-h-[44px] rounded-lg border border-dashed border-[#9aa0a8] text-[14px] text-muted
          bg-transparent active:scale-[0.98] transition-transform"
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
  const t = useT()
  const zones: ShotZone[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  const labels: Record<number, Text> = {
    1: { en: 'Top L', is: 'Efst V' }, 2: { en: 'Top C', is: 'Efst M' }, 3: { en: 'Top R', is: 'Efst H' },
    4: { en: 'Mid L', is: 'Miðj V' }, 5: { en: 'Mid C', is: 'Miðj M' }, 6: { en: 'Mid R', is: 'Miðj H' },
    7: { en: 'Low L', is: 'Neðst V' }, 8: { en: 'Low C', is: 'Neðst M' }, 9: { en: 'Low R', is: 'Neðst H' },
  }
  const off = 'min-h-[44px] sm:min-h-[52px] rounded-lg border border-[#cdd2d9] bg-white text-[14px] font-medium text-ink active:scale-95 active:bg-[#111214] active:text-white transition-transform'
  return (
    <div className="flex flex-col gap-2 max-w-[560px]">
      {/* The goal face: posts and bar in ink, 3 × 3 zones */}
      <div className="grid grid-cols-3 gap-1 p-1 border-[6px] border-b-0 border-ink bg-white">
        {zones.map(z => (
          <button
            key={z}
            onPointerDown={() => onZone(z)}
            className="h-12 sm:h-14 md:h-16 rounded bg-[#f5f6f8] text-[13px] sm:text-[14px] font-medium text-ink
              hover:bg-[#e8eaee] active:scale-95 active:bg-accent active:text-white transition-transform"
          >
            {t(labels[z])}
          </button>
        ))}
      </div>
      <div className={`grid ${onBlocked ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
        {onBlocked && <button onPointerDown={onBlocked} className={off}>{t(T.blocked)}</button>}
        <button onPointerDown={onPost} className={off}>{t(T.post)}</button>
        <button onPointerDown={onWide} className={off}>{t(T.wide)}</button>
      </div>
    </div>
  )
}

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

function ScoreBar() {
  const t = useT()
  const match = useMatchStore(s => s.match)
  const homeTeam = useMatchStore(s => s.homeTeam)
  const awayTeam = useMatchStore(s => s.awayTeam)
  const trackedScore = useMatchStore(selectTrackedScore)
  const opponentScore = useMatchStore(selectOpponentScore)
  const period = useMatchStore(s => s.currentPeriod)
  const isOnline = useMatchStore(s => s.isOnline)
  const isTrackedHome = match?.tracked_team_id === match?.home_team_id
  return (
    <div className="flex items-center justify-between gap-2 bg-ink text-white px-3 sm:px-4 h-12 sm:h-14 shrink-0">
      <div className="flex items-center gap-2 w-[88px] sm:w-[140px]">
        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-[#3fc07a]' : 'bg-[#e5566f]'}`} aria-hidden="true" />
        <span className="hidden sm:inline text-[13px] text-white/70">{isOnline ? t({ en: 'Online', is: 'Tengt' }) : t({ en: 'Offline, saving here', is: 'Ótengt, vistað hér' })}</span>
      </div>
      <div className="flex items-center justify-center gap-2 sm:gap-4 min-w-0 flex-1">
        <span className="truncate text-[14px] sm:text-[17px] font-medium text-right flex-1 min-w-0">{homeTeam?.name ?? t(T.home)}</span>
        <span className="text-[20px] sm:text-[26px] md:text-[30px] font-semibold num whitespace-nowrap">
          {isTrackedHome ? trackedScore : opponentScore}
          <span className="text-white/50 mx-1">–</span>
          {isTrackedHome ? opponentScore : trackedScore}
        </span>
        <span className="truncate text-[14px] sm:text-[17px] font-medium flex-1 min-w-0">{awayTeam?.name ?? t(T.away)}</span>
      </div>
      <div className="flex items-center justify-end gap-2 w-[88px] sm:w-[140px]">
        <span className="text-[13px] text-white/70 whitespace-nowrap">{t(T.period)} {period}</span>
        <span className="hidden md:inline"><LangToggle dark /></span>
      </div>
    </div>
  )
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function TopBar({ flow, setFlow }: { flow: FlowStep; setFlow: (f: FlowStep) => void }) {
  const t = useT()
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

  const tool = 'h-9 sm:h-10 rounded-md px-2.5 sm:px-3 text-[13px] sm:text-[14px] font-medium active:scale-95 transition-transform select-none whitespace-nowrap'
  const stepBtn = 'w-9 sm:w-10 h-9 sm:h-10 text-[18px] text-ink hover:bg-[#f5f6f8] active:scale-95'

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 bg-white border-b border-line flex-wrap shrink-0">

      {/* Minute counter */}
      <div className="flex items-center rounded-md border border-[#cdd2d9] overflow-hidden" aria-label={t(T.minute)}>
        <button onPointerDown={() => setMinute(Math.max(0, minute - 1))} className={stepBtn} aria-label={`${t(T.minute)} −1`}>−</button>
        <span className="w-10 sm:w-12 text-center text-[15px] sm:text-[17px] font-semibold num">{minute}′</span>
        <button onPointerDown={() => setMinute(minute + 1)} className={stepBtn} aria-label={`${t(T.minute)} +1`}>+</button>
      </div>

      {/* Possession counters */}
      <button onPointerDown={() => logAttack(match.tracked_team_id)} className={`${tool} ${C.attack} text-white flex items-center gap-2`}>
        {t({ en: 'Our attack', is: 'Sókn' })}
        <span className="min-w-6 h-6 px-1 rounded bg-white/20 flex items-center justify-center text-[13px] num">{trackedAttacks}</span>
      </button>
      <button onPointerDown={() => logAttack(opponentTeamId)} className={`${tool} ${C.turnover} text-white flex items-center gap-2`}>
        {t({ en: 'Their attack', is: 'Vörn' })}
        <span className="min-w-6 h-6 px-1 rounded bg-white/20 flex items-center justify-center text-[13px] num">{opponentAttacks}</span>
      </button>

      <button onPointerDown={() => setFlow({ s: 'sub_pick_in' })} className={`${tool} bg-[#e5e5e5] text-ink`}>
        {t({ en: 'Substitution', is: 'Skipti' })}
      </button>

      <button onPointerDown={undoLast} className={`${tool} bg-white text-[#c4242a] border border-[#f0c4c6]`}>
        {t({ en: 'Undo', is: 'Afturkalla' })}
      </button>

      {/* End match */}
      {confirming ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] text-muted">{t({ en: 'End the match?', is: 'Ljúka leik?' })}</span>
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
            className={`${tool} bg-[#111214] text-white`}>
            {loading ? '…' : t({ en: 'Yes, end it', is: 'Já, ljúka' })}
          </button>
          <button onPointerDown={() => setConfirming(false)} className={`${tool} bg-[#e5e5e5] text-ink`}>
            {t(T.no)}
          </button>
        </div>
      ) : (
        <button onPointerDown={() => setConfirming(true)} className={`${tool} bg-[#111214] text-white`}>
          {t({ en: 'End match', is: 'Ljúka' })}
        </button>
      )}

      {/* Cancel current flow */}
      {flow.s !== 'idle' && (
        <button onPointerDown={() => setFlow({ s: 'idle' })} className={`${tool} ml-auto bg-[#e5e5e5] text-ink`}>
          {t(T.cancel)}
        </button>
      )}
    </div>
  )
}

// ─── RecentEventsFeed ─────────────────────────────────────────────────────────

function RecentEventsFeed() {
  const t = useT()
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
    <div className="bg-ink px-2 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
      <span className="text-[12px] text-white/60 whitespace-nowrap pl-1">{t({ en: 'Tap to remove', is: 'Smelltu til að eyða' })}</span>
      {recent.map(e => (
        <button
          key={e.client_id}
          onPointerDown={() => voidEvent(e.client_id)}
          title={t({ en: 'Tap to remove', is: 'Smelltu til að eyða' })}
          className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-[#c4242a] text-white text-[13px]
            rounded-md px-2.5 h-8 active:scale-95 transition"
        >
          <span className="font-medium">{EVENT_TEXT[e.event_type] ? t(EVENT_TEXT[e.event_type]) : e.event_type}</span>
          {e.sub_type && <span className="text-white/75">· {SUB_TEXT[e.sub_type] ? t(SUB_TEXT[e.sub_type]) : e.sub_type.replace(/_/g, ' ')}</span>}
          <span className="text-white/60">{playerLabel(e.player_id)}</span>
        </button>
      ))}
    </div>
  )
}

// ─── FlowPanel ────────────────────────────────────────────────────────────────

function FlowPanel({ flow, setFlow }: { flow: FlowStep; setFlow: (f: FlowStep) => void }) {
  const t = useT()
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

  const o = (origin: string) => t(ORIGIN_LABEL[origin])
  const d = (dir: AttackDirection) => t(DIRECTION_LABEL[dir])
  const wrap = 'p-3 sm:p-4 md:p-5'
  const g3 = 'grid grid-cols-3 gap-2 md:gap-3'
  const g2 = 'grid grid-cols-2 gap-2 md:gap-3'
  const fromQ = t({ en: 'Where did the attack come from?', is: 'Hvaðan kom árásin?' })
  const dirQ = t({ en: 'Which way did it go?', is: 'Í hvaða átt er árásin?' })
  const phaseQ = t({ en: 'Type of attack', is: 'Tegund sóknar' })
  const numQ = t({ en: 'Numbers on court', is: 'Leiktala' })
  const handQ = t({ en: 'Was the hand up?', is: 'Höndin uppi?' })
  const zoneQ = t({ en: 'Where did the shot go?', is: 'Hvert fór skotið?' })

  // ── idle ─────────────────────────────────────────────────────────────────────
  if (flow.s === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted text-[15px] select-none gap-2 px-6 text-center">
        <svg width="36" height="36" viewBox="0 0 27 27" aria-hidden="true" className="opacity-60">
          {[0, 1, 2].flatMap(r => [0, 1, 2].map(c => <rect key={`${r}${c}`} x={c * 9.5} y={r * 9.5} width="8" height="8" fill={r === 0 && c === 2 ? '#1f2de6' : '#9aa0a8'} />))}
        </svg>
        {t({ en: 'Tap a player to start logging', is: 'Veldu leikmann til að hefja skráningu' })}
      </div>
    )
  }

  // ── category ─────────────────────────────────────────────────────────────────
  if (flow.s === 'category') {
    const { pid, tid } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[playerLabel(pid)]} />
        <StepTitle>{t({ en: 'Choose a category', is: 'Veldu flokk' })}</StepTitle>
        <div className={g3}>
          <Btn color={C.attack}  label={t(T.attack)}     size="lg" onTap={() => setFlow({ s: 'atk_sub', pid, tid })} />
          <Btn color={C.defence} label={t(T.defence)}    size="lg" onTap={() => setFlow({ s: 'def_sub', pid, tid })} />
          <Btn color={C.keeper}  label={t(T.goalkeeper)} size="lg" onTap={() => setFlow({ s: 'gk_sub',  pid, tid })} />
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
      <div className={wrap}>
        <StepTitle>{t({ en: 'Attack: choose an action', is: 'Sókn: veldu aðgerð' })}</StepTitle>
        <div className={g2}>
          <Btn color={C.attack} label={t({ en: 'Shot', is: 'Skot' })} size="lg" onTap={() => setFlow({ s: 'atk_shot_origin', pid, tid })} />
          <Btn color={C.attackDeep} label={t(T.other)} size="lg" onTap={() => setFlow({ s: 'atk_other', pid, tid })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_origin') {
    const { pid, tid } = flow
    return (
      <div className={wrap}>
        <StepTitle>{fromQ}</StepTitle>
        <div className={g3}>
          {ORIGINS.map(({ v, label }) => (
            <Btn key={v} color={C.attack} label={t(label)} size="lg"
              onTap={() => setFlow({ s: 'atk_shot_direction', pid, tid, origin: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_direction') {
    const { pid, tid, origin } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin)]} />
        <StepTitle>{dirQ}</StepTitle>
        <div className={g3}>
          {DIRECTIONS.map(({ v, label }) => (
            <Btn key={v} color={C.attack} label={t(label)} size="lg"
              onTap={() => setFlow({ s: 'atk_shot_range', pid, tid, origin, direction: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_range') {
    const { pid, tid, origin, direction } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction)]} />
        <StepTitle>{t({ en: 'Where was the shot taken from?', is: 'Hvaðan kom skotið?' })}</StepTitle>
        <div className={g3}>
          {RANGES.map(({ v, label }) => (
            <Btn key={v} color={C.attack} label={t(label)} size="lg"
              onTap={() => setFlow({ s: 'atk_shot_phase', pid, tid, origin, direction, range: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_phase') {
    const { pid, tid, origin, direction, range } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL[range])]} />
        <StepTitle>{phaseQ}</StepTitle>
        <div className={g3}>
          {PHASES.map(({ v, label }) => (
            <Btn key={v} color={C.attack} label={t(label)}
              onTap={() => setFlow({ s: 'atk_shot_numerical', pid, tid, origin, direction, range, phase: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_numerical') {
    const { pid, tid, origin, direction, range, phase } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL[range]), t(PHASE_LABEL[phase])]} />
        <StepTitle>{numQ}</StepTitle>
        <div className={g2}>
          {ATK_NUMERICALS.map(({ v, label }) => (
            <Btn key={v} color={C.attack} label={t(label)}
              onTap={() => setFlow({ s: 'atk_shot_assist', pid, tid, origin, direction, range, phase, numerical: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_assist') {
    const { pid, tid, origin, direction, range, phase, numerical } = flow
    const isPenalty = range === 'penalty'
    const others = trackedPlayers.filter(p => p.id !== pid)
    const crumbs = [o(origin), d(direction), t(RANGE_LABEL[range]), t(PHASE_LABEL[phase]), t(NUMERICAL_LABEL[numerical])]

    if (isPenalty) {
      return (
        <div className={wrap}>
          <Breadcrumb items={crumbs} />
          <StepTitle>{t({ en: 'Who passed for the 7 m?', is: 'Vítasending: hver sendi?' })}</StepTitle>
          <PlayerPickerGrid
            players={others}
            noneLabel={t(T.none)}
            onPick={(id) => setFlow({ s: 'atk_shot_fiskad_viti', pid, tid, origin, direction, phase, numerical, vitasendingId: id })}
            onNone={() => setFlow({ s: 'atk_shot_fiskad_viti', pid, tid, origin, direction, phase, numerical, vitasendingId: null })}
          />
        </div>
      )
    }

    return (
      <div className={wrap}>
        <Breadcrumb items={crumbs} />
        <StepTitle>{t({ en: 'Who made the assist?', is: 'Hver átti stoðsendinguna?' })}</StepTitle>
        <PlayerPickerGrid
          players={others}
          noneLabel={t(T.none)}
          onPick={(id) => setFlow({ s: 'atk_shot_zone', pid, tid, origin, direction, range, phase, numerical, assistId: id, vitasendingId: null, fiskadVitiId: null })}
          onNone={() => setFlow({ s: 'atk_shot_zone', pid, tid, origin, direction, range, phase, numerical, assistId: null, vitasendingId: null, fiskadVitiId: null })}
        />
      </div>
    )
  }

  if (flow.s === 'atk_shot_fiskad_viti') {
    const { pid, tid, origin, direction, phase, numerical, vitasendingId } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL.penalty), t(PHASE_LABEL[phase]), t(NUMERICAL_LABEL[numerical]), vitasendingId ? `${t({ en: '7 m pass', is: 'Vítasending' })}: ${playerLabel(vitasendingId)}` : undefined]} />
        <StepTitle>{t({ en: 'Who drew the 7 m?', is: 'Fiskað víti: hverjum var gert víti á?' })}</StepTitle>
        <PlayerPickerGrid
          players={trackedPlayers}
          noneLabel={t(T.none)}
          onPick={(id) => setFlow({ s: 'atk_shot_zone', pid, tid, origin, direction, range: 'penalty', phase, numerical, assistId: null, vitasendingId, fiskadVitiId: id })}
          onNone={() => setFlow({ s: 'atk_shot_zone', pid, tid, origin, direction, range: 'penalty', phase, numerical, assistId: null, vitasendingId, fiskadVitiId: null })}
        />
      </div>
    )
  }

  if (flow.s === 'atk_shot_zone') {
    const { pid, tid, origin, direction, range, phase, numerical, assistId, vitasendingId, fiskadVitiId } = flow

    function commitOffTarget(subType: 'blocked' | 'wide' | 'post') {
      const ctx: Record<string, unknown> = { attack_origin: origin, attack_direction: direction }
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
        zone: null,
        context: ctx,
      })
      // The player who drew the penalty gets credit whatever the outcome —
      // same event as logged for a goal/save in the hand-up step.
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
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL[range]), t(PHASE_LABEL[phase]), t(NUMERICAL_LABEL[numerical])]} />
        <StepTitle>{zoneQ}</StepTitle>
        <ZoneGrid
          onZone={(z) => setFlow({ s: 'atk_shot_outcome', pid, tid, origin, direction, range, phase, numerical, assistId, vitasendingId, fiskadVitiId, zone: z })}
          onBlocked={() => commitOffTarget('blocked')}
          onWide={() => commitOffTarget('wide')}
          onPost={() => commitOffTarget('post')}
        />
      </div>
    )
  }

  if (flow.s === 'atk_shot_outcome') {
    const { pid, tid, origin, direction, range, phase, numerical, assistId, vitasendingId, fiskadVitiId, zone } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL[range]), t(PHASE_LABEL[phase]), t(NUMERICAL_LABEL[numerical])]} />
        <StepTitle>{t({ en: 'Outcome', is: 'Niðurstaða' })}</StepTitle>
        <div className={g2}>
          <Btn color={C.attack} label={t(T.goal)} size="lg"
            onTap={() => setFlow({ s: 'atk_shot_hand_up', pid, tid, origin, direction, range, phase, numerical, assistId, vitasendingId, fiskadVitiId, zone, subType: 'goal' })} />
          <Btn color={C.neutral} label={t(T.saved)} size="lg"
            onTap={() => setFlow({ s: 'atk_shot_hand_up', pid, tid, origin, direction, range, phase, numerical, assistId, vitasendingId, fiskadVitiId, zone, subType: 'saved' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_shot_hand_up') {
    const { pid, tid, origin, direction, range, phase, numerical, assistId, vitasendingId, fiskadVitiId, zone, subType } = flow

    function commitShot(handUp: boolean) {
      const ctx: Record<string, unknown> = { attack_origin: origin, attack_direction: direction, hand_up: handUp }
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
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL[range]), subType === 'goal' ? t(T.goal) : t(T.saved)]} />
        <StepTitle>{handQ}</StepTitle>
        <div className={g2}>
          <Btn color={C.attack} label={t(T.yes)} size="lg" onTap={() => commitShot(true)} />
          <Btn color={C.neutral} label={t(T.no)} size="lg" onTap={() => commitShot(false)} />
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_other') {
    const { pid, tid } = flow
    return (
      <div className={wrap}>
        <StepTitle>{t({ en: 'Attack: other', is: 'Annað: sókn' })}</StepTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
          <Btn color={C.turnover} label={t({ en: 'Turnover', is: 'Tapaður bolti' })} onTap={() => setFlow({ s: 'atk_turnover', pid, tid })} />
          <Btn color={C.attackDeep} label={t({ en: 'Offensive rebound', is: 'Sóknarfrákast' })}
            onTap={() => done({ event_type: 'ATTACKING_ACTION', player_id: pid, team_id: tid, sub_type: 'offensive_rebound' })} />
          <Btn color={C.attackDeep} label={t({ en: 'Drew 2 min', is: 'Fengnar 2 mín' })}
            onTap={() => done({ event_type: 'ATTACKING_ACTION', player_id: pid, team_id: tid, sub_type: 'drew_suspension' })} />
          <Btn color={C.keeperDeep} label={t({ en: '3 goals in a row', is: '3 mörk í röð' })}
            onTap={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: opponentTeamId, sub_type: 'empty_phase' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_turnover') {
    const { pid, tid } = flow
    return (
      <div className={wrap}>
        <StepTitle>{t({ en: 'Turnover: what kind?', is: 'Tapaður bolti: tegund' })}</StepTitle>
        <div className={g2}>
          <Btn color={C.turnover} label={t({ en: 'Offensive foul', is: 'Sóknarbrot' })} onTap={() => setFlow({ s: 'atk_turnover_origin', pid, tid, subType: 'offensive_foul' })} />
          <Btn color={C.turnover} label={t({ en: 'Bad pass', is: 'Sendingarmistök' })} onTap={() => setFlow({ s: 'atk_turnover_origin', pid, tid, subType: 'bad_pass' })} />
          <Btn color={C.turnover} label={t({ en: 'Passive play', is: 'Töf' })} onTap={() => setFlow({ s: 'atk_turnover_origin', pid, tid, subType: 'delay' })} />
          <Btn color={C.turnover} label={t(T.other)} onTap={() => setFlow({ s: 'atk_turnover_origin', pid, tid, subType: 'other' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_turnover_origin') {
    const { pid, tid, subType } = flow
    return (
      <div className={wrap}>
        <StepTitle>{fromQ}</StepTitle>
        <div className={g3}>
          {ORIGINS.map(({ v, label }) => (
            <Btn key={v} color={C.turnover} label={t(label)} size="lg"
              onTap={() => setFlow({ s: 'atk_turnover_direction', pid, tid, subType, origin: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'atk_turnover_direction') {
    const { pid, tid, subType, origin } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin)]} />
        <StepTitle>{dirQ}</StepTitle>
        <div className={g3}>
          {DIRECTIONS.map(({ v, label }) => (
            <Btn key={v} color={C.turnover} label={t(label)} size="lg"
              onTap={() => done({
                event_type: 'TURNOVER',
                player_id: pid,
                team_id: tid,
                sub_type: subType,
                context: { attack_origin: origin, attack_direction: v },
              })} />
          ))}
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
      <div className={wrap}>
        <StepTitle>{t({ en: 'Goalkeeper: choose an action', is: 'Markmaður: veldu aðgerð' })}</StepTitle>
        <div className={g2}>
          <Btn color={C.keeper} label={t({ en: 'Shot', is: 'Skot' })} size="lg" onTap={() => setFlow({ s: 'gk_shot_origin', pid, tid })} />
          <Btn color={C.keeperDeep} label={t(T.other)} size="lg" onTap={() => setFlow({ s: 'gk_other', pid, tid })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_origin') {
    const { pid, tid } = flow
    return (
      <div className={wrap}>
        <StepTitle>{fromQ}</StepTitle>
        <div className={g3}>
          {ORIGINS.map(({ v, label }) => (
            <Btn key={v} color={C.keeper} label={t(label)} size="lg"
              onTap={() => setFlow({ s: 'gk_shot_direction', pid, tid, origin: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_direction') {
    const { pid, tid, origin } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin)]} />
        <StepTitle>{dirQ}</StepTitle>
        <div className={g3}>
          {DIRECTIONS.map(({ v, label }) => (
            <Btn key={v} color={C.keeper} label={t(label)} size="lg"
              onTap={() => setFlow({ s: 'gk_shot_range', pid, tid, origin, direction: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_range') {
    const { pid, tid, origin, direction } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction)]} />
        <StepTitle>{t({ en: 'Where was the shot taken from?', is: 'Hvaðan kom skotið frá?' })}</StepTitle>
        <div className={g3}>
          {RANGES.map(({ v, label }) => (
            <Btn key={v} color={C.keeper} label={t(label)} size="lg"
              onTap={() => setFlow({ s: 'gk_shot_phase', pid, tid, origin, direction, range: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_phase') {
    const { pid, tid, origin, direction, range } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL[range])]} />
        <StepTitle>{phaseQ}</StepTitle>
        <div className={g3}>
          {PHASES.map(({ v, label }) => (
            <Btn key={v} color={C.keeper} label={t(label)}
              onTap={() => setFlow({ s: 'gk_shot_numerical', pid, tid, origin, direction, range, phase: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_numerical') {
    const { pid, tid, origin, direction, range, phase } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL[range]), t(PHASE_LABEL[phase])]} />
        <StepTitle>{numQ}</StepTitle>
        <div className={g2}>
          {GK_NUMERICALS.map(({ v, label }) => (
            <Btn key={v} color={C.keeper} label={t(label)}
              onTap={() => setFlow({ s: 'gk_shot_zone', pid, tid, origin, direction, range, phase, numerical: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_zone') {
    const { pid, tid, origin, direction, range, phase, numerical } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL[range]), t(PHASE_LABEL[phase]), t(NUMERICAL_LABEL[numerical])]} />
        <StepTitle>{zoneQ}</StepTitle>
        <ZoneGrid
          onZone={(z) => setFlow({ s: 'gk_shot_outcome', pid, tid, origin, direction, range, phase, numerical, zone: z })}
          onWide={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: 'missed', shot_range: range, phase_type: phase, numerical_state: numerical, context: { attack_origin: origin, attack_direction: direction } })}
          onPost={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: 'missed', shot_range: range, phase_type: phase, numerical_state: numerical, context: { attack_origin: origin, attack_direction: direction } })}
        />
      </div>
    )
  }

  if (flow.s === 'gk_shot_outcome') {
    const { pid, tid, origin, direction, range, phase, numerical, zone } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL[range]), t(PHASE_LABEL[phase]), t(NUMERICAL_LABEL[numerical])]} />
        <StepTitle>{t({ en: 'Outcome', is: 'Niðurstaða' })}</StepTitle>
        <div className={g2}>
          <Btn color={C.keeper} label={t(T.saved)} size="lg"
            onTap={() => setFlow({ s: 'gk_shot_hand_up', pid, tid, origin, direction, range, phase, numerical, zone, subType: 'save' })} />
          <Btn color={C.red} label={t(T.goal)} size="lg"
            onTap={() => setFlow({ s: 'gk_shot_hand_up', pid, tid, origin, direction, range, phase, numerical, zone, subType: 'goal_conceded' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_shot_hand_up') {
    const { pid, tid, origin, direction, range, phase, numerical, zone, subType } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin), d(direction), t(RANGE_LABEL[range]), subType === 'save' ? t(T.saved) : t(T.goal)]} />
        <StepTitle>{handQ}</StepTitle>
        <div className={g2}>
          <Btn color={C.keeper} label={t(T.yes)} size="lg"
            onTap={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: subType, shot_range: range, phase_type: phase, numerical_state: numerical, zone, context: { attack_origin: origin, attack_direction: direction, hand_up: true } })} />
          <Btn color={C.neutral} label={t(T.no)} size="lg"
            onTap={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: subType, shot_range: range, phase_type: phase, numerical_state: numerical, zone, context: { attack_origin: origin, attack_direction: direction, hand_up: false } })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'gk_other') {
    const { pid, tid } = flow
    return (
      <div className={wrap}>
        <StepTitle>{t({ en: 'Goalkeeper: other', is: 'Annað: markmaður' })}</StepTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
          <Btn color={C.keeper} label={t({ en: 'Empty phase (3 goals against in a row)', is: 'Tómur fasi (3 mörk á okkur í röð)' })}
            onTap={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: 'empty_phase' })} />
          <Btn color={C.keeper} label={t({ en: 'Positive response', is: 'Jákvæð viðbrögð' })}
            onTap={() => done({ event_type: 'GOALKEEPER_ACTION', player_id: pid, team_id: tid, sub_type: 'positive_response' })} />
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DEFENSE
  // ════════════════════════════════════════════════════════════════════════════

  const foulName = (f: 'attacking_foul' | '7m_awarded') => f === 'attacking_foul' ? t({ en: 'Free throw', is: 'Fríkast' }) : t({ en: '7 m', is: 'Víti' })

  if (flow.s === 'def_sub') {
    const { pid, tid } = flow
    return (
      <div className={wrap}>
        <StepTitle>{t({ en: 'Defence: choose a category', is: 'Vörn: veldu flokk' })}</StepTitle>
        <div className={g3}>
          <Btn color={C.defence} label={t({ en: 'Foul', is: 'Brot' })} size="lg" onTap={() => setFlow({ s: 'def_brot_type', pid, tid })} />
          <Btn color={C.defence} label={t(T.other)} size="lg" onTap={() => setFlow({ s: 'def_other', pid, tid })} />
          <Btn color={C.defence} label={t({ en: 'Penalty', is: 'Refsing' })} size="lg" onTap={() => setFlow({ s: 'def_refsing', pid, tid })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'def_brot_type') {
    const { pid, tid } = flow
    return (
      <div className={wrap}>
        <StepTitle>{t({ en: 'Foul: what kind?', is: 'Brot: tegund' })}</StepTitle>
        <div className={g2}>
          <Btn color={C.defence} label={foulName('attacking_foul')} size="lg"
            onTap={() => setFlow({ s: 'def_brot_origin', pid, tid, foulSub: 'attacking_foul' })} />
          <Btn color={C.defence} label={foulName('7m_awarded')} size="lg"
            onTap={() => setFlow({ s: 'def_brot_origin', pid, tid, foulSub: '7m_awarded' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'def_brot_origin') {
    const { pid, tid, foulSub } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[foulName(foulSub)]} />
        <StepTitle>{fromQ}</StepTitle>
        <div className={g3}>
          {ORIGINS.map(({ v, label }) => (
            <Btn key={v} color={C.defence} label={t(label)} size="lg"
              onTap={() => setFlow({ s: 'def_brot_direction', pid, tid, foulSub, origin: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'def_brot_direction') {
    const { pid, tid, foulSub, origin } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[foulName(foulSub), o(origin)]} />
        <StepTitle>{dirQ}</StepTitle>
        <div className={g3}>
          {DIRECTIONS.map(({ v, label }) => (
            <Btn key={v} color={C.defence} label={t(label)} size="lg"
              onTap={() => setFlow({ s: 'def_brot_card', pid, tid, foulSub, origin, direction: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'def_brot_card') {
    const { pid, tid, foulSub, origin, direction } = flow

    function commitBrot(card: '2min' | 'yellow_card' | 'red_card' | null) {
      commitEvent({
        event_type: 'FOUL',
        player_id: pid,
        team_id: tid,
        sub_type: foulSub,
        context: { attack_origin: origin, attack_direction: direction },
      })
      if (card) {
        commitEvent({ event_type: 'SUSPENSION', player_id: pid, team_id: tid, sub_type: card })
      }
      setFlow({ s: 'idle' })
    }

    return (
      <div className={wrap}>
        <Breadcrumb items={[foulName(foulSub), o(origin), d(direction)]} />
        <StepTitle>{t({ en: 'Penalty', is: 'Refsing' })}</StepTitle>
        <div className={g2}>
          <Btn color={C.yellow}  label={t({ en: 'Yellow card', is: 'Gult spjald' })} onTap={() => commitBrot('yellow_card')} />
          <Btn color={C.red}     label={t({ en: '2 min', is: '2 mín' })} onTap={() => commitBrot('2min')} />
          <Btn color={C.redDeep} label={t({ en: 'Red card', is: 'Rautt spjald' })} onTap={() => commitBrot('red_card')} />
          <Btn color={C.neutral} label={t({ en: 'None', is: 'Ekkert' })} onTap={() => commitBrot(null)} />
        </div>
      </div>
    )
  }

  if (flow.s === 'def_other') {
    const { pid, tid } = flow
    const defAction = (sub: string) =>
      done({ event_type: 'DEFENSIVE_ACTION', player_id: pid, team_id: tid, sub_type: sub as never })
    const defActionWithCombo = (sub: string) =>
      setFlow({ s: 'def_other_origin', pid, tid, sub })

    return (
      <div className={wrap}>
        <StepTitle>{t({ en: 'Defence: other', is: 'Annað: vörn' })}</StepTitle>
        <div className={g2}>
          <Btn color={C.defence} label={t({ en: '1 v 1', is: 'Árás 1 á 1' })} onTap={() => setFlow({ s: 'def_duel_outcome', pid, tid })} />
          <Btn color={C.defence} label={t({ en: 'High contact', is: 'Hár kontakt' })} onTap={() => defAction('high_contact')} />
          <Btn color={C.defence} label={t({ en: 'Steal', is: 'Stolinn bolti' })} onTap={() => defActionWithCombo('interception')} />
          <Btn color={C.defence} label={t({ en: 'Block', is: 'Blokk' })} onTap={() => defActionWithCombo('block')} />
          <Btn color={C.defence} label={t({ en: 'Rebound', is: 'Frákast' })} onTap={() => defActionWithCombo('rebound')} />
          <Btn color={C.defence} label={t({ en: 'Drew offensive foul', is: 'Fiskuð sóknarbrot' })} onTap={() => defActionWithCombo('drew_offensive_foul')} />
          <Btn color={C.defence} label={t({ en: 'Opponent lost the ball', is: 'Andstæðingur tapar bolta' })} onTap={() => defActionWithCombo('opponent_lost_ball')} />
          <Btn color={C.defence} label={t({ en: 'Dissent', is: 'Værukærð' })} onTap={() => defAction('protest')} />
        </div>
      </div>
    )
  }

  if (flow.s === 'def_duel_outcome') {
    const { pid, tid } = flow
    return (
      <div className={wrap}>
        <StepTitle>{t({ en: '1 v 1: result', is: 'Árás 1 á 1: niðurstaða' })}</StepTitle>
        <div className={g2}>
          <Btn color={C.defence} label={t({ en: 'Won', is: 'Vann' })} size="lg"
            onTap={() => setFlow({ s: 'def_other_origin', pid, tid, sub: 'duel_won' })} />
          <Btn color={C.neutral} label={t({ en: 'Lost', is: 'Tapaði' })} size="lg"
            onTap={() => setFlow({ s: 'def_other_origin', pid, tid, sub: 'duel_lost' })} />
        </div>
      </div>
    )
  }

  if (flow.s === 'def_other_origin') {
    const { pid, tid, sub } = flow
    return (
      <div className={wrap}>
        <StepTitle>{fromQ}</StepTitle>
        <div className={g3}>
          {ORIGINS.map(({ v, label }) => (
            <Btn key={v} color={C.defence} label={t(label)} size="lg"
              onTap={() => setFlow({ s: 'def_other_direction', pid, tid, sub, origin: v })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'def_other_direction') {
    const { pid, tid, sub, origin } = flow
    return (
      <div className={wrap}>
        <Breadcrumb items={[o(origin)]} />
        <StepTitle>{dirQ}</StepTitle>
        <div className={g3}>
          {DIRECTIONS.map(({ v, label }) => (
            <Btn key={v} color={C.defence} label={t(label)} size="lg"
              onTap={() => done({
                event_type: 'DEFENSIVE_ACTION',
                player_id: pid,
                team_id: tid,
                sub_type: sub as never,
                context: { attack_origin: origin, attack_direction: v },
              })} />
          ))}
        </div>
      </div>
    )
  }

  if (flow.s === 'def_refsing') {
    const { pid, tid } = flow
    return (
      <div className={wrap}>
        <StepTitle>{t({ en: 'Penalty', is: 'Refsing' })}</StepTitle>
        <div className={g2}>
          <Btn color={C.yellow} label={t({ en: 'Yellow card', is: 'Gult spjald' })}
            onTap={() => done({ event_type: 'SUSPENSION', player_id: pid, team_id: tid, sub_type: 'yellow_card' })} />
          <Btn color={C.red} label={t({ en: '2 min', is: '2 mín' })}
            onTap={() => done({ event_type: 'SUSPENSION', player_id: pid, team_id: tid, sub_type: '2min' })} />
          <Btn color={C.redDeep} label={t({ en: 'Red card', is: 'Rautt spjald' })}
            onTap={() => done({ event_type: 'SUSPENSION', player_id: pid, team_id: tid, sub_type: 'red_card' })} />
          <Btn color={C.blue} label={t({ en: 'Blue card', is: 'Blátt spjald' })}
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
      <div className={wrap}>
        <StepTitle>{t({ en: 'Substitution: who comes on?', is: 'Skipti: kemur INN' })}</StepTitle>
        <PlayerPickerGrid
          players={bench}
          noneLabel={t(T.cancel)}
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
      <div className={wrap}>
        <Breadcrumb items={[`${t({ en: 'On', is: 'Inn' })}: ${playerLabel(playerInId)}`]} />
        <StepTitle>{t({ en: 'Substitution: who goes off?', is: 'Skipti: fer ÚT' })}</StepTitle>
        <PlayerPickerGrid
          players={court}
          noneLabel={t(T.cancel)}
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

function PlayerTile({ p, selected, tone, onTap }: { p: RosteredPlayer; selected: boolean; tone: 'court' | 'bench' | 'opponent'; onTap: () => void }) {
  const base = 'flex flex-col items-center justify-center rounded-lg border p-1 sm:p-2 min-h-[48px] sm:min-h-[58px] md:min-h-[66px] select-none active:scale-95 transition-transform'
  const look = selected
    ? tone === 'opponent' ? 'bg-[#c2410c] border-[#c2410c] text-white' : 'bg-[#111214] border-[#111214] text-white'
    : tone === 'court' ? 'bg-white border-[#cdd2d9] text-ink hover:border-ink'
    : tone === 'bench' ? 'bg-[#f5f6f8] border-line text-muted hover:border-[#9aa0a8]'
    : 'bg-[#f5f6f8] border-line text-muted hover:border-[#c2410c]'
  return (
    <button onPointerDown={onTap} className={`${base} ${look}`}>
      <span className="text-[18px] sm:text-[20px] md:text-[22px] font-semibold leading-none num">{p.jersey_number ?? '?'}</span>
      <span className="mt-1 text-[11px] sm:text-[12px] truncate max-w-full px-0.5">{p.last_name}</span>
    </button>
  )
}

export function EventLogger() {
  const t = useT()
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

  const label = 'text-[12px] font-medium text-muted px-1 pt-2 first:pt-0'

  return (
    <div className="flex flex-col h-full bg-ground select-none overflow-hidden">
      <ScoreBar />
      <TopBar flow={flow} setFlow={setFlow} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left: player panel */}
        <div className="w-[104px] sm:w-[148px] md:w-[188px] bg-white border-r border-line flex flex-col overflow-y-auto p-1.5 sm:p-2 gap-1.5 shrink-0">
          <p className={label}>{t({ en: 'On court', is: 'Á velli' })}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {trackedPlayers.filter(p => lineupPlayerIds.includes(p.id)).map(p => (
              <PlayerTile key={p.id} p={p} tone="court" selected={selectedPid === p.id} onTap={() => selectPlayer(p.id, p.team_id)} />
            ))}
          </div>

          {trackedPlayers.some(p => !lineupPlayerIds.includes(p.id)) && <p className={label}>{t({ en: 'Bench', is: 'Á bekk' })}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {trackedPlayers.filter(p => !lineupPlayerIds.includes(p.id)).map(p => (
              <PlayerTile key={p.id} p={p} tone="bench" selected={selectedPid === p.id} onTap={() => selectPlayer(p.id, p.team_id)} />
            ))}
          </div>

          {opponentPlayers.length > 0 && (
            <>
              <p className={label}>{t({ en: 'Opponents', is: 'Andstæðingar' })}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {opponentPlayers.map(p => (
                  <PlayerTile key={p.id} p={p} tone="opponent" selected={selectedPid === p.id} onTap={() => selectPlayer(p.id, p.team_id)} />
                ))}
              </div>
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
