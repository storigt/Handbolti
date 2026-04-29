import { useMemo, useState } from 'react'
import type { Event, Player } from '@/lib/db/schema'
import { useMinuteFilter, MinuteFilterBar } from './MinuteFilter'

type ShotMapMode = 'attack' | 'gk'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ZoneStat { shots: number; goals: number }  // goals = goals scored (attack) or goals conceded (gk)

interface ZoneStats {
  goal: Record<number, ZoneStat>   // zones 1-9
  notOnTarget: ZoneStat            // wide + post (attack only)
  blocked: ZoneStat                // blocked by defender (attack) or off-target saves (gk)
}

// ─── Zone labels ──────────────────────────────────────────────────────────────

const ZONE_NAMES: Record<number, [string, string]> = {
  1: ['Vinstri', 'uppi'],
  2: ['Miðja', 'uppi'],
  3: ['Hægri', 'uppi'],
  4: ['Vinstri', 'miðja'],
  5: ['Miðja', ''],
  6: ['Hægri', 'miðja'],
  7: ['Vinstri', 'niðri'],
  8: ['Miðja', 'niðri'],
  9: ['Hægri', 'niðri'],
}

// ─── Zone cell ────────────────────────────────────────────────────────────────

function ZoneCell({ stat, zone, gkMode }: { stat: ZoneStat; zone: number; gkMode: boolean }) {
  const { shots, goals } = stat
  const [line1, line2] = ZONE_NAMES[zone] ?? ['', '']

  // In GK mode: saves = shots - goals_conceded, pct = save%
  // In attack mode: pct = goals/shots = shot efficiency
  const goodCount = gkMode ? shots - goals : goals
  const pct = shots > 0 ? Math.round((goodCount / shots) * 100) : null

  let bg = 'bg-gray-50'
  if (shots > 0) {
    if (pct === null) bg = 'bg-gray-50'
    else if (gkMode) {
      // GK: high save% is green, low save% is bad
      if (pct >= 60) bg = 'bg-green-200'
      else if (pct >= 30) bg = 'bg-green-100'
      else bg = 'bg-orange-100'
    } else {
      // Attack: high shot% is green
      if (goals === 0) bg = 'bg-orange-50'
      else if (pct >= 60) bg = 'bg-green-200'
      else if (pct >= 30) bg = 'bg-green-100'
      else bg = 'bg-green-50'
    }
  }

  const ratioColor = gkMode
    ? (shots - goals > 0 ? 'text-green-800' : shots > 0 ? 'text-orange-600' : 'text-gray-300')
    : (goals > 0 ? 'text-green-800' : shots > 0 ? 'text-orange-500' : 'text-gray-300')

  const ratioLabel = gkMode
    ? (shots > 0 ? `${shots - goals}/${shots}` : '—')
    : (shots > 0 ? `${goals}/${shots}` : '—')

  return (
    <div className={`flex flex-col items-center justify-center gap-0.5 border border-gray-300 ${bg} select-none px-1 py-1.5`}>
      <div className="text-center leading-tight">
        <span className="text-[9px] text-gray-400 font-medium block">{line1}</span>
        {line2 && <span className="text-[9px] text-gray-400 font-medium block">{line2}</span>}
      </div>
      <span className={`text-sm font-bold tabular-nums leading-none ${ratioColor}`}>{ratioLabel}</span>
      {pct !== null && (
        <span className="text-[9px] text-gray-500 leading-none">{pct}%</span>
      )}
    </div>
  )
}

// ─── Goal frame ───────────────────────────────────────────────────────────────

