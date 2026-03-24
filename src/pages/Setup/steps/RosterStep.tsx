// Step 3: pick players for this match, mark starters, add new players inline
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Card, Input, Spinner } from '@/components/ui'
import { getPlayersByTeam, createPlayer, createRosterEntries } from '@/lib/supabase/queries'
import type { Player } from '@/lib/db/schema'

interface Props {
  matchId: string
  trackedTeamId: string
  opponentTeamId: string
  onDone: () => void
  onBack: () => void
}

interface RosterEntry {
  playerId: string
  inSquad: boolean
  isStarter: boolean
  jerseyOverride: string
}

export function RosterStep({ matchId, trackedTeamId, opponentTeamId, onDone, onBack }: Props) {
  const [entries, setEntries] = useState<Record<string, RosterEntry>>({})
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [newFirst, setNewFirst] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newJersey, setNewJersey] = useState('')
  const [newPosition, setNewPosition] = useState<Player['position']>('field')

  const { data: players = [] as Player[], isLoading, refetch } = useQuery({
    queryKey: ['players', trackedTeamId],
    queryFn: () => getPlayersByTeam(trackedTeamId),
  })

  // Init roster entries whenever player list loads/changes
  useEffect(() => {
    if (players.length === 0) return
    setEntries(prev => {
      const next = { ...prev }
      for (const p of players) {
        if (!next[p.id]) {
          next[p.id] = { playerId: p.id, inSquad: true, isStarter: false, jerseyOverride: '' }
        }
      }
      return next
    })
  }, [players])

  const addPlayerMutation = useMutation({
    mutationFn: () => createPlayer({
      team_id: trackedTeamId,
      first_name: newFirst.trim(),
      last_name: newLast.trim(),
      jersey_number: newJersey ? parseInt(newJersey) : null,
      position: newPosition,
      is_active: true,
    }),
    onSuccess: async (player) => {
      setEntries(prev => ({
        ...prev,
        [player.id]: { playerId: player.id, inSquad: true, isStarter: false, jerseyOverride: '' },
      }))
      setNewFirst('')
      setNewLast('')
      setNewJersey('')
      setNewPosition('field')
      setShowAddPlayer(false)
      await refetch()
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const squadPlayers = players.filter(p => entries[p.id]?.inSquad !== false)

      const rosterEntries = squadPlayers.map(p => ({
        match_id: matchId,
        player_id: p.id,
        team_id: trackedTeamId,
        jersey_override: entries[p.id]?.jerseyOverride
          ? parseInt(entries[p.id].jerseyOverride)
          : null,
        is_starter: entries[p.id]?.isStarter ?? false,
      }))

      await createRosterEntries(rosterEntries)
    },
    onSuccess: onDone,
  })

  function toggle(playerId: string, field: 'inSquad' | 'isStarter') {
    setEntries(prev => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [field]: !prev[playerId]?.[field],
        // Can't be starter if not in squad
        ...(field === 'inSquad' && prev[playerId]?.inSquad ? { isStarter: false } : {}),
      },
    }))
  }

  function setJerseyOverride(playerId: string, value: string) {
    setEntries(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], jerseyOverride: value },
    }))
  }

  const squadCount = players.filter(p => entries[p.id]?.inSquad !== false).length
  const starterCount = players.filter(p => entries[p.id]?.isStarter).length

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>

  const goalkeepers = players.filter(p => p.position === 'goalkeeper')
  const fieldPlayers = players.filter(p => p.position === 'field')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Build match roster</h2>
        <p className="text-sm text-gray-500 mt-1">
          {squadCount} in squad · {starterCount} starters · Uncheck to exclude a player from this match.
        </p>
      </div>

      {players.length === 0 ? (
        <Card className="p-6 text-center text-gray-500">
          <p className="mb-3">No players in your squad yet.</p>
          <Button onClick={() => setShowAddPlayer(true)}>+ Add first player</Button>
        </Card>
      ) : (
        <>
          {goalkeepers.length > 0 && (
            <PlayerSection
              title="Goalkeepers"
              players={goalkeepers}
              entries={entries}
              onToggle={toggle}
              onJerseyOverride={setJerseyOverride}
            />
          )}
          <PlayerSection
            title="Field players"
            players={fieldPlayers}
            entries={entries}
            onToggle={toggle}
            onJerseyOverride={setJerseyOverride}
          />
        </>
      )}

      {/* Add player inline */}
      {showAddPlayer ? (
        <Card className="p-4 space-y-3">
          <h3 className="font-medium text-gray-800">Add player</h3>
          <div className="grid grid-cols-[48px_1fr_1fr_80px] gap-2">
            <Input
              value={newJersey}
              onChange={e => setNewJersey(e.target.value)}
              placeholder="#"
              type="number"
              min={1}
              max={99}
              className="text-center px-1"
            />
            <Input value={newFirst} onChange={e => setNewFirst(e.target.value)} placeholder="First name" />
            <Input value={newLast} onChange={e => setNewLast(e.target.value)} placeholder="Last name" />
            <select
              value={newPosition}
              onChange={e => setNewPosition(e.target.value as Player['position'])}
              className="px-2 py-2 rounded-lg border border-gray-300 text-sm bg-white"
            >
              <option value="field">Field</option>
              <option value="goalkeeper">GK</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => addPlayerMutation.mutate()}
              disabled={(!newFirst.trim() && !newLast.trim()) || addPlayerMutation.isPending}
            >
              {addPlayerMutation.isPending ? 'Adding…' : 'Add'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAddPlayer(false)}>Cancel</Button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setShowAddPlayer(true)}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Add player not in squad
        </button>
      )}

      {saveMutation.error && (
        <p className="text-sm text-red-600">{(saveMutation.error as Error).message}</p>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={squadCount === 0 || saveMutation.isPending}
          size="lg"
        >
          {saveMutation.isPending ? 'Saving…' : 'Confirm roster →'}
        </Button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Tip: tap the star ★ to mark a player as starter. Tap the # to override their jersey number for this match.
      </p>

      {/* hidden — suppress TS unused warning */}
      <span className="hidden">{opponentTeamId}</span>
    </div>
  )
}

