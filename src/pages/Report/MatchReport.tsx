import { useQuery } from '@tanstack/react-query'
import { getMatchReportData } from '@/lib/supabase/reportQueries'
import { Card, Spinner } from '@/components/ui'
import type { Match, Team, Player } from '@/lib/db/schema'
import type { MatchReportData, PlayerShotRow, PlayerTurnoverRow, PlayerSuspensionRow } from '@/lib/supabase/reportQueries'

interface Props {
  match: Match
  trackedTeam: Team
  opponentTeam: Team
  onNewMatch: () => void
}

export function MatchReport({ match, trackedTeam, opponentTeam, onNewMatch }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['report', match.id],
    queryFn: () => getMatchReportData(match.id, match.tracked_team_id),
  })

  const isHome = match.home_team_id === match.tracked_team_id
  const trackedScore = isHome ? match.home_score : match.away_score
  const opponentScore = isHome ? match.away_score : match.home_score

  const matchDate = match.match_date
    ? new Date(match.match_date).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:bg-white print:text-black">
        <h1 className="text-lg font-bold">Match Report</h1>
        <div className="flex gap-3 print:hidden">
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-sm bg-slate-700 rounded-lg hover:bg-slate-600"
          >
            Print / Save PDF
          </button>
          <button
            onClick={onNewMatch}
            className="px-3 py-1.5 text-sm bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            New match
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Score card */}
        <Card className="p-6">
          <div className="flex items-center justify-center gap-6">
            <div className="text-center flex-1">
              <p className="text-2xl font-bold">{trackedTeam.name}</p>
              <p className="text-sm text-gray-500">{isHome ? 'Home' : 'Away'}</p>
            </div>
            <div className="text-center">
              <p className="text-5xl font-bold tabular-nums">
                {trackedScore ?? '–'} – {opponentScore ?? '–'}
              </p>
              {matchDate && <p className="text-sm text-gray-500 mt-1">{matchDate}</p>}
              {match.venue && <p className="text-sm text-gray-500">{match.venue}</p>}
            </div>
            <div className="text-center flex-1">
              <p className="text-2xl font-bold">{opponentTeam.name}</p>
              <p className="text-sm text-gray-500">{isHome ? 'Away' : 'Home'}</p>
            </div>
          </div>
        </Card>

        {isLoading && (
          <div className="flex justify-center py-12"><Spinner /></div>
        )}

        {error && (
          <Card className="p-4">
            <p className="text-red-600 text-sm">Failed to load stats: {(error as Error).message}</p>
          </Card>
        )}

        {data && (
          <>
            <TeamSummarySection data={data} trackedTeamId={match.tracked_team_id} />
            <PlayerStatsSection data={data} trackedTeamId={match.tracked_team_id} />
            <GoalkeeperSection data={data} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Team summary ─────────────────────────────────────────────────────────────

function TeamSummarySection({ data, trackedTeamId }: { data: MatchReportData; trackedTeamId: string }) {
  const totalGoals = data.shots.reduce((s, r) => s + r.goals, 0)
  const totalShots = data.shots.reduce((s, r) => s + r.shots_attempted, 0)
  const shotEff = totalShots > 0 ? Math.round(totalGoals / totalShots * 100) : 0
  const totalTurnovers = data.turnovers.reduce((s, r) => s + r.total_turnovers, 0)
  const total2min = data.suspensions.reduce((s, r) => s + r.suspensions_2min, 0)
  const fb = data.fastBreak[0]
  const sevenMGoals = data.sevenM.reduce((s, r) => s + r.goals_7m, 0)
  const sevenMAttempts = data.sevenM.reduce((s, r) => s + r.attempts_7m, 0)
  const sevenMEff = sevenMAttempts > 0 ? Math.round(sevenMGoals / sevenMAttempts * 100) : 0

  void trackedTeamId

  return (
    <Card className="p-4">
      <h2 className="font-semibold text-gray-800 mb-3">Team summary</h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <StatBox label="Goals" value={totalGoals} />
        <StatBox label="Shots" value={totalShots} />
        <StatBox label="Shot %" value={`${shotEff}%`} highlight={shotEff >= 50} />
        <StatBox label="Turnovers" value={totalTurnovers} />
        <StatBox label="2-min susp." value={total2min} />
        {fb && <StatBox label="Fast break" value={`${fb.fast_break_goals}/${fb.fast_break_attempts}`} />}
        {sevenMAttempts > 0 && <StatBox label="7m %" value={`${sevenMEff}%`} />}
      </div>
    </Card>
  )
}

function StatBox({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 text-center ${highlight ? 'bg-green-50' : 'bg-gray-50'}`}>
      <p className={`text-2xl font-bold ${highlight ? 'text-green-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

// ─── Player stats table ───────────────────────────────────────────────────────

function PlayerStatsSection({ data, trackedTeamId }: { data: MatchReportData; trackedTeamId: string }) {
  void trackedTeamId

  // Build a combined row per player
  const playerMap = Object.fromEntries(data.players.map(p => [p.id, p]))
  const allIds = new Set([
    ...data.shots.map(r => r.player_id),
    ...data.turnovers.map(r => r.player_id),
    ...data.suspensions.map(r => r.player_id),
  ])

  const shotMap = Object.fromEntries(data.shots.map(r => [r.player_id, r]))
  const turnMap = Object.fromEntries(data.turnovers.map(r => [r.player_id, r]))
  const suspMap = Object.fromEntries(data.suspensions.map(r => [r.player_id, r]))

  const fieldPlayers = [...allIds]
    .map(id => ({ id, player: playerMap[id] as Player | undefined }))
    .filter(({ player }) => player?.position !== 'goalkeeper')
    .sort((a, b) => {
      const aGoals = shotMap[a.id]?.goals ?? 0
      const bGoals = shotMap[b.id]?.goals ?? 0
      return bGoals - aGoals
    })

  if (fieldPlayers.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Player stats</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-2">#</th>
              <th className="text-left px-4 py-2">Player</th>
              <th className="text-center px-3 py-2">G</th>
              <th className="text-center px-3 py-2">Shots</th>
              <th className="text-center px-3 py-2">Shot%</th>
              <th className="text-center px-3 py-2">TO</th>
              <th className="text-center px-3 py-2">2min</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {fieldPlayers.map(({ id, player }) => {
              const s = shotMap[id] as PlayerShotRow | undefined
              const t = turnMap[id] as PlayerTurnoverRow | undefined
              const d = suspMap[id] as PlayerSuspensionRow | undefined
              return (
                <PlayerRow
                  key={id}
                  player={player}
                  goals={s?.goals ?? 0}
                  shots={s?.shots_attempted ?? 0}
                  shotEff={s?.shot_efficiency ?? 0}
                  turnovers={t?.total_turnovers ?? 0}
                  susp2min={d?.suspensions_2min ?? 0}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function PlayerRow({ player, goals, shots, shotEff, turnovers, susp2min }: {
  player: Player | undefined
  goals: number
  shots: number
  shotEff: number
  turnovers: number
  susp2min: number
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{player?.jersey_number ?? '?'}</td>
      <td className="px-4 py-2.5 font-medium">
        {player ? `${player.first_name} ${player.last_name}` : 'Unknown'}
      </td>
      <td className={`text-center px-3 py-2.5 font-bold ${goals > 0 ? 'text-green-700' : 'text-gray-400'}`}>
        {goals}
      </td>
      <td className="text-center px-3 py-2.5 text-gray-600">{shots}</td>
      <td className="text-center px-3 py-2.5 text-gray-600">
        {shots > 0 ? `${shotEff}%` : '—'}
      </td>
      <td className={`text-center px-3 py-2.5 ${turnovers > 2 ? 'text-orange-600 font-medium' : 'text-gray-600'}`}>
        {turnovers > 0 ? turnovers : '—'}
      </td>
      <td className={`text-center px-3 py-2.5 ${susp2min > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
        {susp2min > 0 ? susp2min : '—'}
      </td>
    </tr>
  )
}

// ─── Goalkeeper stats ─────────────────────────────────────────────────────────

function GoalkeeperSection({ data }: { data: MatchReportData }) {
  if (data.goalkeepers.length === 0) return null

  const playerMap = Object.fromEntries(data.players.map(p => [p.id, p]))

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Goalkeeper</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {data.goalkeepers.map(gk => {
          const player = playerMap[gk.goalkeeper_player_id]
          return (
            <div key={gk.goalkeeper_player_id} className="px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium">
                    {player ? `${player.first_name} ${player.last_name}` : 'Goalkeeper'}
                  </p>
                  {player?.jersey_number && (
                    <p className="text-xs text-gray-500">#{player.jersey_number}</p>
                  )}
                </div>
                <div className={`text-3xl font-bold ${gk.save_pct >= 40 ? 'text-green-600' : 'text-gray-700'}`}>
                  {gk.save_pct}%
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <StatBox label="Shots faced" value={gk.shots_faced} />
                <StatBox label="Saves" value={gk.saves} highlight={gk.saves > 0} />
                <StatBox label="Goals conceded" value={gk.goals_conceded} />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
