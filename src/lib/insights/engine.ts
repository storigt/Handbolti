// Insight finder: runs many small comparisons over the selected matches and
// keeps the ones that stand out. Each comparison is a real statistical test
// (two proportions, Poisson rate, correlation, leave-one-out z); all p-values
// are corrected together with Benjamini–Hochberg, so running hundreds of tests
// does not by itself produce "findings". Every finding says what it is based on.
import type { Event, Player, CourtLineup } from '@/lib/db/schema'
import type { MatchWithTeams } from '@/lib/supabase/dashboardQueries'
import type { Text } from '@/lib/i18n/lang'
import { getCtx } from '@/lib/stats/matchStats'
import { twoProportions, poissonTest, correlation, leaveOneOutZ, benjaminiHochberg, phi } from './stats'

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightArea = 'attack' | 'defence' | 'keeper' | 'lineup' | 'match'
export type Level = 'strong' | 'likely' | 'hint'

export interface BarItem { label: string; value: number; note?: string; highlight?: boolean }
export type InsightChart =
  | { kind: 'bars'; unit: '%' | 'per10' | 'count'; items: BarItem[]; reference?: { value: number; label: Text } }
  | { kind: 'scatter'; x: Text; y: Text; xUnit?: '%'; yUnit?: '%'; points: { label: string; x: number; y: number }[]; slope: number; intercept: number }
  | { kind: 'zones'; cells: { zone: number; saved: number; faced: number; highlight: boolean }[] }

export interface Insight {
  id: string
  area: InsightArea
  level: Level
  p: number
  q: number
  title: Text
  detail: Text
  basis: Text
  chart: InsightChart
}

interface Candidate extends Omit<Insight, 'level' | 'q'> { effect: number; ti: number }

export interface InsightInput {
  events: Event[]
  players: Player[]
  lineups: CourtLineup[]
  matches: MatchWithTeams[]
  trackedTeamId: string
}

export interface InsightResult {
  insights: Insight[]
  tested: number
  enough: boolean
  shots: number
}

// ─── Words ────────────────────────────────────────────────────────────────────

const L = (en: string, is: string): Text => ({ en, is })
const pct = (a: number, n: number) => (n > 0 ? Math.round((a / n) * 100) : 0)
const f1 = (x: number) => (Math.round(x * 10) / 10).toString()

const RANGE_GROUPS: { key: string; ranges: string[]; label: Text; from: Text }[] = [
  { key: '9m', ranges: ['9m_plus'], label: L('9 m+', '9m+'), from: L('from 9 m+', 'af 9m+') },
  { key: '78', ranges: ['7_8m'], label: L('7–8 m', '7–8m'), from: L('from 7–8 m', 'af 7–8m') },
  { key: '6m', ranges: ['6m'], label: L('6 m', '6m'), from: L('from 6 m', 'af 6m') },
  { key: 'line', ranges: ['line'], label: L('Line', 'Lína'), from: L('from the line', 'af línu') },
  { key: 'wing', ranges: ['corner_wing', 'corner_wing_left', 'corner_wing_right'], label: L('Wings', 'Horn'), from: L('from the wings', 'úr hornum') },
  { key: 'pen', ranges: ['penalty'], label: L('7 m', 'Víti'), from: L('from 7 m', 'úr vítum') },
]
const PHASES: { v: string; label: Text; in: Text }[] = [
  { v: 'set_play', label: L('Set play', 'Uppstilltur'), in: L('in set play', 'í uppstilltum leik') },
  { v: 'fast_break', label: L('Fast break', 'Hraðaupphlaup'), in: L('on fast breaks', 'í hraðaupphlaupum') },
  { v: 'second_wave', label: L('Second wave', 'Seinni bylgja'), in: L('in the second wave', 'í seinni bylgju') },
]
const NUMERICAL: { v: string; label: Text; in: Text }[] = [
  { v: '6v6', label: L('6 v 6', '6á6'), in: L('at 6 v 6', 'í 6á6') },
  { v: 'superiority', label: L('Extra player', 'Yfirtala'), in: L('with an extra player', 'í yfirtölu') },
  { v: 'inferiority', label: L('Shorthanded', 'Undirtala'), in: L('when shorthanded', 'í undirtölu') },
  { v: '7v6', label: L('7 v 6', '7á6'), in: L('at 7 v 6', 'í 7á6') },
]
const ORIGINS: { v: string; label: Text; from: Text }[] = [
  { v: 'left_wing', label: L('Left wing', 'Vinstra horn'), from: L('from the left wing', 'frá vinstra horni') },
  { v: 'left_center', label: L('Left back', 'Vinstri skytta'), from: L('from left back', 'frá vinstri skyttu') },
  { v: 'center', label: L('Left centre', 'Vinstri miðja'), from: L('from left centre', 'frá vinstri miðju') },
  { v: 'right_center', label: L('Right centre', 'Hægri miðja'), from: L('from right centre', 'frá hægri miðju') },
  { v: 'right_wing', label: L('Right back', 'Hægri skytta'), from: L('from right back', 'frá hægri skyttu') },
  { v: 'line', label: L('Right wing', 'Hægra horn'), from: L('from the right wing', 'frá hægra horni') },
]
const DIRECTIONS: { v: string; label: Text; in: Text }[] = [
  { v: 'left', label: L('Went left', 'Til vinstri'), in: L('when going left', 'þegar farið er til vinstri') },
  { v: 'right', label: L('Went right', 'Til hægri'), in: L('when going right', 'þegar farið er til hægri') },
  { v: 'neither', label: L('Neither', 'Hvorugt'), in: L('going neither way', 'þegar farið er í hvoruga átt') },
]
const HAND: { v: boolean; label: Text; in: Text }[] = [
  { v: true, label: L('Hand up', 'Hönd uppi'), in: L('with the hand up', 'með höndina uppi') },
  { v: false, label: L('Hand down', 'Hönd niðri'), in: L('with the hand down', 'með höndina niðri') },
]
const ZONE_NAME: Text[] = [
  L('top left', 'efst vinstra'), L('top centre', 'efst í miðju'), L('top right', 'efst hægra'),
  L('middle left', 'miðja vinstra'), L('the centre', 'í miðjuna'), L('middle right', 'miðja hægra'),
  L('bottom left', 'neðst vinstra'), L('bottom centre', 'neðst í miðju'), L('bottom right', 'neðst hægra'),
]
const WINDOWS = [0, 10, 20, 30, 40, 50]

// Situations where a high (or low) rate is simply expected — only the surprising direction is flagged
const EXPECTED_HIGH = new Set(['pen', 'fast_break', 'second_wave', 'superiority', '7v6'])
const EXPECTED_LOW = new Set(['inferiority'])

