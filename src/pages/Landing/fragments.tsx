// Interface fragments for the landing page: true-size pieces of the product,
// drawn from the sample data in ./sample.ts. Each fragment's root carries
// data-ui (inside it the app's own conventions apply: 1px control borders,
// small radii, depth only on what floats).
import { useT, useLang } from '@/lib/i18n/lang'
import type { Text } from '@/lib/i18n/lang'
import {
  PLAYERS, SHOTS, GK_SHOTS, SEASON_WITH_THIS, HOME, AWAY,
  ourGoals, ourShots, theirGoals, pct, playerLine, gkLine, defLine,
  type Zone,
} from './sample'
import { attackCells, keeperCells, type ZoneCell } from './cells'


// ─── Goal grid ────────────────────────────────────────────────────────────────


/**
 * Three clear steps instead of a ramp: hot zones in solid cobalt, middle zones
 * grey, cold zones pale. The thresholds differ for attack and goalkeeping.
 */
function tint(n: number, d: number, mode: 'attack' | 'keeper') {
  if (d === 0) return { background: 'var(--ui-raised)', color: 'var(--ui-faint)' }
  const p = n / d
  const [hi, mid] = mode === 'attack' ? [0.67, 0.4] : [0.5, 0.25]
  if (p >= hi) return { background: 'var(--accent)', color: '#ffffff' }
  if (p >= mid) return { background: '#cfd4db', color: 'var(--ui-text)' }
  return { background: 'var(--ui-raised)', color: 'var(--ui-text)' }
}