function GoalFrame({ zoneStats, gkMode }: { zoneStats: ZoneStats; gkMode: boolean }) {
  const empty: ZoneStat = { shots: 0, goals: 0 }
  const z = (n: number) => zoneStats.goal[n] ?? empty
  const not = zoneStats.notOnTarget
  const blk = zoneStats.blocked

  return (
    <div className="flex flex-col gap-0 w-full max-w-[420px] mx-auto">
      <div className="flex items-end mb-0">
        <div className="w-3 bg-gray-400 rounded-t" style={{ height: 12 }} />
        <div className="flex-1 flex items-center justify-center py-0.5 bg-gray-100 border-x border-t border-gray-400 rounded-t">
          <span className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">
            {gkMode ? 'Skot á okkur' : 'Mark'}
          </span>
        </div>
        <div className="w-3 bg-gray-400 rounded-t" style={{ height: 12 }} />
      </div>

      <div
        className="border-2 border-gray-500 rounded-b grid"
        style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 76px)' }}
      >
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <ZoneCell key={n} stat={z(n)} zone={n} gkMode={gkMode} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        {gkMode ? (
          // GK mode: zone=null saves = off-target/blocked opponent shots
          <div className="rounded border border-gray-300 bg-gray-50 p-2 flex flex-col items-center gap-0.5 col-span-2">
            <span className="text-[10px] text-gray-500 font-medium">Ekki á mark / Blokk</span>
            <span className="text-[9px] text-gray-400">(framhjá, stöng, blokkaðar)</span>
            <span className="text-lg font-bold text-gray-400 tabular-nums">{blk.shots}</span>
            <span className="text-[9px] text-gray-400">skot</span>
          </div>
        ) : (
          <>
            <div className="rounded border border-gray-300 bg-gray-50 p-2 flex flex-col items-center gap-0.5">
              <span className="text-[10px] text-gray-500 font-medium">Ekki á mark</span>
              <span className="text-[9px] text-gray-400">(framhjá / stöng)</span>
              <span className="text-lg font-bold text-gray-500 tabular-nums">{not.shots}</span>
              <span className="text-[9px] text-gray-400">skot</span>
            </div>
            <div className="rounded border border-gray-300 bg-gray-50 p-2 flex flex-col items-center gap-0.5">
              <span className="text-[10px] text-gray-500 font-medium">Blokk</span>
              <span className="text-[9px] text-gray-400">(stöðvað af leikm.)</span>
              <span className="text-lg font-bold text-gray-400 tabular-nums">{blk.shots}</span>
              <span className="text-[9px] text-gray-400">skot</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 justify-center">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-200 border border-gray-300" />
          <span className="text-[10px] text-gray-500">{gkMode ? '≥60% varið' : '≥60% nýting'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-100 border border-gray-300" />
          <span className="text-[10px] text-gray-500">30–59%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-orange-100 border border-gray-300" />
          <span className="text-[10px] text-gray-500">{gkMode ? '<30% varið' : '0 mörk'}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function AttackSummary({ shots, viewMode = 'total', matchCount = 1 }: {
  shots: Event[]; viewMode?: 'total' | 'average'; matchCount?: number
}) {
  const goals = shots.filter(e => e.sub_type === 'goal').length
  const onTarget = shots.filter(e => e.sub_type === 'goal' || e.sub_type === 'saved').length
  const notOnTarget = shots.filter(e => e.sub_type === 'wide' || e.sub_type === 'post').length
  const blocked = shots.filter(e => e.sub_type === 'blocked').length
  const total = shots.length
  const pct = total > 0 ? Math.round(goals / total * 100) : 0
  const disp = (n: number) => viewMode === 'average' ? (matchCount > 0 ? (n / matchCount).toFixed(1) : '0') : n
  return (
    <div className="flex flex-wrap gap-4 px-4 py-3 bg-white border-b border-gray-100 text-center">
      <Stat label="Mörk" value={disp(goals)} color="text-green-700" />
      <Stat label="Skot" value={disp(total)} color="text-gray-700" />
      <Stat label="Nýting" value={`${pct}%`} color="text-gray-600" />
      <Stat label="Á mark" value={disp(onTarget)} color="text-gray-500" />
      <Stat label="Ekki á mark" value={disp(notOnTarget)} color="text-gray-400" />
      <Stat label="Blokk" value={disp(blocked)} color="text-gray-300" />
    </div>
  )
}

function GKSummary({ events, viewMode = 'total', matchCount = 1 }: {
  events: Event[]; viewMode?: 'total' | 'average'; matchCount?: number
}) {
  const shotEvents = events.filter(e => e.sub_type === 'save' || e.sub_type === 'goal_conceded' || e.sub_type === 'parry')
  const onTarget = shotEvents.filter(e => e.zone !== null && e.zone !== undefined)
  const saves = onTarget.filter(e => e.sub_type === 'save' || e.sub_type === 'parry').length
  const conceded = onTarget.filter(e => e.sub_type === 'goal_conceded').length
  const faced = onTarget.length
  const offTarget = shotEvents.filter(e => e.zone === null || e.zone === undefined).length
  const savePct = faced > 0 ? Math.round(saves / faced * 100) : 0
  const disp = (n: number) => viewMode === 'average' ? (matchCount > 0 ? (n / matchCount).toFixed(1) : '0') : n
  return (
    <div className="flex flex-wrap gap-4 px-4 py-3 bg-white border-b border-gray-100 text-center">
      <Stat label="Varið" value={disp(saves)} color="text-green-700" />
      <Stat label="Á móti" value={disp(faced)} color="text-gray-700" />
      <Stat label="Vörn %" value={`${savePct}%`} color={savePct >= 40 ? 'text-green-600' : 'text-gray-600'} />
      <Stat label="Móttökumörk" value={disp(conceded)} color="text-red-500" />
      <Stat label="Ekki á mark" value={disp(offTarget)} color="text-gray-400" />
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  )
}

// ─── Stats computation ────────────────────────────────────────────────────────

function computeAttackZones(shots: Event[]): ZoneStats {
  const s: ZoneStats = { goal: {}, notOnTarget: { shots: 0, goals: 0 }, blocked: { shots: 0, goals: 0 } }
  for (const e of shots) {
    if (e.zone !== null && e.zone !== undefined) {
      if (!s.goal[e.zone]) s.goal[e.zone] = { shots: 0, goals: 0 }
      s.goal[e.zone].shots++
      if (e.sub_type === 'goal') s.goal[e.zone].goals++
    } else if (e.sub_type === 'blocked') {
      s.blocked.shots++
    } else {
      s.notOnTarget.shots++
    }
  }
  return s
}

function computeGKZones(events: Event[]): ZoneStats {
  // Only on-target GK events (save/goal_conceded/parry with zone 1-9)
  // zone=null events = opponent shot was off-target or blocked (all lumped as "blocked/off-target")
  const s: ZoneStats = { goal: {}, notOnTarget: { shots: 0, goals: 0 }, blocked: { shots: 0, goals: 0 } }
  for (const e of events) {
    if (e.sub_type !== 'save' && e.sub_type !== 'goal_conceded' && e.sub_type !== 'parry') continue
    if (e.zone !== null && e.zone !== undefined) {
      if (!s.goal[e.zone]) s.goal[e.zone] = { shots: 0, goals: 0 }
      s.goal[e.zone].shots++
      if (e.sub_type === 'goal_conceded') s.goal[e.zone].goals++
    } else {
      // off-target / blocked / wide / post from opponent — all go into blocked bucket
      s.blocked.shots++
    }
  }
  return s
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ShotMap({
  allEvents,
  players,
  trackedTeamId,
  viewMode = 'total',
  matchCount = 1,
}: {
  allEvents: Event[]
  players: Player[]
  trackedTeamId: string
  viewMode?: 'total' | 'average'
  matchCount?: number
}) {
  const [mode, setMode] = useState<ShotMapMode>('attack')
  const [playerId, setPlayerId] = useState<string>('')
  const { range, setRange, filterEvents, clear } = useMinuteFilter()

  const filtered = useMemo(() => filterEvents(allEvents), [allEvents, range]) // eslint-disable-line react-hooks/exhaustive-deps

  const attackShots = useMemo(() => {
    let evs = filtered.filter(e => e.event_type === 'SHOT' && e.team_id === trackedTeamId)
    if (playerId) evs = evs.filter(e => e.player_id === playerId)
    return evs
  }, [filtered, playerId, trackedTeamId])

  const gkEvents = useMemo(() => {
    let evs = filtered.filter(e => e.event_type === 'GOALKEEPER_ACTION' && e.team_id === trackedTeamId)
    if (mode === 'gk' && playerId) evs = evs.filter(e => e.player_id === playerId)
    return evs
  }, [filtered, trackedTeamId, mode, playerId])

  const attackZones = useMemo(() => computeAttackZones(attackShots), [attackShots])
  const gkZones = useMemo(() => computeGKZones(gkEvents), [gkEvents])

  const fieldPlayers = useMemo(() => players.filter(p => p.position !== 'goalkeeper'), [players])
  const goalkeepers = useMemo(() => players.filter(p => p.position === 'goalkeeper'), [players])

  const activeZones = mode === 'attack' ? attackZones : gkZones
  const noData = mode === 'attack' ? attackShots.length === 0 : gkEvents.length === 0

  return (
    <div className="flex flex-col bg-gray-50">
      {/* Mode toggle */}
      <div className="flex bg-white border-b border-gray-200">
        <button
          onClick={() => { setMode('attack'); setPlayerId('') }}
          className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors ${mode === 'attack' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Sókn
        </button>
        <button
          onClick={() => { setMode('gk'); setPlayerId('') }}
          className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors ${mode === 'gk' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Markvörður
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200">
        <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />
        <div className="flex items-center gap-3 px-4 py-2">
          <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
            {mode === 'attack' ? 'Leikmaður:' : 'Markvörður:'}
          </span>
          <select
            value={playerId}
            onChange={e => setPlayerId(e.target.value)}
            className="px-2 py-1 rounded border border-gray-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">{mode === 'attack' ? 'Allir leikmenn' : 'Allir markmenn'}</option>
            {(mode === 'attack' ? fieldPlayers : goalkeepers).map(p => (
              <option key={p.id} value={p.id}>
                {p.jersey_number != null ? `#${p.jersey_number} ` : ''}{p.first_name} {p.last_name}
              </option>
            ))}
          </select>
          {playerId && (
            <button onClick={() => setPlayerId('')} className="text-xs text-blue-600 hover:underline">Hreinsa</button>
          )}
        </div>
      </div>

      {/* Summary */}
      {mode === 'attack'
        ? <AttackSummary shots={attackShots} viewMode={viewMode} matchCount={matchCount} />
        : <GKSummary events={gkEvents} viewMode={viewMode} matchCount={matchCount} />
      }

      {/* Goal visualization */}
      <div className="flex-1 overflow-auto p-4">
        {noData ? (
          <p className="text-center text-gray-400 text-sm py-8">
            {mode === 'attack' ? 'Engin skot skráð' : 'Engir GK atburðir skráðir'}
          </p>
        ) : (
          <GoalFrame zoneStats={activeZones} gkMode={mode === 'gk'} />
        )}
      </div>
    </div>
  )
}