// ─── Preparation ──────────────────────────────────────────────────────────────

interface Prep {
  ev: Event[]
  team: string
  name: (id: string | null | undefined) => string
  isGK: (id: string) => boolean
  field: Player[]
  keepers: Player[]
  ourShots: Event[]
  onTarget: Event[]          // keeper shots: save / goal conceded
  oppShots: Event[]          // keeper shots incl. wide/post
  lineupOf: Map<string, Set<string>>
  hasLineups: boolean
  matches: MatchWithTeams[]
  /** Every p-value computed, reported or not — the multiple-testing correction needs all of them */
  tests: number[]
  record: (p: number) => number
}

function prepare({ events, players, lineups, matches, trackedTeamId }: InsightInput): Prep {
  const ev = events.filter(e => !e.is_voided)
  const byId = new Map(players.map(p => [p.id, p]))
  const name = (id: string | null | undefined) => {
    const p = id ? byId.get(id) : undefined
    return p ? `#${p.jersey_number ?? ''} ${p.first_name}`.trim() : '?'
  }
  const ours = (e: Event) => e.team_id === trackedTeamId
  const gk = ev.filter(e => ours(e) && e.event_type === 'GOALKEEPER_ACTION')
  const lineupOf = new Map(lineups.map(l => [l.id, new Set(l.player_ids)]))
  const tests: number[] = []
  return {
    ev, team: trackedTeamId, name,
    isGK: id => byId.get(id)?.position === 'goalkeeper',
    field: players.filter(p => p.position !== 'goalkeeper'),
    keepers: players.filter(p => p.position === 'goalkeeper'),
    ourShots: ev.filter(e => ours(e) && e.event_type === 'SHOT' && !!e.player_id),
    onTarget: gk.filter(e => e.sub_type === 'save' || e.sub_type === 'goal_conceded'),
    oppShots: gk.filter(e => e.sub_type === 'save' || e.sub_type === 'goal_conceded' || e.sub_type === 'missed'),
    lineupOf,
    hasLineups: lineups.length > 0 && ev.some(e => e.lineup_id && lineupOf.has(e.lineup_id)),
    matches,
    tests,
    record: (p: number) => tests.push(p) - 1,
  }
}

const isGoal = (e: Event) => e.sub_type === 'goal'

// ─── 1. Player vs the rest of the team, same kind of shot ─────────────────────

function playerVsTeam(P: Prep): Candidate[] {
  const out: Candidate[] = []
  const contexts: { key: string; label: Text; from: Text; test: (e: Event) => boolean }[] = [
    { key: 'all', label: L('All shots', 'Öll skot'), from: L('overall', 'í heild'), test: () => true },
    ...RANGE_GROUPS.map(g => ({ key: g.key, label: g.label, from: g.from, test: (e: Event) => g.ranges.includes(e.shot_range ?? '') })),
    ...PHASES.filter(p => p.v !== 'set_play').map(p => ({ key: p.v, label: p.label, from: p.in, test: (e: Event) => e.phase_type === p.v })),
  ]
  for (const c of contexts) {
    const shots = P.ourShots.filter(c.test)
    const byPlayer = new Map<string, { g: number; n: number }>()
    for (const s of shots) {
      const r = byPlayer.get(s.player_id!) ?? { g: 0, n: 0 }
      r.n++; if (isGoal(s)) r.g++
      byPlayer.set(s.player_id!, r)
    }
    const totalG = shots.filter(isGoal).length, totalN = shots.length
    for (const [pid, { g, n }] of byPlayer) {
      const restG = totalG - g, restN = totalN - n
      if (n < 8 || restN < 15) continue
      const { diff, p } = twoProportions(g, n, restG, restN)
      const ti = P.record(p)
      if (Math.abs(diff) < 12) continue
      if (EXPECTED_HIGH.has(c.key) && diff > 0) continue
      const items = [...byPlayer].filter(([, r]) => r.n >= 5).map(([id, r]) => ({
        label: P.name(id), value: pct(r.g, r.n), note: `${r.g}/${r.n}`, highlight: id === pid,
      })).sort((a, b) => b.value - a.value)
      const nm = P.name(pid)
      const up = diff > 0
      out.push({
        id: `pvt:${c.key}:${pid}`, area: 'attack', p, ti, effect: Math.abs(diff) / 100,
        title: L(`${nm} scores ${pct(g, n)}% ${c.from.en}`, `${nm} skorar úr ${pct(g, n)}% skota ${c.from.is}`),
        detail: L(
          `${up ? 'Well above' : 'Well below'} the rest of the team, who score ${pct(restG, restN)}% ${c.from.en}.`,
          `${up ? 'Langt yfir' : 'Langt undir'} restinni af liðinu, sem skorar úr ${pct(restG, restN)}% ${c.from.is}.`,
        ),
        basis: L(`${nm}: ${g} of ${n} shots · rest of team: ${restG} of ${restN}`, `${nm}: ${g} af ${n} skotum · restin: ${restG} af ${restN}`),
        chart: { kind: 'bars', unit: '%', items, reference: { value: pct(totalG, totalN), label: L('Team', 'Liðið') } },
      })
    }
  }
  return out
}

// ─── 2. A player against themselves: one situation vs their other shots ──────

