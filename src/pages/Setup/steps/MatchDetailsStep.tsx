// Step 2: match details — opponent, date, venue, competition
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Field, Input, Label, Spinner } from '@/components/ui'
import {
  getTeams,
  getSeasons,
  getCompetitions,
  createSeason,
  createCompetition,
  upsertTeamByName,
  createMatch,
  getOrCreateCurrentSeason,
} from '@/lib/supabase/queries'
import type { Season, Competition } from '@/lib/db/schema'

interface Props {
  trackedTeamId: string
  onDone: (matchId: string, opponentTeamId: string) => void
  onBack: () => void
}

export function MatchDetailsStep({ trackedTeamId, onDone, onBack }: Props) {
  const qc = useQueryClient()

  const [opponentName, setOpponentName] = useState('')
  const [isHome, setIsHome] = useState(true)
  const [matchDate, setMatchDate] = useState(() => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [venue, setVenue] = useState('')

  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [newSeasonName, setNewSeasonName] = useState('')
  const [addingSeason, setAddingSeason] = useState(false)

  const [selectedCompId, setSelectedCompId] = useState<string>('')
  const [newCompName, setNewCompName] = useState('')
  const [newCompLevel, setNewCompLevel] = useState<Competition['level']>('league')
  const [addingComp, setAddingComp] = useState(false)

  const { data: seasons = [], isLoading: loadingSeasons } = useQuery({
    queryKey: ['seasons'],
    queryFn: getSeasons,
  })

  const { data: competitions = [] } = useQuery({
    queryKey: ['competitions', selectedSeasonId],
    queryFn: () => getCompetitions(selectedSeasonId),
    enabled: !!selectedSeasonId,
  })

  // Auto-select current season on load
  useEffect(() => {
    if (seasons.length > 0 && !selectedSeasonId) {
      setSelectedSeasonId(seasons[0].id)
    }
  }, [seasons, selectedSeasonId])

  // Auto-select first competition when season changes
  useEffect(() => {
    setSelectedCompId('')
  }, [selectedSeasonId])

  useEffect(() => {
    if (competitions.length > 0 && !selectedCompId) {
      setSelectedCompId(competitions[0].id)
    }
  }, [competitions, selectedCompId])

  const addSeasonMutation = useMutation({
    mutationFn: () => createSeason(newSeasonName.trim()),
    onSuccess: (season: Season) => {
      void qc.invalidateQueries({ queryKey: ['seasons'] })
      setSelectedSeasonId(season.id)
      setNewSeasonName('')
      setAddingSeason(false)
    },
  })

  const addCompMutation = useMutation({
    mutationFn: () => createCompetition(selectedSeasonId, newCompName.trim(), newCompLevel),
    onSuccess: (comp: Competition) => {
      void qc.invalidateQueries({ queryKey: ['competitions', selectedSeasonId] })
      setSelectedCompId(comp.id)
      setNewCompName('')
      setAddingComp(false)
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!opponentName.trim()) throw new Error('Opponent name is required')

      const opponent = await upsertTeamByName(opponentName)

      let compId: string | null = selectedCompId || null
      let resolvedSeasonId = selectedSeasonId

      if (!resolvedSeasonId) {
        const season = await getOrCreateCurrentSeason()
        resolvedSeasonId = season.id
      }

      if (!compId && newCompName.trim()) {
        const comp = await createCompetition(resolvedSeasonId, newCompName.trim(), newCompLevel)
        compId = comp.id
      }

      const match = await createMatch({
        competition_id: compId,
        home_team_id: isHome ? trackedTeamId : opponent.id,
        away_team_id: isHome ? opponent.id : trackedTeamId,
        match_date: matchDate ? new Date(matchDate).toISOString() : null,
        venue: venue.trim() || null,
        status: 'planned',
        home_score: null,
        away_score: null,
        tracked_team_id: trackedTeamId,
        notes: null,
      })

      return { match, opponentId: opponent.id }
    },
    onSuccess: ({ match, opponentId }) => onDone(match.id, opponentId),
  })

  if (loadingSeasons) {
    return <div className="flex justify-center py-12"><Spinner /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Match details</h2>
        <p className="text-sm text-gray-500 mt-1">Fill in the details for today's match.</p>
      </div>

      <Card className="p-4 space-y-4">
        <h3 className="font-medium text-gray-800">Opponent</h3>
        <Field>
          <Label htmlFor="opponent">Opponent team *</Label>
          <Input
            id="opponent"
            value={opponentName}
            onChange={e => setOpponentName(e.target.value)}
            placeholder="e.g. Selfoss"
            list="team-suggestions"
          />
          <TeamSuggestions />
        </Field>

        <Field>
          <Label>Home or away?</Label>
          <div className="flex gap-2">
            {(['home', 'away'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setIsHome(opt === 'home')}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  (opt === 'home') === isHome
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                {opt === 'home' ? '🏠 Home' : '✈️ Away'}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field>
            <Label htmlFor="match-date">Date & time</Label>
            <Input
              id="match-date"
              type="datetime-local"
              value={matchDate}
              onChange={e => setMatchDate(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="venue">Venue</Label>
            <Input
              id="venue"
              value={venue}
              onChange={e => setVenue(e.target.value)}
              placeholder="e.g. Laugardalshöll"
            />
          </Field>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h3 className="font-medium text-gray-800">Competition</h3>

        {/* Season */}
        <Field>
          <Label>Season</Label>
          <div className="flex gap-2">
            <select
              value={selectedSeasonId}
              onChange={e => setSelectedSeasonId(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— no season —</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={() => setAddingSeason(v => !v)}>
              {addingSeason ? 'Cancel' : '+ New'}
            </Button>
          </div>
          {addingSeason && (
            <div className="flex gap-2 mt-2">
              <Input
                value={newSeasonName}
                onChange={e => setNewSeasonName(e.target.value)}
                placeholder="e.g. 2025/2026"
              />
              <Button
                size="sm"
                onClick={() => addSeasonMutation.mutate()}
                disabled={!newSeasonName.trim() || addSeasonMutation.isPending}
              >
                Add
              </Button>
            </div>
          )}
        </Field>

        {/* Competition */}
        {selectedSeasonId && (
          <Field>
            <Label>Competition</Label>
            <div className="flex gap-2">
              <select
                value={selectedCompId}
                onChange={e => setSelectedCompId(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— no competition —</option>
                {competitions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Button variant="ghost" size="sm" onClick={() => setAddingComp(v => !v)}>
                {addingComp ? 'Cancel' : '+ New'}
              </Button>
            </div>
            {addingComp && (
              <div className="flex gap-2 mt-2">
                <Input
                  value={newCompName}
                  onChange={e => setNewCompName(e.target.value)}
                  placeholder="e.g. Úrvalsdeild"
                  className="flex-1"
                />
                <select
                  value={newCompLevel}
                  onChange={e => setNewCompLevel(e.target.value as Competition['level'])}
                  className="px-2 py-2 rounded-lg border border-gray-300 text-sm bg-white"
                >
                  <option value="league">League</option>
                  <option value="cup">Cup</option>
                  <option value="friendly">Friendly</option>
                </select>
                <Button
                  size="sm"
                  onClick={() => addCompMutation.mutate()}
                  disabled={!newCompName.trim() || addCompMutation.isPending}
                >
                  Add
                </Button>
              </div>
            )}
          </Field>
        )}
      </Card>

      {createMutation.error && (
        <p className="text-sm text-red-600">{(createMutation.error as Error).message}</p>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!opponentName.trim() || createMutation.isPending}
          size="lg"
        >
          {createMutation.isPending ? 'Creating…' : 'Continue →'}
        </Button>
      </div>
    </div>
  )
}

// Datalist of existing teams for autocomplete
function TeamSuggestions() {
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: getTeams })
  return (
    <datalist id="team-suggestions">
      {teams.map(t => <option key={t.id} value={t.name} />)}
    </datalist>
  )
}