function PlayerSection({
  title,
  players,
  entries,
  onToggle,
  onJerseyOverride,
}: {
  title: string
  players: Player[]
  entries: Record<string, RosterEntry>
  onToggle: (id: string, field: 'inSquad' | 'isStarter') => void
  onJerseyOverride: (id: string, value: string) => void
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {players.map(p => {
          const entry = entries[p.id] ?? { inSquad: true, isStarter: false, jerseyOverride: '' }
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${!entry.inSquad ? 'opacity-40' : ''}`}
            >
              {/* In-squad checkbox */}
              <input
                type="checkbox"
                checked={entry.inSquad !== false}
                onChange={() => onToggle(p.id, 'inSquad')}
                className="w-4 h-4 rounded text-blue-600 cursor-pointer"
              />

              {/* Jersey # (editable override) */}
              <input
                type="number"
                value={entry.jerseyOverride || (p.jersey_number?.toString() ?? '')}
                onChange={e => onJerseyOverride(p.id, e.target.value)}
                className="w-10 text-center text-sm font-bold border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                min={1}
                max={99}
                disabled={!entry.inSquad}
              />

              {/* Name */}
              <span className="flex-1 text-sm">
                {p.first_name} <strong>{p.last_name}</strong>
              </span>

              {/* Position badge */}
              {p.position === 'goalkeeper' && (
                <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">GK</span>
              )}

              {/* Starter toggle */}
              <button
                onClick={() => entry.inSquad !== false && onToggle(p.id, 'isStarter')}
                disabled={!entry.inSquad}
                className={`text-lg leading-none transition-colors ${
                  entry.isStarter ? 'text-yellow-500' : 'text-gray-300'
                } disabled:cursor-not-allowed`}
                title={entry.isStarter ? 'Starter' : 'Mark as starter'}
              >
                ★
              </button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