function playerSplits(P: Prep): Candidate[] {
  const out: Candidate[] = []
  type Dim = { key: string; cats: { v: string; label: Text; in: Text; test: (e: Event) => boolean }[]; onTargetOnly?: boolean }
  const dims: Dim[] = [
    { key: 'range', cats: RANGE_GROUPS.map(g => ({ v: g.key, label: g.label, in: g.from, test: (e: Event) => g.ranges.includes(e.shot_range ?? '') })) },
    { key: 'phase', cats: PHASES.map(p => ({ v: p.v, label: p.label, in: p.in, test: (e: Event) => e.phase_type === p.v })) },
    { key: 'num', cats: NUMERICAL.map(x => ({ v: x.v, label: x.label, in: x.in, test: (e: Event) => e.numerical_state === x.v })) },
    { key: 'dir', cats: DIRECTIONS.map(x => ({ v: x.v, label: x.label, in: x.in, test: (e: Event) => getCtx(e).attack_direction === x.v })) },
    { key: 'hand', onTargetOnly: true, cats: HAND.map(x => ({ v: String(x.v), label: x.label, in: x.in, test: (e: Event) => getCtx(e).hand_up === x.v })) },
  ]
  const byPlayer = new Map<string, Event[]>()
  for (const s of P.ourShots) byPlayer.set(s.player_id!, [...(byPlayer.get(s.player_id!) ?? []), s])
  for (const [pid, all] of byPlayer) {
    if (all.length < 15) continue
    const nm = P.name(pid)
    for (const d of dims) {
      const shots = d.onTargetOnly ? all.filter(e => e.sub_type === 'goal' || e.sub_type === 'saved') : all
      const inDim = shots.filter(e => d.cats.some(c => c.test(e)))
      for (const c of d.cats) {
        const inC = inDim.filter(c.test), rest = inDim.filter(e => !c.test(e))
        if (inC.length < 6 || rest.length < 6) continue
        const g = inC.filter(isGoal).length, rg = rest.filter(isGoal).length
        const { diff, p } = twoProportions(g, inC.length, rg, rest.length)
        const ti = P.record(p)
        if (Math.abs(diff) < 20) continue
        if (EXPECTED_HIGH.has(c.v) && diff > 0) continue
        if (EXPECTED_LOW.has(c.v) && diff < 0) continue
        const items = d.cats.map(cc => {
          const xs = inDim.filter(cc.test)
          return { label: cc.label.en, labelIs: cc.label.is, value: pct(xs.filter(isGoal).length, xs.length), note: `${xs.filter(isGoal).length}/${xs.length}`, highlight: cc.v === c.v, n: xs.length }
        }).filter(x => x.n >= 3)
        out.push({
          id: `split:${d.key}:${c.v}:${pid}`, area: 'attack', p, ti, effect: Math.abs(diff) / 100,
          title: L(`${nm}: ${pct(g, inC.length)}% ${c.in.en}`, `${nm}: ${pct(g, inC.length)}% ${c.in.is}`),
          detail: L(
            `Against ${pct(rg, rest.length)}% in ${nm.split(' ').slice(1).join(' ')}'s other shots — a gap of ${Math.abs(Math.round(diff))} points.`,
            `Á móti ${pct(rg, rest.length)}% í öðrum skotum leikmannsins — munur upp á ${Math.abs(Math.round(diff))} prósentustig.`,
          ),
          basis: L(`${g} of ${inC.length} vs ${rg} of ${rest.length} shots${d.onTargetOnly ? ' on target' : ''}`, `${g} af ${inC.length} á móti ${rg} af ${rest.length} skotum${d.onTargetOnly ? ' á mark' : ''}`),
          chart: { kind: 'bars', unit: '%', items: items.map(x => ({ label: `${x.label}|${x.labelIs}`, value: x.value, note: x.note, highlight: x.highlight })), reference: { value: pct(g + rg, inDim.length), label: L('Player', 'Leikmaður') } },
        })
      }
    }
  }
  return out
}

// ─── 3. Rates per possession on court, vs the rest of the team ───────────────

function exposures(P: Prep) {
  // possessions each player was on court for, ours and theirs
  const own = new Map<string, number>(), opp = new Map<string, number>()
  for (const e of P.ev) {
    if (e.event_type !== 'ATTACK' || !e.lineup_id) continue
    const on = P.lineupOf.get(e.lineup_id)
    if (!on) continue
    const m = e.team_id === P.team ? own : opp
    for (const pid of on) m.set(pid, (m.get(pid) ?? 0) + 1)
  }
  return { own, opp }
}

