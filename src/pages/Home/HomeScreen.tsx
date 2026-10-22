// Home — the first screen after sign-in.
// tasteskill app style "Achromatic ledger" (seed 1458700562), shell redrawn to
// "No sidebar": the product has three destinations and every other screen is
// a full-screen tool. The screen's question: "What's next for my team, and how
// is the season going?" Colour only on data: wins in cobalt, the rest in ink.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMatchHistory, getMatchEventsForMatches, type MatchWithTeams } from '@/lib/supabase/dashboardQueries'
import { getMyTeams, getMatchById, getTeamById, getPlayersByTeam } from '@/lib/supabase/queries'
import { getSavedSession } from '@/store/matchStore'
import { useLang, useT, PRODUCT_NAME } from '@/lib/i18n/lang'
import { LogoMark } from '@/components/brand/Logo'
import { LangToggle } from '@/components/ui'

interface Props {
  teamId: string | null
  isAdmin: boolean
  userEmail: string
  hasSavedMatch: boolean
  onNewMatch: () => void
  onResumeMatch: () => void
  onDashboard: () => void
  onAdmin: () => void
  onSignOut: () => void
}

type Result = 'W' | 'D' | 'L'
interface Played { id: string; date: string | null; opponent: string; home: boolean; gf: number; ga: number; result: Result; competition: string | null; seasonId: string | null }

function toPlayed(m: MatchWithTeams, teamId: string): Played | null {
  if (m.home_score == null || m.away_score == null) return null
  const home = m.home_team_id === teamId
  const gf = home ? m.home_score : m.away_score
  const ga = home ? m.away_score : m.home_score
  return {
    id: m.id, date: m.match_date, home, gf, ga,
    opponent: (home ? m.away_team?.name : m.home_team?.name) ?? '—',
    result: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
    competition: m.competition?.name ?? null,
    seasonId: m.competition?.season_id ?? null,
  }
}

const RESULT_WORD = {
  W: { en: 'Win', is: 'Sigur' },
  D: { en: 'Draw', is: 'Jafntefli' },
  L: { en: 'Loss', is: 'Tap' },
}

