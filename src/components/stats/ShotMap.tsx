import { useMemo, useState } from 'react'
import type { Event, Player } from '@/lib/db/schema'
import { useMinuteFilter, MinuteFilterBar } from './MinuteFilter'
import { useT, type Text } from '@/lib/i18n/lang'
import { T } from '@/lib/i18n/terms'
import { Segmented, Select } from '@/components/ui'

type ShotMapMode = 'attack' | 'gk'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ZoneStat { shots: number; goals: number }  // goals = goals scored (attack) or goals conceded (gk)

interface ZoneStats {
  goal: Record<number, ZoneStat>   // zones 1-9
  notOnTarget: ZoneStat            // wide + post (attack only)
  blocked: ZoneStat                // blocked by defender (attack) or off-target saves (gk)
}

// ─── Zone labels ──────────────────────────────────────────────────────────────

const ZONE_NAMES: Record<number, Text> = {
  1: { en: 'Top left', is: 'Vinstri uppi' },
  2: { en: 'Top centre', is: 'Miðja uppi' },
  3: { en: 'Top right', is: 'Hægri uppi' },
  4: { en: 'Middle left', is: 'Vinstri miðja' },
  5: { en: 'Middle', is: 'Miðja' },
  6: { en: 'Middle right', is: 'Hægri miðja' },
  7: { en: 'Low left', is: 'Vinstri niðri' },
  8: { en: 'Low centre', is: 'Miðja niðri' },
  9: { en: 'Low right', is: 'Hægri niðri' },
}

// ─── Zone cell: three clear steps, cobalt for the hot zones ───────────────────

function ZoneCell({ stat, zone, gkMode }: { stat: ZoneStat; zone: number; gkMode: boolean }) {
  const t = useT()
  const { shots, goals } = stat
  // In GK mode: good = saves (shots − goals conceded); in attack mode: good = goals
  const good = gkMode ? shots - goals : goals
  const p = shots > 0 ? good / shots : null
  const [hi, mid] = gkMode ? [0.5, 0.25] : [0.6, 0.3]
  const tone = p === null ? 'bg-[#f5f6f8] text-[#9aa0a8]'
    : p >= hi ? 'bg-accent text-white'
    : p >= mid ? 'bg-[#cfd4db] text-ink'
    : 'bg-[#f5f6f8] text-ink'
  return (
    <div className={`flex flex-col items-center justify-center gap-0.5 rounded-[3px] ${tone} select-none px-1 py-1.5`}>
      <span className="text-[11px] leading-tight opacity-80 text-center">{t(ZONE_NAMES[zone])}</span>
      <span className="text-[17px] font-semibold num leading-none">{shots > 0 ? `${good}/${shots}` : '—'}</span>
      {p !== null && <span className="text-[12px] num leading-none opacity-80">{Math.round(p * 100)}%</span>}
    </div>
  )
}

// ─── Goal frame ───────────────────────────────────────────────────────────────