function playerRates(P: Prep): Candidate[] {
  if (!P.hasLineups) return []
  const out: Candidate[] = []
  const { own, opp } = exposures(P)
  type Stat = { key: string; side: 'own' | 'opp'; label: Text; what: Text; good: boolean; who: (e: Event) => string | null }
  const team = P.team
  const stats: Stat[] = [
    { key: 'to', side: 'own', label: L('Turnovers', 'Tapaðir boltar'), what: L('turnovers', 'tapaða bolta'), good: false, who: e => e.event_type === 'TURNOVER' && e.team_id === team ? e.player_id : null },
    { key: 'ast', side: 'own', label: L('Assists', 'Stoðsendingar'), what: L('assists', 'stoðsendingar'), good: true, who: e => e.event_type === 'SHOT' && e.team_id === team && isGoal(e) ? (getCtx(e).assist_player_id as string) ?? null : null },
    { key: 'd7', side: 'own', label: L('Drew 7 m', 'Fiskuð víti'), what: L('drawn penalties', 'fiskuð víti'), good: true, who: e => e.event_type === 'FOUL' && e.sub_type === '7m_awarded' && e.team_id !== team ? (getCtx(e).fouled_player_id as string) ?? null : null },
    { key: 'orb', side: 'own', label: L('Offensive rebounds', 'Sóknarfráköst'), what: L('offensive rebounds', 'sóknarfráköst'), good: true, who: e => e.event_type === 'ATTACKING_ACTION' && e.sub_type === 'offensive_rebound' && e.team_id === team ? e.player_id : null },
    { key: 'blk', side: 'opp', label: L('Blocks', 'Blokk'), what: L('blocks', 'blokk'), good: true, who: e => e.event_type === 'DEFENSIVE_ACTION' && e.sub_type === 'block' && e.team_id === team ? e.player_id : null },
    { key: 'stl', side: 'opp', label: L('Steals', 'Stolnir boltar'), what: L('steals', 'stolna bolta'), good: true, who: e => e.event_type === 'DEFENSIVE_ACTION' && (e.sub_type === 'interception' || e.sub_type === 'opponent_lost_ball') && e.team_id === team ? e.player_id : null },
    { key: 'dl', side: 'opp', label: L('Duels lost', 'Töpuð einvígi'), what: L('lost 1 v 1 duels', 'töpuð einvígi'), good: false, who: e => e.event_type === 'DEFENSIVE_ACTION' && e.sub_type === 'duel_lost' && e.team_id === team ? e.player_id : null },
    { key: 'dw', side: 'opp', label: L('Duels won', 'Unnin einvígi'), what: L('won 1 v 1 duels', 'unnin einvígi'), good: true, who: e => e.event_type === 'DEFENSIVE_ACTION' && e.sub_type === 'duel_won' && e.team_id === team ? e.player_id : null },
    { key: 'ft', side: 'opp', label: L('Free throws given', 'Fríköst'), what: L('free throws conceded', 'fríköst á sig'), good: false, who: e => e.event_type === 'FOUL' && e.sub_type === 'attacking_foul' && e.team_id === team ? e.player_id : null },
    { key: '2m', side: 'opp', label: L('2 minutes', '2 mínútur'), what: L('2-minute suspensions', 'brottvísanir'), good: false, who: e => e.event_type === 'SUSPENSION' && e.sub_type === '2min' && e.team_id === team ? e.player_id : null },
    { key: '7c', side: 'opp', label: L('7 m conceded', 'Víti á sig'), what: L('penalties conceded', 'víti á sig'), good: false, who: e => e.event_type === 'FOUL' && e.sub_type === '7m_awarded' && e.team_id === team ? e.player_id : null },
  ]
  for (const st of stats) {
    const exp = st.side === 'own' ? own : opp
    const counts = new Map<string, number>()
    for (const e of P.ev) { const w = st.who(e); if (w) counts.set(w, (counts.get(w) ?? 0) + 1) }
    const players = P.field.filter(p => (exp.get(p.id) ?? 0) >= 30)
    const totalC = players.reduce((a, p) => a + (counts.get(p.id) ?? 0), 0)
    const totalE = players.reduce((a, p) => a + (exp.get(p.id) ?? 0), 0)
    if (totalC < 10) continue
    for (const pl of players) {
      const c = counts.get(pl.id) ?? 0, x = exp.get(pl.id)!
      const restRate = (totalC - c) / (totalE - x)
      const expected = restRate * x
      if (expected <= 0) continue
      const ratio = c / expected
      const p = poissonTest(c, expected)
      const ti = P.record(p)
      const high = ratio >= 1.7 && c >= 4, low = ratio <= 0.45 && expected >= 5
      if (!high && !low) continue
      const nm = P.name(pl.id)
      const per10 = (c / x) * 10, rest10 = restRate * 10
      const items = players.map(q => ({ label: P.name(q.id), value: Math.round(((counts.get(q.id) ?? 0) / exp.get(q.id)!) * 100) / 10, note: `${counts.get(q.id) ?? 0}`, highlight: q.id === pl.id }))
        .sort((a, b) => b.value - a.value)
      const sideTxt = st.side === 'own' ? L('of our possessions', 'sóknum okkar') : L('opponent possessions', 'sóknum andstæðinga')
      out.push({
        id: `rate:${st.key}:${pl.id}`, area: st.side === 'own' ? 'attack' : 'defence', p, ti, effect: Math.min(3, Math.abs(Math.log(Math.max(ratio, 0.05)))) / 3,
        title: high
          ? L(`${nm}: ${f1(per10)} ${st.what.en} per 10 possessions — ${ratio >= 2 ? `${f1(ratio)}×` : 'well above'} the rest of the team`,
              `${nm}: ${f1(per10).replace('.', ',')} ${st.what.is} á 10 sóknir — ${ratio >= 2 ? `${f1(ratio).replace('.', ',')}×` : 'vel yfir'} restinni af liðinu`)
          : L(`${nm}: only ${f1(per10)} ${st.what.en} per 10 possessions — well below the rest of the team`,
              `${nm}: aðeins ${f1(per10).replace('.', ',')} ${st.what.is} á 10 sóknir — vel undir restinni af liðinu`),
        detail: L(
          `Counted per 10 ${sideTxt.en} while on court. The rest of the team together: ${f1(rest10)}. Players with fewer possessions can show higher rates by chance; this one holds up over ${x} possessions.`,
          `Talið á hverjar 10 ${sideTxt.is} inni á vellinum. Restin af liðinu saman: ${f1(rest10).replace('.', ',')}. Leikmenn með færri sóknir geta sýnt hærri tölur af tilviljun; þessi stenst yfir ${x} sóknir.`,
        ),
        basis: L(`${c} ${st.what.en} in ${x} ${sideTxt.en} on court`, `${c} ${st.what.is} í ${x} ${sideTxt.is} inni á velli`),
        chart: { kind: 'bars', unit: 'per10', items, reference: { value: Math.round(rest10 * 10) / 10, label: L('Rest of team', 'Restin') } },
      })
    }
  }
  return out
}

// ─── 4. On court vs off court ────────────────────────────────────────────────

function onOff(P: Prep): Candidate[] {
  if (!P.hasLineups) return []
  const out: Candidate[] = []
  const team = P.team
  const ourGoal = (e: Event) => e.event_type === 'SHOT' && e.team_id === team && isGoal(e)
  const theirGoal = (e: Event) => (e.event_type === 'GOALKEEPER_ACTION' && e.team_id === team && e.sub_type === 'goal_conceded') || (e.event_type === 'SHOT' && e.team_id !== team && isGoal(e))
  const withLineup = P.ev.filter(e => e.lineup_id && P.lineupOf.has(e.lineup_id))
  for (const pl of P.field) {
    const on = (e: Event) => P.lineupOf.get(e.lineup_id!)!.has(pl.id)
    const nm = P.name(pl.id)
    for (const side of ['attack', 'defence'] as const) {
      const poss = withLineup.filter(e => e.event_type === 'ATTACK' && (side === 'attack' ? e.team_id === team : e.team_id !== team))
      const goals = withLineup.filter(side === 'attack' ? ourGoal : theirGoal)
      const pOn = poss.filter(on).length, pOff = poss.length - pOn
      const gOn = goals.filter(on).length, gOff = goals.length - gOn
      if (pOn < 40 || pOff < 40) continue
      const { diff, p } = twoProportions(gOn, pOn, gOff, pOff)
      const ti = P.record(p)
      if (Math.abs(diff) < 8) continue
      const better = side === 'attack' ? diff > 0 : diff < 0
      out.push({
        id: `onoff:${side}:${pl.id}`, area: 'lineup', p, ti, effect: Math.abs(diff) / 100,
        title: side === 'attack'
          ? L(`With ${nm} on court we score on ${pct(gOn, pOn)}% of attacks`, `Með ${nm} inni á vellinum skorum við í ${pct(gOn, pOn)}% sókna`)
          : L(`With ${nm} on court we concede on ${pct(gOn, pOn)}% of opponent attacks`, `Með ${nm} inni á vellinum fáum við mark á okkur í ${pct(gOn, pOn)}% sókna andstæðinga`),
        detail: L(
          `${pct(gOff, pOff)}% when ${nm.split(' ').slice(1).join(' ')} is off — the team is ${better ? 'better' : 'worse'} ${side === 'attack' ? 'in attack' : 'in defence'} with them on.`,
          `${pct(gOff, pOff)}% þegar leikmaðurinn er utan vallar — liðið er ${better ? 'betra' : 'verra'} ${side === 'attack' ? 'í sókn' : 'í vörn'} með hann inni á.`,
        ),
        basis: L(`On: ${gOn} goals in ${pOn} possessions · off: ${gOff} in ${pOff}`, `Inni á: ${gOn} mörk í ${pOn} sóknum · utan vallar: ${gOff} í ${pOff}`),
        chart: { kind: 'bars', unit: '%', items: [
          { label: 'On court|Inni á', value: pct(gOn, pOn), note: `${gOn}/${pOn}`, highlight: true },
          { label: 'Off court|Utan vallar', value: pct(gOff, pOff), note: `${gOff}/${pOff}` },
        ] },
      })
    }
  }
  return out
}

