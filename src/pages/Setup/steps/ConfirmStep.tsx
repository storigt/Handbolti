// Step 4: review and kick off the match
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Card, Spinner } from '@/components/ui'
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
    ? new Date(match.match_date).toLocaleDateString('is-IS', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : 'Ekki búið að velja dagsetningu'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Tilbúið</h2>
        <p className="text-sm text-gray-500 mt-1">Farðu yfir upplýsingar um leikinn áður en þú byrjar.</p>
      </div>

      <Card className="p-4 space-y-3">
        <h3 className="font-medium text-gray-800">Leikur</h3>
        <div className="flex items-center justify-center gap-4 py-3">
          <div className="text-center">
            <p className="font-bold text-lg">{trackedTeam.short_name ?? trackedTeam.name}</p>
            {isHome && <p className="text-xs text-gray-400">Heima</p>}
          </div>
          <span className="text-2xl font-light text-gray-400">vs</span>
          <div className="text-center">
            <p className="font-bold text-lg">{opponentTeam.short_name ?? opponentTeam.name}</p>
            {!isHome && <p className="text-xs text-gray-400">Heima</p>}
          </div>
        </div>
        <div className="flex justify-between text-sm text-gray-600 border-t pt-3">
          <span>{matchDate}</span>
          {match.venue && <span>{match.venue}</span>}
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-800">Leikmannahópur</h3>
            <span className="text-sm text-gray-500">{roster.length} leikmenn</span>
          </div>

          {starters.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Byrjunarlið</p>
              <div className="flex flex-wrap gap-2">
                {starters.map(r => (
                  <span key={r.id} className="flex items-center gap-1 bg-blue-50 text-blue-800 text-sm px-2 py-1 rounded-full">
                    <span className="font-bold">#{r.jersey_override ?? r.player.jersey_number ?? '?'}</span>
                    <span>{r.player.last_name}</span>
                    {r.player.position === 'goalkeeper' && <span className="text-xs text-purple-600">MV</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {bench.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bekkur</p>
              <div className="flex flex-wrap gap-2">
                {bench.map(r => (
                  <span key={r.id} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-sm px-2 py-1 rounded-full">
                    <span className="font-bold">#{r.jersey_override ?? r.player.jersey_number ?? '?'}</span>
                    <span>{r.player.last_name}</span>
                    {r.player.position === 'goalkeeper' && <span className="text-xs text-purple-600">MV</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {startMutation.error && (
        <p className="text-sm text-red-600">{(startMutation.error as Error).message}</p>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>← Breyta leikmannahópi</Button>
        <Button
          onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending || roster.length === 0}
          size="lg"
          className="bg-green-600 hover:bg-green-700"
        >
          {startMutation.isPending ? 'Byrja…' : '▶ Byrja leik'}
        </Button>
      </div>
    </div>
  )
}
