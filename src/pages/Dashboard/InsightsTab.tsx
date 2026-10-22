// Insight tab: patterns the app finds on its own in the selected matches.
// The finder (src/lib/insights/engine.ts) runs hundreds of comparisons and
// keeps only those that survive a correction for multiple testing.
import { useMemo, useState } from 'react'
import type { Event, Player, CourtLineup } from '@/lib/db/schema'
import type { MatchWithTeams } from '@/lib/supabase/dashboardQueries'
import { findInsights, type Insight, type InsightArea, type Level } from '@/lib/insights/engine'
import { InsightChart } from '@/components/insights/InsightChart'
import { useT, type Text } from '@/lib/i18n/lang'
import { EmptyLine, Spinner } from '@/components/ui'

type Filter = 'all' | InsightArea

const AREA_TEXT: Record<InsightArea, Text> = {
  attack: { en: 'Attack', is: 'Sókn' },
  defence: { en: 'Defence', is: 'Vörn' },
  keeper: { en: 'Goalkeeping', is: 'Markvarsla' },
  lineup: { en: 'On court', is: 'Inni á velli' },
  match: { en: 'Matches & time', is: 'Leikir og tími' },
}

const LEVEL: Record<Level, { text: Text; cls: string; hint: Text }> = {
  strong: {
    text: { en: 'Strong', is: 'Sterkt' }, cls: 'bg-ink text-white',
    hint: { en: 'Very unlikely to be chance, even after the correction.', is: 'Mjög ólíklegt að sé tilviljun, líka eftir leiðréttingu.' },
  },
  likely: {
    text: { en: 'Likely', is: 'Líklegt' }, cls: 'bg-white text-ink border border-ink',
    hint: { en: 'Probably real — worth checking on video.', is: 'Líklega raunverulegt — vert að skoða á myndbandi.' },
  },
  hint: {
    text: { en: 'Worth a look', is: 'Vert að skoða' }, cls: 'bg-[#eef0f3] text-muted',
    hint: { en: 'Unusual on its own, but with this many comparisons it could still be chance.', is: 'Óvenjulegt eitt og sér, en með svona mörgum samanburðum gæti það verið tilviljun.' },
  },
}

export function InsightsTab({ events, players, lineups, matches, trackedTeamId, loading }: {
  events: Event[]
  players: Player[]
  lineups: CourtLineup[]
  matches: MatchWithTeams[]
  trackedTeamId: string
  loading: boolean
}) {
  const t = useT()
  const [filter, setFilter] = useState<Filter>('all')
  const result = useMemo(
    () => findInsights({ events, players, lineups, matches, trackedTeamId }),
    [events, players, lineups, matches, trackedTeamId],
  )
  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>

  const counts = result.insights.reduce<Record<string, number>>((a, i) => { a[i.area] = (a[i.area] ?? 0) + 1; return a }, {})
  const shown = filter === 'all' ? result.insights : result.insights.filter(i => i.area === filter)
  const areas = (Object.keys(AREA_TEXT) as InsightArea[]).filter(a => counts[a])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px] font-semibold">{t({ en: 'Insight', is: 'Innsýn' })}</h2>
        <p className="text-[15px] text-muted max-w-[70ch]">
          {result.enough
            ? t({
              en: `Patterns the app found on its own in ${matches.length} ${matches.length === 1 ? 'match' : 'matches'}: ${result.insights.length} of ${result.tested} comparisons stood out.`,
              is: `Mynstur sem appið fann sjálft í ${matches.length} ${matches.length === 1 ? 'leik' : 'leikjum'}: ${result.insights.length} af ${result.tested} samanburðum stóðu upp úr.`,
            })
            : t({ en: 'Patterns the app finds on its own in the selected matches.', is: 'Mynstur sem appið finnur sjálft í völdum leikjum.' })}
        </p>
      </div>

      <HowItWorks tested={result.tested} />

      {!result.enough ? (
        <EmptyLine>
          {t({
            en: `Not enough data yet: the finder needs at least 60 logged shots in the selected matches (now ${result.shots}). Select more matches, or log a few more.`,
            is: `Ekki næg gögn enn: það þarf að minnsta kosti 60 skráð skot í völdum leikjum (nú ${result.shots}). Veldu fleiri leiki eða skráðu fleiri.`,
          })}
        </EmptyLine>
      ) : result.insights.length === 0 ? (
        <EmptyLine>
          {t({
            en: 'Nothing stands out in these matches: every comparison was within what chance would give. That is a finding too.',
            is: 'Ekkert stendur upp úr í þessum leikjum: allir samanburðir voru innan þess sem tilviljun gefur. Það er líka niðurstaða.',
          })}
        </EmptyLine>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t({ en: 'Show', is: 'Sýna' })}>
            {(['all', ...areas] as Filter[]).map(f => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                className={`h-9 px-3 rounded-md text-[14px] transition-colors ${filter === f ? 'bg-ink text-white' : 'bg-white border border-line text-ink hover:border-[#9aa0a8]'}`}>
                {f === 'all' ? t({ en: 'All', is: 'Allt' }) : t(AREA_TEXT[f])}{' '}
                <span className={`num ${filter === f ? 'text-white/70' : 'text-muted'}`}>{f === 'all' ? result.insights.length : counts[f]}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            {shown.map(i => <InsightCard key={i.id} insight={i} />)}
          </div>
        </>
      )}
    </div>
  )
}

