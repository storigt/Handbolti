// Step 1: pick which of the coach's teams this match is for, manage teams, or create a new one
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Field, Input, Label, Select, Spinner, Tabs } from '@/components/ui'
import { useT } from '@/lib/i18n/lang'
import { ManageTeamsList } from '@/components/team/ManageTeamsList'
import { createTeam, createPlayer, getMyTeams, setTrackedTeamId, updateProfileTeam } from '@/lib/supabase/queries'
import type { Player } from '@/lib/db/schema'

interface DraftPlayer {
  first_name: string
  last_name: string
  jersey_number: string
  position: Player['position']
}

const emptyPlayer = (): DraftPlayer => ({
  first_name: '',
  last_name: '',
  jersey_number: '',
  position: 'field',
})

interface Props {
  mainTeamId: string | null
  onDone: (teamId: string) => void
}

type Mode = 'pick' | 'manage' | 'new'

export function TeamSetupStep({ mainTeamId, onDone }: Props) {
  const t = useT()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>(mainTeamId ? 'pick' : 'new')
  const [selectedTeamId, setSelectedTeamId] = useState<string>(mainTeamId ?? '')

  const { data: myTeams = [], isLoading: loadingTeams } = useQuery({
    queryKey: ['my-teams'],
    queryFn: getMyTeams,
  })

  // If the selected team got renamed/deleted from the Manage tab, fall back to main.
  useEffect(() => {
    if (selectedTeamId && myTeams.length > 0 && !myTeams.some(t => t.id === selectedTeamId)) {
      setSelectedTeamId(mainTeamId ?? '')
    }
  }, [myTeams, selectedTeamId, mainTeamId])

  const [teamName, setTeamName] = useState('')
  const [shortName, setShortName] = useState('')
  const [players, setPlayers] = useState<DraftPlayer[]>([emptyPlayer()])

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!teamName.trim()) throw new Error(t({ en: 'Team name is required.', is: 'Nafn liðs vantar.' }))
      const team = await createTeam({
        name: teamName.trim(),
        short_name: shortName.trim() || null,
        home_venue: null,
      })

      // The very first team a coach ever creates becomes their main/default team.
      // Later teams don't touch the main-team pointer — that's an explicit choice
      // made from the Season Dashboard or the Manage teams tab.
      if (myTeams.length === 0) {
        setTrackedTeamId(team.id)
        void updateProfileTeam(team.id)
      }

      const validPlayers = players.filter(p => p.first_name.trim() || p.last_name.trim())
      for (const p of validPlayers) {
        await createPlayer({
          team_id: team.id,
          first_name: p.first_name.trim(),
          last_name: p.last_name.trim(),
          jersey_number: p.jersey_number ? parseInt(p.jersey_number) : null,
          position: p.position,
          is_active: true,
        })
      }
      return team
    },
    onSuccess: (team) => {
      void queryClient.invalidateQueries({ queryKey: ['my-teams'] })
      onDone(team.id)
    },
  })

  function updatePlayer(i: number, field: keyof DraftPlayer, value: string) {
    setPlayers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p))
  }

  function addPlayer() {
    setPlayers(prev => [...prev, emptyPlayer()])
  }

  function removePlayer(i: number) {
    setPlayers(prev => prev.filter((_, idx) => idx !== i))
  }

  const tabs = mode !== 'new' && myTeams.length > 0 && (
    <Tabs<Mode> value={mode} onChange={setMode} options={[
      { v: 'pick', label: t({ en: 'Choose team', is: 'Velja lið' }) },
      { v: 'manage', label: t({ en: 'Manage teams', is: 'Stjórna liðum' }) },
    ]} />
  )

  const heading = (title: string, sub: string) => (
    <div>
      <h1 className="text-[22px] font-semibold leading-tight">{title}</h1>
      <p className="text-[15px] text-muted mt-1">{sub}</p>
    </div>
  )

  if (mode === 'pick') {
    return (
      <div className="space-y-6">
        {heading(t({ en: 'Which team is this match for?', is: 'Fyrir hvaða lið er leikurinn?' }), t({ en: 'Pick one of your teams.', is: 'Veldu eitt af liðunum þínum.' }))}

        {tabs}

        <Card className="p-2">
          {loadingTeams ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : myTeams.length === 0 ? (
            <p className="text-[15px] text-muted p-3">{t({ en: 'You have no teams yet. Create one below.', is: 'Þú átt engin lið enn. Búðu til lið hér fyrir neðan.' })}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {myTeams.map(team => (
                <label
                  key={team.id}
                  className={`flex items-center gap-3 px-3 h-12 rounded-md cursor-pointer transition-colors ${
                    selectedTeamId === team.id ? 'bg-[#eef0f3] ring-1 ring-ink' : 'hover:bg-[#f8f9fa]'
                  }`}
                >
                  <input
                    type="radio"
                    name="existing-team"
                    checked={selectedTeamId === team.id}
                    onChange={() => setSelectedTeamId(team.id)}
                    className="w-4 h-4 accent-[#111214]"
                  />
                  <span className="text-[15px] font-medium">{team.name}</span>
                  {team.id === mainTeamId && (
                    <span className="ml-auto text-[12px] font-medium px-2 py-0.5 rounded bg-white border border-line">{t({ en: 'Main team', is: 'Aðallið' })}</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={() => setMode('manage')} className="text-[15px] font-medium underline underline-offset-4 decoration-transparent hover:decoration-current transition-colors">
            {t({ en: 'Add a new team', is: 'Bæta við nýju liði' })}
          </button>
          <Button onClick={() => selectedTeamId && onDone(selectedTeamId)} disabled={!selectedTeamId} size="lg">
            {t({ en: 'Continue', is: 'Áfram' })}
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'manage') {
    return (
      <div className="space-y-6">
        {heading(t({ en: 'Manage your teams', is: 'Stjórna liðunum' }), t({
          en: 'Rename, hide or add a team. A team with match history is hidden rather than deleted, so its data is kept and it can come back later. Your main team cannot be hidden.',
          is: 'Endurnefndu, feldu eða bættu við liði. Lið með leikjasögu er falið en ekki eytt, svo gögnin haldast og það getur komið aftur. Aðalliðið er ekki hægt að fela.',
        }))}

        {tabs}

        <ManageTeamsList mainTeamId={mainTeamId} onAddTeam={() => setMode('new')} />
      </div>
    )
  }

  const colHead = 'text-[12px] text-muted px-1'
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        {heading(t({ en: 'Set up a new team', is: 'Nýtt lið' }), t({ en: 'You can change all of this later.', is: 'Þú getur breytt öllu síðar.' }))}
        {myTeams.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setMode('manage')} className="shrink-0">
            {t({ en: 'Back to your teams', is: 'Aftur í liðin þín' })}
          </Button>
        )}
      </div>

      <Card className="p-5 space-y-4">
        <h3 className="text-[16px] font-medium">{t({ en: 'Team details', is: 'Upplýsingar um lið' })}</h3>
        <Field>
          <Label htmlFor="team-name">{t({ en: 'Team name', is: 'Nafn liðs' })}</Label>
          <Input id="team-name" value={teamName} onChange={e => setTeamName(e.target.value)} autoComplete="off"
            placeholder={t({ en: 'e.g. HK Norðri', is: 't.d. HK Norðri' })} />
        </Field>
        <Field>
          <Label htmlFor="short-name">{t({ en: 'Short name (3–4 letters)', is: 'Stutt nafn (3–4 stafir)' })}</Label>
          <Input id="short-name" value={shortName} onChange={e => setShortName(e.target.value)} autoComplete="off"
            placeholder={t({ en: 'e.g. HKN', is: 't.d. HKN' })} maxLength={6} className="max-w-[140px]" />
        </Field>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-medium">{t({ en: 'Squad', is: 'Leikmannahópur' })}</h3>
          <Button variant="secondary" size="sm" onClick={addPlayer}>{t({ en: 'Add player', is: 'Bæta við leikmanni' })}</Button>
        </div>

        <div className="grid grid-cols-[56px_1fr_1fr_104px_36px] gap-2">
          <span className={colHead}>#</span>
          <span className={colHead}>{t({ en: 'First name', is: 'Fornafn' })}</span>
          <span className={colHead}>{t({ en: 'Last name', is: 'Eftirnafn' })}</span>
          <span className={colHead}>{t({ en: 'Position', is: 'Staða' })}</span>
          <span />
        </div>

        {players.map((p, i) => (
          <div key={i} className="grid grid-cols-[56px_1fr_1fr_104px_36px] gap-2 items-center">
            <Input value={p.jersey_number} onChange={e => updatePlayer(i, 'jersey_number', e.target.value)}
              placeholder="#" type="number" inputMode="numeric" min={1} max={99} className="text-center px-1 num" aria-label="#" />
            <Input value={p.first_name} onChange={e => updatePlayer(i, 'first_name', e.target.value)} autoComplete="off"
              aria-label={t({ en: 'First name', is: 'Fornafn' })} />
            <Input value={p.last_name} onChange={e => updatePlayer(i, 'last_name', e.target.value)} autoComplete="off"
              aria-label={t({ en: 'Last name', is: 'Eftirnafn' })} />
            <Select value={p.position} onChange={e => updatePlayer(i, 'position', e.target.value as Player['position'])}
              aria-label={t({ en: 'Position', is: 'Staða' })}>
              <option value="field">{t({ en: 'Court', is: 'Útileikm.' })}</option>
              <option value="goalkeeper">{t({ en: 'Goalkeeper', is: 'Markmaður' })}</option>
            </Select>
            <button type="button" onClick={() => removePlayer(i)} aria-label={t({ en: 'Remove player', is: 'Fjarlægja leikmann' })}
              className="w-9 h-9 rounded-md text-muted hover:text-[#c4242a] hover:bg-[#ffedea] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
        ))}

        <p className="text-[13px] text-muted">{t({ en: 'You can add more players later from the team settings.', is: 'Þú getur bætt við fleiri leikmönnum síðar í stillingum liðsins.' })}</p>
      </Card>

      {createMutation.error && (
        <p className="text-[14px] text-[#c4242a]" role="alert">{(createMutation.error as Error).message}</p>
      )}

      <div className="flex justify-end">
        <Button onClick={() => createMutation.mutate()} disabled={!teamName.trim() || createMutation.isPending} size="lg">
          {createMutation.isPending ? t({ en: 'Saving…', is: 'Vista…' }) : t({ en: 'Save team and continue', is: 'Vista lið og halda áfram' })}
        </Button>
      </div>
    </div>
  )
}
