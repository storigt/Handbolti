import { useMemo } from 'react'
import {
  computeAttack, computeDefense, computeGK, computeTeamStats,
  sumAttack, sumDefense, sumGK,
  pct, v,
  type AttackRow, type DefenseRow, type GKRow,
} from '@/lib/stats/matchStats'
import type { Event, Player } from '@/lib/db/schema'

// ─── View mode toggle ─────────────────────────────────────────────────────────

export function ViewModeToggle({ mode, onChange }: { mode: 'total' | 'average'; onChange: (m: 'total' | 'average') => void }) {
  return (
    <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
      <button
        onClick={() => onChange('total')}
        className={`px-3 py-1.5 font-medium transition-colors ${mode === 'total' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
      >
        Heildartölur
      </button>
      <button
        onClick={() => onChange('average')}
        className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-300 ${mode === 'average' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
      >
        Meðaltal
      </button>
    </div>
  )
}

// ─── Table primitives ─────────────────────────────────────────────────────────

export function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-1.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-r border-gray-200 ${className}`}>
      {children}
    </th>
  )
}

export function ThGroup({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <th colSpan={colSpan} className="px-2 py-1 text-center text-[10px] font-bold text-gray-700 bg-gray-100 border-r border-gray-300 whitespace-nowrap">
      {label}
    </th>
  )
}

