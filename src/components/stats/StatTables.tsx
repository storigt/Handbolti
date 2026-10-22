// Stat tables (attack, defence, goalkeeping, team). Column order is unchanged
// from earlier versions so coaches find every number where it always was;
// only the look and the language are new. Tables follow the app rules: 12px
// grey sentence-case headers, a 1px line opening each column group, numbers
// right-aligned in tabular figures, zero shown as a grey dash.
import { useMemo, type ReactNode } from 'react'
import {
  computeAttack, computeDefense, computeGK, computeTeamStats,
  sumAttack, sumDefense, sumGK,
  pct, v,
  type AttackRow, type DefenseRow, type GKRow,
} from '@/lib/stats/matchStats'
import type { Event, Player } from '@/lib/db/schema'
import { useT, type Text } from '@/lib/i18n/lang'
import { T, ORIGIN_TEXT } from '@/lib/i18n/terms'
import { Segmented } from '@/components/ui'

type ViewMode = 'total' | 'average'

// ─── View mode toggle ─────────────────────────────────────────────────────────

export function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const t = useT()
  return (
    <Segmented<ViewMode> value={mode} onChange={onChange} size="sm"
      options={[{ v: 'total', label: t(T.totals) }, { v: 'average', label: t(T.perMatch) }]} />
  )
}

// ─── Table primitives ─────────────────────────────────────────────────────────

const GROUP_EDGE = 'border-l border-line'

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`px-2 pt-1 pb-2 text-right text-[12px] font-normal text-muted whitespace-nowrap ${className}`}>
      {children}
    </th>
  )
}

export function ThGroup({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <th colSpan={colSpan} className={`px-2 pt-2.5 pb-0.5 text-left text-[12px] font-medium text-ink whitespace-nowrap ${GROUP_EDGE}`}>
      {label}
    </th>
  )
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <td className={`px-2 py-2 text-right whitespace-nowrap ${className}`}>
      {children}
    </td>
  )
}

const zero = (n: number) => (n > 0 ? 'text-ink' : 'text-[#9aa0a8]')

function fmt(n: number, viewMode: ViewMode, matchCount: number) {
  return viewMode === 'average' ? (n > 0 ? (n / matchCount).toFixed(1) : '—') : v(n)
}

function TdGKPair({ saved, faced, va }: { saved: number; faced: number; va: (n: number) => number | string }) {
  return (
    <>
      <Td className={`${GROUP_EDGE} ${saved > 0 ? 'text-ink font-medium' : 'text-[#9aa0a8]'}`}>{va(saved)}</Td>
      <Td className={zero(faced)}>{va(faced)}</Td>
      <Td className="text-muted">{pct(saved, faced)}</Td>
    </>
  )
}

function TdTriple({ goals, shots, highlight = false, viewMode = 'total', matchCount = 1 }: {
  goals: number; shots: number; highlight?: boolean
  viewMode?: ViewMode; matchCount?: number
}) {
  return (
    <>
      <Td className={`${GROUP_EDGE} ${goals > 0 ? (highlight ? 'text-ink font-semibold' : 'text-ink font-medium') : 'text-[#9aa0a8]'}`}>{fmt(goals, viewMode, matchCount)}</Td>
      <Td className={zero(shots)}>{fmt(shots, viewMode, matchCount)}</Td>
      <Td className="text-muted">{pct(goals, shots)}</Td>
    </>
  )
}

/** Sticky name and number columns, shared by every table. */
function NameCells({ label, jersey, totals }: { label: string; jersey: number | null | undefined; totals: boolean }) {
  const bg = totals ? 'bg-[#f5f6f8]' : 'bg-white group-hover:bg-[#f8f9fa]'
  return (
    <>
      <td className={`sticky left-0 z-10 px-3 py-2 text-left font-medium text-ink min-w-[132px] max-w-[180px] truncate ${bg}`}>{label}</td>
      <td className={`sticky left-[132px] z-10 px-2 py-2 text-right text-muted min-w-[36px] ${bg}`}>{jersey ?? '—'}</td>
    </>
  )
}

