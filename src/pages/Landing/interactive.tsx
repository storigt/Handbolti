// The page's live thing: the event log of the sample match next to the numbers
// counted from it. Remove an event, or log a new one, and every figure is
// recounted — exactly how the app derives every stat from logged events.
import { useMemo, useState } from 'react'
import { useT, type Text } from '@/lib/i18n/lang'
import { trust as C } from './copy'
import { PLAYERS, SHOTS, GK_SHOTS, DEFENCE, pct, type DefKind } from './sample'

type Side = 'attack' | 'defence' | 'keeper'
interface LogEvent { id: number; side: Side; what: Text; playerId: string; minute: number; scores: boolean; won: boolean; twoMin: boolean; voided: boolean }

const SHOT_TEXT: Record<string, Text> = {
  goal: { en: 'Goal', is: 'Mark' }, saved: { en: 'Shot saved', is: 'Skot varið' },
  blocked: { en: 'Shot blocked', is: 'Skot í blokk' }, wide: { en: 'Shot wide', is: 'Skot fram hjá' }, post: { en: 'Post', is: 'Stöng' },
}
const DEF_TEXT: Record<DefKind, Text> = {
  block: { en: 'Block', is: 'Blokk' }, steal: { en: 'Steal', is: 'Stolinn bolti' }, duel_won: { en: 'Duel won', is: 'Einvígi unnið' },
  duel_lost: { en: 'Duel lost', is: 'Einvígi tapað' }, rebound: { en: 'Rebound', is: 'Frákast' }, two_min: { en: '2 minutes', is: '2 mínútur' },
}
const SIDE_TEXT: Record<Side, Text> = { attack: { en: 'Attack', is: 'Sókn' }, defence: { en: 'Defence', is: 'Vörn' }, keeper: { en: 'Keeper', is: 'Markv.' } }

function initialLog(): LogEvent[] {
  const list: Omit<LogEvent, 'id'>[] = [
    ...SHOTS.map(s => ({ side: 'attack' as const, what: SHOT_TEXT[s.outcome], playerId: s.playerId, minute: s.minute, scores: s.outcome === 'goal', won: false, twoMin: false, voided: false })),
    ...GK_SHOTS.map((g, i) => ({ side: 'keeper' as const, what: g.saved ? { en: 'Save', is: 'Varsla' } : { en: 'Goal against', is: 'Mark á sig' }, playerId: g.keeperId, minute: Math.round(((i + 0.5) / GK_SHOTS.length) * 60), scores: !g.saved, won: g.saved, twoMin: false, voided: false })),
    ...DEFENCE.map(d => ({ side: 'defence' as const, what: DEF_TEXT[d.kind], playerId: d.playerId, minute: d.minute, scores: false, won: ['block', 'steal', 'duel_won', 'rebound'].includes(d.kind), twoMin: d.kind === 'two_min', voided: false })),
  ]
  return list.sort((a, b) => a.minute - b.minute).map((e, id) => ({ ...e, id }))
}

const ADDS: { label: Text; make: () => Omit<LogEvent, 'id'> }[] = [
  { label: { en: 'Goal · #9 Kári', is: 'Mark · #9 Kári' }, make: () => ({ side: 'attack', what: SHOT_TEXT.goal, playerId: 'kari', minute: 60, scores: true, won: false, twoMin: false, voided: false }) },
  { label: { en: 'Block · #4 Hlynur', is: 'Blokk · #4 Hlynur' }, make: () => ({ side: 'defence', what: DEF_TEXT.block, playerId: 'hlynur', minute: 60, scores: false, won: true, twoMin: false, voided: false }) },
  { label: { en: 'Save · #1 Haukur', is: 'Varsla · #1 Haukur' }, make: () => ({ side: 'keeper', what: { en: 'Save', is: 'Varsla' }, playerId: 'haukur', minute: 60, scores: false, won: true, twoMin: false, voided: false }) },
]

const who = (id: string) => { const p = PLAYERS.find(x => x.id === id)!; return `#${p.jersey} ${p.name}` }

