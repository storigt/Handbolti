// Step 1 (first time only): create the tracked team + add initial players
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Card, Field, Input, Label } from '@/components/ui'
import { createTeam, createPlayer, setTrackedTeamId } from '@/lib/supabase/queries'
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
  onDone: (teamId: string) => void
}

export function TeamSetupStep({ onDone }: Props) {
  const [teamName, setTeamName] = useState('')
  const [shortName, setShortName] = useState('')
  const [players, setPlayers] = useState<DraftPlayer[]>([emptyPlayer()])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!teamName.trim()) throw new Error('Team name is required')
      const team = await createTeam({
        name: teamName.trim(),
        short_name: shortName.trim() || null,
        home_venue: null,
      })
      setTrackedTeamId(team.id)

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
    onSuccess: (team) => onDone(team.id),
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Set up your team</h2>
        <p className="text-sm text-gray-500 mt-1">This is a one-time setup. You can edit everything later.</p>
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

      {mutation.error && (
        <p className="text-sm text-red-600">{(mutation.error as Error).message}</p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => mutation.mutate()}
          disabled={!teamName.trim() || mutation.isPending}
          size="lg"
        >
          {mutation.isPending ? 'Saving…' : 'Save team & continue →'}
        </Button>
      </div>
    </div>
  )
}