function GoalFrame({ zoneStats, gkMode }: { zoneStats: ZoneStats; gkMode: boolean }) {
  const t = useT()
  const empty: ZoneStat = { shots: 0, goals: 0 }
  const z = (n: number) => zoneStats.goal[n] ?? empty
  const not = zoneStats.notOnTarget
  const blk = zoneStats.blocked
  const legend = gkMode
    ? [{ c: 'bg-accent', l: t({ en: '50% saved or more', is: '50% varið eða meira' }) }, { c: 'bg-[#cfd4db]', l: '25–49%' }, { c: 'bg-[#f5f6f8] border border-line', l: t({ en: 'Under 25%', is: 'Undir 25%' }) }]
    : [{ c: 'bg-accent', l: t({ en: '60% scored or more', is: '60% nýting eða meira' }) }, { c: 'bg-[#cfd4db]', l: '30–59%' }, { c: 'bg-[#f5f6f8] border border-line', l: t({ en: 'Under 30%', is: 'Undir 30%' }) }]

  return (
    <div className="flex flex-col w-full max-w-[460px] mx-auto">
      {/* 3 m × 2 m goal face, posts and bar in ink */}
      <div className="grid grid-cols-3 gap-[3px] p-[3px] border-[6px] border-b-0 border-ink bg-white" style={{ gridTemplateRows: 'repeat(3, 84px)' }}
        aria-label={gkMode ? t({ en: 'Shots on our goal by zone', is: 'Skot á okkar mark eftir svæðum' }) : t({ en: 'Our shots by zone', is: 'Skotin okkar eftir svæðum' })}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <ZoneCell key={n} stat={z(n)} zone={n} gkMode={gkMode} />)}
      </div>

      <dl className={`grid ${gkMode ? 'grid-cols-1' : 'grid-cols-2'} gap-3 mt-4`}>
        {gkMode ? (
          <OffCell label={t({ en: 'Off target or blocked', is: 'Ekki á mark eða blokk' })} sub={t({ en: 'Wide, post and blocked', is: 'Framhjá, stöng og blokkað' })} value={blk.shots} />
        ) : (
          <>
            <OffCell label={t(T.offTarget)} sub={t({ en: 'Wide or post', is: 'Framhjá eða stöng' })} value={not.shots} />
            <OffCell label={t(T.blocked)} sub={t({ en: 'Stopped by a defender', is: 'Stöðvað af varnarmanni' })} value={blk.shots} />
          </>
        )}
      </dl>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {legend.map(x => (
          <li key={x.l} className="flex items-center gap-1.5 text-[12px] text-muted">
            <span className={`w-3 h-3 rounded-sm ${x.c}`} aria-hidden="true" />{x.l}
          </li>
        ))}
      </ul>
    </div>
  )
}

function OffCell({ label, sub, value }: { label: string; sub: string; value: number }) {
  return (
    <div className="bg-white border border-line rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
      <div>
        <dt className="text-[14px]">{label}</dt>
        <p className="text-[12px] text-muted">{sub}</p>
      </div>
      <dd className={`text-[20px] font-semibold num ${value > 0 ? 'text-ink' : 'text-[#9aa0a8]'}`}>{value}</dd>
    </div>
  )
}

// ─── Summary bar ──────────────────────────────────────────────────────────────

function AttackSummary({ shots, viewMode = 'total', matchCount = 1 }: {
  shots: Event[]; viewMode?: 'total' | 'average'; matchCount?: number
}) {
  const t = useT()
  const goals = shots.filter(e => e.sub_type === 'goal').length
  const onTarget = shots.filter(e => e.sub_type === 'goal' || e.sub_type === 'saved').length
  const notOnTarget = shots.filter(e => e.sub_type === 'wide' || e.sub_type === 'post').length
  const blocked = shots.filter(e => e.sub_type === 'blocked').length
  const total = shots.length
  const pct = total > 0 ? Math.round(goals / total * 100) : 0
  const disp = (n: number) => viewMode === 'average' ? (matchCount > 0 ? (n / matchCount).toFixed(1) : '0') : n
  return (
    <Strip>
      <Stat label={t(T.goals)} value={disp(goals)} accent />
      <Stat label={t(T.shots)} value={disp(total)} />
      <Stat label={t(T.shootingPct)} value={`${pct}%`} />
      <Stat label={t({ en: 'On target', is: 'Á mark' })} value={disp(onTarget)} />
      <Stat label={t(T.offTarget)} value={disp(notOnTarget)} />
      <Stat label={t(T.blocked)} value={disp(blocked)} />
    </Strip>
  )
}