function HeadNameCells({ rowSpan = 1 }: { rowSpan?: number }) {
  const t = useT()
  return (
    <>
      <th rowSpan={rowSpan} className="sticky left-0 z-20 bg-white px-3 pb-2 text-left align-bottom text-[12px] font-normal text-muted min-w-[132px]">{t(T.name)}</th>
      <th rowSpan={rowSpan} className="sticky left-[132px] z-20 bg-white px-2 pb-2 text-right align-bottom text-[12px] font-normal text-muted min-w-[36px]">#</th>
    </>
  )
}

const tableClass = 'text-[13px] border-collapse min-w-max num'
const rowClass = (totals: boolean) => `group border-t ${totals ? 'border-[#d6dae1] bg-[#f5f6f8] font-semibold' : 'border-[#eef0f2] bg-white hover:bg-[#f8f9fa]'}`

// ─── Team Stats table ─────────────────────────────────────────────────────────

export function TeamStatsTable({ events, trackedTeamId, myTeamName, opponentTeamName }: {
  events: Event[]
  trackedTeamId: string
  myTeamName?: string
  opponentTeamName?: string
}) {
  const t = useT()
  const stats = useMemo(() => computeTeamStats(events, trackedTeamId), [events, trackedTeamId])
  const rows = [
    { name: myTeamName ?? t(T.team), goals: stats.myGoals, attacks: stats.myAttacks, shots: stats.myShots },
    { name: opponentTeamName ?? t(T.opponent), goals: stats.opponentGoals, attacks: stats.opponentAttacks, shots: stats.opponentShots },
  ]
  return (
    <div className="p-4">
      <table className={tableClass}>
        <thead>
          <tr>
            <th className="px-3 pb-2 text-left text-[12px] font-normal text-muted min-w-[160px]">{t(T.team)}</th>
            <Th>{t(T.goals)}</Th><Th>{t(T.shots)}</Th><Th>{t(T.attacks)}</Th><Th>{t(T.shootingPct)}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={rowClass(false)}>
              <td className="px-3 py-2.5 text-left font-medium max-w-[200px] truncate">{r.name}</td>
              <Td className={`text-[15px] ${i === 0 && r.goals > 0 ? 'text-accent font-semibold' : 'font-medium'}`}>{r.goals}</Td>
              <Td className={zero(r.shots)}>{r.shots || '—'}</Td>
              <Td className={zero(r.attacks)}>{r.attacks > 0 ? r.attacks : '—'}</Td>
              <Td className="text-muted">{pct(r.goals, r.shots)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Attack table ─────────────────────────────────────────────────────────────

const RANGE_GROUPS: Text[] = [T.total, T.penalty, T.wing, T.leftWing, T.rightWing, T.nineM, T.sevenEight, T.sixM, T.line,
  T.fastBreak, T.secondWave, T.setPlay, T.inferiority, T.superiority, T.s7v6, T.s6v6]
const ORIGIN_KEYS = ['left_wing', 'left_center', 'center', 'right_center', 'right_wing', 'line', 'other']

function AtkRow({ r, isTotals = false, viewMode = 'total', matchCount = 1 }: {
  r: Omit<AttackRow, 'player'> & { player?: Player }; isTotals?: boolean
  viewMode?: ViewMode; matchCount?: number
}) {
  const t = useT()
  const va = (n: number) => fmt(n, viewMode, matchCount)
  const tdp = { viewMode, matchCount }
  const label = r.player ? `${r.player.first_name} ${r.player.last_name}` : t(viewMode === 'average' ? T.average : T.total)
  return (
    <tr className={rowClass(isTotals)}>
      <NameCells label={label} jersey={r.player?.jersey_number} totals={isTotals} />
      <TdTriple goals={r.goals} shots={r.shots} highlight {...tdp} />
      <TdTriple goals={r.penGoals} shots={r.penShots} {...tdp} />
      <TdTriple goals={r.cornGoals} shots={r.cornShots} {...tdp} />
      <TdTriple goals={r.cornLeftGoals} shots={r.cornLeftShots} {...tdp} />
      <TdTriple goals={r.cornRightGoals} shots={r.cornRightShots} {...tdp} />
      <TdTriple goals={r.nineMGoals} shots={r.nineMShots} {...tdp} />
      <TdTriple goals={r.s78Goals} shots={r.s78Shots} {...tdp} />
      <TdTriple goals={r.s6mGoals} shots={r.s6mShots} {...tdp} />
      <TdTriple goals={r.lineGoals} shots={r.lineShots} {...tdp} />
      <TdTriple goals={r.fbGoals} shots={r.fbShots} {...tdp} />
      <TdTriple goals={r.swGoals} shots={r.swShots} {...tdp} />
      <TdTriple goals={r.spGoals} shots={r.spShots} {...tdp} />
      <TdTriple goals={r.infGoals} shots={r.infShots} {...tdp} />
      <TdTriple goals={r.supGoals} shots={r.supShots} {...tdp} />
      <TdTriple goals={r.s76Goals} shots={r.s76Shots} {...tdp} />
      <TdTriple goals={r.s66Goals} shots={r.s66Shots} {...tdp} />
      <Td className={`${GROUP_EDGE} ${zero(r.chancesCreated)}`}>{va(r.chancesCreated)}</Td>
      <Td className={zero(r.assists)}>{va(r.assists)}</Td>
      <Td className={zero(r.penaltyAssists)}>{va(r.penaltyAssists)}</Td>
      <Td className={zero(r.drewPenalty)}>{va(r.drewPenalty)}</Td>
      <Td className={zero(r.turnovers)}>{va(r.turnovers)}</Td>
      <Td className={zero(r.offensiveRebounds)}>{va(r.offensiveRebounds)}</Td>
      <Td className={zero(r.drewSuspension)}>{va(r.drewSuspension)}</Td>
      <TdTriple goals={r.origLeftWingGoals}    shots={r.origLeftWingShots}    {...tdp} />
      <TdTriple goals={r.origLeftCenterGoals}  shots={r.origLeftCenterShots}  {...tdp} />
      <TdTriple goals={r.origCenterGoals}      shots={r.origCenterShots}      {...tdp} />
      <TdTriple goals={r.origRightCenterGoals} shots={r.origRightCenterShots} {...tdp} />
      <TdTriple goals={r.origRightWingGoals}   shots={r.origRightWingShots}   {...tdp} />
      <TdTriple goals={r.origLineGoals}        shots={r.origLineShots}        {...tdp} />
      <TdTriple goals={r.origOtherGoals}       shots={r.origOtherShots}       {...tdp} />
      <TdTriple goals={r.handUpGoals}          shots={r.handUpShots}          {...tdp} />
      <TdTriple goals={r.handDownGoals}        shots={r.handDownShots}        {...tdp} />
    </tr>
  )
}

export function AttackTable({ rows, matchCount = 1, viewMode = 'total' }: {
  rows: AttackRow[]; matchCount?: number; viewMode?: ViewMode
}) {
  const t = useT()
  const totals = useMemo(() => sumAttack(rows), [rows])
  const triple = (k: string) => [<Th key={`${k}g`}>{t(T.goalsShort)}</Th>, <Th key={`${k}s`}>{t(T.shots)}</Th>, <Th key={`${k}p`}>%</Th>]
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            <HeadNameCells rowSpan={2} />
            {RANGE_GROUPS.map((g, i) => <ThGroup key={i} label={t(g)} colSpan={3} />)}
            <ThGroup label={t(T.other)} colSpan={7} />
            {ORIGIN_KEYS.map(k => <ThGroup key={k} label={`${t(ORIGIN_TEXT[k])}${k === 'left_wing' || k === 'line' ? ` (${t(T.origin)})` : ''}`} colSpan={3} />)}
            <ThGroup label={t(T.handUp)} colSpan={3} />
            <ThGroup label={t(T.handDown)} colSpan={3} />
          </tr>
          <tr className="border-b border-line">
            {RANGE_GROUPS.flatMap((_, i) => triple(`r${i}`))}
            <Th className={GROUP_EDGE}>{t(T.chancesCreated)}</Th><Th>{t(T.assists)}</Th><Th>{t(T.penaltyAssists)}</Th><Th>{t(T.drewPenalty)}</Th>
            <Th>{t(T.turnovers)}</Th><Th>{t(T.offRebounds)}</Th><Th>{t(T.drewSuspension)}</Th>
            {[...ORIGIN_KEYS, 'up', 'down'].flatMap(k => triple(`o${k}`))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => <AtkRow key={r.player.id} r={r} viewMode={viewMode} matchCount={matchCount} />)}
          <AtkRow r={{ ...totals }} isTotals viewMode={viewMode} matchCount={matchCount} />
        </tbody>
      </table>
    </div>
  )
}

// ─── Defence table ────────────────────────────────────────────────────────────

function DefRow({ r, isTotals = false, viewMode = 'total', matchCount = 1 }: {
  r: Omit<DefenseRow, 'player'> & { player?: Player }; isTotals?: boolean
  viewMode?: ViewMode; matchCount?: number
}) {
  const t = useT()
  const va = (n: number) => fmt(n, viewMode, matchCount)
  const label = r.player ? `${r.player.first_name} ${r.player.last_name}` : t(viewMode === 'average' ? T.average : T.total)
  const neg = (n: number) => (n > 0 ? 'text-[#c4242a] font-medium' : 'text-[#9aa0a8]')
  return (
    <tr className={rowClass(isTotals)}>
      <NameCells label={label} jersey={r.player?.jersey_number} totals={isTotals} />
      <Td className={`${GROUP_EDGE} ${zero(r.duels)}`}>{va(r.duels)}</Td>
      <Td className={r.duelsWon > 0 ? 'text-ink font-medium' : 'text-[#9aa0a8]'}>{va(r.duelsWon)}</Td>
      <Td className="text-muted">{pct(r.duelsWon, r.duels)}</Td>
      <Td className={`${GROUP_EDGE} ${zero(r.highContact)}`}>{va(r.highContact)}</Td>
      <Td className={zero(r.freekick)}>{va(r.freekick)}</Td>
      <Td className={r.interceptions > 0 ? 'text-ink font-medium' : 'text-[#9aa0a8]'}>{va(r.interceptions)}</Td>
      <Td className={r.blocks > 0 ? 'text-ink font-medium' : 'text-[#9aa0a8]'}>{va(r.blocks)}</Td>
      <Td className={zero(r.rebounds)}>{va(r.rebounds)}</Td>
      <Td className={zero(r.penaltyAwarded)}>{va(r.penaltyAwarded)}</Td>
      <Td className={`${GROUP_EDGE} ${zero(r.yellowCards)}`}>{va(r.yellowCards)}</Td>
      <Td className={neg(r.suspensions2min)}>{va(r.suspensions2min)}</Td>
      <Td className={neg(r.redCards)}>{va(r.redCards)}</Td>
      <Td className={zero(r.protest)}>{va(r.protest)}</Td>
      <Td className={`${GROUP_EDGE} ${zero(r.drewOffensiveFoul)}`}>{va(r.drewOffensiveFoul)}</Td>
    </tr>
  )
}

export function DefenseTable({ rows, matchCount = 1, viewMode = 'total' }: {
  rows: DefenseRow[]; matchCount?: number; viewMode?: ViewMode
}) {
  const t = useT()
  const totals = useMemo(() => sumDefense(rows), [rows])
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            <HeadNameCells rowSpan={2} />
            <ThGroup label={t(T.duels)} colSpan={3} />
            <ThGroup label={t(T.defence)} colSpan={6} />
            <ThGroup label={t({ en: 'Discipline', is: 'Agi' })} colSpan={4} />
            <ThGroup label={t(T.other)} colSpan={1} />
          </tr>
          <tr className="border-b border-line">
            <Th className={GROUP_EDGE}>{t(T.duels)}</Th><Th>{t(T.duelsWon)}</Th><Th>%</Th>
            <Th className={GROUP_EDGE}>{t(T.highContact)}</Th><Th>{t(T.freeThrows)}</Th><Th>{t(T.steals)}</Th><Th>{t(T.blocks)}</Th>
            <Th>{t(T.rebounds)}</Th><Th>{t(T.penConceded)}</Th>
            <Th className={GROUP_EDGE}>{t(T.yellow)}</Th><Th>{t(T.twoMin)}</Th><Th>{t(T.red)}</Th><Th>{t(T.protest)}</Th><Th className={GROUP_EDGE}>{t(T.drewOffFoul)}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => <DefRow key={r.player.id} r={r} viewMode={viewMode} matchCount={matchCount} />)}
          <DefRow r={{ ...totals }} isTotals viewMode={viewMode} matchCount={matchCount} />
        </tbody>
      </table>
    </div>
  )
}