export function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-2 py-1.5 text-center text-xs border-r border-gray-100 whitespace-nowrap ${className}`}>
      {children}
    </td>
  )
}

function TdTriple({ goals, shots, highlight = false, viewMode = 'total', matchCount = 1 }: {
  goals: number; shots: number; highlight?: boolean
  viewMode?: 'total' | 'average'; matchCount?: number
}) {
  const dg = viewMode === 'average' ? (goals > 0 ? (goals / matchCount).toFixed(1) : '—') : v(goals)
  const ds = viewMode === 'average' ? (shots > 0 ? (shots / matchCount).toFixed(1) : '—') : v(shots)
  return (
    <>
      <Td className={goals > 0 ? (highlight ? 'text-green-700 font-bold' : 'text-green-700 font-semibold') : 'text-gray-300'}>{dg}</Td>
      <Td className="text-gray-500">{ds}</Td>
      <Td className={goals > 0 && shots > 0 ? 'text-gray-600' : 'text-gray-300'}>{pct(goals, shots)}</Td>
    </>
  )
}

// ─── Team Stats table ─────────────────────────────────────────────────────────

export function TeamStatsTable({
  events,
  trackedTeamId,
  myTeamName,
  opponentTeamName,
}: {
  events: Event[]
  trackedTeamId: string
  myTeamName?: string
  opponentTeamName?: string
}) {
  const stats = useMemo(() => computeTeamStats(events, trackedTeamId), [events, trackedTeamId])
  return (
    <div className="px-2 pb-2">
      <table className="text-xs border-collapse w-auto">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-300">
            <th className="px-3 py-1.5 text-left text-[10px] font-bold text-gray-600 whitespace-nowrap border-r border-gray-200" />
            <Th>Mörk</Th>
            <Th>Fjöldi sókna</Th>
            <Th>Skotnýting %</Th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-white border-b border-gray-100">
            <td className="px-3 py-1.5 text-xs font-semibold text-gray-700 border-r border-gray-200 whitespace-nowrap max-w-[120px] truncate">
              {myTeamName ?? 'Liðið'}
            </td>
            <Td className={stats.myGoals > 0 ? 'text-green-700 font-bold' : 'text-gray-400'}>{stats.myGoals}</Td>
            <Td className={stats.myAttacks > 0 ? 'text-gray-700' : 'text-gray-400'}>{stats.myAttacks > 0 ? stats.myAttacks : '—'}</Td>
            <Td className={stats.myGoals > 0 ? 'text-gray-700 font-semibold' : 'text-gray-400'}>{pct(stats.myGoals, stats.myShots)}</Td>
          </tr>
          <tr className="bg-white border-b border-gray-100">
            <td className="px-3 py-1.5 text-xs font-semibold text-gray-700 border-r border-gray-200 whitespace-nowrap max-w-[120px] truncate">
              {opponentTeamName ?? 'Andstæðingur'}
            </td>
            <Td className={stats.opponentGoals > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}>{stats.opponentGoals}</Td>
            <Td className={stats.opponentAttacks > 0 ? 'text-gray-700' : 'text-gray-400'}>{stats.opponentAttacks > 0 ? stats.opponentAttacks : '—'}</Td>
            <Td className={stats.opponentGoals > 0 ? 'text-gray-700' : 'text-gray-400'}>{pct(stats.opponentGoals, stats.opponentShots)}</Td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ─── Attack table ─────────────────────────────────────────────────────────────

function AtkRow({ r, isTotals = false, viewMode = 'total', matchCount = 1 }: {
  r: Omit<AttackRow, 'player'> & { player?: Player }; isTotals?: boolean
  viewMode?: 'total' | 'average'; matchCount?: number
}) {
  const bg = isTotals ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
  const nameBg = isTotals ? 'bg-gray-50' : 'bg-white group-hover:bg-gray-50'
  const va = (n: number) => viewMode === 'average' ? (n > 0 ? (n / matchCount).toFixed(1) : '—') : v(n)
  const tdp = { viewMode, matchCount }
  const rowLabel = r.player ? `${r.player.first_name} ${r.player.last_name}` : (viewMode === 'average' ? 'Meðaltal' : 'Samtals')
  return (
    <tr className={`group border-b border-gray-100 ${bg}`}>
      <td className={`sticky left-0 z-10 px-3 py-1.5 text-xs font-medium text-gray-800 border-r border-gray-200 min-w-[110px] ${nameBg}`}>
        {rowLabel}
      </td>
      <td className={`sticky left-[110px] z-10 px-2 py-1.5 text-center text-xs text-gray-500 border-r border-gray-200 min-w-[36px] ${nameBg}`}>
        {r.player?.jersey_number ?? '—'}
      </td>
      <TdTriple goals={r.goals} shots={r.shots} highlight={isTotals} {...tdp} />
      <TdTriple goals={r.penGoals} shots={r.penShots} {...tdp} />
      <TdTriple goals={r.cornGoals} shots={r.cornShots} {...tdp} />
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
      <Td className={r.chancesCreated > 0 ? 'text-blue-600 font-semibold' : 'text-gray-300'}>{va(r.chancesCreated)}</Td>
      <Td className={r.assists > 0 ? 'text-blue-600' : 'text-gray-300'}>{va(r.assists)}</Td>
      <Td className={r.penaltyAssists > 0 ? 'text-blue-600' : 'text-gray-300'}>{va(r.penaltyAssists)}</Td>
      <Td className={r.drewPenalty > 0 ? 'text-blue-600' : 'text-gray-300'}>{va(r.drewPenalty)}</Td>
      <Td className={r.turnovers > 0 ? 'text-orange-600 font-semibold' : 'text-gray-300'}>{va(r.turnovers)}</Td>
      <Td className={r.offensiveRebounds > 0 ? 'text-gray-700' : 'text-gray-300'}>{va(r.offensiveRebounds)}</Td>
      <Td className={r.drewSuspension > 0 ? 'text-gray-700' : 'text-gray-300'}>{va(r.drewSuspension)}</Td>
    </tr>
  )
}

export function AttackTable({ rows, matchCount = 1, viewMode = 'total' }: {
  rows: AttackRow[]; matchCount?: number; viewMode?: 'total' | 'average'
}) {
  const totals = useMemo(() => sumAttack(rows), [rows])
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse min-w-max">
        <thead>
          <tr className="border-b-2 border-gray-300">
            <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1.5 text-left text-[10px] font-bold text-gray-600 border-r border-gray-200 min-w-[110px]">Nafn</th>
            <th className="sticky left-[110px] z-20 bg-gray-50 px-2 py-1.5 text-center text-[10px] font-bold text-gray-600 border-r border-gray-200 min-w-[36px]">#</th>
            <ThGroup label="Samtals" colSpan={3} />
            <ThGroup label="Víti" colSpan={3} />
            <ThGroup label="Horn" colSpan={3} />
            <ThGroup label="9m+" colSpan={3} />
            <ThGroup label="7–8m" colSpan={3} />
            <ThGroup label="6m" colSpan={3} />
            <ThGroup label="Lína" colSpan={3} />
            <ThGroup label="Hraðaupphlaup" colSpan={3} />
            <ThGroup label="Seinni bylgja" colSpan={3} />
            <ThGroup label="Uppstilltur leikur" colSpan={3} />
            <ThGroup label="Undirtala" colSpan={3} />
            <ThGroup label="Yfirtala" colSpan={3} />
            <ThGroup label="7á6" colSpan={3} />
            <ThGroup label="6á6" colSpan={3} />
            <ThGroup label="Annað" colSpan={7} />
          </tr>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="sticky left-0 z-20 bg-gray-50 border-r border-gray-200" />
            <th className="sticky left-[110px] z-20 bg-gray-50 border-r border-gray-200" />
            {Array.from({ length: 14 }).map((_, i) => (
              <><Th key={`g${i}`}>M</Th><Th key={`s${i}`}>Skot</Th><Th key={`p${i}`}>%</Th></>
            ))}
            <Th>Sk.Færi</Th><Th>Stoð</Th><Th>Vítas</Th><Th>Fisk.V</Th>
            <Th>Tap</Th><Th>Frákast</Th><Th>2mín fisk</Th>
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

// ─── Defense table ────────────────────────────────────────────────────────────

function DefRow({ r, isTotals = false, viewMode = 'total', matchCount = 1 }: {
  r: Omit<DefenseRow, 'player'> & { player?: Player }; isTotals?: boolean
  viewMode?: 'total' | 'average'; matchCount?: number
}) {
  const bg = isTotals ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
  const nameBg = isTotals ? 'bg-gray-50' : 'bg-white group-hover:bg-gray-50'
  const va = (n: number) => viewMode === 'average' ? (n > 0 ? (n / matchCount).toFixed(1) : '—') : v(n)
  const rowLabel = r.player ? `${r.player.first_name} ${r.player.last_name}` : (viewMode === 'average' ? 'Meðaltal' : 'Samtals')
  return (
    <tr className={`group border-b border-gray-100 ${bg}`}>
      <td className={`sticky left-0 z-10 px-3 py-1.5 text-xs font-medium text-gray-800 border-r border-gray-200 min-w-[110px] ${nameBg}`}>
        {rowLabel}
      </td>
      <td className={`sticky left-[110px] z-10 px-2 py-1.5 text-center text-xs text-gray-500 border-r border-gray-200 min-w-[36px] ${nameBg}`}>
        {r.player?.jersey_number ?? '—'}
      </td>
      <Td>{va(r.duels)}</Td>
      <Td className={r.duelsWon > 0 ? 'text-green-700 font-semibold' : 'text-gray-300'}>{va(r.duelsWon)}</Td>
      <Td>{pct(r.duelsWon, r.duels)}</Td>
      <Td className={r.highContact > 0 ? 'text-orange-600' : 'text-gray-300'}>{va(r.highContact)}</Td>
      <Td className={r.freekick > 0 ? 'text-orange-500' : 'text-gray-300'}>{va(r.freekick)}</Td>
      <Td className={r.interceptions > 0 ? 'text-green-700 font-semibold' : 'text-gray-300'}>{va(r.interceptions)}</Td>
      <Td className={r.blocks > 0 ? 'text-green-700 font-semibold' : 'text-gray-300'}>{va(r.blocks)}</Td>
      <Td className={r.rebounds > 0 ? 'text-gray-700' : 'text-gray-300'}>{va(r.rebounds)}</Td>
      <Td className={r.penaltyAwarded > 0 ? 'text-red-600 font-bold' : 'text-gray-300'}>{va(r.penaltyAwarded)}</Td>
      <Td className={r.yellowCards > 0 ? 'text-yellow-600 font-semibold' : 'text-gray-300'}>{va(r.yellowCards)}</Td>
      <Td className={r.suspensions2min > 0 ? 'text-red-500 font-semibold' : 'text-gray-300'}>{va(r.suspensions2min)}</Td>
      <Td className={r.redCards > 0 ? 'text-red-700 font-bold' : 'text-gray-300'}>{va(r.redCards)}</Td>
      <Td className={r.protest > 0 ? 'text-purple-600' : 'text-gray-300'}>{va(r.protest)}</Td>
      <Td className={r.drewOffensiveFoul > 0 ? 'text-green-600' : 'text-gray-300'}>{va(r.drewOffensiveFoul)}</Td>
    </tr>
  )
}

export function DefenseTable({ rows, matchCount = 1, viewMode = 'total' }: {
  rows: DefenseRow[]; matchCount?: number; viewMode?: 'total' | 'average'
}) {
  const totals = useMemo(() => sumDefense(rows), [rows])
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse min-w-max">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1.5 text-left text-[10px] font-bold text-gray-600 border-r border-gray-200 min-w-[110px]">Nafn</th>
            <th className="sticky left-[110px] z-20 bg-gray-50 px-2 py-1.5 text-center text-[10px] font-bold text-gray-600 border-r border-gray-200 min-w-[36px]">#</th>
            <Th>Árás 1á1</Th><Th>Vinnur</Th><Th>1á1 %</Th>
            <Th>Hár kontakt</Th><Th>Fríköst</Th><Th>Stolinn</Th><Th>Blokk</Th>
            <Th>Fráköst</Th><Th>Víti á</Th><Th>Gult</Th><Th>2 mín</Th>
            <Th>Rautt</Th><Th>Værukærð</Th><Th>Fisk. sóknarbrot</Th>
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

// ─── GK table ─────────────────────────────────────────────────────────────────

function GkRow({ r, isTotals = false, viewMode = 'total', matchCount = 1 }: {
  r: Omit<GKRow, 'player'> & { player?: Player }; isTotals?: boolean
  viewMode?: 'total' | 'average'; matchCount?: number
}) {
  const bg = isTotals ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
  const nameBg = isTotals ? 'bg-gray-50' : 'bg-white group-hover:bg-gray-50'
  const va = (n: number) => viewMode === 'average' ? (n > 0 ? (n / matchCount).toFixed(1) : '—') : v(n)
  const rowLabel = r.player ? `${r.player.first_name} ${r.player.last_name}` : (viewMode === 'average' ? 'Meðaltal' : 'Samtals')
  return (
    <tr className={`group border-b border-gray-100 ${bg}`}>
      <td className={`sticky left-0 z-10 px-3 py-1.5 text-xs font-medium text-gray-800 border-r border-gray-200 min-w-[110px] ${nameBg}`}>
        {rowLabel}
      </td>
      <td className={`sticky left-[110px] z-10 px-2 py-1.5 text-center text-xs text-gray-500 border-r border-gray-200 min-w-[36px] ${nameBg}`}>
        {r.player?.jersey_number ?? '—'}
      </td>
      <Td className={r.saves > 0 ? 'text-green-700 font-bold' : 'text-gray-300'}>{va(r.saves)}</Td>
      <Td className="text-gray-600">{va(r.shotsFaced)}</Td>
      <Td className={r.saves / (r.shotsFaced || 1) >= 0.4 ? 'text-green-700 font-semibold' : 'text-gray-500'}>{pct(r.saves, r.shotsFaced)}</Td>
      <Td className={r.savedPen > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedPen)}</Td>
      <Td className="text-gray-500">{va(r.facedPen)}</Td>
      <Td className="text-gray-500">{pct(r.savedPen, r.facedPen)}</Td>
      <Td className={r.savedCorn > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedCorn)}</Td>
      <Td className="text-gray-500">{va(r.facedCorn)}</Td>
      <Td className="text-gray-500">{pct(r.savedCorn, r.facedCorn)}</Td>
      <Td className={r.savedNineM > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedNineM)}</Td>
      <Td className="text-gray-500">{va(r.facedNineM)}</Td>
      <Td className="text-gray-500">{pct(r.savedNineM, r.facedNineM)}</Td>
      <Td className={r.savedS78 > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedS78)}</Td>
      <Td className="text-gray-500">{va(r.facedS78)}</Td>
      <Td className="text-gray-500">{pct(r.savedS78, r.facedS78)}</Td>
      <Td className={r.savedS6m > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedS6m)}</Td>
      <Td className="text-gray-500">{va(r.facedS6m)}</Td>
      <Td className="text-gray-500">{pct(r.savedS6m, r.facedS6m)}</Td>
      <Td className={r.savedLine > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedLine)}</Td>
      <Td className="text-gray-500">{va(r.facedLine)}</Td>
      <Td className="text-gray-500">{pct(r.savedLine, r.facedLine)}</Td>
      <Td className={r.savedFb > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedFb)}</Td>
      <Td className="text-gray-500">{va(r.facedFb)}</Td>
      <Td className="text-gray-500">{pct(r.savedFb, r.facedFb)}</Td>
      <Td className={r.savedSw > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedSw)}</Td>
      <Td className="text-gray-500">{va(r.facedSw)}</Td>
      <Td className="text-gray-500">{pct(r.savedSw, r.facedSw)}</Td>
      <Td className={r.savedInf > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedInf)}</Td>
      <Td className="text-gray-500">{va(r.facedInf)}</Td>
      <Td className="text-gray-500">{pct(r.savedInf, r.facedInf)}</Td>
      <Td className={r.savedSup > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedSup)}</Td>
      <Td className="text-gray-500">{va(r.facedSup)}</Td>
      <Td className="text-gray-500">{pct(r.savedSup, r.facedSup)}</Td>
      <Td className={r.savedS67 > 0 ? 'text-green-700' : 'text-gray-300'}>{va(r.savedS67)}</Td>
      <Td className="text-gray-500">{va(r.facedS67)}</Td>
      <Td className="text-gray-500">{pct(r.savedS67, r.facedS67)}</Td>
      <Td className={r.emptyPhase > 0 ? 'text-red-500 font-semibold' : 'text-gray-300'}>{va(r.emptyPhase)}</Td>
      <Td className={r.positiveResponse > 0 ? 'text-green-700 font-semibold' : 'text-gray-300'}>{va(r.positiveResponse)}</Td>
    </tr>
  )
}

export function GKTable({ rows, matchCount = 1, viewMode = 'total' }: {
  rows: GKRow[]; matchCount?: number; viewMode?: 'total' | 'average'
}) {
  const totals = useMemo(() => sumGK(rows), [rows])

  if (rows.length === 0) {
    return <p className="text-center text-gray-400 text-sm py-12">Engir markmenn á liðinu</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse min-w-max">
        <thead>
          <tr className="border-b-2 border-gray-300">
            <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1.5 text-left text-[10px] font-bold text-gray-600 border-r border-gray-200 min-w-[110px]">Nafn</th>
            <th className="sticky left-[110px] z-20 bg-gray-50 px-2 py-1.5 text-center text-[10px] font-bold text-gray-600 border-r border-gray-200 min-w-[36px]">#</th>
            <ThGroup label="Samtals" colSpan={3} />
            <ThGroup label="Víti" colSpan={3} />
            <ThGroup label="Horn" colSpan={3} />
            <ThGroup label="9m+" colSpan={3} />
            <ThGroup label="7–8m" colSpan={3} />
            <ThGroup label="6m" colSpan={3} />
            <ThGroup label="Lína" colSpan={3} />
            <ThGroup label="Hraðaupphlaup" colSpan={3} />
            <ThGroup label="Seinni bylgja" colSpan={3} />
            <ThGroup label="Undirtala" colSpan={3} />
            <ThGroup label="Yfirtala" colSpan={3} />
            <ThGroup label="6á7" colSpan={3} />
            <ThGroup label="Annað" colSpan={2} />
          </tr>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="sticky left-0 z-20 bg-gray-50 border-r border-gray-200" />
            <th className="sticky left-[110px] z-20 bg-gray-50 border-r border-gray-200" />
            {Array.from({ length: 12 }).map((_, i) => (
              <><Th key={`sv${i}`}>Varin</Th><Th key={`sf${i}`}>Fjöldi</Th><Th key={`sp${i}`}>%</Th></>
            ))}
            <Th>Tóm fasi</Th><Th>Jákv. viðbr.</Th>
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

export function StatsPanel({
  events,
  players,
  trackedTeamId,
  tab,
}: {
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