// ─── 5. Passer → scorer connections ──────────────────────────────────────────

function connections(P: Prep): Candidate[] {
  const out: Candidate[] = []
  const assisted = P.ourShots.filter(e => isGoal(e) && e.shot_range !== 'penalty' && getCtx(e).assist_player_id)
  const T = assisted.length
  if (T < 25) return out
  const pair = new Map<string, number>(), A = new Map<string, number>(), S = new Map<string, number>()
  for (const e of assisted) {
    const a = getCtx(e).assist_player_id as string, s = e.player_id!
    pair.set(`${a}>${s}`, (pair.get(`${a}>${s}`) ?? 0) + 1)
    A.set(a, (A.get(a) ?? 0) + 1); S.set(s, (S.get(s) ?? 0) + 1)
  }
  const top = [...pair].sort((x, y) => y[1] - x[1]).slice(0, 7)
  for (const [k, c] of pair) {
    const [a, s] = k.split('>')
    const expected = (A.get(a)! * S.get(s)!) / T
    if (c < 3) continue
    const p = poissonTest(c, expected)
    const ti = P.record(p)
    if (c < 5 || c / expected < 1.8) continue
    const items = (top.some(([kk]) => kk === k) ? top : [...top.slice(0, 6), [k, c] as [string, number]])
      .map(([kk, cc]) => { const [x, y] = kk.split('>'); return { label: `${P.name(x)} → ${P.name(y)}`, value: cc, highlight: kk === k } })
    out.push({
      id: `conn:${k}`, area: 'attack', p, ti, effect: Math.min(1, (c / expected - 1) / 3),
      title: L(`${P.name(a)} finds ${P.name(s)} far more than expected`, `${P.name(a)} finnur ${P.name(s)} mun oftar en búast mætti við`),
      detail: L(
        `${c} of ${P.name(a)}'s ${A.get(a)} assists went to ${P.name(s)} — about ${f1(c / expected)}× what their shares of the team's assisted goals would predict.`,
        `${c} af ${A.get(a)} stoðsendingum ${P.name(a)} fóru á ${P.name(s)} — um ${f1(c / expected)}× það sem hlutdeild þeirra í mörkum eftir stoðsendingu segir til um.`,
      ),
      basis: L(`${T} goals with an assist in the selected matches`, `${T} mörk eftir stoðsendingu í völdum leikjum`),
      chart: { kind: 'bars', unit: 'count', items },
    })
  }
  return out
}

// ─── 6. Goalkeepers: zones, ranges, keeper vs keeper ─────────────────────────

function keepers(P: Prep): Candidate[] {
  const out: Candidate[] = []
  const saved = (e: Event) => e.sub_type === 'save'
  for (const k of P.keepers) {
    const mine = P.onTarget.filter(e => e.player_id === k.id)
    if (mine.length < 25) continue
    const nm = P.name(k.id)
    const withZone = mine.filter(e => e.zone && e.zone >= 1 && e.zone <= 9)
    for (let z = 1; z <= 9; z++) {
      const inZ = withZone.filter(e => e.zone === z), rest = withZone.filter(e => e.zone !== z)
      if (inZ.length < 6 || rest.length < 10) continue
      const s = inZ.filter(saved).length, rs = rest.filter(saved).length
      const { diff, p } = twoProportions(s, inZ.length, rs, rest.length)
      const ti = P.record(p)
      if (Math.abs(diff) < 20) continue
      out.push({
        id: `gkz:${k.id}:${z}`, area: 'keeper', p, ti, effect: Math.abs(diff) / 100,
        title: L(`${nm} saves ${pct(s, inZ.length)}% of shots to ${ZONE_NAME[z - 1].en}`, `${nm} ver ${pct(s, inZ.length)}% skota ${ZONE_NAME[z - 1].is}`),
        detail: L(`Against ${pct(rs, rest.length)}% in the other zones of the goal.`, `Á móti ${pct(rs, rest.length)}% í öðrum svæðum marksins.`),
        basis: L(`${s} of ${inZ.length} vs ${rs} of ${rest.length} shots on target`, `${s} af ${inZ.length} á móti ${rs} af ${rest.length} skotum á mark`),
        chart: { kind: 'zones', cells: Array.from({ length: 9 }, (_, i) => {
          const c = withZone.filter(e => e.zone === i + 1)
          return { zone: i + 1, saved: c.filter(saved).length, faced: c.length, highlight: i + 1 === z }
        }) },
      })
    }
    for (const g of RANGE_GROUPS) {
      const inR = mine.filter(e => g.ranges.includes(e.shot_range ?? '')), rest = mine.filter(e => !g.ranges.includes(e.shot_range ?? ''))
      if (inR.length < 8 || rest.length < 10) continue
      const s = inR.filter(saved).length, rs = rest.filter(saved).length
      const { diff, p } = twoProportions(s, inR.length, rs, rest.length)
      const ti = P.record(p)
      if (Math.abs(diff) < 18) continue
      if (g.key === 'pen' && diff < 0) continue   // penalties are expected to be saved less
      out.push({
        id: `gkr:${k.id}:${g.key}`, area: 'keeper', p, ti, effect: Math.abs(diff) / 100,
        title: L(`${nm} saves ${pct(s, inR.length)}% of shots ${g.from.en}`, `${nm} ver ${pct(s, inR.length)}% skota ${g.from.is}`),
        detail: L(`Against ${pct(rs, rest.length)}% of all other shots.`, `Á móti ${pct(rs, rest.length)}% annarra skota.`),
        basis: L(`${s} of ${inR.length} vs ${rs} of ${rest.length} shots on target`, `${s} af ${inR.length} á móti ${rs} af ${rest.length} skotum á mark`),
        chart: { kind: 'bars', unit: '%', items: RANGE_GROUPS.map(gg => {
          const xs = mine.filter(e => gg.ranges.includes(e.shot_range ?? ''))
          return { label: `${gg.label.en}|${gg.label.is}`, value: pct(xs.filter(saved).length, xs.length), note: `${xs.filter(saved).length}/${xs.length}`, highlight: gg.key === g.key, n: xs.length }
        }).filter(x => x.n >= 3), reference: { value: pct(s + rs, mine.length), label: L('Overall', 'Í heild') } },
      })
    }
  }
  // keeper vs keeper
  const ks = P.keepers.map(k => ({ k, xs: P.onTarget.filter(e => e.player_id === k.id) })).filter(x => x.xs.length >= 20)
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = ks[i], b = ks[j]
    const sa = a.xs.filter(saved).length, sb = b.xs.filter(saved).length
    const { diff, p } = twoProportions(sa, a.xs.length, sb, b.xs.length)
    const ti = P.record(p)
    if (Math.abs(diff) < 10) continue
    const [hi, lo] = diff > 0 ? [a, b] : [b, a]
    out.push({
      id: `gkvs:${a.k.id}:${b.k.id}`, area: 'keeper', p, ti, effect: Math.abs(diff) / 100,
      title: L(`${P.name(hi.k.id)} saves clearly more than ${P.name(lo.k.id)}`, `${P.name(hi.k.id)} ver greinilega meira en ${P.name(lo.k.id)}`),
      detail: L(`${pct(hi.xs.filter(saved).length, hi.xs.length)}% against ${pct(lo.xs.filter(saved).length, lo.xs.length)}% of shots on target.`, `${pct(hi.xs.filter(saved).length, hi.xs.length)}% á móti ${pct(lo.xs.filter(saved).length, lo.xs.length)}% skota á mark.`),
      basis: L(`${hi.xs.length} and ${lo.xs.length} shots on target faced`, `${hi.xs.length} og ${lo.xs.length} skot á mark`),
      chart: { kind: 'bars', unit: '%', items: ks.map(x => ({ label: P.name(x.k.id), value: pct(x.xs.filter(saved).length, x.xs.length), note: `${x.xs.filter(saved).length}/${x.xs.length}`, highlight: x === hi })) },
    })
  }
  return out
}