// ─── Goalkeeping table ────────────────────────────────────────────────────────

const GK_GROUPS: Text[] = [T.total, T.penalty, T.wing, T.leftWing, T.rightWing, T.nineM, T.sevenEight, T.sixM, T.line,
  T.fastBreak, T.secondWave, T.inferiority, T.superiority, T.s6v7]

function GkRow({ r, isTotals = false, viewMode = 'total', matchCount = 1 }: {
  r: Omit<GKRow, 'player'> & { player?: Player }; isTotals?: boolean
  viewMode?: ViewMode; matchCount?: number
}) {
  const t = useT()
  const va = (n: number) => fmt(n, viewMode, matchCount)
  const label = r.player ? `${r.player.first_name} ${r.player.last_name}` : t(viewMode === 'average' ? T.average : T.total)
  return (
    <tr className={rowClass(isTotals)}>
      <NameCells label={label} jersey={r.player?.jersey_number} totals={isTotals} />
      <Td className={`${GROUP_EDGE} ${r.saves > 0 ? 'text-ink font-semibold' : 'text-[#9aa0a8]'}`}>{va(r.saves)}</Td>
      <Td className={zero(r.shotsFaced)}>{va(r.shotsFaced)}</Td>
      <Td className={r.shotsFaced > 0 && r.saves / r.shotsFaced >= 0.4 ? 'text-accent font-medium' : 'text-muted'}>{pct(r.saves, r.shotsFaced)}</Td>
      <TdGKPair saved={r.savedPen} faced={r.facedPen} va={va} />
      <TdGKPair saved={r.savedCorn} faced={r.facedCorn} va={va} />
      <TdGKPair saved={r.savedCornLeft} faced={r.facedCornLeft} va={va} />
      <TdGKPair saved={r.savedCornRight} faced={r.facedCornRight} va={va} />
      <TdGKPair saved={r.savedNineM} faced={r.facedNineM} va={va} />
      <TdGKPair saved={r.savedS78} faced={r.facedS78} va={va} />
      <TdGKPair saved={r.savedS6m} faced={r.facedS6m} va={va} />
      <TdGKPair saved={r.savedLine} faced={r.facedLine} va={va} />
      <TdGKPair saved={r.savedFb} faced={r.facedFb} va={va} />
      <TdGKPair saved={r.savedSw} faced={r.facedSw} va={va} />
      <TdGKPair saved={r.savedInf} faced={r.facedInf} va={va} />
      <TdGKPair saved={r.savedSup} faced={r.facedSup} va={va} />
      <TdGKPair saved={r.savedS67} faced={r.facedS67} va={va} />
      <Td className={`${GROUP_EDGE} ${zero(r.emptyPhase)}`}>{va(r.emptyPhase)}</Td>
      <Td className={zero(r.positiveResponse)}>{va(r.positiveResponse)}</Td>
      <TdGKPair saved={r.origLeftWingSaves}    faced={r.origLeftWingFaced}    va={va} />
      <TdGKPair saved={r.origLeftCenterSaves}  faced={r.origLeftCenterFaced}  va={va} />
      <TdGKPair saved={r.origCenterSaves}      faced={r.origCenterFaced}      va={va} />
      <TdGKPair saved={r.origRightCenterSaves} faced={r.origRightCenterFaced} va={va} />
      <TdGKPair saved={r.origRightWingSaves}   faced={r.origRightWingFaced}   va={va} />
      <TdGKPair saved={r.origLineSaves}        faced={r.origLineFaced}        va={va} />
      <TdGKPair saved={r.origOtherSaves}       faced={r.origOtherFaced}       va={va} />
      <TdGKPair saved={r.handUpSaves}          faced={r.handUpFaced}          va={va} />
      <TdGKPair saved={r.handDownSaves}        faced={r.handDownFaced}        va={va} />
    </tr>
  )
}

