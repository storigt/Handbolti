// Step 4: review and kick off the match
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Card, Spinner } from '@/components/ui'
import { useLang, useT } from '@/lib/i18n/lang'
import { T } from '@/lib/i18n/terms'
import { getRoster, updateMatchStatus } from '@/lib/supabase/queries'
import type { Match, Team } from '@/lib/db/schema'

interface Props {
  match: Match
  trackedTeam: Team
  opponentTeam: Team
  onStart: () => void
  onBack: () => void
}

export function ConfirmStep({ match, trackedTeam, opponentTeam, onStart, onBack }: Props) {
  const t = useT()
  const lang = useLang(st => st.lang)
  const { data: roster = [], isLoading } = useQuery({
    queryKey: ['roster', match.id],
    queryFn: () => getRoster(match.id),
  })

  const startMutation = useMutation({
    mutationFn: () => updateMatchStatus(match.id, 'in_progress'),
    onSuccess: onStart,
  })

  const isHome = match.home_team_id === trackedTeam.id
  const starters = roster.filter(r => r.is_starter)
  const bench = roster.filter(r => !r.is_starter)

  const matchDate = match.match_date
    ? new Date(match.match_date).toLocaleDateString(lang === 'is' ? 'is-IS' : 'en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : t({ en: 'No date set', is: 'Engin dagsetning' })

  const chip = (r: (typeof roster)[number], starter: boolean) => (
    <span key={r.id} className={`flex items-center gap-1.5 text-[14px] px-2.5 h-8 rounded-md ${starter ? 'bg-[#111214] text-white' : 'bg-[#f5f6f8] border border-line'}`}>
      <span className="font-semibold num">{r.jersey_override ?? r.player.jersey_number ?? '?'}</span>
      <span>{r.player.last_name}</span>
      {r.player.position === 'goalkeeper' && <span className={`text-[12px] ${starter ? 'text-white/70' : 'text-muted'}`}>{t({ en: 'GK', is: 'MM' })}</span>}
    </span>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">{t({ en: 'Ready to start', is: 'Tilbúið' })}</h1>
        <p className="text-[15px] text-muted mt-1">{t({ en: 'Check the details before the throw-off.', is: 'Farðu yfir upplýsingarnar áður en leikurinn hefst.' })}</p>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2">
          <div className="text-right min-w-0">
            <p className="text-[20px] font-semibold truncate">{trackedTeam.short_name ?? trackedTeam.name}</p>
            <p className="text-[13px] text-muted">{isHome ? t(T.home) : t(T.away)}</p>
          </div>
          <span className="text-[15px] text-muted">{t({ en: 'vs', is: 'gegn' })}</span>
          <div className="min-w-0">
            <p className="text-[20px] font-semibold truncate">{opponentTeam.short_name ?? opponentTeam.name}</p>
            <p className="text-[13px] text-muted">{isHome ? t(T.away) : t(T.home)}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-[14px] text-muted border-t border-[#eef0f2] pt-3 mt-3">
          <span>{matchDate}</span>
          {match.venue && <span>{match.venue}</span>}
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : (
        <Card className="p-5 space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[16px] font-medium">{t({ en: 'Squad', is: 'Leikmannahópur' })}</h3>
            <span className="text-[14px] text-muted num">{roster.length} {t({ en: 'players', is: 'leikmenn' })}</span>
          </div>
          {starters.length > 0 && (
            <div>
              <p className="text-[13px] text-muted mb-2">{t({ en: 'Starting', is: 'Byrjunarlið' })}</p>
              <div className="flex flex-wrap gap-2">{starters.map(r => chip(r, true))}</div>
            </div>
          )}
          {bench.length > 0 && (
            <div>
              <p className="text-[13px] text-muted mb-2">{t({ en: 'Bench', is: 'Bekkur' })}</p>
              <div className="flex flex-wrap gap-2">{bench.map(r => chip(r, false))}</div>
            </div>
          )}
        </Card>
      )}

      {startMutation.error && (
        <p className="text-[14px] text-[#c4242a]" role="alert">{(startMutation.error as Error).message}</p>
      )}

      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>{t({ en: 'Change roster', is: 'Breyta hópnum' })}</Button>
        <Button variant="accent" onClick={() => startMutation.mutate()} disabled={startMutation.isPending || roster.length === 0} size="lg">
          {startMutation.isPending ? t({ en: 'Starting…', is: 'Byrja…' }) : t({ en: 'Start the match', is: 'Byrja leik' })}
        </Button>
      </div>
    </div>
  )
}