export function TrustDemo() {
  const t = useT()
  const [log, setLog] = useState<LogEvent[]>(initialLog)
  const [lastChanged, setLastChanged] = useState<{ playerId: string; key: number } | null>(null)
  const [showAll, setShowAll] = useState(false)

  const live = log.filter(e => !e.voided)
  const stats = useMemo(() => {
    const atk = live.filter(e => e.side === 'attack'), gk = live.filter(e => e.side === 'keeper'), def = live.filter(e => e.side === 'defence')
    return {
      us: atk.filter(e => e.scores).length, them: gk.filter(e => e.scores).length,
      shots: atk.length, saves: gk.filter(e => e.won).length, faced: gk.length,
      won: def.filter(e => e.won).length, twoMin: def.filter(e => e.twoMin).length,
    }
  }, [live])
  const players = PLAYERS.filter(p => p.position === 'field').map(p => {
    const own = live.filter(e => e.playerId === p.id)
    const shots = own.filter(e => e.side === 'attack')
    return { p, goals: shots.filter(e => e.scores).length, shots: shots.length, won: own.filter(e => e.side === 'defence' && e.won).length }
  })
  const voided = log.length - live.length

  function toggle(id: number) {
    setLog(l => l.map(e => (e.id === id ? { ...e, voided: !e.voided } : e)))
    const e = log.find(x => x.id === id)
    if (e) setLastChanged(c => ({ playerId: e.playerId, key: (c?.key ?? 0) + 1 }))
  }
  function add(i: number) {
    const ev = ADDS[i].make()
    setLog(l => [...l, { ...ev, id: l.length ? Math.max(...l.map(x => x.id)) + 1 : 0 }])
    setLastChanged(c => ({ playerId: ev.playerId, key: (c?.key ?? 0) + 1 }))
  }

  const newestFirst = [...log].reverse()
  const shown = showAll ? newestFirst : newestFirst.slice(0, 20)
  const flashKey = (id: string) => (lastChanged?.playerId === id ? `${id}-${lastChanged.key}` : id)

  return (
    <div className="lp-trust" data-ui>
      <div className="ui-card lp-trust__log">
        <div className="ui-row ui-row--head">
          <span className="ui-strong">{t(C.log)}</span>
          <span className="ui-muted num">{log.length} {t(C.events)}{voided > 0 && <> · {voided} {t(C.removedNote)}</>}</span>
        </div>
        <div className="lp-trust__adds">
          {ADDS.map((a, i) => (
            <button key={i} type="button" className="ui-btn ui-btn--secondary" onClick={() => add(i)}>+ {t(a.label)}</button>
          ))}
        </div>
        <ul className="lp-trust__list" aria-label={t(C.log)}>
          {shown.map(e => (
            <li key={e.id} className={e.voided ? 'is-voided' : ''}>
              <span className={`lp-trust__side lp-trust__side--${e.side}`}>{t(SIDE_TEXT[e.side])}</span>
              <span className="lp-trust__what">{t(e.what)}</span>
              <span className="ui-muted lp-trust__who">{who(e.playerId)}</span>
              <span className="num ui-muted">{e.minute}′</span>
              <button type="button" className="lp-trust__toggle" onClick={() => toggle(e.id)}
                aria-label={`${e.voided ? t(C.restore) : t(C.remove)}: ${t(e.what)}, ${who(e.playerId)}, ${e.minute}′`}>
                {e.voided ? t(C.restore) : t(C.remove)}
              </button>
            </li>
          ))}
          {!showAll && newestFirst.length > shown.length && (
            <li className="lp-trust__more">
              <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setShowAll(true)}>
                {t(C.older)} <span className="num ui-muted">{newestFirst.length - shown.length}</span>
              </button>
            </li>
          )}
        </ul>
      </div>

      <div className="ui-card lp-trust__stats" aria-live="polite">
        <div className="ui-row ui-row--head">
          <span className="ui-strong">{t(C.computed)}</span>
          <button type="button" className="lp-link ui-muted" onClick={() => { setLog(initialLog()); setLastChanged(null) }}>{t(C.reset)}</button>
        </div>
        <div className="lp-trust__score">
          <span className="num" key={`s${stats.us}-${stats.them}`}>{stats.us}<span className="ui-muted">–</span>{stats.them}</span>
          <span className="ui-muted">HK Norðri – ÍF Suðri</span>
        </div>
        <dl className="lp-trust__kpis">
          <div><dt>{t({ en: 'Attack', is: 'Sókn' })}</dt><dd className="num" key={`a${stats.us}${stats.shots}`}>{stats.us}/{stats.shots}</dd><dd className="ui-muted num">{pct(stats.us, stats.shots)}% {t({ en: 'shooting', is: 'nýting' })}</dd></div>
          <div><dt>{t({ en: 'Defence', is: 'Vörn' })}</dt><dd className="num" key={`d${stats.won}`}>{stats.won}</dd><dd className="ui-muted">{t({ en: 'won balls', is: 'unnir boltar' })}</dd></div>
          <div><dt>{t({ en: 'Goalkeeping', is: 'Markvarsla' })}</dt><dd className="num" key={`g${stats.saves}${stats.faced}`}>{stats.saves}/{stats.faced}</dd><dd className="ui-muted num">{pct(stats.saves, stats.faced)}% {t({ en: 'saved', is: 'varið' })}</dd></div>
        </dl>
        <table className="ui-table">
          <thead><tr>
            <th>{t({ en: 'Player', is: 'Leikmaður' })}</th>
            <th className="num">{t({ en: 'Goals', is: 'Mörk' })}</th>
            <th className="num">%</th>
            <th className="num">{t({ en: 'Won balls', is: 'Unnir' })}</th>
          </tr></thead>
          <tbody>
            {players.map(r => (
              <tr key={flashKey(r.p.id)} className={lastChanged?.playerId === r.p.id ? 'is-changed' : ''}>
                <td><span className="ui-jersey num">{r.p.jersey}</span>{r.p.name}</td>
                <td className="num"><span className="ui-strong">{r.goals}</span><span className="ui-muted">/{r.shots}</span></td>
                <td className="num">{pct(r.goals, r.shots)}%</td>
                <td className="num">{r.won || <span className="ui-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── The logger, at each of the four stages ──────────────────────────────────

const RANGE_BUTTONS = [
  { en: 'Penalty', is: 'Víti' }, { en: 'Left wing', is: 'Vinstra horn' }, { en: 'Right wing', is: 'Hægra horn' },
  { en: '9 m+', is: '9 m+' }, { en: '7–8 m', is: '7–8 m' }, { en: '6 m', is: '6 m' }, { en: 'Line', is: 'Lína' },
]

export function LoggerFragment({ stage }: { stage: number }) {
  const t = useT()
  const field = PLAYERS.filter(p => p.position === 'field')
  const crumbs = [
    stage >= 1 ? '#9 Kári' : null,
    stage >= 2 ? '9 m+' : null,
    stage >= 2 ? t({ en: 'Set play', is: 'Uppstilltur' }) : null,
    stage >= 3 ? t({ en: 'Zone 3', is: 'Svæði 3' }) : null,
  ].filter(Boolean) as string[]

  return (
    <div className="ui-card ui-logger" data-ui>
      <div className="ui-row ui-row--head">
        <span className="ui-strong num">{scoreAt(stage)}</span>
        <span className="ui-muted num">38′</span>
      </div>
      <div className="ui-crumbs" aria-label="selection">
        {crumbs.length ? crumbs.map(c => <span key={c}>{c}</span>) : <span className="ui-muted">{t({ en: 'Pick a player', is: 'Veldu leikmann' })}</span>}
      </div>

      {stage === 0 && (
        <div className="ui-players">
          {field.map(p => (
            <span key={p.id} className={`ui-player${p.id === 'kari' ? ' is-pressed' : ''}`}>
              <span className="num ui-player__no">{p.jersey}</span><span className="ui-player__name">{p.name}</span>
            </span>
          ))}
        </div>
      )}
      {stage === 1 && (
        <div className="ui-choices">
          {RANGE_BUTTONS.map((r, i) => (
            <span key={i} className={`ui-choice${i === 3 ? ' is-pressed' : ''}`}>{t(r)}</span>
          ))}
        </div>
      )}
      {stage === 2 && (
        <div className="ui-zonepick">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(z => (
            <span key={z} className={`ui-zonepick__cell${z === 3 ? ' is-pressed' : ''}`}>{z}</span>
          ))}
        </div>
      )}
      {stage === 3 && (
        <>
          <div className="ui-choices ui-choices--two">
            <span className="ui-choice is-pressed">{t({ en: 'Goal', is: 'Mark' })}</span>
            <span className="ui-choice">{t({ en: 'Saved', is: 'Varið' })}</span>
          </div>
          <p className="ui-logged">{t({ en: 'Logged: goal, #9 Kári, zone 3', is: 'Skráð: mark, #9 Kári, svæði 3' })}</p>
        </>
      )}
    </div>
  )
}

// The score in the fragment's header ticks over when the goal is logged.
function scoreAt(stage: number) {
  return stage === 3 ? '19–16' : '18–16'
}
