// Postgame match report — what coaches share. Prints as a clean branded page,
// and "Copy summary" puts a short text version on the clipboard for the team
// chat.
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMatchStore, selectActiveEvents, selectTrackedScore, selectOpponentScore } from '@/store/matchStore'
import {
  computeAttack, computeDefense, computeGK,
  sumAttack, sumDefense, sumGK,
  pct, v,
  type AttackRow, type DefenseRow, type GKRow,
} from '@/lib/stats/matchStats'
import { computeIndices } from '@/lib/stats/indices'
import { IndexPanel } from '@/components/stats/IndexPanel'
import { MatchFlow } from '@/components/stats/MatchFlow'
import type { Player } from '@/lib/db/schema'
import { useLang, useT, PRODUCT_NAME, type Text } from '@/lib/i18n/lang'
import { T } from '@/lib/i18n/terms'
import { AppBar, Button } from '@/components/ui'
import { Wordmark } from '@/components/brand/Logo'

interface Props {
  onNewMatch: () => void
  onDashboard: () => void
}

export function MatchReport({ onNewMatch, onDashboard }: Props) {
  const t = useT()
  const lang = useLang(s => s.lang)
  const match = useMatchStore(s => s.match)
  const homeTeam = useMatchStore(s => s.homeTeam)
  const awayTeam = useMatchStore(s => s.awayTeam)
  const trackedPlayers = useMatchStore(useShallow(s => s.trackedPlayers))
  const events = useMatchStore(useShallow(selectActiveEvents))
  const trackedScore = useMatchStore(selectTrackedScore)
  const opponentScore = useMatchStore(selectOpponentScore)
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')

  const trackedTeamId = match?.tracked_team_id ?? ''
  const isTrackedHome = match?.home_team_id === match?.tracked_team_id
  const goalkeepers = useMemo(() => trackedPlayers.filter(p => p.position === 'goalkeeper'), [trackedPlayers])

  const attackStats = useMemo(() => computeAttack(events, trackedPlayers, trackedTeamId), [events, trackedPlayers, trackedTeamId])
  const defenseStats = useMemo(() => computeDefense(events, trackedPlayers, trackedTeamId), [events, trackedPlayers, trackedTeamId])
  const gkStats = useMemo(() => computeGK(events, goalkeepers, trackedTeamId), [events, goalkeepers, trackedTeamId])
  const indices = useMemo(() => computeIndices(events, trackedTeamId), [events, trackedTeamId])

  const atkTotals = useMemo(() => sumAttack(attackStats), [attackStats])
  const defTotals = useMemo(() => sumDefense(defenseStats), [defenseStats])

  const trackedTeam = isTrackedHome ? homeTeam : awayTeam
  const opponentTeam = isTrackedHome ? awayTeam : homeTeam
  const displayHome = isTrackedHome ? trackedScore : opponentScore
  const displayAway = isTrackedHome ? opponentScore : trackedScore
  const won = trackedScore > opponentScore
  const result: Text = won ? { en: 'Win', is: 'Sigur' } : trackedScore < opponentScore ? { en: 'Loss', is: 'Tap' } : { en: 'Draw', is: 'Jafntefli' }

  const locale = lang === 'is' ? 'is-IS' : 'en-GB'
  const matchDate = match?.match_date
    ? new Date(match.match_date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const shotEff = atkTotals.shots > 0 ? Math.round(atkTotals.goals / atkTotals.shots * 100) : 0

  // ── Copy summary for the team chat ──────────────────────────────────────────
  function summaryText() {
    const top = [...attackStats].filter(r => r.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 3)
    const lines = [
      `${homeTeam?.name ?? ''} ${displayHome}–${displayAway} ${awayTeam?.name ?? ''}`,
      matchDate ?? '',
      `${t(T.shootingPct)}: ${atkTotals.goals}/${atkTotals.shots} (${shotEff}%)`,
      top.length ? `${t({ en: 'Top scorers', is: 'Markahæstir' })}: ${top.map(r => `${r.player.first_name} ${r.goals}`).join(', ')}` : '',
      ...gkStats.filter(g => g.shotsFaced > 0).map(g => `${t(T.goalkeeper)}: ${g.player.first_name} ${g.saves}/${g.shotsFaced} (${pct(g.saves, g.shotsFaced)})`),
      atkTotals.turnovers > 0 ? `${t({ en: 'Turnovers', is: 'Tapaðir boltar' })}: ${atkTotals.turnovers}` : '',
      `— ${PRODUCT_NAME[lang]}`,
    ]
    return lines.filter(Boolean).join('\n')
  }
  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryText())
      setCopied('done')
    } catch {
      setCopied('failed')
    }
    setTimeout(() => setCopied('idle'), 2500)
  }

  return (
    <div className="min-h-svh bg-ground text-ink print:bg-white">
      <AppBar
        title={t({ en: 'Match report', is: 'Leikskýrsla' })}
        right={<Button variant="ghost" size="sm" onClick={onDashboard} className="hidden sm:inline-flex">{t({ en: 'Season dashboard', is: 'Tölur tímabilsins' })}</Button>}
      />

      <main className="max-w-[1136px] mx-auto px-4 sm:px-6 pt-8 pb-16 flex flex-col gap-4 print:pt-0 print:px-0">
        {/* Print-only brand line */}
        <div className="hidden print:flex items-center justify-between pb-2 border-b border-line">
          <span className="font-bold uppercase tracking-tight text-[15px]"><Wordmark size={18} /></span>
          <span className="text-[13px] text-muted">{t({ en: 'Match report', is: 'Leikskýrsla' })}</span>
        </div>

        {/* Title row with the actions */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 print:hidden">
          <div>
            <h1 className="text-[24px] font-semibold leading-tight">{t({ en: 'Match report', is: 'Leikskýrsla' })}</h1>
            <p className="text-[15px] text-muted mt-1">
              {t(result)} · {t({ en: 'built from', is: 'unnin úr' })} <span className="num">{events.length}</span> {t({ en: 'logged events', is: 'skráðum atburðum' })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copySummary} aria-live="polite">
              {copied === 'done' ? t({ en: 'Copied', is: 'Afritað' }) : copied === 'failed' ? t({ en: 'Copy failed', is: 'Afritun mistókst' }) : t({ en: 'Copy summary', is: 'Afrita samantekt' })}
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>{t({ en: 'Print or PDF', is: 'Prenta / PDF' })}</Button>
            <Button variant="primary" onClick={onNewMatch}>{t({ en: 'New match', is: 'Nýr leikur' })}</Button>
          </div>
        </div>

        {/* Score card */}
        <section className="bg-white border border-line rounded-lg px-5 py-6 sm:py-8" aria-label={t({ en: 'Final score', is: 'Lokastaða' })}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8">
            <div className="text-right min-w-0">
              <p className="text-[17px] sm:text-[22px] font-semibold truncate">
                <span className="sm:hidden">{homeTeam?.short_name ?? homeTeam?.name}</span><span className="hidden sm:inline">{homeTeam?.name}</span>
              </p>
              <p className="text-[13px] text-muted mt-0.5">{t(T.home)}</p>
            </div>
            <p className="text-[36px] sm:text-[44px] font-semibold leading-none num whitespace-nowrap">
              <span className={isTrackedHome && won ? 'text-accent' : ''}>{displayHome}</span>
              <span className="text-[#9aa0a8] mx-2">–</span>
              <span className={!isTrackedHome && won ? 'text-accent' : ''}>{displayAway}</span>
            </p>
            <div className="min-w-0">
              <p className="text-[17px] sm:text-[22px] font-semibold truncate">
                <span className="sm:hidden">{awayTeam?.short_name ?? awayTeam?.name}</span><span className="hidden sm:inline">{awayTeam?.name}</span>
              </p>
              <p className="text-[13px] text-muted mt-0.5">{t(T.away)}</p>
            </div>
          </div>
          {(matchDate || match?.venue) && (
            <p className="text-center text-[14px] text-muted mt-4">{[matchDate, match?.venue].filter(Boolean).join(' · ')}</p>
          )}
          <p className="text-center text-[13px] text-muted mt-1">
            {t({ en: 'Stats for', is: 'Tölfræði fyrir' })} <span className="text-ink font-medium">{trackedTeam?.name}</span> {t({ en: 'against', is: 'gegn' })} {opponentTeam?.name}
          </p>
        </section>

        {/* Team summary */}
        <section className="bg-white border border-line rounded-lg p-5" aria-labelledby="sum-h">
          <h2 id="sum-h" className="text-[16px] font-medium mb-4">{t({ en: 'Team summary', is: 'Samantekt liðs' })}</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-6 gap-y-4">
            <Kpi label={t(T.goals)} value={atkTotals.goals} accent />
            <Kpi label={t(T.shots)} value={atkTotals.shots} />
            <Kpi label={t(T.shootingPct)} value={`${shotEff}%`} />
            <Kpi label={t({ en: 'Turnovers', is: 'Tapaðir boltar' })} value={atkTotals.turnovers} />
            <Kpi label={t(T.twoMin)} value={defTotals.suspensions2min} />
            <Kpi label={t(T.fastBreak)} value={`${atkTotals.fbGoals}/${atkTotals.fbShots}`} />
            <Kpi label={t({ en: '7 m', is: 'Víti' })} value={`${atkTotals.penGoals}/${atkTotals.penShots}`} />
            <Kpi label={t({ en: 'Assists', is: 'Stoðsendingar' })} value={atkTotals.assists} />
          </dl>
        </section>

        <Standouts attack={attackStats} defense={defenseStats} gk={gkStats} />

        <ReportSection title={t({ en: 'Match flow', is: 'Gangur leiksins' })}>
          <MatchFlow events={events} trackedTeamId={trackedTeamId} myName={trackedTeam?.name} oppName={opponentTeam?.name} />
        </ReportSection>

        <ReportSection title={t(T.attack)}>
          <AttackReportTable rows={attackStats} totals={atkTotals} />
        </ReportSection>

        <ReportSection title={t(T.defence)}>
          <DefenseReportTable rows={defenseStats} totals={defTotals} />
        </ReportSection>

        {gkStats.length > 0 && (
          <ReportSection title={t(T.goalkeeping)}>
            <GKReportSection rows={gkStats} />
          </ReportSection>
        )}

        <ReportSection title={t(T.indices)}>
          <IndexPanel breakdown={indices} />
        </ReportSection>
      </main>
    </div>
  )
}

