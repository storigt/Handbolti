import { useMemo } from 'react'
import {
  computeAttack, computeDefense, computeGK, computeTeamStats,
  sumAttack, sumDefense, sumGK,
  pct, v,
  type AttackRow, type DefenseRow, type GKRow,
} from '@/lib/stats/matchStats'
import type { Event, Player } from '@/lib/db/schema'

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

function TdTriple({ goals, shots, highlight = false }: { goals: number; shots: number; highlight?: boolean }) {
  return (
    <>
      <Td className={goals > 0 ? (highlight ? 'text-green-700 font-bold' : 'text-green-700 font-semibold') : 'text-gray-300'}>{v(goals)}</Td>
      <Td className="text-gray-500">{v(shots)}</Td>
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

function AtkRow({ r, isTotals = false }: { r: Omit<AttackRow, 'player'> & { player?: Player }; isTotals?: boolean }) {
  const bg = isTotals ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
  const nameBg = isTotals ? 'bg-gray-50' : 'bg-white group-hover:bg-gray-50'
  return (
    <tr className={`group border-b border-gray-100 ${bg}`}>
      <td className={`sticky left-0 z-10 px-3 py-1.5 text-xs font-medium text-gray-800 border-r border-gray-200 min-w-[110px] ${nameBg}`}>
        {r.player ? `${r.player.first_name} ${r.player.last_name}` : 'Samtals'}
      </td>
      <td className={`sticky left-[110px] z-10 px-2 py-1.5 text-center text-xs text-gray-500 border-r border-gray-200 min-w-[36px] ${nameBg}`}>
        {r.player?.jersey_number ?? '—'}
      </td>
      <TdTriple goals={r.goals} shots={r.shots} highlight={isTotals} />
      <TdTriple goals={r.penGoals} shots={r.penShots} />
      <TdTriple goals={r.cornGoals} shots={r.cornShots} />
      <TdTriple goals={r.nineMGoals} shots={r.nineMShots} />
      <TdTriple goals={r.s78Goals} shots={r.s78Shots} />
      <TdTriple goals={r.s6mGoals} shots={r.s6mShots} />
      <TdTriple goals={r.lineGoals} shots={r.lineShots} />
      <TdTriple goals={r.fbGoals} shots={r.fbShots} />
      <TdTriple goals={r.swGoals} shots={r.swShots} />
      <TdTriple goals={r.spGoals} shots={r.spShots} />
      <TdTriple goals={r.infGoals} shots={r.infShots} />
      <TdTriple goals={r.supGoals} shots={r.supShots} />
      <TdTriple goals={r.s76Goals} shots={r.s76Shots} />
      <TdTriple goals={r.s66Goals} shots={r.s66Shots} />
      <Td className={r.chancesCreated > 0 ? 'text-blue-600 font-semibold' : 'text-gray-300'}>{v(r.chancesCreated)}</Td>
      <Td className={r.assists > 0 ? 'text-blue-600' : 'text-gray-300'}>{v(r.assists)}</Td>
      <Td className={r.penaltyAssists > 0 ? 'text-blue-600' : 'text-gray-300'}>{v(r.penaltyAssists)}</Td>
      <Td className={r.drewPenalty > 0 ? 'text-blue-600' : 'text-gray-300'}>{v(r.drewPenalty)}</Td>
      <Td className={r.turnovers > 0 ? 'text-orange-600 font-semibold' : 'text-gray-300'}>{v(r.turnovers)}</Td>
      <Td className={r.offensiveRebounds > 0 ? 'text-gray-700' : 'text-gray-300'}>{v(r.offensiveRebounds)}</Td>
      <Td className={r.drewSuspension > 0 ? 'text-gray-700' : 'text-gray-300'}>{v(r.drewSuspension)}</Td>
    </tr>
  )
}

export function AttackTable({ rows }: { rows: AttackRow[] }) {
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
          {rows.map(r => <AtkRow key={r.player.id} r={r} />)}
          <AtkRow r={{ ...totals }} isTotals />
        </tbody>
      </table>
    </div>
  )
}

// ─── Defense table ────────────────────────────────────────────────────────────

function DefRow({ r, isTotals = false }: { r: Omit<DefenseRow, 'player'> & { player?: Player }; isTotals?: boolean }) {
  const bg = isTotals ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
  const nameBg = isTotals ? 'bg-gray-50' : 'bg-white group-hover:bg-gray-50'
  return (
    <tr className={`group border-b border-gray-100 ${bg}`}>
      <td className={`sticky left-0 z-10 px-3 py-1.5 text-xs font-medium text-gray-800 border-r border-gray-200 min-w-[110px] ${nameBg}`}>
        {r.player ? `${r.player.first_name} ${r.player.last_name}` : 'Samtals'}
      </td>
      <td className={`sticky left-[110px] z-10 px-2 py-1.5 text-center text-xs text-gray-500 border-r border-gray-200 min-w-[36px] ${nameBg}`}>
        {r.player?.jersey_number ?? '—'}
      </td>
      <Td>{v(r.duels)}</Td>
      <Td className={r.duelsWon > 0 ? 'text-green-700 font-semibold' : 'text-gray-300'}>{v(r.duelsWon)}</Td>
      <Td>{pct(r.duelsWon, r.duels)}</Td>
      <Td className={r.highContact > 0 ? 'text-orange-600' : 'text-gray-300'}>{v(r.highContact)}</Td>
      <Td className={r.freekick > 0 ? 'text-orange-500' : 'text-gray-300'}>{v(r.freekick)}</Td>
      <Td className={r.interceptions > 0 ? 'text-green-700 font-semibold' : 'text-gray-300'}>{v(r.interceptions)}</Td>
      <Td className={r.blocks > 0 ? 'text-green-700 font-semibold' : 'text-gray-300'}>{v(r.blocks)}</Td>
      <Td className={r.rebounds > 0 ? 'text-gray-700' : 'text-gray-300'}>{v(r.rebounds)}</Td>
      <Td className={r.penaltyAwarded > 0 ? 'text-red-600 font-bold' : 'text-gray-300'}>{v(r.penaltyAwarded)}</Td>
      <Td className={r.yellowCards > 0 ? 'text-yellow-600 font-semibold' : 'text-gray-300'}>{v(r.yellowCards)}</Td>
      <Td className={r.suspensions2min > 0 ? 'text-red-500 font-semibold' : 'text-gray-300'}>{v(r.suspensions2min)}</Td>
      <Td className={r.redCards > 0 ? 'text-red-700 font-bold' : 'text-gray-300'}>{v(r.redCards)}</Td>
      <Td className={r.protest > 0 ? 'text-purple-600' : 'text-gray-300'}>{v(r.protest)}</Td>
      <Td className={r.drewOffensiveFoul > 0 ? 'text-green-600' : 'text-gray-300'}>{v(r.drewOffensiveFoul)}</Td>
    </tr>
  )
}

export function DefenseTable({ rows }: { rows: DefenseRow[] }) {
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
          {rows.map(r => <DefRow key={r.player.id} r={r} />)}
          <DefRow r={{ ...totals }} isTotals />
        </tbody>
      </table>
    </div>
  )
}

