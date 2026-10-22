import { useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  PieChart, Pie, Cell, ComposedChart, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ZAxis,
} from 'recharts'
import { useLang, useT, type Lang } from '@/lib/i18n/lang'
import { computeAttack, computeDefense, computeGK, sumAttack, sumDefense, sumGK } from '@/lib/stats/matchStats'
import { computeIndices } from '@/lib/stats/indices'
import { evaluateIndices, type IndexDef } from '@/lib/stats/indexDefs'
import { useIndexStore } from '@/store/indexStore'
import type { Event, Player } from '@/lib/db/schema'
import type { MatchWithTeams } from '@/lib/supabase/dashboardQueries'

// ─── Color palette ────────────────────────────────────────────────────────────

const COLORS = [
  '#1f2de6', '#111214', '#d08a1a', '#2f9461', '#c4242a',
  '#0e7490', '#7a8290', '#a15c07', '#1d5fbf', '#3a3f47',
  '#6b8afd', '#9a3412', '#15803d', '#b45309', '#475569',
]

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartTypeId =
  | 'bar' | 'grouped-bar' | 'pareto'
  | 'line' | 'line-categories'
  | 'scatter' | 'scatter-matrix'
  | 'pie' | 'histogram' | 'histogram-side'
  | 'boxplot' | 'boxplot-side'
  | 'qq' | 'heatmap' | 'mosaic'

type DatasetId = 'attack' | 'defense' | 'gk' | 'matches'

interface VarDef { id: string; label: string; short: string }
interface DataRow { label: string; [key: string]: number | string | null }

interface ChartDef {
  id: ChartTypeId; label: string; desc: string
  needsX?: boolean; multiY?: boolean; maxY?: number
}

// ─── Variable definitions ─────────────────────────────────────────────────────

const ATK_VARS: VarDef[] = [
  { id: 'goals',          label: 'Goals',               short: 'Goals' },
  { id: 'shots',          label: 'Shots',               short: 'Shots' },
  { id: 'shot_pct',       label: 'Shot Efficiency %',   short: 'Shot%' },
  { id: 'assists',        label: 'Assists',              short: 'Ast' },
  { id: 'chancesCreated', label: 'Chances Created',     short: 'Ch.Cr' },
  { id: 'turnovers',      label: 'Turnovers',           short: 'TO' },
  { id: 'drewSuspension', label: 'Drew 2-min',          short: '2min' },
  { id: 'drewPenalty',    label: 'Drew Penalty',        short: 'DrPen' },
  { id: 'penGoals',       label: 'Goals – Penalty',     short: 'G Pen' },
  { id: 'penShots',       label: 'Shots – Penalty',     short: 'S Pen' },
  { id: 'pen_pct',        label: 'Penalty %',           short: 'Pen%' },
  { id: 'cornGoals',      label: 'Goals – Corner',      short: 'G Cor' },
  { id: 'cornLeftGoals',  label: 'Goals – Left Corner', short: 'G LCor' },
  { id: 'cornRightGoals', label: 'Goals – Right Corner', short: 'G RCor' },
  { id: 'nineMGoals',     label: 'Goals – 9m+',         short: 'G 9m+' },
  { id: 'nineMShots',     label: 'Shots – 9m+',         short: 'S 9m+' },
  { id: 's78Goals',       label: 'Goals – 7-8m',        short: 'G 78m' },
  { id: 's78Shots',       label: 'Shots – 7-8m',        short: 'S 78m' },
  { id: 's6mGoals',       label: 'Goals – 6m',          short: 'G 6m' },
  { id: 'lineGoals',      label: 'Goals – Line',        short: 'G Line' },
  { id: 'fbGoals',        label: 'Goals – Fast Break',  short: 'G FB' },
  { id: 'swGoals',        label: 'Goals – 2nd Wave',    short: 'G 2W' },
  { id: 'spGoals',        label: 'Goals – Set Play',    short: 'G SP' },
  { id: 'infGoals',       label: 'Goals – Inferiority', short: 'G Inf' },
  { id: 'supGoals',       label: 'Goals – Superiority', short: 'G Sup' },
  { id: 's76Goals',       label: 'Goals – 7v6',         short: 'G 7v6' },
  { id: 's66Goals',       label: 'Goals – 6v6',         short: 'G 6v6' },
]

const DEF_VARS: VarDef[] = [
  { id: 'duels',            label: 'Duels',               short: 'Duels' },
  { id: 'duelsWon',         label: 'Duels Won',           short: 'D Won' },
  { id: 'duel_pct',         label: 'Duel Win %',          short: 'D%' },
  { id: 'blocks',           label: 'Blocks',              short: 'Blks' },
  { id: 'interceptions',    label: 'Steals',              short: 'Steal' },
  { id: 'rebounds',         label: 'Rebounds',            short: 'Reb' },
  { id: 'highContact',      label: 'High Contact',        short: 'HiCon' },
  { id: 'freekick',         label: 'Freekick Given',      short: 'FK' },
  { id: 'penaltyAwarded',   label: 'Penalty Given',       short: 'Pen' },
  { id: 'yellowCards',      label: 'Yellow Cards',        short: 'Yel' },
  { id: 'suspensions2min',  label: '2-min Suspensions',   short: '2min' },
  { id: 'redCards',         label: 'Red Cards',           short: 'Red' },
  { id: 'drewOffensiveFoul', label: 'Drew Offensive Foul', short: 'DrOF' },
]

const GK_VARS: VarDef[] = [
  { id: 'saves',      label: 'Saves',              short: 'Saves' },
  { id: 'shotsFaced', label: 'Shots Faced',        short: 'Faced' },
  { id: 'save_pct',   label: 'Save %',             short: 'Save%' },
  { id: 'savedPen',   label: 'Saved – Penalty',    short: 'S Pen' },
  { id: 'facedPen',   label: 'Faced – Penalty',    short: 'F Pen' },
  { id: 'savedCorn',  label: 'Saved – Corner',     short: 'S Cor' },
  { id: 'savedCornLeft',  label: 'Saved – Left Corner',  short: 'S LCor' },
  { id: 'savedCornRight', label: 'Saved – Right Corner', short: 'S RCor' },
  { id: 'savedNineM', label: 'Saved – 9m+',        short: 'S 9m+' },
  { id: 'savedS78',   label: 'Saved – 7-8m',       short: 'S 78m' },
  { id: 'savedS6m',   label: 'Saved – 6m',         short: 'S 6m' },
  { id: 'savedLine',  label: 'Saved – Line',       short: 'S Lin' },
  { id: 'savedFb',    label: 'Saved – Fast Break', short: 'S FB' },
  { id: 'savedSw',    label: 'Saved – 2nd Wave',   short: 'S 2W' },
  { id: 'emptyPhase', label: 'Empty Phase',        short: 'EmpPh' },
]

