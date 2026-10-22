// Step 3: pick players for this match, mark starters, add new players inline
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button, Card, Input, Select, Spinner } from '@/components/ui'
import { useT } from '@/lib/i18n/lang'
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
  const t = useT()
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
        <h1 className="text-[22px] font-semibold leading-tight">{t({ en: 'Match roster', is: 'Leikmannalisti' })}</h1>
        <p className="text-[15px] text-muted mt-1 num">
          {squadCount} {t({ en: 'in the squad', is: 'í hóp' })} · {starterCount} {t({ en: 'starting', is: 'í byrjunarliði' })}. {t({ en: 'Untick a player to leave them out of this match.', is: 'Taktu hakið af til að sleppa leikmanni í þessum leik.' })}
        </p>
      </div>

      {players.length === 0 ? (
        <Card className="p-6 flex flex-col items-start gap-3">
          <p className="text-[15px] text-muted">{t({ en: 'No players in your squad yet.', is: 'Engir leikmenn í hópnum enn.' })}</p>
          <Button onClick={() => setShowAddPlayer(true)}>{t({ en: 'Add the first player', is: 'Bæta við fyrsta leikmanni' })}</Button>
        </Card>
      ) : (
        <>
          {goalkeepers.length > 0 && (
            <PlayerSection title={t({ en: 'Goalkeepers', is: 'Markmenn' })} players={goalkeepers} entries={entries}
              onToggle={toggle} onJerseyOverride={setJerseyOverride} />
          )}
          <PlayerSection title={t({ en: 'Court players', is: 'Útileikmenn' })} players={fieldPlayers} entries={entries}
            onToggle={toggle} onJerseyOverride={setJerseyOverride} />
        </>
      )}

      {showAddPlayer ? (
        <Card className="p-5 space-y-3">
          <h3 className="text-[16px] font-medium">{t({ en: 'Add a player', is: 'Bæta við leikmanni' })}</h3>
          <div className="grid grid-cols-[56px_1fr_1fr_120px] gap-2">
            <Input value={newJersey} onChange={e => setNewJersey(e.target.value)} placeholder="#" type="number" inputMode="numeric"
              min={1} max={99} className="text-center px-1 num" aria-label="#" />
            <Input value={newFirst} onChange={e => setNewFirst(e.target.value)} autoComplete="off" placeholder={t({ en: 'First name', is: 'Fornafn' })} aria-label={t({ en: 'First name', is: 'Fornafn' })} />
            <Input value={newLast} onChange={e => setNewLast(e.target.value)} autoComplete="off" placeholder={t({ en: 'Last name', is: 'Eftirnafn' })} aria-label={t({ en: 'Last name', is: 'Eftirnafn' })} />
            <Select value={newPosition} onChange={e => setNewPosition(e.target.value as Player['position'])} aria-label={t({ en: 'Position', is: 'Staða' })}>
              <option value="field">{t({ en: 'Court', is: 'Útileikm.' })}</option>
              <option value="goalkeeper">{t({ en: 'Goalkeeper', is: 'Markmaður' })}</option>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => addPlayerMutation.mutate()} disabled={(!newFirst.trim() && !newLast.trim()) || addPlayerMutation.isPending}>
              {addPlayerMutation.isPending ? t({ en: 'Adding…', is: 'Bæti við…' }) : t({ en: 'Add', is: 'Bæta við' })}
            </Button>
            <Button variant="ghost" onClick={() => setShowAddPlayer(false)}>{t({ en: 'Cancel', is: 'Hætta við' })}</Button>
          </div>
        </Card>
      ) : (
        <button type="button" onClick={() => setShowAddPlayer(true)}
          className="w-full h-12 border border-dashed border-[#9aa0a8] rounded-lg text-[15px] text-muted hover:border-ink hover:text-ink transition-colors">
          {t({ en: 'Add a player who is not in the squad', is: 'Bæta við leikmanni sem er ekki í hópnum' })}
        </button>
      )}

      {saveMutation.error && (
        <p className="text-[14px] text-[#c4242a]" role="alert">{(saveMutation.error as Error).message}</p>
      )}

      <div className="flex justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>{t({ en: 'Back', is: 'Til baka' })}</Button>
        <Button onClick={() => saveMutation.mutate()} disabled={squadCount === 0 || saveMutation.isPending} size="lg">
          {saveMutation.isPending ? t({ en: 'Saving…', is: 'Vista…' }) : t({ en: 'Confirm roster', is: 'Staðfesta lista' })}
        </Button>
      </div>

      <p className="text-[13px] text-muted text-center">
        {t({ en: 'Tap Starter to put a player in the starting seven. Change the number to override their jersey for this match.', is: 'Smelltu á Byrjar til að setja leikmann í byrjunarlið. Breyttu númerinu til að nota annað treyjunúmer í þessum leik.' })}
      </p>

      {/* hidden — suppress TS unused warning */}
      <span className="hidden">{opponentTeamId}</span>
    </div>
  )
}

function PlayerSection({ title, players, entries, onToggle, onJerseyOverride }: {
  title: string
  players: Player[]
  entries: Record<string, RosterEntry>
  onToggle: (id: string, field: 'inSquad' | 'isStarter') => void
  onJerseyOverride: (id: string, value: string) => void
}) {
  const t = useT()
  return (
    <Card className="overflow-hidden">
      <h3 className="px-4 pt-3 pb-2 text-[15px] font-medium">{title}</h3>
      <div className="divide-y divide-[#eef0f2] border-t border-[#eef0f2]">
        {players.map(p => {
          const entry = entries[p.id] ?? { inSquad: true, isStarter: false, jerseyOverride: '' }
          const name = `${p.first_name} ${p.last_name}`
          return (
            <div key={p.id} className={`flex items-center gap-3 px-4 min-h-[52px] ${!entry.inSquad ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={entry.inSquad !== false}
                onChange={() => onToggle(p.id, 'inSquad')}
                className="w-5 h-5 accent-[#111214] cursor-pointer"
                aria-label={`${t({ en: 'In squad', is: 'Í hóp' })}: ${name}`}
              />
              <input
                type="number"
                inputMode="numeric"
                value={entry.jerseyOverride || (p.jersey_number?.toString() ?? '')}
                onChange={e => onJerseyOverride(p.id, e.target.value)}
                className="w-14 h-9 text-center text-[15px] font-semibold num border border-[#cdd2d9] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-[#f5f6f8]"
                min={1}
                max={99}
                disabled={!entry.inSquad}
                aria-label={`${t({ en: 'Jersey number', is: 'Treyjunúmer' })}: ${name}`}
              />
              <span className="flex-1 min-w-0 truncate text-[15px]">{p.first_name} <span className="font-semibold">{p.last_name}</span></span>
              <button
                type="button"
                onClick={() => entry.inSquad !== false && onToggle(p.id, 'isStarter')}
                disabled={!entry.inSquad}
                aria-pressed={entry.isStarter}
                className={`h-8 px-3 rounded-md text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${
                  entry.isStarter ? 'bg-[#111214] text-white' : 'bg-[#f5f6f8] text-muted border border-line hover:text-ink'
                }`}
              >
                {t({ en: 'Starter', is: 'Byrjar' })}
              </button>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