export function HomeScreen(p: Props) {
  const t = useT()
  const lang = useLang(s => s.lang)

  const teamsQ = useQuery({ queryKey: ['my-teams'], queryFn: getMyTeams })
  const team = teamsQ.data?.find(x => x.id === p.teamId) ?? null

  const matchesQ = useQuery({
    queryKey: ['match-history', p.teamId],
    queryFn: async () => getMatchHistory(p.teamId!),
    enabled: !!p.teamId,
  })

  // The live match saved on this device, with its opponent's name
  const saved = p.hasSavedMatch ? getSavedSession() : null
  const liveQ = useQuery({
    queryKey: ['live-match', saved?.matchId],
    enabled: !!saved,
    queryFn: async () => {
      const m = await getMatchById(saved!.matchId)
      if (!m) return null
      const oppId = m.home_team_id === m.tracked_team_id ? m.away_team_id : m.home_team_id
      const opp = await getTeamById(oppId)
      return { match: m, opponent: opp?.name ?? '—' }
    },
  })

  const played = useMemo(() => {
    if (!p.teamId || !matchesQ.data) return []
    return matchesQ.data.map(m => toPlayed(m, p.teamId!)).filter((x): x is Played => !!x)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [matchesQ.data, p.teamId])

  // "This season" = the season of the most recent match (all matches if it has none)
  const season = useMemo(() => {
    const sid = played[0]?.seasonId ?? null
    return sid ? played.filter(m => m.seasonId === sid) : played
  }, [played])
  const record = { W: season.filter(m => m.result === 'W').length, D: season.filter(m => m.result === 'D').length, L: season.filter(m => m.result === 'L').length }
  const gf = season.reduce((s, m) => s + m.gf, 0)
  const ga = season.reduce((s, m) => s + m.ga, 0)
  const last = played[0] ?? null

  // Who scored in the last match, and how we shot — from its events
  const lastEventsQ = useQuery({
    queryKey: ['match-events', last ? [last.id] : []],
    queryFn: async () => getMatchEventsForMatches(last ? [last.id] : []),
    enabled: !!last,
  })
  const playersQ = useQuery({
    queryKey: ['players', p.teamId],
    queryFn: async () => getPlayersByTeam(p.teamId!),
    enabled: !!p.teamId && !!last,
  })
  const lastDetail = useMemo(() => {
    if (!last || !lastEventsQ.data || !p.teamId) return null
    const shots = lastEventsQ.data.filter(e => e.event_type === 'SHOT' && e.team_id === p.teamId)
    const goals = shots.filter(e => e.sub_type === 'goal')
    const byPlayer = new Map<string, { goals: number; shots: number }>()
    for (const e of shots) {
      if (!e.player_id) continue
      const r = byPlayer.get(e.player_id) ?? { goals: 0, shots: 0 }
      r.shots++; if (e.sub_type === 'goal') r.goals++
      byPlayer.set(e.player_id, r)
    }
    const names = new Map((playersQ.data ?? []).map(pl => [pl.id, pl]))
    const top = [...byPlayer.entries()].filter(([, r]) => r.goals > 0)
      .sort((a, b) => b[1].goals - a[1].goals || a[1].shots - b[1].shots).slice(0, 3)
      .map(([id, r]) => {
        const pl = names.get(id)
        return { id, name: pl ? `${pl.first_name}` : '—', jersey: pl?.jersey_number ?? null, ...r }
      })
    return { goals: goals.length, shots: shots.length, top }
  }, [last, lastEventsQ.data, playersQ.data, p.teamId])

  const finding = !p.teamId
    ? t({ en: 'Set up your team to start logging matches.', is: 'Settu upp liðið til að byrja að skrá leiki.' })
    : season.length === 0
      ? t({ en: 'No finished matches yet. Your first one starts here.', is: 'Engir leiknir leikir enn. Sá fyrsti byrjar hér.' })
      : lang === 'is'
        ? `${season.length} leikir á tímabilinu: ${record.W} sigrar, ${record.D} jafntefli, ${record.L} töp.`
        : `${season.length} ${season.length === 1 ? 'match' : 'matches'} this season: ${record.W} won, ${record.D} drawn, ${record.L} lost.`

  const live = saved && liveQ.data
  const primary = 'h-9 px-4 rounded-md bg-[#111214] text-white text-[14px] font-medium hover:bg-black active:scale-[0.98] transition whitespace-nowrap'
  const secondary = 'h-9 px-4 rounded-md bg-[#e5e5e5] text-ink text-[14px] font-medium hover:bg-[#dadada] active:scale-[0.98] transition whitespace-nowrap'
  const card = 'bg-white border border-line rounded-lg'

  return (
    <div className="min-h-svh bg-ground text-ink">
      <a href="#home-main" className="absolute left-4 -top-16 focus:top-3 z-10 px-3 py-2 rounded-md bg-ink text-white text-[14px] transition-[top]">{t({ en: 'Skip to content', is: 'Fara í efni' })}</a>
      {/* Top bar: the product, the scope, the account */}
      <header className="h-12 border-b border-line bg-ground">
        <div className="h-full max-w-[1136px] mx-auto px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <LogoMark size={20} />
            <span className="font-bold uppercase tracking-tight text-[15px] whitespace-nowrap hidden sm:inline">{PRODUCT_NAME[lang]}</span>
            {team && (<><span className="text-muted hidden sm:inline" aria-hidden="true">/</span><span className="text-[14px] truncate">{team.name}</span></>)}
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <LangToggle />
            {p.isAdmin && (
              <button type="button" onClick={p.onAdmin} className="h-8 px-2 text-[14px] text-muted hover:text-ink transition-colors">
                {t({ en: 'Admin', is: 'Stjórnun' })}
              </button>
            )}
            <span className="text-[13px] text-muted hidden md:inline max-w-[220px] truncate">{p.userEmail}</span>
            <button type="button" onClick={p.onSignOut} className="h-8 px-2 text-[14px] text-muted hover:text-ink transition-colors">
              {t({ en: 'Sign out', is: 'Skrá út' })}
            </button>
          </div>
        </div>
      </header>

      <main id="home-main" tabIndex={-1} className="max-w-[1136px] mx-auto px-4 sm:px-6 pt-8 pb-16 flex flex-col gap-4 outline-none">
        {/* Title row */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-2">
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold leading-tight truncate">
              {team?.name ?? t({ en: 'Get started', is: 'Byrjaðu hér' })}
            </h1>
            <p className="text-[15px] text-muted mt-1">{finding}</p>
          </div>
          {p.teamId && (
            <div className="flex gap-2">
              <button type="button" onClick={p.onDashboard} className={secondary}>{t({ en: 'Season dashboard', is: 'Tölur tímabilsins' })}</button>
              <button type="button" onClick={p.onNewMatch} className={live ? secondary : primary}>
                {t({ en: 'New match', is: 'Nýr leikur' })}
              </button>
            </div>
          )}
        </div>

        {/* A match in progress on this device comes first */}
        {saved && (
          <section className={`${card} p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4`} aria-labelledby="live-h">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2 h-2 rounded-full bg-accent flex-none" aria-hidden="true" />
              <div className="min-w-0">
                <h2 id="live-h" className="text-[16px] font-medium">
                  {t({ en: 'Match in progress', is: 'Leikur í gangi' })}
                  {live ? <span className="text-muted font-normal"> · {t({ en: 'vs', is: 'gegn' })} {liveQ.data!.opponent}</span> : null}
                </h2>
                <p className="text-[14px] text-muted num">
                  {t({ en: 'Period', is: 'Hálfleikur' })} {saved.period} · {saved.matchMinute}′ · {t({ en: 'saved on this device', is: 'vistað á þessu tæki' })}
                </p>
              </div>
            </div>
            <button type="button" onClick={p.onResumeMatch} className={primary}>{t({ en: 'Resume match', is: 'Halda áfram' })}</button>
          </section>
        )}

        {!p.teamId ? <FirstRun onNewMatch={p.onNewMatch} primary={primary} /> : (<>
        {/* Season form + last match */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <section className={`${card} lg:col-span-2 p-5 flex flex-col gap-4`} aria-labelledby="form-h">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="form-h" className="text-[16px] font-medium">{t({ en: 'Season form', is: 'Gengi tímabilsins' })}</h2>
              <span className="text-[13px] text-muted">{t({ en: 'Goal difference per match, oldest first', is: 'Markamunur í hverjum leik, elsti fyrst' })}</span>
            </div>
            {matchesQ.isLoading && p.teamId ? (
              <div className="h-[168px] rounded-md bg-[#f1f3f5]" role="status" aria-label="Loading" />
            ) : matchesQ.isError ? (
              <BlockError onRetry={() => matchesQ.refetch()} />
            ) : season.length === 0 ? (
              <EmptyLine text={t({ en: 'Your form appears here after your first finished match.', is: 'Gengið birtist hér eftir fyrsta leikinn.' })} />
            ) : (
              <>
                <FormStrip matches={[...season].reverse().slice(-12)} />
                <dl className="grid grid-cols-3 sm:grid-cols-5 gap-x-6 gap-y-3 pt-1">
                  <Kpi label={t({ en: 'Won', is: 'Sigrar' })} value={record.W} accent />
                  <Kpi label={t({ en: 'Drawn', is: 'Jafntefli' })} value={record.D} />
                  <Kpi label={t({ en: 'Lost', is: 'Töp' })} value={record.L} />
                  <Kpi label={t({ en: 'Goals for', is: 'Skoruð mörk' })} value={gf} />
                  <Kpi label={t({ en: 'Goals against', is: 'Fengin mörk' })} value={ga} />
                </dl>
              </>
            )}
          </section>

          <section className={`${card} p-5 flex flex-col gap-3`} aria-labelledby="last-h">
            <h2 id="last-h" className="text-[16px] font-medium">{t({ en: 'Last match', is: 'Síðasti leikur' })}</h2>
            {matchesQ.isLoading && p.teamId ? (
              <div className="h-[120px] rounded-md bg-[#f1f3f5]" role="status" aria-label="Loading" />
            ) : !last ? (
              <EmptyLine text={t({ en: 'No finished matches yet.', is: 'Engir leiknir leikir enn.' })} />
            ) : (
              <>
                <p className="text-[15px]">
                  {t({ en: 'vs', is: 'gegn' })} <span className="font-medium">{last.opponent}</span>
                  <span className="text-muted"> · {last.home ? t({ en: 'home', is: 'heima' }) : t({ en: 'away', is: 'úti' })}</span>
                </p>
                <p className="flex items-baseline gap-3">
                  <span className={`text-[32px] font-semibold leading-none num ${last.result === 'W' ? 'text-accent' : ''}`}>{last.gf}–{last.ga}</span>
                  <span className="text-[14px] text-muted">{t(RESULT_WORD[last.result])}</span>
                </p>
                <p className="text-[14px] text-muted">
                  {formatDate(last.date, lang)}{last.competition ? ` · ${last.competition}` : ''}
                </p>
                {lastDetail && lastDetail.shots > 0 && (
                  <div className="flex flex-col gap-2 pt-3 mt-1 border-t border-[#eef0f2]">
                    <p className="flex justify-between text-[14px]">
                      <span className="text-muted">{t({ en: 'Shooting', is: 'Skotnýting' })}</span>
                      <span className="num"><span className="font-medium">{lastDetail.goals}/{lastDetail.shots}</span><span className="text-muted"> · {Math.round(lastDetail.goals / lastDetail.shots * 100)}%</span></span>
                    </p>
                    {lastDetail.top.length > 0 && (
                      <>
                        <p className="text-[13px] text-muted">{t({ en: 'Top scorers', is: 'Markahæstir' })}</p>
                        <ul className="flex flex-col gap-1">
                          {lastDetail.top.map(x => (
                            <li key={x.id} className="flex justify-between text-[14px]">
                              <span><span className="text-muted num inline-block min-w-[26px]">{x.jersey ?? ''}</span>{x.name}</span>
                              <span className="num"><span className="font-medium">{x.goals}</span><span className="text-muted">/{x.shots}</span></span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
                <button type="button" onClick={p.onDashboard} className="mt-auto self-start text-[14px] font-medium underline underline-offset-4 decoration-transparent hover:decoration-current transition-colors">
                  {t({ en: 'Open in the season dashboard', is: 'Opna í tölum tímabilsins' })}
                </button>
              </>
            )}
          </section>
        </div>

        {/* Recent matches + teams */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <section className={`${card} lg:col-span-2`} aria-labelledby="recent-h">
            <div className="flex items-baseline justify-between gap-4 px-5 pt-4 pb-2">
              <h2 id="recent-h" className="text-[16px] font-medium">{t({ en: 'Recent matches', is: 'Nýlegir leikir' })}</h2>
              {played.length > 0 && (
                <button type="button" onClick={p.onDashboard} className="text-[14px] text-muted hover:text-ink transition-colors num">
                  {t({ en: 'View all', is: 'Sjá alla' })} ({played.length})
                </button>
              )}
            </div>
            {played.length === 0 ? (
              <div className="px-5 pb-5"><EmptyLine text={t({ en: 'Finished matches are listed here.', is: 'Leiknir leikir birtast hér.' })} /></div>
            ) : (
              <ul>
                {played.slice(0, 4).map(m => (
                  <li key={m.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[96px_1fr_auto_64px] items-center gap-x-4 gap-y-0.5 px-5 py-3 border-t border-[#eef0f2]">
                    <span className="text-[13px] text-muted num order-3 sm:order-none">{formatDate(m.date, lang)}</span>
                    <span className="text-[15px] truncate">{m.opponent}<span className="text-muted text-[13px]"> · {m.home ? t({ en: 'home', is: 'heima' }) : t({ en: 'away', is: 'úti' })}</span></span>
                    <span className={`text-[15px] font-medium num text-right ${m.result === 'W' ? 'text-accent' : ''}`}>{m.gf}–{m.ga}</span>
                    <span className="text-[13px] text-muted text-right hidden sm:inline">{t(RESULT_WORD[m.result])}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${card} p-5 flex flex-col gap-3`} aria-labelledby="teams-h">
            <h2 id="teams-h" className="text-[16px] font-medium">{t({ en: 'Your teams', is: 'Liðin þín' })}</h2>
            {teamsQ.isLoading ? (
              <div className="h-[72px] rounded-md bg-[#f1f3f5]" role="status" aria-label="Loading" />
            ) : (teamsQ.data ?? []).length === 0 ? (
              <EmptyLine text={t({ en: 'You add your team when you set up your first match.', is: 'Þú bætir liðinu við þegar þú setur upp fyrsta leikinn.' })} />
            ) : (
              <ul className="flex flex-col">
                {(teamsQ.data ?? []).map(x => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-2 border-t border-[#eef0f2] first:border-t-0">
                    <span className="text-[15px] truncate">{x.name}</span>
                    {x.id === p.teamId && <span className="text-[12px] font-medium px-2 py-0.5 rounded bg-[#eef0f3] text-ink flex-none">{t({ en: 'Main team', is: 'Aðallið' })}</span>}
                  </li>
                ))}
              </ul>
            )}
            {p.teamId && (
              <button type="button" onClick={p.onDashboard} className="mt-auto self-start text-[14px] font-medium underline underline-offset-4 decoration-transparent hover:decoration-current transition-colors">
                {t({ en: 'Manage teams in the season dashboard', is: 'Stjórna liðum í tölum tímabilsins' })}
              </button>
            )}
          </section>
        </div>
        </>)}
      </main>
    </div>
  )
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

/** First run: the setup steps, in order, with the one action that starts them. */
function FirstRun({ onNewMatch, primary }: { onNewMatch: () => void; primary: string }) {
  const t = useT()
  const steps = [
    { title: { en: 'Add your team and players', is: 'Bættu við liðinu og leikmönnum' }, body: { en: 'Names, jersey numbers and goalkeepers. You do this once.', is: 'Nöfn, treyjunúmer og markmenn. Þetta gerirðu einu sinni.' } },
    { title: { en: 'Set the match and the roster', is: 'Settu upp leikinn og hópinn' }, body: { en: 'Opponent, home or away, competition, and who starts.', is: 'Mótherji, heima eða úti, keppni og byrjunarlið.' } },
    { title: { en: 'Log it courtside', is: 'Skráðu við völlinn' }, body: { en: 'Every throw in a few taps. The stats build as you go.', is: 'Hvert skot í nokkrum snertingum. Tölurnar verða til jafnóðum.' } },
  ]
  return (
    <section className="bg-white border border-line rounded-lg" aria-labelledby="first-h">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-5 pb-4">
        <div>
          <h2 id="first-h" className="text-[16px] font-medium">{t({ en: 'Your first match', is: 'Fyrsti leikurinn' })}</h2>
          <p className="text-[14px] text-muted mt-0.5">{t({ en: 'About five minutes to set up, then you are ready for the whistle.', is: 'Um fimm mínútur að setja upp, svo ertu klár fyrir flautið.' })}</p>
        </div>
        <button type="button" onClick={onNewMatch} className={primary}>{t({ en: 'Set up a match', is: 'Setja upp leik' })}</button>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-3 border-t border-[#eef0f2]">
        {steps.map((st, i) => (
          <li key={i} className={`px-5 py-4 flex flex-col gap-1 ${i > 0 ? 'border-t md:border-t-0 md:border-l border-[#eef0f2]' : ''}`}>
            <span className="text-[15px] font-medium">{t(st.title)}</span>
            <span className="text-[14px] text-muted">{t(st.body)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Kpi({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={`text-[24px] font-medium leading-tight num ${accent ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  )
}

/** Signature element: each match a column above or below the line by its goal difference. */
function FormStrip({ matches }: { matches: Played[] }) {
  const lang = useLang(s => s.lang)
  const max = Math.max(4, ...matches.map(m => Math.abs(m.gf - m.ga)))
  return (
    <div className="relative flex-1 flex flex-col min-h-[150px]" role="img"
      aria-label={matches.map(m => `${m.opponent} ${m.gf}–${m.ga}`).join(', ')}>
      <div className="flex-1 flex items-stretch gap-1.5">
        {matches.map(m => {
          const d = m.gf - m.ga
          const h = `${Math.max(4, (Math.abs(d) / max) * 100)}%`
          return (
            <div key={m.id} className="flex-1 min-w-0 flex flex-col" title={`${m.opponent} ${m.gf}–${m.ga}`}>
              <div className="flex-1 flex items-end">
                {d > 0 && <div className="w-full bg-accent rounded-t-sm" style={{ height: h }} />}
              </div>
              <div className={`h-[2px] flex-none ${d === 0 ? 'bg-ink' : 'bg-[#cfd4db]'}`} />
              <div className="flex-1 flex items-start">
                {d < 0 && <div className="w-full bg-ink rounded-b-sm" style={{ height: h }} />}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {matches.map(m => (
          <span key={m.id} className="flex-1 min-w-0 text-center text-[12px] text-muted num truncate">{m.gf - m.ga > 0 ? '+' : ''}{m.gf - m.ga}</span>
        ))}
      </div>
      <p className="sr-only">{lang === 'is' ? 'Markamunur hvers leiks' : 'Goal difference of each match'}</p>
    </div>
  )
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="text-[14px] text-muted border border-dashed border-[#cfd4db] rounded-lg px-3 py-2.5">{text}</p>
  )
}

function BlockError({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  return (
    <p className="text-[14px] flex items-center gap-3">
      <span className="w-2 h-2 rounded-full bg-[#c4242a]" aria-hidden="true" />
      {t({ en: 'Couldn’t load your matches.', is: 'Ekki tókst að sækja leikina.' })}
      <button type="button" onClick={onRetry} className="font-medium underline underline-offset-4">{t({ en: 'Retry', is: 'Reyna aftur' })}</button>
    </p>
  )
}

function formatDate(iso: string | null, lang: 'en' | 'is') {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  return d.toLocaleDateString(lang === 'is' ? 'is-IS' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