const MATCH_VARS: VarDef[] = [
  { id: 'goalsScored',   label: 'Goals Scored',      short: 'Goals' },
  { id: 'goalsConceded', label: 'Goals Conceded',    short: 'Conc' },
  { id: 'goalsDiff',     label: 'Goal Difference',   short: 'Diff' },
  { id: 'shotsMade',     label: 'Shots',             short: 'Shots' },
  { id: 'shotEff',       label: 'Shot Efficiency %', short: 'Shot%' },
  // + one variable per visible index (the user's definitions), added in GrofTab
]

/** Chart variable id for an index (prefixed so an index key can't clash with another variable). */
const ixVar = (key: string) => `ix_${key}`

const DATASET_VARS: Record<DatasetId, VarDef[]> = {
  attack: ATK_VARS, defense: DEF_VARS, gk: GK_VARS, matches: MATCH_VARS,
}

const DATASET_LABELS: Record<DatasetId, string> = {
  attack: 'Attack', defense: 'Defense', gk: 'Goalkeeping', matches: 'Match Overview',
}

const IS_LABELS: Record<string, string> = {
 "2-min Suspensions": "Brottvísanir (2 mín)",
 "All pairings of selected variables": "Allar pörun valdra breyta",
 "Assists": "Stoðsendingar",
 "Bar Chart": "Súlurit",
 "Blocks": "Blokk",
 "Box Plot": "Kassarit",
 "Box plots for multiple variables": "Kassarit fyrir margar breytur",
 "Chances Created": "Sköpuð færi",
 "Check normality of a variable": "Athuga normaldreifingu breytu",
 "Distribution of one variable": "Dreifing einnar breytu",
 "Distribution of two variables": "Dreifing tveggja breyta",
 "Drew 2-min": "Fengnar 2 mín",
 "Drew Offensive Foul": "Fiskað sóknarbrot",
 "Drew Penalty": "Fiskað víti",
 "Duel Win %": "1á1 sigrar %",
 "Duels Won": "1á1 unnin",
 "Duels": "1á1",
 "Each match as share of total": "Hver leikur sem hlutfall af heild",
 "Empty Phase": "Tómur fasi",
 "Faced – Penalty": "Skot á – víti",
 "Freekick Given": "Fríköst gefin",
 "Goal Difference": "Markamunur",
 "Goals Conceded": "Fengin mörk",
 "Goals Scored": "Skoruð mörk",
 "Goals – 2nd Wave": "Mörk – seinni bylgja",
 "Goals – 6m": "Mörk – 6m",
 "Goals – 6v6": "Mörk – 6á6",
 "Goals – 7-8m": "Mörk – 7-8m",
 "Goals – 7v6": "Mörk – 7á6",
 "Goals – 9m+": "Mörk – 9m+",
 "Goals – Corner": "Mörk – horn",
 "Goals – Fast Break": "Mörk – hraðaupphlaup",
 "Goals – Inferiority": "Mörk – undirtala",
 "Goals – Left Corner": "Mörk – vinstra horn",
 "Goals – Line": "Mörk – lína",
 "Goals – Penalty": "Mörk – víti",
 "Goals – Right Corner": "Mörk – hægra horn",
 "Goals – Set Play": "Mörk – uppstilltur leikur",
 "Goals – Superiority": "Mörk – yfirtala",
 "Goals": "Mörk",
 "Grouped Bar": "Flokkað súlurit",
 "Heatmap": "Hitakort",
 "High Contact": "Hár kontakt",
 "Histogram": "Stuðlarit",
 "Line Chart": "Línurit",
 "Matches × multiple variables": "Leikir × margar breytur",
 "Median and spread of one variable": "Miðgildi og dreifing einnar breytu",
 "Mosaic Plot": "Mósaíkrit",
 "Multi-Line": "Margar línur",
 "Multiple series on one chart": "Margar raðir á einu riti",
 "Multiple values side by side": "Mörg gildi hlið við hlið",
 "Normal Q-Q": "Normal Q-Q",
 "One value compared across matches": "Eitt gildi borið saman milli leikja",
 "Pareto Chart": "Pareto-rit",
 "Penalty %": "Víti %",
 "Penalty Given": "Víti gefin",
 "Pie Chart": "Kökurit",
 "Proportion of two variables per match": "Hlutfall tveggja breyta í hverjum leik",
 "Rebounds": "Fráköst",
 "Red Cards": "Rauð spjöld",
 "Relationship between two variables": "Samband tveggja breyta",
 "Save %": "Markvarsla %",
 "Saved – 2nd Wave": "Varið – seinni bylgja",
 "Saved – 6m": "Varið – 6m",
 "Saved – 7-8m": "Varið – 7-8m",
 "Saved – 9m+": "Varið – 9m+",
 "Saved – Corner": "Varið – horn",
 "Saved – Fast Break": "Varið – hraðaupphlaup",
 "Saved – Left Corner": "Varið – vinstra horn",
 "Saved – Line": "Varið – lína",
 "Saved – Penalty": "Varið – víti",
 "Saved – Right Corner": "Varið – hægra horn",
 "Saves": "Varin skot",
 "Scatter Matrix": "Dreififylki",
 "Scatter Plot": "Dreifirit",
 "Shot Efficiency %": "Skotnýting %",
 "Shots Faced": "Skot á mark",
 "Shots – 7-8m": "Skot – 7-8m",
 "Shots – 9m+": "Skot – 9m+",
 "Shots – Penalty": "Skot – víti",
 "Shots": "Skot",
 "Side Box Plots": "Kassarit hlið við hlið",
 "Side Histogram": "Stuðlarit hlið við hlið",
 "Sorted descending + cumulative %": "Raðað niður + uppsafnað %",
 "Steals": "Stolnir boltar",
 "Trend over matches": "Þróun yfir leiki",
 "Turnovers": "Tapaðir boltar",
 "Yellow Cards": "Gul spjöld",
 "Attack": "Sókn",
 "Defense": "Vörn",
 "Goalkeeping": "Markvarsla",
 "Match Overview": "Yfirlit leikja",
 "Cumulative %": "Uppsafnað %",
 "Frequency": "Tíðni",
 "Theoretical Normal Quantiles": "Fræðileg normaldreifingarhlutföll",
 "Data": "Gögn",
 "No data to display": "Engin gögn til að sýna"
}