// ─── Standouts: one player per side of the game ──────────────────────────────

function Standouts({ attack, defense, gk }: { attack: AttackRow[]; defense: DefenseRow[]; gk: GKRow[] }) {
  const t = useT()
  const scorer = [...attack].filter(r => r.goals > 0)
    .sort((a, b) => b.goals - a.goals || (a.shots - b.shots))[0]
  const defScore = (r: DefenseRow) => r.blocks + r.interceptions + r.duelsWon + r.rebounds
  const defender = [...defense].filter(r => defScore(r) > 0).sort((a, b) => defScore(b) - defScore(a))[0]
  const keeper = [...gk].filter(r => r.shotsFaced > 0)
    .sort((a, b) => b.saves - a.saves || (b.saves / b.shotsFaced - a.saves / a.shotsFaced))[0]
  const name = (p: Player) => `${p.first_name} ${p.last_name}`.trim()
  const cards = [
    {
      area: t(T.attack), player: scorer?.player,
      big: scorer ? `${scorer.goals}` : null, unit: t({ en: 'goals', is: 'mörk' }),
      sub: scorer ? `${scorer.goals}/${scorer.shots} · ${pct(scorer.goals, scorer.shots)}${scorer.assists ? ` · ${scorer.assists} ${t({ en: 'assists', is: 'stoðs.' })}` : ''}` : '',
    },
    {
      area: t(T.defence), player: defender?.player,
      big: defender ? `${defScore(defender)}` : null, unit: t({ en: 'won balls', is: 'unnir boltar' }),
      sub: defender ? [
        defender.blocks && `${defender.blocks} ${t({ en: defender.blocks === 1 ? 'block' : 'blocks', is: 'blokk' })}`,
        defender.interceptions && `${defender.interceptions} ${t({ en: defender.interceptions === 1 ? 'steal' : 'steals', is: defender.interceptions === 1 ? 'stolinn' : 'stolnir' })}`,
        defender.duelsWon && `${defender.duelsWon} ${t({ en: defender.duelsWon === 1 ? 'duel won' : 'duels won', is: defender.duelsWon === 1 ? 'unnið einvígi' : 'unnin einvígi' })}`,
        defender.rebounds && `${defender.rebounds} ${t({ en: defender.rebounds === 1 ? 'rebound' : 'rebounds', is: defender.rebounds === 1 ? 'frákast' : 'fráköst' })}`,
      ].filter(Boolean).join(' · ') : '',
    },
    {
      area: t(T.goalkeeping), player: keeper?.player,
      big: keeper ? `${keeper.saves}` : null, unit: t({ en: 'saves', is: 'varin' }),
      sub: keeper ? `${keeper.saves}/${keeper.shotsFaced} · ${pct(keeper.saves, keeper.shotsFaced)}` : '',
    },
  ]
  return (
    <section aria-labelledby="standouts-h" className="flex flex-col gap-2 break-inside-avoid">
      <h2 id="standouts-h" className="text-[16px] font-medium">{t({ en: 'Standouts', is: 'Skáru fram úr' })}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {cards.map(c => (
          <div key={c.area} className="bg-white border border-line rounded-lg p-5 flex flex-col gap-1 min-w-0">
            <p className="text-[13px] text-muted">{c.area}</p>
            {c.player ? (
              <>
                <p className="text-[17px] font-medium truncate">
                  <span className="text-muted num mr-1.5">{c.player.jersey_number ?? ''}</span>{name(c.player)}
                </p>
                <p className="mt-1"><span className="text-[36px] font-semibold leading-none num text-accent">{c.big}</span> <span className="text-[14px] text-muted">{c.unit}</span></p>
                <p className="text-[13px] text-muted num">{c.sub}</p>
              </>
            ) : (
              <p className="text-[14px] text-muted">{t({ en: 'Nothing logged here.', is: 'Ekkert skráð hér.' })}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Kpi({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={`text-[24px] font-medium leading-tight num ${accent ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  )
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-line rounded-lg overflow-hidden break-inside-avoid">
      <h2 className="px-5 pt-4 pb-2 text-[16px] font-medium">{title}</h2>
      {children}
    </section>
  )
}

function Th({ children, left = false }: { children: React.ReactNode; left?: boolean }) {
  return <th className={`px-3 pb-2 ${left ? 'text-left' : 'text-right'} text-[12px] font-normal text-muted whitespace-nowrap`}>{children}</th>
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-right whitespace-nowrap ${className}`}>{children}</td>
}

const dim = (n: number) => (n > 0 ? 'text-ink' : 'text-[#9aa0a8]')
const rowCls = (totals: boolean) => `border-t ${totals ? 'border-[#d6dae1] bg-[#f5f6f8] font-semibold' : 'border-[#eef0f2] hover:bg-[#f8f9fa]'}`

function NameTd({ player }: { player?: Player }) {
  const t = useT()
  return (
    <td className="px-3 py-2 text-left whitespace-nowrap">
      {player ? (<><span className="text-muted num inline-block min-w-[28px]">{player.jersey_number ?? ''}</span>{player.first_name} {player.last_name}</>) : t(T.total)}
    </td>
  )
}

// ─── Attack report table ──────────────────────────────────────────────────────

function AttackReportRow({ r, player, isTotals = false }: { r: Omit<AttackRow, 'player'>; player?: Player; isTotals?: boolean }) {
  return (
    <tr className={rowCls(isTotals)}>
      <NameTd player={player} />
      <Td className={r.goals > 0 ? 'text-ink font-semibold' : 'text-[#9aa0a8]'}>{v(r.goals)}</Td>
      <Td className={dim(r.shots)}>{v(r.shots)}</Td>
      <Td className="text-muted">{pct(r.goals, r.shots)}</Td>
      <Td className={dim(r.penShots)}>{r.penGoals > 0 || r.penShots > 0 ? `${r.penGoals}/${r.penShots}` : '—'}</Td>
      <Td className={dim(r.fbShots)}>{r.fbGoals > 0 || r.fbShots > 0 ? `${r.fbGoals}/${r.fbShots}` : '—'}</Td>
      <Td className={dim(r.assists)}>{v(r.assists)}</Td>
      <Td className={dim(r.turnovers)}>{v(r.turnovers)}</Td>
      <Td className={dim(r.drewSuspension)}>{v(r.drewSuspension)}</Td>
      <Td className={dim(r.drewPenalty)}>{v(r.drewPenalty)}</Td>
    </tr>
  )
}

function AttackReportTable({ rows, totals }: { rows: AttackRow[]; totals: Omit<AttackRow, 'player'> }) {
  const t = useT()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px] num border-collapse">
        <thead>
          <tr>
            <Th left>{t(T.player)}</Th>
            <Th>{t(T.goals)}</Th><Th>{t(T.shots)}</Th><Th>%</Th>
            <Th>{t({ en: '7 m', is: 'Víti' })}</Th>
            <Th>{t(T.fastBreak)}</Th>
            <Th>{t({ en: 'Assists', is: 'Stoðs.' })}</Th>
            <Th>{t({ en: 'Turnovers', is: 'Tapaðir' })}</Th>
            <Th>{t({ en: 'Drew 2 min', is: 'Fengnar 2 mín' })}</Th>
            <Th>{t({ en: 'Drew 7 m', is: 'Fiskað víti' })}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => <AttackReportRow key={r.player.id} r={r} player={r.player} />)}
          <AttackReportRow r={totals} isTotals />
        </tbody>
      </table>
    </div>
  )
}

// ─── Defence report table ─────────────────────────────────────────────────────

function DefenseReportRow({ r, player, isTotals = false }: { r: Omit<DefenseRow, 'player'>; player?: Player; isTotals?: boolean }) {
  const neg = (n: number) => (n > 0 ? 'text-[#c4242a] font-medium' : 'text-[#9aa0a8]')
  return (
    <tr className={rowCls(isTotals)}>
      <NameTd player={player} />
      <Td className={r.blocks > 0 ? 'text-ink font-medium' : 'text-[#9aa0a8]'}>{v(r.blocks)}</Td>
      <Td className={r.interceptions > 0 ? 'text-ink font-medium' : 'text-[#9aa0a8]'}>{v(r.interceptions)}</Td>
      <Td className={dim(r.duels)}>{r.duels > 0 ? `${r.duelsWon}/${r.duels}` : '—'}</Td>
      <Td className="text-muted">{pct(r.duelsWon, r.duels)}</Td>
      <Td className={dim(r.rebounds)}>{v(r.rebounds)}</Td>
      <Td className={dim(r.freekick)}>{v(r.freekick)}</Td>
      <Td className={dim(r.penaltyAwarded)}>{v(r.penaltyAwarded)}</Td>
      <Td className={dim(r.yellowCards)}>{v(r.yellowCards)}</Td>
      <Td className={neg(r.suspensions2min)}>{v(r.suspensions2min)}</Td>
      <Td className={neg(r.redCards)}>{v(r.redCards)}</Td>
    </tr>
  )
}

function DefenseReportTable({ rows, totals }: { rows: DefenseRow[]; totals: Omit<DefenseRow, 'player'> }) {
  const t = useT()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px] num border-collapse">
        <thead>
          <tr>
            <Th left>{t(T.player)}</Th>
            <Th>{t(T.blocks)}</Th><Th>{t(T.steals)}</Th>
            <Th>{t(T.duels)}</Th><Th>%</Th>
            <Th>{t(T.rebounds)}</Th><Th>{t(T.freeThrows)}</Th><Th>{t(T.penConceded)}</Th>
            <Th>{t(T.yellow)}</Th><Th>{t(T.twoMin)}</Th><Th>{t(T.red)}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => <DefenseReportRow key={r.player.id} r={r} player={r.player} />)}
          <DefenseReportRow r={totals} isTotals />
        </tbody>
      </table>
    </div>
  )
}