// ─── 7. Where opponents score from ───────────────────────────────────────────

function opponents(P: Prep): Candidate[] {
  const out: Candidate[] = []
  const all = P.oppShots
  if (all.length < 60) return out
  const goal = (e: Event) => e.sub_type === 'goal_conceded'
  const dims: { key: string; cats: { v: string; label: Text; from: Text; test: (e: Event) => boolean }[] }[] = [
    { key: 'range', cats: RANGE_GROUPS.map(g => ({ v: g.key, label: g.label, from: g.from, test: (e: Event) => g.ranges.includes(e.shot_range ?? '') })) },
    { key: 'origin', cats: ORIGINS.map(o => ({ v: o.v, label: o.label, from: o.from, test: (e: Event) => getCtx(e).attack_origin === o.v })) },
    { key: 'phase', cats: PHASES.map(x => ({ v: x.v, label: x.label, from: x.in, test: (e: Event) => e.phase_type === x.v })) },
    { key: 'num', cats: NUMERICAL.map(x => ({ v: x.v, label: x.label, from: x.in, test: (e: Event) => e.numerical_state === x.v })) },
  ]
  for (const d of dims) {
    const inDim = all.filter(e => d.cats.some(c => c.test(e)))
    for (const c of d.cats) {
      const inC = inDim.filter(c.test), rest = inDim.filter(e => !c.test(e))
      if (inC.length < 10 || rest.length < 20) continue
      const g = inC.filter(goal).length, rg = rest.filter(goal).length
      const { diff, p } = twoProportions(g, inC.length, rg, rest.length)
      const ti = P.record(p)
      if (Math.abs(diff) < 15) continue
      if (EXPECTED_HIGH.has(c.v) && diff > 0) continue
      if (EXPECTED_LOW.has(c.v) && diff < 0) continue
      out.push({
        id: `opp:${d.key}:${c.v}`, area: 'defence', p, ti, effect: Math.abs(diff) / 100,
        title: L(`Opponents score on ${pct(g, inC.length)}% of their shots ${c.from.en}`, `Andstæðingar skora úr ${pct(g, inC.length)}% skota ${c.from.is}`),
        detail: L(`Against ${pct(rg, rest.length)}% of their other shots — ${diff > 0 ? 'a weak spot' : 'a strong spot'} in our defence.`, `Á móti ${pct(rg, rest.length)}% annarra skota þeirra — ${diff > 0 ? 'veikur blettur' : 'sterkur blettur'} í vörninni okkar.`),
        basis: L(`${g} of ${inC.length} vs ${rg} of ${rest.length} opponent shots`, `${g} af ${inC.length} á móti ${rg} af ${rest.length} skotum andstæðinga`),
        chart: { kind: 'bars', unit: '%', items: d.cats.map(cc => {
          const xs = inDim.filter(cc.test)
          return { label: `${cc.label.en}|${cc.label.is}`, value: pct(xs.filter(goal).length, xs.length), note: `${xs.filter(goal).length}/${xs.length}`, highlight: cc.v === c.v, n: xs.length }
        }).filter(x => x.n >= 4), reference: { value: pct(g + rg, inDim.length), label: L('All', 'Öll') } },
      })
    }
  }
  return out
}

// ─── 8. Stretches of the match ───────────────────────────────────────────────

function timeWindows(P: Prep): Candidate[] {
  const out: Candidate[] = []
  const team = P.team
  for (const side of ['attack', 'defence'] as const) {
    const poss = P.ev.filter(e => e.event_type === 'ATTACK' && e.match_minute != null && (side === 'attack' ? e.team_id === team : e.team_id !== team))
    const goals = P.ev.filter(e => e.match_minute != null && (side === 'attack'
      ? e.event_type === 'SHOT' && e.team_id === team && isGoal(e)
      : (e.event_type === 'GOALKEEPER_ACTION' && e.team_id === team && e.sub_type === 'goal_conceded') || (e.event_type === 'SHOT' && e.team_id !== team && isGoal(e))))
    const win = (m: number) => Math.min(5, Math.floor(m / 10))
    const pw = WINDOWS.map(w => poss.filter(e => win(e.match_minute!) === w / 10).length)
    const gw = WINDOWS.map(w => goals.filter(e => win(e.match_minute!) === w / 10).length)
    const P0 = pw.reduce((a, b) => a + b, 0), G0 = gw.reduce((a, b) => a + b, 0)
    if (P0 < 120) continue
    WINDOWS.forEach((w, i) => {
      if (pw[i] < 25) return
      const { diff, p } = twoProportions(gw[i], pw[i], G0 - gw[i], P0 - pw[i])
      const ti = P.record(p)
      if (Math.abs(diff) < 10) return
      const label = `${w}–${w + 10}′`
      out.push({
        id: `time:${side}:${w}`, area: 'match', p, ti, effect: Math.abs(diff) / 100,
        title: side === 'attack'
          ? L(`In minutes ${label} we score on ${pct(gw[i], pw[i])}% of attacks`, `Á mínútum ${label} skorum við í ${pct(gw[i], pw[i])}% sókna`)
          : L(`In minutes ${label} we concede on ${pct(gw[i], pw[i])}% of opponent attacks`, `Á mínútum ${label} fáum við mark á okkur í ${pct(gw[i], pw[i])}% sókna andstæðinga`),
        detail: L(`Against ${pct(G0 - gw[i], P0 - pw[i])}% in the rest of the match.`, `Á móti ${pct(G0 - gw[i], P0 - pw[i])}% í restinni af leiknum.`),
        basis: L(`${gw[i]} goals in ${pw[i]} possessions in that stretch`, `${gw[i]} mörk í ${pw[i]} sóknum á þeim kafla`),
        chart: { kind: 'bars', unit: '%', items: WINDOWS.map((ww, j) => ({ label: `${ww}–${ww + 10}′`, value: pct(gw[j], pw[j]), note: `${gw[j]}/${pw[j]}`, highlight: j === i })), reference: { value: pct(G0, P0), label: L('Whole match', 'Allur leikurinn') } },
      })
    })
  }
  return out
}