/** Label in the current language (stored variable keys never change). */
function tr(label: string, lang: Lang) {
  return lang === 'is' ? (IS_LABELS[label] ?? label) : label
}

// ─── Chart type registry ──────────────────────────────────────────────────────

const CHART_TYPES: ChartDef[] = [
  { id: 'bar',             label: 'Bar Chart',              desc: 'One value compared across matches' },
  { id: 'grouped-bar',     label: 'Grouped Bar',            desc: 'Multiple values side by side', multiY: true },
  { id: 'pareto',          label: 'Pareto Chart',           desc: 'Sorted descending + cumulative %' },
  { id: 'line',            label: 'Line Chart',             desc: 'Trend over matches' },
  { id: 'line-categories', label: 'Multi-Line',             desc: 'Multiple series on one chart', multiY: true },
  { id: 'scatter',         label: 'Scatter Plot',           desc: 'Relationship between two variables', needsX: true },
  { id: 'scatter-matrix',  label: 'Scatter Matrix',         desc: 'All pairings of selected variables', multiY: true, maxY: 4 },
  { id: 'pie',             label: 'Pie Chart',              desc: 'Each match as share of total' },
  { id: 'histogram',       label: 'Histogram',              desc: 'Distribution of one variable' },
  { id: 'histogram-side',  label: 'Side Histogram',         desc: 'Distribution of two variables', multiY: true, maxY: 2 },
  { id: 'boxplot',         label: 'Box Plot',               desc: 'Median and spread of one variable' },
  { id: 'boxplot-side',    label: 'Side Box Plots',         desc: 'Box plots for multiple variables', multiY: true, maxY: 6 },
  { id: 'qq',              label: 'Normal Q-Q',             desc: 'Check normality of a variable' },
  { id: 'heatmap',         label: 'Heatmap',                desc: 'Matches × multiple variables', multiY: true },
  { id: 'mosaic',          label: 'Mosaic Plot',            desc: 'Proportion of two variables per match', multiY: true },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchLabel(m: MatchWithTeams, trackedTeamId: string, idx: number): string {
  const isHome = m.home_team_id === trackedTeamId
  const opp = (isHome ? m.away_team : m.home_team)?.name ?? `M${idx + 1}`
  const date = m.match_date
    ? new Date(m.match_date).toLocaleDateString(useLang.getState().lang === 'is' ? 'is-IS' : 'en-GB', { day: '2-digit', month: 'short' })
    : `M${idx + 1}`
  return `${opp} ${date}`
}

// ─── Data builder — always one row per match ──────────────────────────────────

function buildDataset(
  id: DatasetId,
  events: Event[],
  fieldPlayers: Player[],
  goalkeepers: Player[],
  matches: MatchWithTeams[],
  trackedTeamId: string,
  playerId: string | null,
  indexDefs: IndexDef[],
): DataRow[] {
  if (id === 'attack') {
    return matches.map((m, i) => {
      const ev = events.filter(e => e.match_id === m.id)
      const label = matchLabel(m, trackedTeamId, i)
      const rows = computeAttack(ev, fieldPlayers, trackedTeamId)
      const r = playerId
        ? (rows.find(row => row.player.id === playerId) ?? sumAttack([]))
        : sumAttack(rows)
      return {
        label,
        goals: r.goals, shots: r.shots,
        shot_pct: r.shots > 0 ? +(r.goals / r.shots * 100).toFixed(1) : 0,
        assists: r.assists, chancesCreated: r.chancesCreated,
        turnovers: r.turnovers, drewSuspension: r.drewSuspension,
        drewPenalty: r.drewPenalty,
        penGoals: r.penGoals, penShots: r.penShots,
        pen_pct: r.penShots > 0 ? +(r.penGoals / r.penShots * 100).toFixed(1) : 0,
        cornGoals: r.cornGoals,
        cornLeftGoals: r.cornLeftGoals, cornRightGoals: r.cornRightGoals,
        nineMGoals: r.nineMGoals, nineMShots: r.nineMShots,
        s78Goals: r.s78Goals, s78Shots: r.s78Shots,
        s6mGoals: r.s6mGoals, lineGoals: r.lineGoals,
        fbGoals: r.fbGoals, swGoals: r.swGoals, spGoals: r.spGoals,
        infGoals: r.infGoals, supGoals: r.supGoals,
        s76Goals: r.s76Goals, s66Goals: r.s66Goals,
      }
    })
  }

  if (id === 'defense') {
    return matches.map((m, i) => {
      const ev = events.filter(e => e.match_id === m.id)
      const label = matchLabel(m, trackedTeamId, i)
      const rows = computeDefense(ev, fieldPlayers, trackedTeamId)
      const r = playerId
        ? (rows.find(row => row.player.id === playerId) ?? sumDefense([]))
        : sumDefense(rows)
      return {
        label,
        duels: r.duels, duelsWon: r.duelsWon,
        duel_pct: r.duels > 0 ? +(r.duelsWon / r.duels * 100).toFixed(1) : 0,
        blocks: r.blocks, interceptions: r.interceptions, rebounds: r.rebounds,
        highContact: r.highContact, freekick: r.freekick,
        penaltyAwarded: r.penaltyAwarded, yellowCards: r.yellowCards,
        suspensions2min: r.suspensions2min, redCards: r.redCards,
        protest: r.protest, drewOffensiveFoul: r.drewOffensiveFoul,
      }
    })
  }

  if (id === 'gk') {
    return matches.map((m, i) => {
      const ev = events.filter(e => e.match_id === m.id)
      const label = matchLabel(m, trackedTeamId, i)
      const gks = playerId ? goalkeepers.filter(g => g.id === playerId) : goalkeepers
      const rows = computeGK(ev, gks, trackedTeamId)
      const r = sumGK(rows)
      return {
        label,
        saves: r.saves, shotsFaced: r.shotsFaced,
        save_pct: r.shotsFaced > 0 ? +(r.saves / r.shotsFaced * 100).toFixed(1) : 0,
        savedPen: r.savedPen, facedPen: r.facedPen,
        savedCorn: r.savedCorn,
        savedCornLeft: r.savedCornLeft, savedCornRight: r.savedCornRight,
        savedNineM: r.savedNineM,
        savedS78: r.savedS78, savedS6m: r.savedS6m,
        savedLine: r.savedLine, savedFb: r.savedFb, savedSw: r.savedSw,
        emptyPhase: r.emptyPhase,
      }
    })
  }

  // matches — no player filter
  return matches.map((m, i) => {
    const ev = events.filter(e => e.match_id === m.id)
    const isHome = m.home_team_id === trackedTeamId
    const scored = (isHome ? m.home_score : m.away_score) ?? 0
    const conceded = (isHome ? m.away_score : m.home_score) ?? 0
    const myShots = ev.filter(e => e.event_type === 'SHOT' && e.team_id === trackedTeamId)
    const { values } = evaluateIndices(indexDefs, computeIndices(ev, trackedTeamId).raw)
    const row: DataRow = {
      label: matchLabel(m, trackedTeamId, i),
      goalsScored: scored, goalsConceded: conceded, goalsDiff: scored - conceded,
      shotsMade: myShots.length,
      shotEff: myShots.length > 0 ? +(scored / myShots.length * 100).toFixed(1) : 0,
    }
    for (const d of indexDefs) if (!d.hidden) row[ixVar(d.key)] = +(values[d.key] ?? 0).toFixed(1)
    return row
  })
}

// ─── Statistical helpers ──────────────────────────────────────────────────────

function numVals(data: DataRow[], varId: string): number[] {
  return data.map(r => Number(r[varId] ?? 0)).filter(n => isFinite(n))
}

function autoBin(values: number[], nBins = 8) {
  if (!values.length) return []
  const lo = Math.min(...values), hi = Math.max(...values)
  const size = (hi - lo) || 1
  const bSize = size / nBins
  return Array.from({ length: nBins }, (_, i) => {
    const from = lo + i * bSize, to = from + bSize
    return {
      bin: `${from.toFixed(1)}–${to.toFixed(1)}`,
      count: values.filter(v => i === nBins - 1 ? v >= from && v <= to : v >= from && v < to).length,
    }
  })
}

function boxStats(values: number[]) {
  if (values.length < 2) return null
  const s = [...values].sort((a, b) => a - b)
  const n = s.length
  const q = (p: number) => {
    const pos = p * (n - 1)
    const lo = Math.floor(pos), hi = Math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)
  }
  return { min: s[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: s[n - 1] }
}

function qqPoints(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  const n = s.length
  const mean = s.reduce((a, v) => a + v, 0) / n
  const std = Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / n) || 1
  return s.map((v, i) => {
    const p = (i + 0.5) / n
    const pp = p < 0.5 ? p : 1 - p
    const t = Math.sqrt(-2 * Math.log(pp))
    const c = [2.515517, 0.802853, 0.010328]
    const d = [1.432788, 0.189269, 0.001308]
    const z = t - (c[0] + c[1] * t + c[2] * t * t) / (1 + d[0] * t + d[1] * t * t + d[2] * t * t * t)
    const theoretical = +(p < 0.5 ? -z : z).toFixed(3)
    return { theoretical, sample: +((v - mean) / std).toFixed(3) }
  })
}

