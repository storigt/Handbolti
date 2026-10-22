import { useState, useMemo } from 'react'
import type { Event, Player } from '@/lib/db/schema'
import type { MatchWithTeams } from '@/lib/supabase/dashboardQueries'
import { buildCSV, buildRawCSV, downloadCSV, type ExportStatsType, type RawMatchInfo } from '@/lib/stats/exportCsv'
import { MinuteInput } from './MinuteFilter'
import type { MinuteRange } from './MinuteFilter'
import { useT, useLang } from '@/lib/i18n/lang'
import { T } from '@/lib/i18n/terms'
import { Button } from '@/components/ui'

interface Props {
  onClose: () => void
  allEvents: Event[]
  players: Player[]
  matches: MatchWithTeams[]
  trackedTeamId: string
  trackedTeamName: string
}

export function ExportModal({ onClose, allEvents, players, matches, trackedTeamId, trackedTeamName }: Props) {
  const [statsType, setStatsType] = useState<ExportStatsType>('attack')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(new Set())
  const [minuteRange, setMinuteRange] = useState<MinuteRange>({ from: null, to: null })
  const [includeTotals, setIncludeTotals] = useState(true)

  const relevantPlayers = useMemo(() =>
    statsType === 'gk'
      ? players.filter(p => p.position === 'goalkeeper')
      : players.filter(p => p.position !== 'goalkeeper'),
    [players, statsType],
  )

  function togglePlayer(id: string) {
    setSelectedPlayerIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }

  function toggleMatch(id: string) {
    setSelectedMatchIds(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }

  function handleDownload() {
    // Filter events by selected matches
    let events = allEvents
    if (selectedMatchIds.size > 0) {
      events = events.filter(e => selectedMatchIds.has(e.match_id))
    }

    // Filter by minute range
    if (minuteRange.from !== null || minuteRange.to !== null) {
      events = events.filter(e => {
        const m = e.match_minute
        if (m === null || m === undefined) return true
        if (minuteRange.from !== null && m < minuteRange.from) return false
        if (minuteRange.to !== null && m > minuteRange.to) return false
        return true
      })
    }

    const matchLabel = selectedMatchIds.size > 0 ? `_${selectedMatchIds.size}leikir` : '_allir'
    const minuteLabel = minuteRange.from !== null || minuteRange.to !== null
      ? `_${minuteRange.from ?? 0}-${minuteRange.to ?? 90}min`
      : ''

    let csv: string
    let typeLabel: string

    if (statsType === 'raw') {
      // Build match info map for raw export
      const matchInfoMap = new Map<string, RawMatchInfo>()
      for (const m of matches) {
        const isHome = m.home_team_id === trackedTeamId
        const opponent = isHome ? m.away_team : m.home_team
        const scored = isHome ? m.home_score : m.away_score
        const against = isHome ? m.away_score : m.home_score
        const date = m.match_date
          ? new Date(m.match_date).toLocaleDateString('is-IS', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : null
        matchInfoMap.set(m.id, {
          date,
          opponent: opponent?.name ?? '?',
          isHome,
          score: `${scored ?? '?'}–${against ?? '?'}`,
        })
      }
      csv = buildRawCSV(events, players, matchInfoMap, trackedTeamId)
      typeLabel = 'gogn'
    } else {
      // Filter players
      let exportPlayers = relevantPlayers
      if (selectedPlayerIds.size > 0) {
        exportPlayers = exportPlayers.filter(p => selectedPlayerIds.has(p.id))
      }
      csv = buildCSV(events, exportPlayers, trackedTeamId, statsType, includeTotals)
      typeLabel = statsType === 'attack' ? 'sokn' : statsType === 'defense' ? 'vorn' : 'markvordur'
    }

    const filename = `${trackedTeamName}_${typeLabel}${matchLabel}${minuteLabel}.csv`
      .replace(/\s+/g, '_')
      .toLowerCase()

    downloadCSV(csv, filename)
    onClose()
  }

  const t = useT()
  const lang = useLang(st => st.lang)
  const linkBtn = 'text-[13px] text-muted hover:text-ink underline underline-offset-4 decoration-transparent hover:decoration-current transition-colors'
  const sectionLabel = 'text-[14px] font-medium'
  const listBox = 'border border-line rounded-lg divide-y divide-[#eef0f2] overflow-y-auto'
  const check = 'w-4 h-4 accent-[#111214]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="export-h">
      <div className="bg-white rounded-xl shadow-[0_24px_48px_rgba(0,0,0,0.22)] w-full max-w-md max-h-[90vh] flex flex-col overscroll-contain">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 id="export-h" className="text-[18px] font-semibold">{t({ en: 'Export to CSV', is: 'Sækja CSV' })}</h2>
          <button type="button" onClick={onClose} aria-label={t(T.close)} className="w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-[#f5f6f8] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <section className="space-y-2">
            <p className={sectionLabel}>{t({ en: 'What to export', is: 'Hvað á að sækja' })}</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'attack', label: t(T.attack) },
                { id: 'defense', label: t(T.defence) },
                { id: 'gk', label: t(T.goalkeeper) },
                { id: 'raw', label: t({ en: 'Every event (raw)', is: 'Öll gögn (raw)' }) },
              ] as { id: ExportStatsType; label: string }[]).map(o => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={statsType === o.id}
                  onClick={() => { setStatsType(o.id); setSelectedPlayerIds(new Set()) }}
                  className={`h-10 rounded-md text-[14px] font-medium border transition-colors ${
                    statsType === o.id ? 'bg-[#111214] text-white border-[#111214]' : 'bg-white text-ink border-[#cdd2d9] hover:border-ink'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {statsType === 'raw' && (
              <p className="text-[13px] text-muted">
                {t({ en: 'One row per event: match, minute, type, player, zone and more. Made for Excel or Python.', is: 'Ein lína á hvern atburð: leikur, mínúta, tegund, leikmaður, svæði o.fl. Hentar til greiningar í Excel eða Python.' })}
              </p>
            )}
          </section>

          <section className="space-y-2">
            <p className={sectionLabel}>{t(T.minutes)}</p>
            <div className="flex flex-wrap items-center gap-3">
              <MinuteInput label={t(T.from)} value={minuteRange.from} onChange={v => setMinuteRange(r => ({ ...r, from: v }))} />
              <MinuteInput label={t(T.to)} value={minuteRange.to} onChange={v => setMinuteRange(r => ({ ...r, to: v }))} />
              {(minuteRange.from !== null || minuteRange.to !== null) && (
                <button type="button" onClick={() => setMinuteRange({ from: null, to: null })} className={linkBtn}>{t(T.clear)}</button>
              )}
            </div>
          </section>

          {statsType !== 'raw' && <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={sectionLabel}>{statsType === 'gk' ? t({ en: 'Goalkeepers', is: 'Markmenn' }) : t(T.players)}</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setSelectedPlayerIds(new Set())} className={linkBtn}>{t({ en: 'All', is: 'Allir' })}</button>
                <button type="button" onClick={() => setSelectedPlayerIds(new Set(relevantPlayers.map(p => p.id)))} className={linkBtn}>{t({ en: 'Select each', is: 'Velja alla' })}</button>
              </div>
            </div>
            <div className={`${listBox} max-h-40`}>
              {relevantPlayers.length === 0 ? (
                <p className="px-3 py-2.5 text-[14px] text-muted">{t({ en: 'No players', is: 'Engir leikmenn' })}</p>
              ) : relevantPlayers.map(p => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#f8f9fa]">
                  <input
                    type="checkbox"
                    checked={selectedPlayerIds.size === 0 || selectedPlayerIds.has(p.id)}
                    onChange={() => {
                      if (selectedPlayerIds.size === 0) {
                        // Currently "all" — start excluding this one by selecting all others
                        const others = new Set(relevantPlayers.filter(x => x.id !== p.id).map(x => x.id))
                        setSelectedPlayerIds(others)
                      } else {
                        togglePlayer(p.id)
                      }
                    }}
                    className={check}
                  />
                  <span className="text-[14px]">
                    {p.jersey_number != null ? <span className="text-muted num inline-block min-w-[26px]">{p.jersey_number}</span> : null}
                    {p.first_name} {p.last_name}
                  </span>
                </label>
              ))}
            </div>
            {selectedPlayerIds.size > 0 && (
              <p className="text-[13px] text-muted num">{selectedPlayerIds.size} {t({ en: 'selected', is: 'valin' })}</p>
            )}
          </section>}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={sectionLabel}>{t(T.matches)}</p>
              <div className="flex gap-3">
                <button type="button" onClick={() => setSelectedMatchIds(new Set())} className={linkBtn}>{t({ en: 'All', is: 'Allir' })}</button>
                <button type="button" onClick={() => setSelectedMatchIds(new Set(matches.map(m => m.id)))} className={linkBtn}>{t({ en: 'Select each', is: 'Velja alla' })}</button>
              </div>
            </div>
            <div className={`${listBox} max-h-44`}>
              {matches.length === 0 ? (
                <p className="px-3 py-2.5 text-[14px] text-muted">{t({ en: 'No matches', is: 'Engir leikir' })}</p>
              ) : matches.map(m => {
                const isHome = m.home_team_id === trackedTeamId
                const opponent = isHome ? m.away_team : m.home_team
                const scored = isHome ? m.home_score : m.away_score
                const against = isHome ? m.away_score : m.home_score
                const date = m.match_date
                  ? new Date(m.match_date).toLocaleDateString(lang === 'is' ? 'is-IS' : 'en-GB', { day: 'numeric', month: 'short' })
                  : ''
                const checked = selectedMatchIds.size === 0 || selectedMatchIds.has(m.id)
                return (
                  <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#f8f9fa]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (selectedMatchIds.size === 0) {
                          const others = new Set(matches.filter(x => x.id !== m.id).map(x => x.id))
                          setSelectedMatchIds(others)
                        } else {
                          toggleMatch(m.id)
                        }
                      }}
                      className={check}
                    />
                    <span className="text-[14px] flex-1 min-w-0 truncate">{t({ en: 'vs', is: 'gegn' })} {opponent?.name ?? '?'}</span>
                    <span className="text-[13px] text-muted num">{scored ?? '?'}–{against ?? '?'} · {date}</span>
                  </label>
                )
              })}
            </div>
            {selectedMatchIds.size > 0 && (
              <p className="text-[13px] text-muted num">{selectedMatchIds.size} {t({ en: 'selected', is: 'valin' })}</p>
            )}
          </section>

          {statsType !== 'raw' && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={includeTotals} onChange={e => setIncludeTotals(e.target.checked)} className={check} />
              <span className="text-[14px]">{t({ en: 'Include a totals row', is: 'Hafa með samtals línu' })}</span>
            </label>
          )}
        </div>

        <div className="px-5 py-4 border-t border-line flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t(T.cancel)}</Button>
          <Button variant="primary" className="flex-1" onClick={handleDownload}>{t({ en: 'Download', is: 'Hlaða niður' })}</Button>
        </div>
      </div>
    </div>
  )
}