// ─── GK table ─────────────────────────────────────────────────────────────────

function GkRow({ r, isTotals = false }: { r: Omit<GKRow, 'player'> & { player?: Player }; isTotals?: boolean }) {
  const bg = isTotals ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
  const nameBg = isTotals ? 'bg-gray-50' : 'bg-white group-hover:bg-gray-50'
  return (
    <tr className={`group border-b border-gray-100 ${bg}`}>
      <td className={`sticky left-0 z-10 px-3 py-1.5 text-xs font-medium text-gray-800 border-r border-gray-200 min-w-[110px] ${nameBg}`}>
        {r.player ? `${r.player.first_name} ${r.player.last_name}` : 'Samtals'}
      </td>
      <td className={`sticky left-[110px] z-10 px-2 py-1.5 text-center text-xs text-gray-500 border-r border-gray-200 min-w-[36px] ${nameBg}`}>
        {r.player?.jersey_number ?? '—'}
      </td>
      <Td className={r.saves > 0 ? 'text-green-700 font-bold' : 'text-gray-300'}>{v(r.saves)}</Td>
      <Td className="text-gray-600">{v(r.shotsFaced)}</Td>
      <Td className={r.saves / (r.shotsFaced || 1) >= 0.4 ? 'text-green-700 font-semibold' : 'text-gray-500'}>{pct(r.saves, r.shotsFaced)}</Td>
      <Td className={r.savedPen > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedPen)}</Td>
      <Td className="text-gray-500">{v(r.facedPen)}</Td>
      <Td className="text-gray-500">{pct(r.savedPen, r.facedPen)}</Td>
      <Td className={r.savedCorn > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedCorn)}</Td>
      <Td className="text-gray-500">{v(r.facedCorn)}</Td>
      <Td className="text-gray-500">{pct(r.savedCorn, r.facedCorn)}</Td>
      <Td className={r.savedNineM > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedNineM)}</Td>
      <Td className="text-gray-500">{v(r.facedNineM)}</Td>
      <Td className="text-gray-500">{pct(r.savedNineM, r.facedNineM)}</Td>
      <Td className={r.savedS78 > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedS78)}</Td>
      <Td className="text-gray-500">{v(r.facedS78)}</Td>
      <Td className="text-gray-500">{pct(r.savedS78, r.facedS78)}</Td>
      <Td className={r.savedS6m > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedS6m)}</Td>
      <Td className="text-gray-500">{v(r.facedS6m)}</Td>
      <Td className="text-gray-500">{pct(r.savedS6m, r.facedS6m)}</Td>
      <Td className={r.savedLine > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedLine)}</Td>
      <Td className="text-gray-500">{v(r.facedLine)}</Td>
      <Td className="text-gray-500">{pct(r.savedLine, r.facedLine)}</Td>
      <Td className={r.savedFb > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedFb)}</Td>
      <Td className="text-gray-500">{v(r.facedFb)}</Td>
      <Td className="text-gray-500">{pct(r.savedFb, r.facedFb)}</Td>
      <Td className={r.savedSw > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedSw)}</Td>
      <Td className="text-gray-500">{v(r.facedSw)}</Td>
      <Td className="text-gray-500">{pct(r.savedSw, r.facedSw)}</Td>
      <Td className={r.savedInf > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedInf)}</Td>
      <Td className="text-gray-500">{v(r.facedInf)}</Td>
      <Td className="text-gray-500">{pct(r.savedInf, r.facedInf)}</Td>
      <Td className={r.savedSup > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedSup)}</Td>
      <Td className="text-gray-500">{v(r.facedSup)}</Td>
      <Td className="text-gray-500">{pct(r.savedSup, r.facedSup)}</Td>
      <Td className={r.savedS67 > 0 ? 'text-green-700' : 'text-gray-300'}>{v(r.savedS67)}</Td>
      <Td className="text-gray-500">{v(r.facedS67)}</Td>
      <Td className="text-gray-500">{pct(r.savedS67, r.facedS67)}</Td>
      <Td className={r.emptyPhase > 0 ? 'text-red-500 font-semibold' : 'text-gray-300'}>{v(r.emptyPhase)}</Td>
      <Td className={r.positiveResponse > 0 ? 'text-green-700 font-semibold' : 'text-gray-300'}>{v(r.positiveResponse)}</Td>
    </tr>
  )
}

export function GKTable({ rows }: { rows: GKRow[] }) {
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
          {rows.map(r => <GkRow key={r.player.id} r={r} />)}
          {rows.length > 1 && <GkRow r={{ ...totals }} isTotals />}
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