// ─── 9 & 10. Match by match: outliers and stats that move together ───────────

interface MatchVar { key: string; label: Text; unit?: '%'; group: string; value: (ev: Event[], team: string) => number | null }

const sh = (ev: Event[], team: string) => ev.filter(e => e.event_type === 'SHOT' && e.team_id === team)
const gkOn = (ev: Event[], team: string) => ev.filter(e => e.event_type === 'GOALKEEPER_ACTION' && e.team_id === team && (e.sub_type === 'save' || e.sub_type === 'goal_conceded' || e.sub_type === 'parry'))
const cnt = (ev: Event[], f: (e: Event) => boolean) => ev.filter(f).length

const MATCH_VARS: MatchVar[] = [
  { key: 'goals', label: L('Goals scored', 'Skoruð mörk'), group: 'score', value: (ev, t) => cnt(sh(ev, t), isGoal) },
  { key: 'conceded', label: L('Goals conceded', 'Mörk á okkur'), group: 'against', value: (ev, t) => cnt(gkOn(ev, t), e => e.sub_type === 'goal_conceded') },
  { key: 'shotPct', label: L('Shooting %', 'Skotnýting'), unit: '%', group: 'score', value: (ev, t) => { const s = sh(ev, t); return s.length >= 10 ? pct(cnt(s, isGoal), s.length) : null } },
  { key: 'savePct', label: L('Save %', 'Markvarsla'), unit: '%', group: 'against', value: (ev, t) => { const s = gkOn(ev, t); return s.length >= 10 ? pct(cnt(s, e => e.sub_type === 'save'), s.length) : null } },
  { key: 'turnovers', label: L('Turnovers', 'Tapaðir boltar'), group: 'to', value: (ev, t) => cnt(ev, e => e.event_type === 'TURNOVER' && e.team_id === t) },
  { key: 'fbGoals', label: L('Fast-break goals', 'Mörk úr hraðaupphlaupum'), group: 'score', value: (ev, t) => cnt(sh(ev, t), e => isGoal(e) && e.phase_type === 'fast_break') },
  { key: 'twoMin', label: L('2-minute suspensions', 'Brottvísanir'), group: 'disc', value: (ev, t) => cnt(ev, e => e.event_type === 'SUSPENSION' && e.sub_type === '2min' && e.team_id === t) },
  { key: 'pen', label: L('7 m conceded', 'Víti á okkur'), group: 'disc', value: (ev, t) => cnt(ev, e => e.event_type === 'FOUL' && e.sub_type === '7m_awarded' && e.team_id === t) },
  { key: 'steals', label: L('Steals', 'Stolnir boltar'), group: 'def', value: (ev, t) => cnt(ev, e => e.event_type === 'DEFENSIVE_ACTION' && e.team_id === t && (e.sub_type === 'interception' || e.sub_type === 'opponent_lost_ball')) },
  { key: 'blocks', label: L('Blocks', 'Blokk'), group: 'def2', value: (ev, t) => cnt(ev, e => e.event_type === 'DEFENSIVE_ACTION' && e.team_id === t && e.sub_type === 'block') },
  { key: 'duelPct', label: L('1 v 1 won %', 'Unnin einvígi %'), unit: '%', group: 'duel', value: (ev, t) => { const w = cnt(ev, e => e.event_type === 'DEFENSIVE_ACTION' && e.team_id === t && e.sub_type === 'duel_won'), l = cnt(ev, e => e.event_type === 'DEFENSIVE_ACTION' && e.team_id === t && e.sub_type === 'duel_lost'); return w + l >= 6 ? pct(w, w + l) : null } },
  { key: 'nineMPct', label: L('Shooting % from 9 m+', 'Skotnýting af 9m+'), unit: '%', group: 'score', value: (ev, t) => { const s = sh(ev, t).filter(e => e.shot_range === '9m_plus'); return s.length >= 6 ? pct(cnt(s, isGoal), s.length) : null } },
]
// Pairs inside one group are linked by construction (goals ↔ shooting %), so they are never tested
const OUTCOME = new Set(['goals', 'conceded'])

function matchLabel(m: MatchWithTeams, team: string) {
  const opp = m.home_team_id === team ? m.away_team : m.home_team
  const d = m.match_date ? new Date(m.match_date) : null
  return `${opp?.short_name ?? opp?.name ?? '?'}${d ? ` · ${d.getDate()}/${d.getMonth() + 1}` : ''}`
}

function perMatch(P: Prep) {
  const ms = [...P.matches].sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? ''))
  const byMatch = new Map<string, Event[]>()
  for (const e of P.ev) byMatch.set(e.match_id, [...(byMatch.get(e.match_id) ?? []), e])
  const rows = ms.filter(m => (byMatch.get(m.id)?.length ?? 0) >= 40).map(m => ({ m, label: matchLabel(m, P.team), ev: byMatch.get(m.id)! }))
  return rows.map(r => ({ ...r, v: Object.fromEntries(MATCH_VARS.map(x => [x.key, x.value(r.ev, P.team)])) as Record<string, number | null> }))
}