// ─── Goalkeeping section ──────────────────────────────────────────────────────

function GKReportSection({ rows }: { rows: GKRow[] }) {
  const t = useT()
  const totals = useMemo(() => rows.length > 1 ? sumGK(rows) : null, [rows])

  return (
    <div className="divide-y divide-[#eef0f2]">
      {rows.map(gk => {
        const savePct = gk.shotsFaced > 0 ? Math.round(gk.saves / gk.shotsFaced * 100) : 0
        const ranges = [
          { label: t({ en: '7 m', is: 'Víti' }), saved: gk.savedPen, faced: gk.facedPen },
          { label: t(T.wing), saved: gk.savedCorn, faced: gk.facedCorn },
          { label: t(T.leftWing), saved: gk.savedCornLeft, faced: gk.facedCornLeft },
          { label: t(T.rightWing), saved: gk.savedCornRight, faced: gk.facedCornRight },
          { label: t(T.nineM), saved: gk.savedNineM, faced: gk.facedNineM },
          { label: t(T.sevenEight), saved: gk.savedS78, faced: gk.facedS78 },
          { label: t(T.sixM), saved: gk.savedS6m, faced: gk.facedS6m },
          { label: t(T.line), saved: gk.savedLine, faced: gk.facedLine },
        ].filter(x => x.faced > 0)
        return (
          <div key={gk.player.id} className="px-5 py-5 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
            <div className="flex flex-col gap-1">
              <p className="text-[15px] font-medium"><span className="text-muted num inline-block min-w-[28px]">{gk.player.jersey_number ?? ''}</span>{gk.player.first_name} {gk.player.last_name}</p>
              <p className={`text-[36px] font-semibold leading-none num ${savePct >= 40 ? 'text-accent' : ''}`}>{savePct}%</p>
              <p className="text-[14px] text-muted num">{gk.saves} {t({ en: 'saves of', is: 'varin af' })} {gk.shotsFaced} · {gk.shotsFaced - gk.saves} {t({ en: 'conceded', is: 'mörk á sig' })}</p>
              {(gk.emptyPhase > 0 || gk.positiveResponse > 0) && (
                <p className="text-[13px] text-muted mt-2">
                  {gk.emptyPhase > 0 && <span className="mr-3">{t(T.emptyPhase)}: <span className="text-ink num">{gk.emptyPhase}</span></span>}
                  {gk.positiveResponse > 0 && <span>{t(T.positiveResponse)}: <span className="text-ink num">{gk.positiveResponse}</span></span>}
                </p>
              )}
            </div>
            <ul className="flex flex-col gap-2 self-center">
              {ranges.map(x => (
                <li key={x.label} className="grid grid-cols-[96px_1fr_64px_44px] items-center gap-3 text-[14px]">
                  <span>{x.label}</span>
                  <span className="h-1.5 rounded-full bg-[#eef0f2] overflow-hidden"><span className="block h-full bg-ink" style={{ width: `${(x.saved / x.faced) * 100}%` }} /></span>
                  <span className="text-right num">{x.saved}/{x.faced}</span>
                  <span className="text-right text-muted num">{pct(x.saved, x.faced)}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {totals && (
        <div className="px-5 py-4 bg-[#f5f6f8] flex flex-wrap gap-x-8 gap-y-2 text-[14px]">
          <span className="font-medium">{t(T.total)}</span>
          <span>{t(T.saves)}: <span className="num font-medium">{totals.saves}</span></span>
          <span>{t({ en: 'Shots faced', is: 'Fjöldi skota' })}: <span className="num font-medium">{totals.shotsFaced}</span></span>
          <span>{t(T.savePct)}: <span className="num font-medium">{totals.shotsFaced > 0 ? Math.round(totals.saves / totals.shotsFaced * 100) : 0}%</span></span>
        </div>
      )}
    </div>
  )
}
