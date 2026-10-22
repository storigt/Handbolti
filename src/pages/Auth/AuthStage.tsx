// The sign-in page's left half: a match being logged, live. Events from the
// landing page's FICTIONAL sample match tick in one by one — attack, defence
// and goalkeeping — and the tallies and the goal mark follow them. It shows
// what the product is while you type your password. Reduced motion: still.
import { useEffect, useMemo, useState } from 'react'
import { useT, type Text } from '@/lib/i18n/lang'
import { PLAYERS, SHOTS, GK_SHOTS, HOME, type Zone } from '@/pages/Landing/sample'

type Side = 'attack' | 'defence' | 'keeper'
interface Tick { side: Side; what: Text; who: string; minute: number; zone: Zone | null; good: boolean }

const jersey = (id: string) => {
  const p = PLAYERS.find(x => x.id === id)!
  return `#${p.jersey} ${p.name}`
}

function buildFeed(): Tick[] {
  const shots: Tick[] = SHOTS.map(s => ({
    side: 'attack', minute: s.minute, zone: s.zone, good: s.outcome === 'goal', who: jersey(s.playerId),
    what: s.outcome === 'goal' ? { en: 'Goal', is: 'Mark' } : s.outcome === 'saved' ? { en: 'Shot saved', is: 'Skot varið' }
      : s.outcome === 'blocked' ? { en: 'Shot blocked', is: 'Skot í blokk' } : { en: 'Shot missed', is: 'Skot fram hjá' },
  }))
  const saves: Tick[] = GK_SHOTS.map((g, i) => ({
    side: 'keeper', minute: Math.round(((i + 0.5) / GK_SHOTS.length) * 60), zone: g.zone, good: g.saved, who: jersey(g.keeperId),
    what: g.saved ? { en: 'Save', is: 'Varsla' } : { en: 'Goal conceded', is: 'Mark á sig' },
  }))
  const def: [string, Text, boolean][] = [
    ['hlynur', { en: 'Block', is: 'Blokk' }, true], ['kari', { en: 'Steal', is: 'Stolinn bolti' }, true],
    ['einar', { en: 'Duel won', is: 'Einvígi unnið' }, true], ['snorri', { en: 'Duel lost', is: 'Einvígi tapað' }, false],
    ['atli', { en: 'Rebound', is: 'Frákast' }, true], ['hlynur', { en: '2 minutes', is: '2 mínútur' }, false],
    ['breki', { en: 'Steal', is: 'Stolinn bolti' }, true], ['einar', { en: 'Block', is: 'Blokk' }, true],
  ]
  const defence: Tick[] = def.map(([id, what, good], i) => ({ side: 'defence', minute: 4 + i * 7, zone: null, good, who: jersey(id), what }))
  return [...shots, ...saves, ...defence].sort((a, b) => a.minute - b.minute)
}

const SIDE: Record<Side, Text> = {
  attack: { en: 'Attack', is: 'Sókn' },
  defence: { en: 'Defence', is: 'Vörn' },
  keeper: { en: 'Goalkeeping', is: 'Markvarsla' },
}

function useReducedMotion() {
  const [reduce] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  return reduce
}

function useFeed() {
  const feed = useMemo(() => buildFeed(), [])
  const reduce = useReducedMotion()
  // How many events have been "logged" so far; loops back after the final whistle
  const [n, setN] = useState(reduce ? 34 : 6)
  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setN(x => (x >= feed.length ? 6 : x + 1)), 1700)
    return () => clearInterval(id)
  }, [feed.length, reduce])
  return { feed, n, reduce }
}

/** Phone and tablet: the same live match, as one line. */
export function AuthTicker() {
  const t = useT()
  const { feed, n, reduce } = useFeed()
  const e = feed[n - 1]
  return (
    <div className="flex items-center gap-3 h-11 px-3.5 rounded-md bg-ink text-white text-[14px] overflow-hidden" aria-hidden="true">
      <span className={`w-2 h-2 rounded-full bg-[#4ade80] shrink-0 ${reduce ? '' : 'animate-pulse'}`} />
      <span key={n} className={`flex-1 min-w-0 flex gap-2 ${reduce ? '' : 'animate-[hs-in_400ms_cubic-bezier(0.22,1,0.36,1)]'}`}>
        <span className="text-white/55 shrink-0">{t(SIDE[e.side])}</span>
        <span className="truncate">{t(e.what)} · {e.who}</span>
      </span>
      <span className="text-white/55 num shrink-0">{e.minute}′</span>
    </div>
  )
}

