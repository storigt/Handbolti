// Step 1: pick which of the coach's teams this match is for, manage teams, or create a new one
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Field, Input, Label, Spinner } from '@/components/ui'
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
      if (!teamName.trim()) throw new Error('Team name is required')
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
    <div className="flex gap-1 border-b border-gray-200">
      <button
        onClick={() => setMode('pick')}
        className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
          mode === 'pick' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
      >
        Velja lið
      </button>
      <button
        onClick={() => setMode('manage')}
        className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
          mode === 'manage' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
        }`}
      >
        Stjórna liðum
      </button>
    </div>
  )

  if (mode === 'pick') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Which team is this match for?</h2>
          <p className="text-sm text-gray-500 mt-1">Pick one of your teams.</p>
        </div>

        {tabs}

        <Card className="p-4 space-y-2">
          {loadingTeams ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : myTeams.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">You don't have any teams yet — create one below.</p>
          ) : (
            <div className="space-y-2">
              {myTeams.map(team => (
                <label
                  key={team.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    selectedTeamId === team.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="existing-team"
                    checked={selectedTeamId === team.id}
                    onChange={() => setSelectedTeamId(team.id)}
                  />
                  <span className="font-medium text-gray-800">{team.name}</span>
                  {team.id === mainTeamId && (
                    <span className="ml-auto text-xs text-blue-600 font-medium">Main team</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setMode('manage')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            + Add a new team
          </button>
          <Button
            onClick={() => selectedTeamId && onDone(selectedTeamId)}
            disabled={!selectedTeamId}
            size="lg"
          >
            Continue →
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'manage') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Manage your teams</h2>
          <p className="text-sm text-gray-500 mt-1">
            Rename, hide, or add a team. A team with match history is hidden rather than deleted — its data is kept and you can bring it back later. Your current main team can't be hidden.
          </p>
        </div>

        {tabs}

        <ManageTeamsList mainTeamId={mainTeamId} onAddTeam={() => setMode('new')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Set up a new team</h2>
          <p className="text-sm text-gray-500 mt-1">You can edit everything later.</p>
        </div>
        {myTeams.length > 0 && (
          <button
            onClick={() => setMode('manage')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium shrink-0"
          >
            ← Back to your teams
          </button>
        )}
      </div>

      <Card className="p-4 space-y-4">
        <h3 className="font-medium text-gray-800">Team details</h3>
        <Field>
          <Label htmlFor="team-name">Team name *</Label>
          <Input
            id="team-name"
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder="e.g. Knattspyrnufélag Reykjavíkur"
          />
        </Field>
        <Field>
          <Label htmlFor="short-name">Short name (3–4 letters)</Label>
          <Input
            id="short-name"
            value={shortName}
            onChange={e => setShortName(e.target.value)}
            placeholder="e.g. KR"
            maxLength={6}
            className="max-w-[120px]"
          />
        </Field>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-800">Squad</h3>
          <Button variant="ghost" size="sm" onClick={addPlayer}>+ Add player</Button>
        </div>

        {/* Header row */}
        <div className="grid grid-cols-[48px_1fr_1fr_80px_32px] gap-2 text-xs font-medium text-gray-500 px-1">
          <span>#</span>
          <span>First name</span>
          <span>Last name</span>
          <span>Position</span>
          <span />
        </div>

        {players.map((p, i) => (
          <div key={i} className="grid grid-cols-[48px_1fr_1fr_80px_32px] gap-2 items-center">
            <Input
              value={p.jersey_number}
              onChange={e => updatePlayer(i, 'jersey_number', e.target.value)}
              placeholder="#"
              type="number"
              min={1}
              max={99}
              className="text-center px-1"
            />
            <Input
              value={p.first_name}
              onChange={e => updatePlayer(i, 'first_name', e.target.value)}
              placeholder="First"
            />
            <Input
              value={p.last_name}
              onChange={e => updatePlayer(i, 'last_name', e.target.value)}
              placeholder="Last"
            />
            <select
              value={p.position}
              onChange={e => updatePlayer(i, 'position', e.target.value as Player['position'])}
              className="px-2 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="field">Field</option>
              <option value="goalkeeper">GK</option>
            </select>
            <button
              onClick={() => removePlayer(i)}
              className="text-gray-400 hover:text-red-500 text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}

        <p className="text-xs text-gray-400">You can add more players later from the team settings.</p>
      </Card>

      {createMutation.error && (
        <p className="text-sm text-red-600">{(createMutation.error as Error).message}</p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!teamName.trim() || createMutation.isPending}
          size="lg"
        >
          {createMutation.isPending ? 'Saving…' : 'Save team & continue →'}
        </Button>
      </div>
    </div>
  )
}