function InsightCard({ insight: i }: { insight: Insight }) {
  const t = useT()
  const lv = LEVEL[i.level]
  return (
    <article className="bg-white border border-line rounded-lg p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[12px]">
        <span className={`px-2 py-0.5 rounded font-medium ${lv.cls}`} title={t(lv.hint)}>{t(lv.text)}</span>
        <span className="text-muted">{t(AREA_TEXT[i.area])}</span>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-[17px] font-semibold leading-snug">{t(i.title)}</h3>
        <p className="text-[14px] leading-relaxed">{t(i.detail)}</p>
      </div>
      <InsightChart chart={i.chart} />
      <p className="text-[12px] text-muted border-t border-[#eef0f2] pt-2">
        {t({ en: 'Based on', is: 'Byggt á' })}: {t(i.basis)}
      </p>
    </article>
  )
}

function HowItWorks({ tested }: { tested: number }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <section className="bg-white border border-line rounded-lg px-4 sm:px-5 py-3.5 text-[14px] leading-relaxed">
      <p>
        {t({
          en: 'How this works: the app compares everything it can in the selected matches — each player against teammates and against themselves, the team with a player on and off court, who passes to whom, goalkeeper zones, where opponents score from, ten-minute stretches, single matches against the rest, and stats that move together. Each comparison is a statistical test of whether the gap could just be chance, and only the ones that hold up are shown.',
          is: 'Svona virkar þetta: appið ber saman allt sem það getur í völdum leikjum — hvern leikmann við liðsfélagana og við sjálfan sig, liðið með leikmann inni á og utan vallar, hver sendir á hvern, svæði markmanna, hvaðan andstæðingar skora, tíu mínútna kafla, einstaka leiki við hina og tölur sem fylgjast að. Hver samanburður er tölfræðipróf á því hvort munurinn gæti verið tilviljun, og aðeins það sem stenst er sýnt.',
        })}
      </p>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="mt-1.5 text-[13px] text-muted hover:text-ink underline underline-offset-4">
        {open ? t({ en: 'Less detail', is: 'Minna' }) : t({ en: 'More detail', is: 'Nánar' })}
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3 text-[14px]">
          <p>
            {t({
              en: `Running many comparisons means some will look unusual by luck alone. So all ${tested} results are corrected together (the Benjamini–Hochberg method), which keeps the share of false alarms among the findings low.`,
              is: `Þegar margir samanburðir eru gerðir lítur sumt óvenjulega út af hreinni heppni. Því eru allar ${tested} niðurstöðurnar leiðréttar saman (Benjamini–Hochberg aðferðin), sem heldur hlutfalli falskra niðurstaðna lágu.`,
            })}
          </p>
          <ul className="flex flex-col gap-1.5">
            {(['strong', 'likely', 'hint'] as Level[]).map(l => (
              <li key={l} className="flex items-baseline gap-2">
                <span className={`shrink-0 px-2 py-0.5 rounded text-[12px] font-medium ${LEVEL[l].cls}`}>{t(LEVEL[l].text)}</span>
                <span>{t(LEVEL[l].hint)}</span>
              </li>
            ))}
          </ul>
          <p>
            {t({
              en: 'Small samples are never compared: a player needs at least 8 shots of a kind, on/off-court comparisons need 40 possessions each way, and match-by-match patterns need 6 matches. Gaps that are real but tiny are left out. Expected patterns (for example scoring more on fast breaks) are only flagged when they go the surprising way.',
              is: 'Lítil úrtök eru aldrei borin saman: leikmaður þarf að minnsta kosti 8 skot af sama tagi, samanburður inni á/utan vallar þarf 40 sóknir hvoru megin og mynstur milli leikja þarf 6 leiki. Raunverulegur en smávægilegur munur er ekki sýndur. Viðbúin mynstur (t.d. að skora meira úr hraðaupphlaupum) eru aðeins sýnd ef þau fara óvænta leið.',
            })}
          </p>
          <p>
            {t({
              en: 'On-court findings use the substitutions you log, so they appear once lineups are recorded. A finding is a pattern, not a cause — the more matches you select, the more reliable it gets.',
              is: 'Niðurstöður um leikmenn inni á velli nota skiptingarnar sem þú skráir, svo þær birtast þegar uppstillingar eru skráðar. Niðurstaða er mynstur, ekki orsök — því fleiri leiki sem þú velur, því áreiðanlegri verður hún.',
            })}
          </p>
        </div>
      )}
    </section>
  )
}