export function GoalGrid({ cells, onZone, flash, zoneLabel, mode = 'attack' }: {
  cells: ZoneCell[]
  mode?: 'attack' | 'keeper'
  onZone?: (z: Zone) => void
  flash?: { zone: Zone; key: number } | null
  zoneLabel?: string
}) {
  return (
    <div className="ui-goal">
      <div className="ui-goal__frame">
        {cells.map(c => {
          const style = tint(c.n, c.d, mode)
          const inner = (
            <>
              <span className="ui-goal__ratio num">{c.d ? `${c.n}/${c.d}` : '—'}</span>
              <span className="ui-goal__pct num">{c.d ? `${pct(c.n, c.d)}%` : ''}</span>
            </>
          )
          const isFlash = flash?.zone === c.zone
          return onZone ? (
            <button
              key={c.zone}
              type="button"
              data-flash={isFlash ? flash!.key : undefined}
              className={`ui-goal__cell${isFlash ? (flash!.key % 2 ? ' is-flash' : ' is-flash-b') : ''}`}
              style={style}
              onClick={() => onZone(c.zone)}
              aria-label={`${zoneLabel ?? 'Zone'} ${c.zone}: ${c.n} / ${c.d}`}
            >{inner}</button>
          ) : (
            <div key={c.zone} className="ui-goal__cell" style={style}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Hero frames ──────────────────────────────────────────────────────────────

export function HeroShotMapFrame() {
  const t = useT()
  const off = SHOTS.filter(s => s.outcome === 'wide' || s.outcome === 'post').length
  const blocked = SHOTS.filter(s => s.outcome === 'blocked').length
  return (
    <div className="ui-card ui-hero-frame" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong">{HOME}</span>
        <span className="ui-muted num">{ourGoals}/{ourShots} · {pct(ourGoals, ourShots)}%</span>
      </div>
      <div className="ui-hero-frame__body">
        <GoalGrid cells={attackCells()} />
        <dl className="ui-kv">
          <div><dt>{t({ en: 'Off target', is: 'Ekki á mark' })}</dt><dd className="num">{off}</dd></div>
          <div><dt>{t({ en: 'Blocked', is: 'Blokk' })}</dt><dd className="num">{blocked}</dd></div>
          <div><dt>{t({ en: 'Score', is: 'Staða' })}</dt><dd className="num">{ourGoals}–{theirGoals}</dd></div>
        </dl>
      </div>
    </div>
  )
}

export function ReportTable({ rows = 5 }: { rows?: number }) {
  const t = useT()
  const field = PLAYERS.filter(p => p.position === 'field')
    .map(p => ({ p, ...playerLine(p.id) }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, rows)
  return (
    <table className="ui-table">
      <thead>
        <tr>
          <th>{t({ en: 'Player', is: 'Leikmaður' })}</th>
          <th className="num">{t({ en: 'Goals', is: 'Mörk' })}</th>
          <th className="num">%</th>
          <th className="num">{t({ en: 'Ast', is: 'Stoðs.' })}</th>
          <th className="num">{t({ en: 'TO', is: 'Tap.' })}</th>
        </tr>
      </thead>
      <tbody>
        {field.map(({ p, goals, shots, assists, turnovers }) => (
          <tr key={p.id}>
            <td><span className="ui-jersey num">{p.jersey}</span>{p.name}</td>
            <td className="num"><span className="ui-strong">{goals}</span><span className="ui-muted">/{shots}</span></td>
            <td className="num">{pct(goals, shots)}%</td>
            <td className="num">{assists}</td>
            <td className="num">{turnovers}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function HeroReportFrame() {
  const t = useT()
  return (
    <div className="ui-card ui-hero-frame" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong">{t({ en: 'Match report', is: 'Leikskýrsla' })}</span>
        <span className="ui-muted num">{HOME} {ourGoals}–{theirGoals} {AWAY}</span>
      </div>
      <ReportTable rows={5} />
    </div>
  )
}

const GK_RANGE_LABEL: Record<string, Text> = {
  '9m_plus': { en: '9 m+', is: '9 m+' },
  '6m': { en: '6 m', is: '6 m' },
  wing: { en: 'Wing', is: 'Horn' },
  penalty: { en: 'Penalty', is: 'Víti' },
}

export function KeeperSheet({ id = 'haukur' }: { id?: string }) {
  const t = useT()
  const keeper = PLAYERS.find(p => p.id === id)!
  const line = gkLine(id)
  return (
    <div className="ui-keeper">
      <div className="ui-keeper__lead">
        <span className="ui-keeper__pct num">{pct(line.saves, line.faced)}%</span>
        <span className="ui-muted num">{line.saves} {t({ en: 'saves of', is: 'varin af' })} {line.faced}</span>
      </div>
      <div className="ui-keeper__name"><span className="ui-jersey num">{keeper.jersey}</span>{keeper.name}</div>
      <ul className="ui-bars">
        {Object.entries(line.byRange).map(([range, [s, f]]) => (
          <li key={range}>
            <span>{t(GK_RANGE_LABEL[range])}</span>
            <span className="ui-bars__track"><span className="ui-bars__fill" style={{ width: `${f ? (s / f) * 100 : 0}%` }} /></span>
            <span className="num ui-bars__val">{s}/{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HeroKeeperFrame() {
  const t = useT()
  return (
    <div className="ui-card ui-hero-frame" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong">{t({ en: 'Goalkeeper', is: 'Markvörður' })}</span>
        <span className="ui-muted">{t({ en: 'Saves by range', is: 'Varsla eftir færi' })}</span>
      </div>
      <div className="ui-hero-frame__body">
        <KeeperSheet id="haukur" />
        <GoalGrid mode="keeper" cells={keeperCells(GK_SHOTS.filter(s => s.keeperId === 'haukur'))} />
      </div>
    </div>
  )
}

// ─── Season chart (one series, last match in the accent) ─────────────────────

export function SeasonChart({ width = 440, height = 170 }: { width?: number; height?: number }) {
  const data = SEASON_WITH_THIS.map(m => ({ ...m, p: m.goals / m.shots * 100 }))
  const padL = 34, padR = 12, padT = 10, padB = 24
  const w = width - padL - padR, h = height - padT - padB
  const yMin = 40, yMax = 70
  const x = (i: number) => padL + (i / (data.length - 1)) * w
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * h
  const ticks = [40, 50, 60, 70]
  const pts = data.map((d, i) => `${x(i)},${y(d.p)}`).join(' ')
  const lang = useLang(s => s.lang)
  const dateFmt = new Intl.DateTimeFormat(lang === 'is' ? 'is-IS' : 'en-GB', { day: 'numeric', month: 'short' })
  const fmt = (iso: string) => dateFmt.format(new Date(iso + 'T12:00:00'))
  const labelIdx = [0, 3, data.length - 1]
  const last = data[data.length - 1]
  return (
    <svg className="ui-chart" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Shooting percentage per match, ${data.map(d => Math.round(d.p) + '%').join(', ')}`}>
      {ticks.map(v => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} className="ui-chart__grid" />
          <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="ui-chart__tick">{v}%</text>
        </g>
      ))}
      <polyline points={pts} fill="none" className="ui-chart__line" />
      <circle cx={x(data.length - 1)} cy={y(last.p)} r={4.5} className="ui-chart__now" />
      <text x={x(data.length - 1) - 8} y={y(last.p) - 10} textAnchor="end" className="ui-chart__label">{Math.round(last.p)}%</text>
      {labelIdx.map(i => (
        <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} className="ui-chart__tick">{fmt(data[i].date)}</text>
      ))}
    </svg>
  )
}

export function HeroSeasonFrame() {
  const t = useT()
  const goals = SEASON_WITH_THIS.reduce((s, m) => s + m.goals, 0)
  const shots = SEASON_WITH_THIS.reduce((s, m) => s + m.shots, 0)
  return (
    <div className="ui-card ui-hero-frame" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong">{t({ en: 'Shooting %', is: 'Skotnýting' })}</span>
        <span className="ui-muted num">{SEASON_WITH_THIS.length} {t({ en: 'matches', is: 'leikir' })} · {goals}/{shots} · {pct(goals, shots)}%</span>
      </div>
      <SeasonChart />
    </div>
  )
}

// ─── Feature cells ────────────────────────────────────────────────────────────

export function OfflineQueue() {
  const t = useT()
  const queued = [
    { what: { en: 'Shot · goal', is: 'Skot · mark' }, who: '#21 Snorri', min: 59 },
    { what: { en: 'Attack', is: 'Sókn' }, who: HOME, min: 59 },
    { what: { en: 'Save', is: 'Varsla' }, who: '#1 Haukur', min: 58 },
    { what: { en: 'Turnover · bad pass', is: 'Tapaður · sending' }, who: '#4 Hlynur', min: 58 },
  ]
  return (
    <div className="ui-card ui-pad" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-status"><span className="ui-dot ui-dot--off" />{t({ en: 'Offline', is: 'Ótengt' })}</span>
        <span className="ui-muted num">{t({ en: '14 waiting to send', is: '14 bíða sendingar' })}</span>
      </div>
      <ul className="ui-list">
        {queued.map((q, i) => (
          <li key={i}><span>{t(q.what)}</span><span className="ui-muted">{q.who}</span><span className="num ui-muted">{q.min}′</span></li>
        ))}
      </ul>
    </div>
  )
}

export function UndoFeed() {
  const t = useT()
  return (
    <div className="ui-card ui-pad" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong">{t({ en: 'Last events', is: 'Síðustu skráningar' })}</span>
        <button type="button" className="ui-btn ui-btn--secondary">{t({ en: 'Undo', is: 'Afturkalla' })}</button>
      </div>
      <ul className="ui-list">
        <li className="is-voided"><span>{t({ en: 'Shot · goal', is: 'Skot · mark' })}</span><span>#13 Einar</span><span className="num">52′</span></li>
        <li><span>{t({ en: 'Shot · goal', is: 'Skot · mark' })}</span><span className="ui-muted">#9 Kári</span><span className="num ui-muted">52′</span></li>
        <li><span>{t({ en: 'Block', is: 'Blokk' })}</span><span className="ui-muted">#4 Hlynur</span><span className="num ui-muted">51′</span></li>
      </ul>
    </div>
  )
}

export function ExportBox() {
  const t = useT()
  return (
    <div className="ui-card ui-pad" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong">{t({ en: 'Export to CSV', is: 'Sækja CSV' })}</span>
        <span className="ui-muted num">{SEASON_WITH_THIS.length} {t({ en: 'matches', is: 'leikir' })}</span>
      </div>
      <div className="ui-seg" role="group">
        <span className="is-on">{t({ en: 'Attack', is: 'Sókn' })}</span>
        <span>{t({ en: 'Defence', is: 'Vörn' })}</span>
        <span>{t({ en: 'Keeper', is: 'Markv.' })}</span>
      </div>
      <div className="ui-field-row"><span className="ui-muted">{t({ en: 'Matches', is: 'Leikir' })}</span><span className="num">{SEASON_WITH_THIS.length} {t({ en: 'of', is: 'af' })} {SEASON_WITH_THIS.length}</span></div>
      <div className="ui-field-row"><span className="ui-muted">{t({ en: 'Players', is: 'Leikmenn' })}</span><span>{PLAYERS.filter(p => p.position === 'field').map(p => p.name).slice(0, 4).join(', ')} +2</span></div>
      <div className="ui-field-row"><span className="ui-muted">{t({ en: 'Minutes', is: 'Mínútur' })}</span><span className="num">0–60</span></div>
      <button type="button" className="ui-btn ui-btn--primary">{t({ en: 'Download', is: 'Sækja' })}</button>
    </div>
  )
}

// ─── Defence ─────────────────────────────────────────────────────────────────

export function DefenceTable({ rows = 6 }: { rows?: number }) {
  const t = useT()
  const field = PLAYERS.filter(p => p.position === 'field')
    .map(p => ({ p, ...defLine(p.id) }))
    .sort((a, b) => (b.blocks + b.steals + b.duelsWon) - (a.blocks + a.steals + a.duelsWon))
    .slice(0, rows)
  return (
    <table className="ui-table">
      <thead>
        <tr>
          <th>{t({ en: 'Player', is: 'Leikmaður' })}</th>
          <th className="num">{t({ en: 'Blocks', is: 'Blokk' })}</th>
          <th className="num">{t({ en: 'Steals', is: 'Stolnir' })}</th>
          <th className="num">{t({ en: 'Duels', is: 'Einvígi' })}</th>
          <th className="num">{t({ en: '2 min', is: '2 mín' })}</th>
        </tr>
      </thead>
      <tbody>
        {field.map(({ p, blocks, steals, duelsWon, duels, twoMin }) => (
          <tr key={p.id}>
            <td><span className="ui-jersey num">{p.jersey}</span>{p.name}</td>
            <td className="num">{blocks || <span className="ui-muted">—</span>}</td>
            <td className="num">{steals || <span className="ui-muted">—</span>}</td>
            <td className="num">{duels ? <><span className="ui-strong">{duelsWon}</span><span className="ui-muted">/{duels}</span></> : <span className="ui-muted">—</span>}</td>
            <td className="num">{twoMin ? <span className="ui-neg">{twoMin}</span> : <span className="ui-muted">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function HeroDefenceFrame() {
  const t = useT()
  return (
    <div className="ui-card ui-hero-frame" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong">{t({ en: 'Defence', is: 'Vörn' })}</span>
        <span className="ui-muted">{t({ en: 'Per player', is: 'Á hvern leikmann' })}</span>
      </div>
      <DefenceTable rows={5} />
    </div>
  )
}

// ─── Your view: the chart builder ────────────────────────────────────────────

export function ChartBuilder({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const data = PLAYERS.filter(p => p.position === 'field').map(p => {
    const a = playerLine(p.id), d = defLine(p.id)
    return { p, attack: a.goals, defence: d.blocks + d.steals + d.duelsWon }
  }).sort((a, b) => (b.attack + b.defence) - (a.attack + a.defence))
  const max = Math.max(...data.map(d => Math.max(d.attack, d.defence)))
  return (
    <div className="ui-builder">
      <div className="ui-builder__controls">
        <span className="ui-pill"><span className="ui-muted">{t({ en: 'Chart', is: 'Graf' })}</span> {t({ en: 'Grouped bars', is: 'Flokkaðar súlur' })}</span>
        <span className="ui-pill"><span className="ui-muted">{t({ en: 'Y', is: 'Y' })}</span> {t({ en: 'Goals', is: 'Mörk' })} + {t({ en: 'Won balls', is: 'Unnir boltar' })}</span>
        {!compact && <span className="ui-pill"><span className="ui-muted">{t({ en: 'By', is: 'Eftir' })}</span> {t({ en: 'Player', is: 'Leikmanni' })}</span>}
      </div>
      <div className="ui-bars2" role="img" aria-label={t({ en: 'Goals and won balls per player', is: 'Mörk og unnir boltar á leikmann' })}>
        {data.map(d => (
          <div key={d.p.id} className="ui-bars2__group">
            <div className="ui-bars2__pair">
              <span className="ui-bars2__bar ui-bars2__bar--a" style={{ height: `${(d.attack / max) * 100}%` }}><span className="num">{d.attack}</span></span>
              <span className="ui-bars2__bar ui-bars2__bar--b" style={{ height: `${(d.defence / max) * 100}%` }}><span className="num">{d.defence}</span></span>
            </div>
            <span className="ui-bars2__label">{d.p.name}</span>
          </div>
        ))}
      </div>
      <div className="ui-legend">
        <span><i className="ui-legend__a" />{t({ en: 'Goals', is: 'Mörk' })}</span>
        <span><i className="ui-legend__b" />{t({ en: 'Won balls (blocks, steals, duels)', is: 'Unnir boltar (blokk, stolnir, einvígi)' })}</span>
      </div>
    </div>
  )
}

export function HeroViewFrame() {
  const t = useT()
  return (
    <div className="ui-card ui-hero-frame" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong">{t({ en: 'Your chart', is: 'Þitt graf' })}</span>
        <span className="ui-muted">{HOME} · {t({ en: 'minutes 0–60', is: 'mínútur 0–60' })}</span>
      </div>
      <ChartBuilder compact />
    </div>
  )
}

// ─── Match flow (sample): goal difference after each goal ────────────────────

export function FlowSpark({ width = 420, height = 120 }: { width?: number; height?: number }) {
  const t = useT()
  // Our goals from the shot rows, theirs from the keeper rows spread over the match
  const ours = SHOTS.filter(s => s.outcome === 'goal').map(s => ({ m: s.minute, us: true }))
  const conceded = GK_SHOTS.filter(g => !g.saved).map((_, i, arr) => ({ m: Math.round(((i + 0.5) / arr.length) * 60), us: false }))
  const goals = [...ours, ...conceded].sort((a, b) => a.m - b.m)
  const diffs = goals.reduce<number[]>((acc, g) => [...acc, acc[acc.length - 1] + (g.us ? 1 : -1)], [0])
  const top = Math.max(2, ...diffs), bottom = Math.min(-2, ...diffs)
  const padL = 26, padR = 8, padT = 8, padB = 8
  const x = (i: number) => padL + (i / goals.length) * (width - padL - padR)
  const y = (v: number) => padT + ((top - v) / (top - bottom)) * (height - padT - padB)
  let path = `M${x(0)},${y(0)}`
  diffs.slice(1).forEach((v, i) => { path += ` H${x(i + 1)} V${y(v)}` })
  return (
    <svg className="ui-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t({ en: 'Goal difference after each goal', is: 'Markamunur eftir hvert mark' })}>
      {[top, 0, bottom].map(v => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} className={v === 0 ? 'ui-chart__zero' : 'ui-chart__grid'} />
          <text x={padL - 5} y={y(v) + 4} textAnchor="end" className="ui-chart__tick">{v > 0 ? `+${v}` : v}</text>
        </g>
      ))}
      <path d={`${path} V${y(0)} H${x(0)} Z`} className="ui-chart__area" />
      <path d={path} fill="none" className="ui-chart__flow" />
    </svg>
  )
}

/** The report's standouts row: one player for each side of the game. */
export function Standouts() {
  const t = useT()
  const scorer = PLAYERS.filter(p => p.position === 'field').map(p => ({ p, ...playerLine(p.id) })).sort((a, b) => b.goals - a.goals)[0]
  const defender = PLAYERS.filter(p => p.position === 'field').map(p => { const d = defLine(p.id); return { p, n: d.blocks + d.steals + d.duelsWon + d.rebounds } }).sort((a, b) => b.n - a.n)[0]
  const keeper = gkLine('haukur')
  return (
    <div className="ui-standouts">
      <div><span className="ui-muted">{t({ en: 'Attack', is: 'Sókn' })}</span><b>#{scorer.p.jersey} {scorer.p.name}</b><span><em className="num">{scorer.goals}</em> {t({ en: 'goals', is: 'mörk' })}</span></div>
      <div><span className="ui-muted">{t({ en: 'Defence', is: 'Vörn' })}</span><b>#{defender.p.jersey} {defender.p.name}</b><span><em className="num">{defender.n}</em> {t({ en: 'won balls', is: 'unnir' })}</span></div>
      <div><span className="ui-muted">{t({ en: 'Goalkeeping', is: 'Markvarsla' })}</span><b>#1 Haukur</b><span><em className="num">{keeper.saves}</em> {t({ en: 'saves', is: 'varin' })}</span></div>
    </div>
  )
}