function matchOutliers(P: Prep): Candidate[] {
  const rows = perMatch(P)
  if (rows.length < 6) return []
  const out: Candidate[] = []
  for (const mv of MATCH_VARS) {
    const valid = rows.filter(r => r.v[mv.key] != null)
    if (valid.length < 6) continue
    const vals = valid.map(r => r.v[mv.key]!)
    valid.forEach((r, i) => {
      const { z, mean } = leaveOneOutZ(vals, i)
      const p = Math.min(1, 2 * (1 - phi(Math.abs(z))))
      const ti = P.record(p)
      if (Math.abs(z) < 2.5) return
      const v = vals[i], u = mv.unit ?? ''
      out.push({
        id: `mo:${mv.key}:${r.m.id}`, area: 'match', p, ti, effect: Math.min(1, (Math.abs(z) - 2) / 3),
        title: L(`${mv.label.en}: ${v}${u} against ${r.label}`, `${mv.label.is}: ${v}${u} gegn ${r.label}`),
        detail: L(`Far ${v > mean ? 'above' : 'below'} the other matches, which average ${f1(mean)}${u}.`, `Langt ${v > mean ? 'yfir' : 'undir'} hinum leikjunum, sem eru að meðaltali ${f1(mean)}${u}.`),
        basis: L(`Compared with ${valid.length - 1} other matches`, `Borið saman við ${valid.length - 1} aðra leiki`),
        chart: { kind: 'bars', unit: mv.unit === '%' ? '%' : 'count', items: valid.map((rr, j) => ({ label: rr.label, value: vals[j], highlight: j === i })), reference: { value: Math.round(mean * 10) / 10, label: L('Other matches', 'Aðrir leikir') } },
      })
    })
  }
  return out
}

function correlations(P: Prep): Candidate[] {
  const rows = perMatch(P)
  if (rows.length < 6) return []
  const out: Candidate[] = []
  for (let i = 0; i < MATCH_VARS.length; i++) for (let j = i + 1; j < MATCH_VARS.length; j++) {
    const a = MATCH_VARS[i], b = MATCH_VARS[j]
    if (a.group === b.group) continue
    if (OUTCOME.has(a.key) && OUTCOME.has(b.key)) continue
    // put the outcome (goals / conceded) on the y axis
    const [x, y] = OUTCOME.has(a.key) ? [b, a] : [a, b]
    const valid = rows.filter(r => r.v[x.key] != null && r.v[y.key] != null)
    if (valid.length < 6) continue
    const xs = valid.map(r => r.v[x.key]!), ys = valid.map(r => r.v[y.key]!)
    const { r, p, slope, intercept } = correlation(xs, ys)
    const ti = P.record(p)
    if (Math.abs(r) < 0.6) continue
    const more = r > 0
    out.push({
      id: `corr:${x.key}:${y.key}`, area: 'match', p, ti, effect: Math.abs(r),
      title: L(`More ${x.label.en.toLowerCase()} goes with ${more ? 'more' : 'fewer'} ${y.label.en.toLowerCase()}`, `Meira af ${x.label.is.toLowerCase()} fylgir ${more ? 'meira' : 'minna'} af ${y.label.is.toLowerCase()}`),
      detail: L(
        `Match by match, the two move together (correlation ${r.toFixed(2)}). A pattern, not proof of cause.`,
        `Leik fyrir leik fylgjast þær að (fylgni ${r.toFixed(2)}). Mynstur, ekki sönnun á orsök.`,
      ),
      basis: L(`${valid.length} matches`, `${valid.length} leikir`),
      chart: { kind: 'scatter', x: x.label, y: y.label, xUnit: x.unit, yUnit: y.unit, points: valid.map((rr, k) => ({ label: rr.label, x: xs[k], y: ys[k] })), slope, intercept },
    })
  }
  return out
}

// ─── Run all, correct, rank ──────────────────────────────────────────────────

export function findInsights(input: InsightInput): InsightResult {
  const P = prepare(input)
  const shots = P.ourShots.length
  if (shots < 60) return { insights: [], tested: 0, enough: false, shots }

  const all: Candidate[] = [
    ...playerVsTeam(P), ...playerSplits(P), ...playerRates(P), ...onOff(P),
    ...connections(P), ...keepers(P), ...opponents(P), ...timeWindows(P),
    ...matchOutliers(P), ...correlations(P),
  ]
  // The correction runs over every comparison made, including ones too small to report
  const qs = benjaminiHochberg(P.tests)
  const tested = P.tests.length

  const kept: Insight[] = []
  all.forEach(c => {
    const q = qs[c.ti]
    const level: Level | null = q <= 0.05 ? 'strong' : q <= 0.2 ? 'likely' : c.p <= 0.01 ? 'hint' : null
    if (!level) return
    const { effect: _e, ti: _t, ...rest } = c
    void _e; void _t
    kept.push({ ...rest, level, q })
  })
  const rank: Record<Level, number> = { strong: 0, likely: 1, hint: 2 }
  const effectOf = new Map(all.map(c => [c.id, c.effect]))
  kept.sort((a, b) => rank[a.level] - rank[b.level] || (effectOf.get(b.id)! - effectOf.get(a.id)!) || a.p - b.p)

  // One goal-zone card per keeper: the strongest zone, with the other unusual zones named in it
  const zoneCards = new Map<string, { card: Insight; extra: Text[] }>()
  const merged = kept.filter(x => {
    if (!x.id.startsWith('gkz:')) return true
    const keeper = x.id.split(':')[1]
    const got = zoneCards.get(keeper)
    if (!got) { zoneCards.set(keeper, { card: x, extra: [] }); return true }
    got.extra.push({ en: x.title.en.replace(/^.*? saves /, '').replace(' of shots to ', ' to '), is: x.title.is.replace(/^.*? ver /, '').replace(' skota ', ' ') })
    return false
  })
  for (const { card, extra } of zoneCards.values()) {
    if (!extra.length) continue
    card.detail = {
      en: `${card.detail.en} Also unusual: ${extra.map(e => e.en).join(', ')}.`,
      is: `${card.detail.is} Líka óvenjulegt: ${extra.map(e => e.is).join(', ')}.`,
    }
  }

  // Keep the list varied: at most 3 findings about the same player (or match) per kind
  const seen = new Map<string, number>()
  const varied = merged.filter(x => {
    const subject = x.id.split(':').slice(0, 1).concat(x.id.split(':').slice(-1)).join(':')
    const n = (seen.get(subject) ?? 0) + 1
    seen.set(subject, n)
    return n <= 3
  })
  // Icelandic writes decimals with a comma
  const isComma = (t: Text): Text => ({ en: t.en, is: t.is.replace(/(\d)\.(\d)/g, '$1,$2') })
  const out = varied.slice(0, 40).map(x => ({ ...x, title: isComma(x.title), detail: isComma(x.detail), basis: isComma(x.basis) }))
  return { insights: out, tested, enough: true, shots }
}