export function GKTable({ rows, matchCount = 1, viewMode = 'total' }: {
  rows: GKRow[]; matchCount?: number; viewMode?: ViewMode
}) {
  const t = useT()
  const totals = useMemo(() => sumGK(rows), [rows])

  if (rows.length === 0) {
    return (
      <p className="m-4 text-[14px] text-muted border border-dashed border-[#cfd4db] rounded-lg px-3 py-2.5">
        {t({ en: 'No goalkeepers on this roster.', is: 'Engir markmenn á leikmannalistanum.' })}
      </p>
    )
  }

  const triple = (k: string) => [<Th key={`${k}s`}>{t(T.saves)}</Th>, <Th key={`${k}f`}>{t(T.faced)}</Th>, <Th key={`${k}p`}>%</Th>]
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            <HeadNameCells rowSpan={2} />
            {GK_GROUPS.map((g, i) => <ThGroup key={i} label={t(g)} colSpan={3} />)}
            <ThGroup label={t(T.other)} colSpan={2} />
            {ORIGIN_KEYS.map(k => <ThGroup key={k} label={`${t(ORIGIN_TEXT[k])}${k === 'left_wing' || k === 'line' ? ` (${t(T.origin)})` : ''}`} colSpan={3} />)}
            <ThGroup label={t(T.handUp)} colSpan={3} />
            <ThGroup label={t(T.handDown)} colSpan={3} />
          </tr>
          <tr className="border-b border-line">
            {GK_GROUPS.flatMap((_, i) => triple(`g${i}`))}
            <Th className={GROUP_EDGE}>{t(T.emptyPhase)}</Th><Th>{t(T.positiveResponse)}</Th>
            {[...ORIGIN_KEYS, 'up', 'down'].flatMap(k => triple(`o${k}`))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => <GkRow key={r.player.id} r={r} viewMode={viewMode} matchCount={matchCount} />)}
          {rows.length > 1 && <GkRow r={{ ...totals }} isTotals viewMode={viewMode} matchCount={matchCount} />}
        </tbody>
      </table>
    </div>
  )
}

// ─── Convenience: compute + render all three tables ───────────────────────────

export function StatsPanel({ events, players, trackedTeamId, tab }: {
  events: Event[]
  players: Player[]
  trackedTeamId: string
  tab: 'attack' | 'defense' | 'gk'
}) {
  const goalkeepers = useMemo(() => players.filter(p => p.position === 'goalkeeper'), [players])
  const attackRows = useMemo(() => computeAttack(events, players, trackedTeamId), [events, players, trackedTeamId])
  const defenseRows = useMemo(() => computeDefense(events, players, trackedTeamId), [events, players, trackedTeamId])
  const gkRows = useMemo(() => computeGK(events, goalkeepers, trackedTeamId), [events, goalkeepers, trackedTeamId])

  if (tab === 'attack') return <AttackTable rows={attackRows} />
  if (tab === 'defense') return <DefenseTable rows={defenseRows} />
  return <GKTable rows={gkRows} />
}
