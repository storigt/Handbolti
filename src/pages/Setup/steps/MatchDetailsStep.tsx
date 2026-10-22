// Step 2: match details — opponent, date, venue, competition
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Field, Input, Label, Segmented, Select, Spinner } from '@/components/ui'
import { useT } from '@/lib/i18n/lang'
import { T } from '@/lib/i18n/terms'
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
  const t = useT()
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
      if (!opponentName.trim()) throw new Error(t({ en: 'Opponent name is required.', is: 'Nafn mótherja vantar.' }))

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
        <h1 className="text-[22px] font-semibold leading-tight">{t({ en: 'Match details', is: 'Upplýsingar um leik' })}</h1>
        <p className="text-[15px] text-muted mt-1">{t({ en: 'Who, where and when.', is: 'Hver, hvar og hvenær.' })}</p>
      </div>

      <Card className="p-5 space-y-4">
        <h3 className="text-[16px] font-medium">{t({ en: 'Opponent', is: 'Mótherji' })}</h3>
        <Field>
          <Label htmlFor="opponent">{t({ en: 'Opponent team', is: 'Mótherjar' })}</Label>
          <Input id="opponent" value={opponentName} onChange={e => setOpponentName(e.target.value)} autoComplete="off"
            placeholder={t({ en: 'e.g. ÍF Suðri', is: 't.d. ÍF Suðri' })} list="team-suggestions" />
          <TeamSuggestions />
        </Field>

        <Field>
          <Label>{t({ en: 'Home or away?', is: 'Heima eða úti?' })}</Label>
          <Segmented<'home' | 'away'> full value={isHome ? 'home' : 'away'} onChange={v => setIsHome(v === 'home')}
            label={t({ en: 'Home or away?', is: 'Heima eða úti?' })}
            options={[{ v: 'home', label: t(T.home) }, { v: 'away', label: t(T.away) }]} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <Label htmlFor="match-date">{t({ en: 'Date and time', is: 'Dagsetning og tími' })}</Label>
            <Input id="match-date" type="datetime-local" value={matchDate} onChange={e => setMatchDate(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="venue">{t({ en: 'Venue', is: 'Leikstaður' })}</Label>
            <Input id="venue" value={venue} onChange={e => setVenue(e.target.value)} autoComplete="off"
              placeholder={t({ en: 'e.g. Laugardalshöll', is: 't.d. Laugardalshöll' })} />
          </Field>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="text-[16px] font-medium">{t(T.competition)}</h3>

        <Field>
          <Label htmlFor="season">{t(T.season)}</Label>
          <div className="flex gap-2">
            <Select id="season" value={selectedSeasonId} onChange={e => setSelectedSeasonId(e.target.value)} className="flex-1">
              <option value="">{t({ en: 'No season', is: 'Ekkert tímabil' })}</option>
              {seasons.map(se => <option key={se.id} value={se.id}>{se.name}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => setAddingSeason(x => !x)}>
              {addingSeason ? t(T.cancel) : t({ en: 'New', is: 'Nýtt' })}
            </Button>
          </div>
          {addingSeason && (
            <div className="flex gap-2 mt-2">
              <Input value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)} autoComplete="off"
                placeholder={t({ en: 'e.g. 2026/2027', is: 't.d. 2026/2027' })} aria-label={t(T.season)} />
              <Button onClick={() => addSeasonMutation.mutate()} disabled={!newSeasonName.trim() || addSeasonMutation.isPending}>
                {t({ en: 'Add', is: 'Bæta við' })}
              </Button>
            </div>
          )}
        </Field>

        {selectedSeasonId && (
          <Field>
            <Label htmlFor="competition">{t(T.competition)}</Label>
            <div className="flex gap-2">
              <Select id="competition" value={selectedCompId} onChange={e => setSelectedCompId(e.target.value)} className="flex-1">
                <option value="">{t({ en: 'No competition', is: 'Engin keppni' })}</option>
                {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Button variant="secondary" onClick={() => setAddingComp(x => !x)}>
                {addingComp ? t(T.cancel) : t({ en: 'New', is: 'Ný' })}
              </Button>
            </div>
            {addingComp && (
              <div className="flex flex-wrap sm:flex-nowrap gap-2 mt-2">
                <Input value={newCompName} onChange={e => setNewCompName(e.target.value)} autoComplete="off"
                  placeholder={t({ en: 'e.g. Úrvalsdeild', is: 't.d. Úrvalsdeild' })} className="flex-1" aria-label={t(T.competition)} />
                <Select value={newCompLevel} onChange={e => setNewCompLevel(e.target.value as Competition['level'])} className="!w-auto"
                  aria-label={t({ en: 'Type', is: 'Tegund' })}>
                  <option value="league">{t({ en: 'League', is: 'Deild' })}</option>
                  <option value="cup">{t({ en: 'Cup', is: 'Bikar' })}</option>
                  <option value="friendly">{t({ en: 'Friendly', is: 'Æfingaleikur' })}</option>
                </Select>
                <Button onClick={() => addCompMutation.mutate()} disabled={!newCompName.trim() || addCompMutation.isPending}>
                  {t({ en: 'Add', is: 'Bæta við' })}
                </Button>
              </div>
            )}
          </Field>
        )}
      </Card>

      {createMutation.error && (
        <p className="text-[14px] text-[#c4242a]" role="alert">{(createMutation.error as Error).message}</p>
      )}

      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>{t(T.back)}</Button>
        <Button onClick={() => createMutation.mutate()} disabled={!opponentName.trim() || createMutation.isPending} size="lg">
          {createMutation.isPending ? t({ en: 'Creating…', is: 'Bý til…' }) : t({ en: 'Continue', is: 'Áfram' })}
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
      {teams.map(tm => <option key={tm.id} value={tm.name} />)}
    </datalist>
  )
}