export function AuthStage({ headline, sub }: { headline: string; sub: string }) {
  const t = useT()
  const { feed, n, reduce } = useFeed()

  const done = feed.slice(0, n)
  const last = done[done.length - 1]
  const tally = {
    goals: done.filter(e => e.side === 'attack' && e.good).length,
    shots: done.filter(e => e.side === 'attack').length,
    defence: done.filter(e => e.side === 'defence' && e.good).length,
    saves: done.filter(e => e.side === 'keeper' && e.good).length,
    faced: done.filter(e => e.side === 'keeper').length,
  }
  const recent = done.slice(-5).reverse()

  return (
    <div className="h-full flex flex-col gap-8 p-8 xl:p-12 bg-ink text-white overflow-hidden">
      <div className="flex flex-col gap-4">
        <h1 className="text-[48px] xl:text-[64px] font-bold uppercase tracking-[-0.03em] leading-[1.02] max-w-[14ch] [text-wrap:balance]">{headline}</h1>
        <p className="text-[17px] leading-snug text-white/80 max-w-[44ch]">{sub}</p>
      </div>

      {/* The goal: zones light where the last shot went */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <BigGoal zone={last?.zone ?? null} good={last?.good ?? false} side={last?.side ?? 'attack'} pulse={n} />
      </div>

      <div className="flex flex-col gap-4" data-ui>
        <dl className="grid grid-cols-3 gap-2" aria-label={t({ en: 'Sample match, live', is: 'Sýnidæmi, í beinni' })}>
          <Tally label={t(SIDE.attack)} value={`${tally.goals}/${tally.shots}`} note={t({ en: 'goals', is: 'mörk' })} />
          <Tally label={t(SIDE.defence)} value={`${tally.defence}`} note={t({ en: 'won balls', is: 'unnir boltar' })} />
          <Tally label={t(SIDE.keeper)} value={`${tally.saves}/${tally.faced}`} note={t({ en: 'saves', is: 'varin' })} />
        </dl>
        <div className="rounded-lg bg-white/[0.07] pb-1.5">
          <div className="flex items-center justify-between px-4 h-10 text-[13px]">
            <span className="flex items-center gap-2 font-medium">
              <span className={`w-2 h-2 rounded-full bg-[#4ade80] ${reduce ? '' : 'animate-pulse'}`} aria-hidden="true" />{HOME}
            </span>
            <span className="text-white/60 num">{last?.minute ?? 0}′</span>
          </div>
          <ul className="text-[14px]" aria-hidden="true">
            {recent.map((e, i) => (
              <li key={`${n}-${i}`} className={`grid grid-cols-[96px_1fr_auto_36px] gap-3 px-4 py-2  ${i === 0 && !reduce ? 'animate-[hs-in_400ms_cubic-bezier(0.22,1,0.36,1)]' : ''} ${i > 2 ? 'opacity-45' : ''}`}>
                <span className="text-white/55 truncate">{t(SIDE[e.side])}</span>
                <span className={`truncate ${e.good ? 'text-white' : 'text-white/70'}`}>{t(e.what)}</span>
                <span className="text-white/55 truncate">{e.who}</span>
                <span className="text-right text-white/55 num">{e.minute}′</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-white/50">{t({ en: 'Sample match. Your own data stays in your account.', is: 'Sýnileikur. Þín gögn haldast í þínum aðgangi.' })}</p>
      </div>
    </div>
  )
}

function Tally({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg bg-white/[0.07] px-3 py-2.5 min-w-0">
      <dt className="text-[13px] text-white/60 truncate">{label}</dt>
      <dd className="text-[24px] font-semibold num leading-tight">{value}</dd>
      <dd className="text-[13px] text-white/50 truncate">{note}</dd>
    </div>
  )
}

/** The logo's nine-zone goal as a real goal face: 3 m × 2 m, posts and bar in white. */
function BigGoal({ zone, good, side, pulse }: { zone: Zone | null; good: boolean; side: Side; pulse: number }) {
  const lit = side !== 'defence' ? zone : null
  return (
    <div className="h-full max-h-[340px] aspect-[3/2] max-w-full border-[6px] border-b-0 border-white p-1.5" aria-hidden="true">
      <div className="grid grid-cols-3 grid-rows-3 gap-1.5 w-full h-full">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(z => (
          <div key={z === lit ? `${z}-${pulse}` : z}
            className={`rounded-[3px] transition-colors duration-500 ${
              z === lit ? (good ? 'bg-accent animate-[hs-pop_500ms_cubic-bezier(0.22,1,0.36,1)]' : 'bg-white/30 animate-[hs-pop_500ms_cubic-bezier(0.22,1,0.36,1)]') : 'bg-white/[0.06]'
            }`} />
        ))}
      </div>
    </div>
  )
}