// ─── Chart renderers ──────────────────────────────────────────────────────────

const SELECT_CLS = 'h-9 text-[14px] border border-[#cdd2d9] rounded-md px-2 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-accent'

const MARGIN = { top: 20, right: 30, left: 10, bottom: 70 }
const CHART_H = 420

function EmptyState() {
  const lang = useLang(st => st.lang)
  return (
    <div className="flex items-center justify-center h-48 text-muted text-[14px]">
      {tr('No data to display', lang)}
    </div>
  )
}

function BarRenderer({ data, yVar, yLabel }: { data: DataRow[]; yVar: string; yLabel: string }) {
  if (!data.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <BarChart data={data} margin={MARGIN}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey={yVar} name={yLabel} fill={COLORS[0]} radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function GroupedBarRenderer({ data, yVars, yLabels }: { data: DataRow[]; yVars: string[]; yLabels: string[] }) {
  if (!data.length || !yVars.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <BarChart data={data} margin={MARGIN}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend verticalAlign="top" />
        {yVars.map((v, i) => (
          <Bar key={v} dataKey={v} name={yLabels[i]} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function ParetoRenderer({ data, yVar, yLabel }: { data: DataRow[]; yVar: string; yLabel: string }) {
  if (!data.length) return <EmptyState />
  const sorted = [...data].sort((a, b) => (Number(b[yVar]) || 0) - (Number(a[yVar]) || 0))
  const total = sorted.reduce((s, r) => s + (Number(r[yVar]) || 0), 0)
  const cumValues: number[] = []
  let cum = 0
  for (const r of sorted) {
    cum += Number(r[yVar]) || 0
    cumValues.push(total > 0 ? +((cum / total) * 100).toFixed(1) : 0)
  }
  const withCum = sorted.map((r, i) => ({ ...r, _cum: cumValues[i] }))
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <ComposedChart data={withCum} margin={MARGIN}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
        <Tooltip />
        <Bar yAxisId="left" dataKey={yVar} name={yLabel} fill={COLORS[0]} radius={[4, 4, 0, 0]}>
          {withCum.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
        <Line yAxisId="right" dataKey="_cum" name={tr('Cumulative %', useLang.getState().lang)} type="monotone"
          stroke="#dc2626" dot={false} strokeWidth={2.5} />
        <ReferenceLine yAxisId="right" y={80} stroke="#d97706" strokeDasharray="5 5"
          label={{ value: '80%', position: 'right', fontSize: 10, fill: '#d97706' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function LineRenderer({ data, yVar, yLabel }: { data: DataRow[]; yVar: string; yLabel: string }) {
  if (!data.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Line dataKey={yVar} name={yLabel} stroke={COLORS[0]} strokeWidth={2.5}
          dot={{ r: 5, fill: COLORS[0] }} activeDot={{ r: 7 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function LineCategoriesRenderer({ data, yVars, yLabels }: { data: DataRow[]; yVars: string[]; yLabels: string[] }) {
  if (!data.length || !yVars.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend verticalAlign="top" />
        {yVars.map((v, i) => (
          <Line key={v} dataKey={v} name={yLabels[i]} stroke={COLORS[i % COLORS.length]}
            strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function ScatterRenderer({ data, xVar, yVar, xLabel, yLabel }: {
  data: DataRow[]; xVar: string; yVar: string; xLabel: string; yLabel: string
}) {
  if (!data.length) return <EmptyState />
  const pts = data.map(r => ({ x: Number(r[xVar]) || 0, y: Number(r[yVar]) || 0, name: r.label }))
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x" name={xLabel} type="number" tick={{ fontSize: 11 }}
          label={{ value: xLabel, position: 'insideBottom', offset: -15, fontSize: 12 }} />
        <YAxis dataKey="y" name={yLabel} tick={{ fontSize: 11 }}
          label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 12 }} />
        <ZAxis range={[60, 60]} />
        <Tooltip content={({ payload }) => {
          if (!payload?.length) return null
          const d = payload[0].payload as { name: string; x: number; y: number }
          return (
            <div className="bg-white border border-line rounded-md p-2 text-[13px] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <p className="font-semibold">{d.name}</p>
              <p>{xLabel}: {d.x}</p>
              <p>{yLabel}: {d.y}</p>
            </div>
          )
        }} />
        <Scatter data={pts} fill={COLORS[0]} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function PieRenderer({ data, yVar, yLabel }: { data: DataRow[]; yVar: string; yLabel: string }) {
  const pieData = data.map(r => ({ name: r.label, value: Number(r[yVar]) || 0 })).filter(r => r.value > 0)
  if (!pieData.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <PieChart>
        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="48%"
          outerRadius={150} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
          {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => [`${v ?? ''}`, yLabel]} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function HistogramRenderer({ data, yVar, yLabel }: { data: DataRow[]; yVar: string; yLabel: string }) {
  const bins = autoBin(numVals(data, yVar))
  if (!bins.length) return <EmptyState />
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <BarChart data={bins} margin={MARGIN} barCategoryGap={1}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="bin" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
        <YAxis tick={{ fontSize: 11 }} label={{ value: tr('Frequency', useLang.getState().lang), angle: -90, position: 'insideLeft', fontSize: 11 }} />
        <Tooltip formatter={(v) => [`${v ?? ''}`, 'Frequency']} labelFormatter={l => `${yLabel}: ${l}`} />
        <Bar dataKey="count" name={tr('Frequency', useLang.getState().lang)} fill={COLORS[0]} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function HistogramSideRenderer({ data, yVars, yLabels }: { data: DataRow[]; yVars: string[]; yLabels: string[] }) {
  const v1 = numVals(data, yVars[0] ?? '')
  const v2 = numVals(data, yVars[1] ?? '')
  if (!v1.length && !v2.length) return <EmptyState />
  const all = [...v1, ...v2]
  const lo = Math.min(...all), hi = Math.max(...all)
  const nBins = 8, bSize = (hi - lo || 1) / nBins
  const bins = Array.from({ length: nBins }, (_, i) => {
    const from = lo + i * bSize, to = from + bSize
    const inBin = (v: number) => i === nBins - 1 ? v >= from && v <= to : v >= from && v < to
    return {
      bin: `${from.toFixed(1)}–${to.toFixed(1)}`,
      [yVars[0] ?? 'a']: v1.filter(inBin).length,
      [yVars[1] ?? 'b']: v2.filter(inBin).length,
    }
  })
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <BarChart data={bins} margin={MARGIN} barCategoryGap={4}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="bin" angle={-30} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend verticalAlign="top" />
        {yVars.slice(0, 2).map((v, i) => (
          <Bar key={v} dataKey={v} name={yLabels[i] ?? v} fill={COLORS[i]} opacity={0.85} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Custom SVG charts ────────────────────────────────────────────────────────

function BoxPlotRenderer({ data, yVars, yLabels }: { data: DataRow[]; yVars: string[]; yLabels: string[] }) {
  if (!data.length || !yVars.length) return <EmptyState />
  const stats = yVars.map(v => ({ v, stats: boxStats(numVals(data, v)) })).filter(s => s.stats !== null)
  if (!stats.length) return <EmptyState />

  const allNums = stats.flatMap(s => s.stats ? [s.stats.min, s.stats.max] : [])
  const gMin = Math.min(...allNums), gMax = Math.max(...allNums)
  const range = gMax - gMin || 1
  const pad = { t: 30, r: 20, b: 40, l: 50 }
  const W = Math.max(300, stats.length * 90 + pad.l + pad.r)
  const H = 360
  const pH = H - pad.t - pad.b
  const spacing = (W - pad.l - pad.r) / (stats.length + 1)
  const bw = Math.min(30, spacing * 0.5)
  const toY = (v: number) => pad.t + pH - ((v - gMin) / range) * pH
  const ticks = Array.from({ length: 6 }, (_, i) => gMin + (range / 5) * i)

  return (
    <div className="overflow-x-auto flex justify-center">
      <svg width={W} height={H} className="font-sans">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={toY(t)} y2={toY(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={pad.l - 5} y={toY(t) + 4} textAnchor="end" fontSize={10} fill="#6b7280">{t.toFixed(1)}</text>
          </g>
        ))}
        <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="#d1d5db" />
        {stats.map(({ v, stats: s }, i) => {
          if (!s) return null
          const cx = pad.l + spacing * (i + 1)
          const q1y = toY(s.q1), q3y = toY(s.q3)
          const medy = toY(s.median)
          const miny = toY(s.min), maxy = toY(s.max)
          const col = COLORS[i % COLORS.length]
          return (
            <g key={v}>
              <line x1={cx} y1={q3y} x2={cx} y2={maxy} stroke={col} strokeWidth={1.5} />
              <line x1={cx} y1={q1y} x2={cx} y2={miny} stroke={col} strokeWidth={1.5} />
              <line x1={cx - bw * 0.5} y1={maxy} x2={cx + bw * 0.5} y2={maxy} stroke={col} strokeWidth={2} />
              <line x1={cx - bw * 0.5} y1={miny} x2={cx + bw * 0.5} y2={miny} stroke={col} strokeWidth={2} />
              <rect x={cx - bw} y={q3y} width={bw * 2} height={Math.max(1, q1y - q3y)}
                fill={col} fillOpacity={0.55} stroke={col} strokeWidth={1.5} rx={2} />
              <line x1={cx - bw} y1={medy} x2={cx + bw} y2={medy} stroke="white" strokeWidth={2.5} />
              <line x1={cx - bw} y1={medy} x2={cx + bw} y2={medy} stroke={col} strokeWidth={1} />
              <text x={cx} y={H - pad.b + 16} textAnchor="middle" fontSize={10} fill="#374151">
                {(yLabels[i] ?? v).slice(0, 14)}
              </text>
              <text x={cx + bw + 3} y={medy + 4} fontSize={9} fill={col}>{s.median.toFixed(1)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function QQRenderer({ data, yVar, yLabel }: { data: DataRow[]; yVar: string; yLabel: string }) {
  const pts = qqPoints(numVals(data, yVar))
  if (pts.length < 2) return <EmptyState />
  const xMin = pts[0].theoretical, xMax = pts[pts.length - 1].theoretical
  const diagonal = [{ x: xMin, y: xMin }, { x: xMax, y: xMax }]
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x" type="number" name="Theoretical" tick={{ fontSize: 11 }}
          label={{ value: tr('Theoretical Normal Quantiles', useLang.getState().lang), position: 'insideBottom', offset: -15, fontSize: 11 }} />
        <YAxis dataKey="y" type="number" name={yLabel} tick={{ fontSize: 11 }}
          label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 11 }} />
        <ZAxis range={[40, 40]} />
        <Tooltip content={({ payload }) => {
          if (!payload?.length) return null
          const d = payload[0].payload as { x: number; y: number }
          return (
            <div className="bg-white border border-line rounded-md p-2 text-[13px] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <p>Theoretical: {d.x}</p>
              <p>Sample: {d.y}</p>
            </div>
          )
        }} />
        <Scatter name={tr('Data', useLang.getState().lang)} data={pts.map(p => ({ x: p.theoretical, y: p.sample }))} fill={COLORS[0]} />
        <Scatter name="45°" data={diagonal} fill="transparent" line={{ stroke: '#c4242a', strokeDasharray: '6 3', strokeWidth: 2 }} legendType="none" />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function HeatmapRenderer({ data, yVars, yLabels }: { data: DataRow[]; yVars: string[]; yLabels: string[] }) {
  if (!data.length || !yVars.length) return <EmptyState />
  const colMax = yVars.map(v => Math.max(1, ...numVals(data, v)))
  const cw = Math.max(60, Math.min(100, 560 / yVars.length))
  const rowH = 28, hdrH = 70, lblW = 130
  const totalW = lblW + cw * yVars.length + 10
  const totalH = hdrH + rowH * data.length + 10

  function heatColor(norm: number) {
    if (norm < 0.5) {
      const t = norm * 2
      return `rgb(${Math.round(200 + 55 * t)},${Math.round(220 + 35 * t)},${Math.round(255 * (1 - t * 0.2))})`
    }
    const t = (norm - 0.5) * 2
    return `rgb(${Math.round(60 + 195 * t)},${Math.round(200 - 170 * t)},${Math.round(255 - 220 * t)})`
  }

  return (
    <div className="overflow-x-auto">
      <svg width={totalW} height={totalH} className="font-sans">
        {yLabels.map((lbl, j) => (
          <text key={j}
            x={lblW + cw * j + cw / 2} y={hdrH - 4}
            textAnchor="start" fontSize={10} fill="#374151"
            transform={`rotate(-40,${lblW + cw * j + cw / 2},${hdrH - 4})`}>
            {lbl}
          </text>
        ))}
        {data.map((row, i) => (
          <g key={i}>
            <text x={lblW - 5} y={hdrH + rowH * i + rowH / 2 + 4}
              textAnchor="end" fontSize={10} fill="#374151">{row.label}</text>
            {yVars.map((v, j) => {
              const val = Number(row[v]) || 0
              const norm = val / colMax[j]
              const bg = heatColor(norm)
              const fg = norm > 0.65 ? 'white' : '#1f2937'
              return (
                <g key={j}>
                  <rect x={lblW + cw * j} y={hdrH + rowH * i}
                    width={cw - 2} height={rowH - 2} fill={bg} rx={3} />
                  <text x={lblW + cw * j + cw / 2} y={hdrH + rowH * i + rowH / 2 + 4}
                    textAnchor="middle" fontSize={10} fill={fg}>{val}</text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
    </div>
  )
}

function MosaicRenderer({ data, yVars, yLabels }: { data: DataRow[]; yVars: string[]; yLabels: string[] }) {
  if (!data.length || yVars.length < 2) return <EmptyState />
  const rows = data.map(r => {
    const vals = yVars.map(v => Math.max(0, Number(r[v]) || 0))
    const total = vals.reduce((s, v) => s + v, 0)
    return { label: r.label, vals, total, props: total > 0 ? vals.map(v => v / total) : vals.map(() => 0) }
  }).filter(r => r.total > 0).sort((a, b) => b.total - a.total)
  if (!rows.length) return <EmptyState />

  const lm = 60, rm = 20, tm = 20, bm = 60
  const W = 640, H = 300
  const pW = W - lm - rm, pH = H - tm - bm
  const totalSum = rows.reduce((s, r) => s + r.total, 0)
  // Left edge of each column — running sum of the widths before it
  const xStarts: number[] = []
  let xRun = lm
  for (const r of rows) {
    xStarts.push(xRun)
    xRun += (r.total / totalSum) * pW
  }

  return (
    <div className="overflow-x-auto flex flex-col items-center gap-3">
      <svg width={W} height={H + bm} className="font-sans">
        {rows.map((row, i) => {
          const colW = (row.total / totalSum) * pW
          const xOff = xStarts[i]
          let yOff = tm
          const cells = row.props.map((p, j) => {
            const cellH = p * pH
            const txt = p > 0.08 ? `${(p * 100).toFixed(0)}%` : ''
            const el = (
              <g key={j}>
                <rect x={xOff} y={yOff} width={Math.max(1, colW - 2)} height={Math.max(1, cellH)}
                  fill={COLORS[j % COLORS.length]} opacity={0.8} />
                {txt && (
                  <text x={xOff + colW / 2} y={yOff + cellH / 2 + 4}
                    textAnchor="middle" fontSize={9} fill="white">{txt}</text>
                )}
              </g>
            )
            yOff += cellH
            return el
          })
          const lbl = (
            <text x={xOff + colW / 2} y={H + bm - 5}
              textAnchor="start" fontSize={9} fill="#374151"
              transform={`rotate(-30,${xOff + colW / 2},${H + bm - 5})`}>
              {row.label}
            </text>
          )
          return <g key={i}>{cells}{lbl}</g>
        })}
        <line x1={lm} y1={tm} x2={lm} y2={H - bm + tm} stroke="#d1d5db" />
        <line x1={lm} y1={tm} x2={W - rm} y2={tm} stroke="#d1d5db" />
      </svg>
      <div className="flex flex-wrap gap-3 justify-center">
        {yLabels.map((lbl, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[13px] text-muted">
            <div className="w-3 h-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            {lbl}
          </div>
        ))}
      </div>
    </div>
  )
}

function ScatterMatrixRenderer({ data, yVars, yLabels }: { data: DataRow[]; yVars: string[]; yLabels: string[] }) {
  const vars = yVars.slice(0, 4)
  const labels = yLabels.slice(0, 4)
  const n = vars.length
  if (n < 2 || !data.length) return <EmptyState />
  const size = 140, pad = 8, lpad = 50, tpad = 20
  const W = lpad + (size + pad) * n, H = tpad + (size + pad) * n

  return (
    <div className="overflow-auto flex justify-center">
      <svg width={W} height={H} className="font-sans">
        {vars.map((yVar, row) =>
          vars.map((xVar, col) => {
            const ox = lpad + col * (size + pad)
            const oy = tpad + row * (size + pad)
            if (row === col) {
              return (
                <g key={`${row}-${col}`}>
                  <rect x={ox} y={oy} width={size} height={size} fill="#f3f4f6" stroke="#e5e7eb" rx={4} />
                  <text x={ox + size / 2} y={oy + size / 2 + 5} textAnchor="middle"
                    fontSize={12} fontWeight="600" fill="#374151">{labels[row]}</text>
                </g>
              )
            }
            const xVals = numVals(data, xVar)
            const yVals = numVals(data, yVar)
            const xMin = Math.min(...xVals), xMax = Math.max(...xVals) || 1
            const yMin = Math.min(...yVals), yMax = Math.max(...yVals) || 1
            const sx = (v: number) => ox + 8 + ((v - xMin) / (xMax - xMin || 1)) * (size - 16)
            const sy = (v: number) => oy + size - 8 - ((v - yMin) / (yMax - yMin || 1)) * (size - 16)
            return (
              <g key={`${row}-${col}`}>
                <rect x={ox} y={oy} width={size} height={size} fill="white" stroke="#e5e7eb" rx={4} />
                {data.map((r, di) => (
                  <circle key={di} cx={sx(Number(r[xVar]) || 0)} cy={sy(Number(r[yVar]) || 0)}
                    r={3.5} fill={COLORS[0]} fillOpacity={0.65} />
                ))}
              </g>
            )
          })
        )}
        {labels.map((lbl, i) => (
          <g key={i}>
            <text x={lpad + i * (size + pad) + size / 2} y={tpad - 4}
              textAnchor="middle" fontSize={9} fill="#9ca3af">{lbl}</text>
            <text x={lpad - 4} y={tpad + i * (size + pad) + size / 2 + 4}
              textAnchor="end" fontSize={9} fill="#9ca3af">{lbl}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ─── Variable multi-selector ──────────────────────────────────────────────────

function VarSelector({ vars, selected, onChange, label, max = 12 }: {
  vars: VarDef[]; selected: string[]; onChange: (s: string[]) => void; label: string; max?: number
}) {
  const t = useT()
  const add = () => {
    const next = vars.find(v => !selected.includes(v.id))
    if (next && selected.length < max) onChange([...selected, next.id])
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      {selected.map((sel, i) => (
        <div key={i} className="flex items-center gap-1">
          <select
            value={sel}
            aria-label={`${label} ${i + 1}`}
            onChange={e => onChange(selected.map((s, si) => si === i ? e.target.value : s))}
            className={SELECT_CLS}
          >
            {vars.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          {selected.length > 1 && (
            <button type="button" onClick={() => onChange(selected.filter((_, si) => si !== i))} aria-label={t({ en: 'Remove variable', is: 'Fjarlægja breytu' })}
              className="w-8 h-8 rounded-md text-muted hover:text-[#c4242a] hover:bg-[#ffedea] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
      ))}
      {selected.length < max && (
        <button type="button" onClick={add} className="text-[13px] text-muted hover:text-ink underline underline-offset-4 text-left">{t({ en: 'Add variable', is: 'Bæta við breytu' })}</button>
      )}
    </div>
  )
}

// ─── Main GrofTab ─────────────────────────────────────────────────────────────

interface Props {
  events: Event[]
  players: Player[]
  matches: MatchWithTeams[]
  trackedTeamId: string
}

export function GrofTab({ events, players, matches, trackedTeamId }: Props) {
  const t = useT()
  const lang = useLang(st => st.lang)
  const [chartType, setChartType] = useState<ChartTypeId>('line')
  const [datasetId, setDatasetId] = useState<DatasetId>('attack')
  const [yVars, setYVars] = useState<string[]>(['goals'])
  const [xVar, setXVar] = useState<string>('shots')
  const [playerId, setPlayerId] = useState<string>('')

  const fieldPlayers = useMemo(() => players.filter(p => p.position !== 'goalkeeper'), [players])
  const goalkeepers  = useMemo(() => players.filter(p => p.position === 'goalkeeper'),  [players])

  // Players shown in the filter depend on the dataset
  const filterablePlayers = datasetId === 'gk' ? goalkeepers : fieldPlayers
  const showPlayerFilter = datasetId !== 'matches'

  const effectivePlayerId = showPlayerFilter && playerId ? playerId : null

  const indexDefs = useIndexStore(st => st.defs)
  // One row per match, oldest first, so charts read left to right through the season.
  // `matches` must be the same selection the events were loaded for (the dashboard's chip filter).
  const chronological = useMemo(
    () => [...matches].sort((a, b) => (a.match_date ?? '').localeCompare(b.match_date ?? '') || a.id.localeCompare(b.id)),
    [matches],
  )
  const data = useMemo(
    () => buildDataset(datasetId, events, fieldPlayers, goalkeepers, chronological, trackedTeamId, effectivePlayerId, indexDefs),
    [datasetId, events, fieldPlayers, goalkeepers, chronological, trackedTeamId, effectivePlayerId, indexDefs],
  )

  const chartDefRaw = CHART_TYPES.find(c => c.id === chartType)!
  const chartDef = { ...chartDefRaw, label: tr(chartDefRaw.label, lang), desc: tr(chartDefRaw.desc, lang) }
  const availVars = useMemo(() => {
    const base = DATASET_VARS[datasetId].map(v => ({ ...v, label: tr(v.label, lang) }))
    if (datasetId !== 'matches') return base
    return [...base, ...indexDefs.filter(d => !d.hidden).map(d => ({ id: ixVar(d.key), label: d.key, short: d.key.slice(0, 6) }))]
  }, [datasetId, lang, indexDefs])

  const safeYVars = yVars.filter(v => availVars.some(d => d.id === v))
  const effectiveYVars = safeYVars.length ? safeYVars : [availVars[0]?.id ?? '']
  const effectiveXVar = availVars.some(d => d.id === xVar) ? xVar : (availVars[1]?.id ?? availVars[0]?.id ?? '')

  function yLabels(ids: string[]) {
    return ids.map(id => availVars.find(v => v.id === id)?.label ?? id)
  }
  const yLabel0 = availVars.find(v => v.id === effectiveYVars[0])?.label ?? ''
  const xLabel0 = availVars.find(v => v.id === effectiveXVar)?.label ?? ''

  function renderChart() {
    const yv = effectiveYVars
    const yl = yLabels(yv)
    switch (chartType) {
      case 'bar':             return <BarRenderer data={data} yVar={yv[0]} yLabel={yLabel0} />
      case 'grouped-bar':     return <GroupedBarRenderer data={data} yVars={yv} yLabels={yl} />
      case 'pareto':          return <ParetoRenderer data={data} yVar={yv[0]} yLabel={yLabel0} />
      case 'line':            return <LineRenderer data={data} yVar={yv[0]} yLabel={yLabel0} />
      case 'line-categories': return <LineCategoriesRenderer data={data} yVars={yv} yLabels={yl} />
      case 'scatter':         return <ScatterRenderer data={data} xVar={effectiveXVar} yVar={yv[0]} xLabel={xLabel0} yLabel={yLabel0} />
      case 'scatter-matrix':  return <ScatterMatrixRenderer data={data} yVars={yv} yLabels={yl} />
      case 'pie':             return <PieRenderer data={data} yVar={yv[0]} yLabel={yLabel0} />
      case 'histogram':       return <HistogramRenderer data={data} yVar={yv[0]} yLabel={yLabel0} />
      case 'histogram-side':  return <HistogramSideRenderer data={data} yVars={yv as [string,string]} yLabels={yl as [string,string]} />
      case 'boxplot':         return <BoxPlotRenderer data={data} yVars={[yv[0]]} yLabels={[yLabel0]} />
      case 'boxplot-side':    return <BoxPlotRenderer data={data} yVars={yv} yLabels={yl} />
      case 'qq':              return <QQRenderer data={data} yVar={yv[0]} yLabel={yLabel0} />
      case 'heatmap':         return <HeatmapRenderer data={data} yVars={yv} yLabels={yl} />
      case 'mosaic':          return <MosaicRenderer data={data} yVars={yv} yLabels={yl} />
    }
  }

  const isMultiY = chartDef.multiY ?? false
  const maxY = chartDef.maxY ?? 12

  const selectedPlayerName = effectivePlayerId
    ? filterablePlayers.find(p => p.id === effectivePlayerId)
      ? `#${filterablePlayers.find(p => p.id === effectivePlayerId)?.jersey_number} ${filterablePlayers.find(p => p.id === effectivePlayerId)?.last_name}`
      : null
    : null

  const fieldLabel = 'text-[13px] font-medium'

  return (
    <div className="space-y-4">

      {/* Chart type */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" role="group" aria-label={t({ en: 'Chart type', is: 'Tegund grafs' })}>
        {CHART_TYPES.map(ct => (
          <button
            key={ct.id}
            type="button"
            aria-pressed={chartType === ct.id}
            onClick={() => setChartType(ct.id)}
            title={tr(ct.desc, lang)}
            className={`h-10 px-3 rounded-md text-[14px] border transition-colors text-center truncate ${
              chartType === ct.id ? 'bg-[#111214] text-white border-[#111214]' : 'bg-white text-ink border-line hover:border-[#9aa0a8]'
            }`}
          >
            {tr(ct.label, lang)}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg border border-line p-4 flex flex-wrap gap-5 items-start">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="grof-dataset" className={fieldLabel}>{t({ en: 'Data', is: 'Gögn' })}</label>
          <select
            id="grof-dataset"
            value={datasetId}
            onChange={e => {
              const d = e.target.value as DatasetId
              setDatasetId(d)
              const first = DATASET_VARS[d][0]?.id ?? ''
              setYVars([first])
              setXVar(DATASET_VARS[d][1]?.id ?? first)
              setPlayerId('')
            }}
            className={SELECT_CLS}
          >
            {(Object.entries(DATASET_LABELS) as [DatasetId, string][]).map(([id, lbl]) => (
              <option key={id} value={id}>{tr(lbl, lang)}</option>
            ))}
          </select>
        </div>

        {showPlayerFilter && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="grof-player" className={fieldLabel}>{t({ en: 'Player', is: 'Leikmaður' })}</label>
            <select id="grof-player" value={playerId} onChange={e => setPlayerId(e.target.value)} className={SELECT_CLS}>
              <option value="">{t({ en: 'Team totals', is: 'Allt liðið' })}</option>
              {filterablePlayers
                .sort((a, b) => (a.jersey_number ?? 99) - (b.jersey_number ?? 99))
                .map(p => (
                  <option key={p.id} value={p.id}>
                    #{p.jersey_number} {p.first_name} {p.last_name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {chartDef.needsX && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="grof-x" className={fieldLabel}>{t({ en: 'Horizontal axis', is: 'Lárétti ás' })}</label>
            <select id="grof-x" value={effectiveXVar} onChange={e => setXVar(e.target.value)} className={SELECT_CLS}>
              {availVars.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        )}

        {isMultiY ? (
          <VarSelector
            vars={availVars}
            selected={effectiveYVars}
            onChange={v => setYVars(v)}
            label={chartType === 'heatmap' || chartType === 'mosaic' || chartType === 'scatter-matrix' ? t({ en: 'Variables', is: 'Breytur' }) : t({ en: 'Vertical axis', is: 'Lóðrétti ás' })}
            max={maxY}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="grof-y" className={fieldLabel}>
              {chartDef.needsX ? t({ en: 'Vertical axis', is: 'Lóðrétti ás' }) : t({ en: 'Variable', is: 'Breyta' })}
            </label>
            <select id="grof-y" value={effectiveYVars[0]} onChange={e => setYVars([e.target.value])} className={SELECT_CLS}>
              {availVars.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        )}

        <p className="ml-auto self-end text-[13px] text-muted max-w-[240px] text-right">{chartDef.desc}</p>
      </div>

      {selectedPlayerName && (
        <p className="text-[14px] text-muted">
          {t({ en: 'Showing', is: 'Sýnir' })} <span className="text-ink font-medium">{selectedPlayerName}</span>, {t({ en: 'one value per match.', is: 'eitt gildi á leik.' })}
        </p>
      )}

      <div className="bg-white rounded-lg border border-line p-4 min-h-[200px]">
        {matches.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted text-[14px]">
            {t({ en: 'No matches in this filter.', is: 'Engir leikir í þessari síu.' })}
          </div>
        ) : renderChart()}
      </div>

    </div>
  )
}
