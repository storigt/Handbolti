import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMatchStore, selectActiveEvents, selectTrackedScore, selectOpponentScore } from '@/store/matchStore'
import {
  computeAttack, computeDefense, computeGK,
  sumAttack, sumDefense, sumGK,
  pct, v,
  type AttackRow, type DefenseRow, type GKRow,
} from '@/lib/stats/matchStats'
import type { Player } from '@/lib/db/schema'

interface Props {
  onNewMatch: () => void
  onDashboard: () => void
}

export function MatchReport({ onNewMatch, onDashboard }: Props) {
  const match = useMatchStore(s => s.match)
  const homeTeam = useMatchStore(s => s.homeTeam)
  const awayTeam = useMatchStore(s => s.awayTeam)
  const trackedPlayers = useMatchStore(useShallow(s => s.trackedPlayers))
  const events = useMatchStore(useShallow(selectActiveEvents))
  const trackedScore = useMatchStore(selectTrackedScore)
  const opponentScore = useMatchStore(selectOpponentScore)

  const trackedTeamId = match?.tracked_team_id ?? ''
  const isTrackedHome = match?.home_team_id === match?.tracked_team_id
  const goalkeepers = trackedPlayers.filter(p => p.position === 'goalkeeper')

  const attackStats = useMemo(() => computeAttack(events, trackedPlayers, trackedTeamId), [events, trackedPlayers, trackedTeamId])
  const defenseStats = useMemo(() => computeDefense(events, trackedPlayers, trackedTeamId), [events, trackedPlayers, trackedTeamId])
  const gkStats = useMemo(() => computeGK(events, goalkeepers, trackedTeamId), [events, goalkeepers, trackedTeamId])

  const atkTotals = useMemo(() => sumAttack(attackStats), [attackStats])
  const defTotals = useMemo(() => sumDefense(defenseStats), [defenseStats])

  const trackedTeam = isTrackedHome ? homeTeam : awayTeam
  const opponentTeam = isTrackedHome ? awayTeam : homeTeam
  const displayHome = isTrackedHome ? trackedScore : opponentScore
  const displayAway = isTrackedHome ? opponentScore : trackedScore

  const matchDate = match?.match_date
    ? new Date(match.match_date).toLocaleDateString('is-IS', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const shotEff = atkTotals.shots > 0 ? Math.round(atkTotals.goals / atkTotals.shots * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between print:bg-white print:text-black shrink-0">
        <h1 className="text-base font-bold">Leiksskýrsla</h1>
        <div className="flex gap-2 print:hidden">
          <button onClick={() => window.print()}
            className="px-3 py-1.5 text-sm bg-slate-700 rounded-lg hover:bg-slate-600">
            Prenta / PDF
          </button>
          <button onClick={onDashboard}
            className="px-3 py-1.5 text-sm bg-blue-600 rounded-lg hover:bg-blue-700">
            Tölur á tímabili
          </button>
          <button onClick={onNewMatch}
            className="px-3 py-1.5 text-sm bg-green-600 rounded-lg hover:bg-green-700">
            Nýr leikur
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Score card */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-center gap-6">
            <div className="text-center flex-1">
              <p className="text-xl font-bold">{trackedTeam?.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{isTrackedHome ? 'Heima' : 'Gestir'}</p>
            </div>
            <div className="text-center">
              <p className="text-5xl font-bold tabular-nums">{displayHome} – {displayAway}</p>
              {matchDate && <p className="text-xs text-gray-400 mt-1">{matchDate}</p>}
              {match?.venue && <p className="text-xs text-gray-400">{match.venue}</p>}
            </div>
            <div className="text-center flex-1">
              <p className="text-xl font-bold">{opponentTeam?.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{isTrackedHome ? 'Gestir' : 'Heima'}</p>
            </div>
          </div>
        </div>

        {/* Team summary */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h2 className="font-semibold text-gray-800 mb-3 text-sm">Samantekt liðs</h2>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
            <StatBox label="Mörk" value={atkTotals.goals} highlight />
            <StatBox label="Skot" value={atkTotals.shots} />
            <StatBox label="Skotnýting" value={`${shotEff}%`} highlight={shotEff >= 50} />
            <StatBox label="Tapað" value={atkTotals.turnovers} />
            <StatBox label="2 mín" value={defTotals.suspensions2min} />
            <StatBox label="Hraðaupp." value={`${atkTotals.fbGoals}/${atkTotals.fbShots}`} />
            <StatBox label="Víti" value={`${atkTotals.penGoals}/${atkTotals.penShots}`} />
            <StatBox label="Stoðsend." value={atkTotals.assists} />
          </div>
        </div>

        {/* Attack table */}
        <ReportSection title="Sókn">
          <AttackReportTable rows={attackStats} totals={atkTotals} />
        </ReportSection>

        {/* Defense table */}
        <ReportSection title="Vörn">
          <DefenseReportTable rows={defenseStats} totals={defTotals} />
        </ReportSection>

        {/* GK section */}
        {gkStats.length > 0 && (
          <ReportSection title="Markvörður">
            <GKReportSection rows={gkStats} />
          </ReportSection>
        )}
      </div>
    </div>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function StatBox({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 text-center ${highlight ? 'bg-green-50' : 'bg-gray-50'}`}>
      <p className={`text-xl font-bold ${highlight ? 'text-green-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{children}</th>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-center text-xs whitespace-nowrap ${className}`}>{children}</td>
}

// ─── Attack report table ──────────────────────────────────────────────────────

function AttackReportTable({ rows, totals }: { rows: AttackRow[]; totals: Omit<AttackRow, 'player'> }) {
  function Row({ r, player, isTotals = false }: { r: Omit<AttackRow, 'player'>; player?: Player; isTotals?: boolean }) {
    const bg = isTotals ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50'
    return (
      <tr className={`border-b border-gray-100 ${bg}`}>
        <td className="px-3 py-2 text-xs font-medium text-gray-800 whitespace-nowrap">
          {player ? `${player.first_name} ${player.last_name}` : 'Samtals'}
        </td>
        <td className="px-3 py-2 text-center text-xs text-gray-500">{player?.jersey_number ?? '—'}</td>
        <Td className={r.goals > 0 ? 'text-green-700 font-bold' : 'text-gray-400'}>{v(r.goals)}</Td>
        <Td className="text-gray-600">{v(r.shots)}</Td>
        <Td className="text-gray-500">{pct(r.goals, r.shots)}</Td>
        <Td className={r.penGoals > 0 ? 'text-green-700' : 'text-gray-400'}>{r.penGoals > 0 || r.penShots > 0 ? `${r.penGoals}/${r.penShots}` : '—'}</Td>
        <Td className={r.fbGoals > 0 ? 'text-green-700' : 'text-gray-400'}>{r.fbGoals > 0 || r.fbShots > 0 ? `${r.fbGoals}/${r.fbShots}` : '—'}</Td>
        <Td className={r.assists > 0 ? 'text-blue-600' : 'text-gray-400'}>{v(r.assists)}</Td>
        <Td className={r.turnovers > 2 ? 'text-orange-600 font-semibold' : r.turnovers > 0 ? 'text-gray-700' : 'text-gray-400'}>{v(r.turnovers)}</Td>
        <Td className={r.drewSuspension > 0 ? 'text-gray-700' : 'text-gray-400'}>{v(r.drewSuspension)}</Td>
        <Td className={r.drewPenalty > 0 ? 'text-blue-600' : 'text-gray-400'}>{v(r.drewPenalty)}</Td>
      </tr>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Nafn</th>
            <Th>#</Th>
            <Th>Mörk</Th><Th>Skot</Th><Th>%</Th>
            <Th>Víti M/S</Th>
            <Th>Hraðaupp. M/S</Th>
            <Th>Stoðsend.</Th>
            <Th>Tapað</Th>
            <Th>Fengnar 2mín</Th>
            <Th>Fiskað víti</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(r => <Row key={r.player.id} r={r} player={r.player} />)}
          <Row r={totals} isTotals />
        </tbody>
      </table>
    </div>
  )
}

// ─── Defense report table ─────────────────────────────────────────────────────

function DefenseReportTable({ rows, totals }: { rows: DefenseRow[]; totals: Omit<DefenseRow, 'player'> }) {
  function Row({ r, player, isTotals = false }: { r: Omit<DefenseRow, 'player'>; player?: Player; isTotals?: boolean }) {
    const bg = isTotals ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50'
    return (
      <tr className={`border-b border-gray-100 ${bg}`}>
        <td className="px-3 py-2 text-xs font-medium text-gray-800 whitespace-nowrap">
          {player ? `${player.first_name} ${player.last_name}` : 'Samtals'}
        </td>
        <td className="px-3 py-2 text-center text-xs text-gray-500">{player?.jersey_number ?? '—'}</td>
        <Td className={r.blocks > 0 ? 'text-green-700 font-semibold' : 'text-gray-400'}>{v(r.blocks)}</Td>
        <Td className={r.interceptions > 0 ? 'text-green-700 font-semibold' : 'text-gray-400'}>{v(r.interceptions)}</Td>
        <Td>{r.duels > 0 ? `${r.duelsWon}/${r.duels}` : '—'}</Td>
        <Td className="text-gray-500">{pct(r.duelsWon, r.duels)}</Td>
        <Td className={r.rebounds > 0 ? 'text-gray-700' : 'text-gray-400'}>{v(r.rebounds)}</Td>
        <Td className={r.freekick > 0 ? 'text-orange-500' : 'text-gray-400'}>{v(r.freekick)}</Td>
        <Td className={r.penaltyAwarded > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}>{v(r.penaltyAwarded)}</Td>
        <Td className={r.yellowCards > 0 ? 'text-yellow-600 font-semibold' : 'text-gray-400'}>{v(r.yellowCards)}</Td>
        <Td className={r.suspensions2min > 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}>{v(r.suspensions2min)}</Td>
        <Td className={r.redCards > 0 ? 'text-red-700 font-bold' : 'text-gray-400'}>{v(r.redCards)}</Td>
      </tr>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Nafn</th>
            <Th>#</Th>
            <Th>Blokk</Th><Th>Stolinn</Th>
            <Th>1á1 V/T</Th><Th>1á1 %</Th>
            <Th>Fráköst</Th><Th>Fríköst</Th><Th>Víti á</Th>
            <Th>Gult</Th><Th>2 mín</Th><Th>Rautt</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map(r => <Row key={r.player.id} r={r} player={r.player} />)}
          <Row r={totals} isTotals />
        </tbody>
      </table>
    </div>
  )
}

// ─── GK report section ────────────────────────────────────────────────────────

function GKReportSection({ rows }: { rows: GKRow[] }) {
  const totals = useMemo(() => rows.length > 1 ? sumGK(rows) : null, [rows])

  return (
    <div className="divide-y divide-gray-100">
      {rows.map(gk => {
        const savePct = gk.shotsFaced > 0 ? Math.round(gk.saves / gk.shotsFaced * 100) : 0
        return (
          <div key={gk.player.id} className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium text-sm">{gk.player.first_name} {gk.player.last_name}</p>
                {gk.player.jersey_number && <p className="text-xs text-gray-400">#{gk.player.jersey_number}</p>}
              </div>
              <div className={`text-3xl font-bold ${savePct >= 40 ? 'text-green-600' : 'text-gray-600'}`}>
                {savePct}%
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <StatBox label="Varin skot" value={gk.saves} highlight={gk.saves > 0} />
              <StatBox label="Fjöldi skota" value={gk.shotsFaced} />
              <StatBox label="Markmið gegn" value={gk.shotsFaced - gk.saves} />
            </div>
            {/* Breakdown by range */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                { label: 'Víti', saved: gk.savedPen, faced: gk.facedPen },
                { label: 'Horn', saved: gk.savedCorn, faced: gk.facedCorn },
                { label: '9m+', saved: gk.savedNineM, faced: gk.facedNineM },
                { label: '7–8m', saved: gk.savedS78, faced: gk.facedS78 },
                { label: '6m', saved: gk.savedS6m, faced: gk.facedS6m },
                { label: 'Lína', saved: gk.savedLine, faced: gk.facedLine },
              ].filter(x => x.faced > 0).map(x => (
                <div key={x.label} className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-sm font-bold text-gray-800">{x.saved}/{x.faced}</p>
                  <p className="text-[10px] text-gray-500">{x.label} ({pct(x.saved, x.faced)})</p>
                </div>
              ))}
            </div>
            {(gk.emptyPhase > 0 || gk.positiveResponse > 0) && (
              <div className="flex gap-3 mt-3">
                {gk.emptyPhase > 0 && <span className="text-xs text-red-500">Tóm fasi: {gk.emptyPhase}</span>}
                {gk.positiveResponse > 0 && <span className="text-xs text-green-600">Jákv. viðbrögð: {gk.positiveResponse}</span>}
              </div>
            )}
          </div>
        )
      })}
      {totals && (
        <div className="px-4 py-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-600 mb-2">Samtals</p>
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Varin skot" value={totals.saves} highlight={totals.saves > 0} />
            <StatBox label="Fjöldi skota" value={totals.shotsFaced} />
            <StatBox label="Markvarsla %" value={`${totals.shotsFaced > 0 ? Math.round(totals.saves / totals.shotsFaced * 100) : 0}%`} />
          </div>
        </div>
      )}
    </div>
  )
}