function GKSummary({ events, viewMode = 'total', matchCount = 1 }: {
  events: Event[]; viewMode?: 'total' | 'average'; matchCount?: number
}) {
  const t = useT()
  const shotEvents = events.filter(e => e.sub_type === 'save' || e.sub_type === 'goal_conceded' || e.sub_type === 'parry')
  const onTarget = shotEvents.filter(e => e.zone !== null && e.zone !== undefined)
  const saves = onTarget.filter(e => e.sub_type === 'save' || e.sub_type === 'parry').length
  const conceded = onTarget.filter(e => e.sub_type === 'goal_conceded').length
  const faced = onTarget.length
  const offTarget = shotEvents.filter(e => e.zone === null || e.zone === undefined).length
  const savePct = faced > 0 ? Math.round(saves / faced * 100) : 0
  const disp = (n: number) => viewMode === 'average' ? (matchCount > 0 ? (n / matchCount).toFixed(1) : '0') : n
  return (
    <Strip>
      <Stat label={t(T.saves)} value={disp(saves)} accent />
      <Stat label={t({ en: 'On target', is: 'Á mark' })} value={disp(faced)} />
      <Stat label={t(T.savePct)} value={`${savePct}%`} />
      <Stat label={t(T.conceded)} value={disp(conceded)} />
      <Stat label={t(T.offTarget)} value={disp(offTarget)} />
    </Strip>
  )
}

function Strip({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-3 sm:grid-cols-6 gap-x-6 gap-y-3 px-4 py-4 bg-white border-b border-line">{children}</dl>
}

function Stat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={`text-[22px] font-medium leading-tight num ${accent ? 'text-accent' : 'text-ink'}`}>{value}</dd>
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
      s.blocked.shots++
    }
  }
  return s
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ShotMap({ allEvents, players, trackedTeamId, viewMode = 'total', matchCount = 1 }: {
  allEvents: Event[]
  players: Player[]
  trackedTeamId: string
  viewMode?: 'total' | 'average'
  matchCount?: number
}) {
  const t = useT()
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
    <div className="flex flex-col bg-ground">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white border-b border-line">
        <Segmented<ShotMapMode> value={mode} onChange={m => { setMode(m); setPlayerId('') }}
          options={[{ v: 'attack', label: t(T.attack) }, { v: 'gk', label: t(T.goalkeeper) }]} />
        <div className="flex items-center gap-2 min-w-0">
          <Select value={playerId} onChange={e => setPlayerId(e.target.value)} className="!h-8 !text-[14px] max-w-[240px]"
            aria-label={mode === 'attack' ? t(T.player) : t(T.goalkeeper)}>
            <option value="">{mode === 'attack' ? t({ en: 'All players', is: 'Allir leikmenn' }) : t({ en: 'All goalkeepers', is: 'Allir markmenn' })}</option>
            {(mode === 'attack' ? fieldPlayers : goalkeepers).map(p => (
              <option key={p.id} value={p.id}>
                {p.jersey_number != null ? `#${p.jersey_number} ` : ''}{p.first_name} {p.last_name}
              </option>
            ))}
          </Select>
          {playerId && (
            <button onClick={() => setPlayerId('')} className="text-[13px] text-muted hover:text-ink underline underline-offset-4">{t(T.clear)}</button>
          )}
        </div>
      </div>
      <MinuteFilterBar range={range} setRange={setRange} onClear={clear} />

      {mode === 'attack'
        ? <AttackSummary shots={attackShots} viewMode={viewMode} matchCount={matchCount} />
        : <GKSummary events={gkEvents} viewMode={viewMode} matchCount={matchCount} />}

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {noData ? (
          <p className="max-w-[460px] mx-auto text-[14px] text-muted border border-dashed border-[#cfd4db] rounded-lg px-3 py-2.5">
            {mode === 'attack' ? t({ en: 'No shots logged yet.', is: 'Engin skot skráð enn.' }) : t({ en: 'No goalkeeper events logged yet.', is: 'Engar markvörslur skráðar enn.' })}
          </p>
        ) : (
          <GoalFrame zoneStats={activeZones} gkMode={mode === 'gk'} />
        )}
      </div>
    </div>
  )
}
