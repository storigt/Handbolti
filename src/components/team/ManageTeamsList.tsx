// Shared team management list: rename, delete/hide, restore, add — used both
// from the match-setup wizard's "Manage teams" tab and as a modal from the
// Season Dashboard.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import {
  createTeam, getMyTeams, getArchivedTeams, getTeamMatchCounts, updateTeam,
  deleteTeam, archiveTeam, restoreTeam, setTrackedTeamId, updateProfileTeam,
} from '@/lib/supabase/queries'

interface Props {
  mainTeamId: string | null
  // If provided, "+ Add a new team" calls this instead of showing an inline
  // name-only create form (e.g. the wizard routes to its full squad-setup step).
  onAddTeam?: () => void
}

export function ManageTeamsList({ mainTeamId, onAddTeam }: Props) {
  const queryClient = useQueryClient()

  const { data: myTeams = [], isLoading: loadingTeams } = useQuery({
    queryKey: ['my-teams'],
    queryFn: getMyTeams,
  })

  const { data: archivedTeams = [] } = useQuery({
    queryKey: ['archived-teams'],
    queryFn: getArchivedTeams,
  })

  const teamIds = myTeams.map(t => t.id)
  const { data: matchCounts = {} } = useQuery({
    queryKey: ['team-match-counts', teamIds.join(',')],
    queryFn: () => getTeamMatchCounts(teamIds),
    enabled: teamIds.length > 0,
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const renameMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) => updateTeam(vars.id, { name: vars.name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-teams'] })
      setEditingId(null)
    },
  })

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const removeMutation = useMutation({
    mutationFn: (team: { id: string; hasMatches: boolean }) =>
      team.hasMatches ? archiveTeam(team.id) : deleteTeam(team.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-teams'] })
      void queryClient.invalidateQueries({ queryKey: ['archived-teams'] })
      setConfirmDeleteId(null)
    },
  })

  const restoreMutation = useMutation({
    mutationFn: restoreTeam,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-teams'] })
      void queryClient.invalidateQueries({ queryKey: ['archived-teams'] })
    },
  })

  const [addingNew, setAddingNew] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const createMutation = useMutation({
    mutationFn: async () => {
      const team = await createTeam({ name: newTeamName.trim(), short_name: null, home_venue: null })
      if (myTeams.length === 0) {
        setTrackedTeamId(team.id)
        void updateProfileTeam(team.id)
      }
      return team
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-teams'] })
      setNewTeamName('')
      setAddingNew(false)
    },
  })

  return (
    <div className="space-y-4">
      <div className="border rounded-lg border-gray-200 p-4 space-y-2">
        {loadingTeams ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : myTeams.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">You don't have any teams yet — add one below.</p>
        ) : (
          <div className="space-y-2">
            {myTeams.map(team => {
              const count = matchCounts[team.id]
              const hasMatches = (count ?? 0) > 0
              const isMain = team.id === mainTeamId
              const isEditing = editingId === team.id
              const isConfirming = confirmDeleteId === team.id

              return (
                <div key={team.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200">
                  {isEditing ? (
                    <>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => editName.trim() && renameMutation.mutate({ id: team.id, name: editName.trim() })}
                        disabled={!editName.trim() || renameMutation.isPending}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 px-2 py-1 shrink-0"
                      >
                        {renameMutation.isPending ? '…' : 'Vista'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 px-1 shrink-0"
                      >
                        Hætta við
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 font-medium text-gray-800 truncate">
                        {team.name}
                        {hasMatches && (
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            {count} {count === 1 ? 'leikur' : 'leikir'}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => { setEditingId(team.id); setEditName(team.name) }}
                        className="text-xs font-medium text-gray-500 hover:text-blue-600 px-2 py-1 shrink-0"
                      >
                        Breyta
                      </button>
                      {isMain ? (
                        <span className="text-xs text-gray-400 shrink-0">Aðallið</span>
                      ) : isConfirming ? (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => removeMutation.mutate({ id: team.id, hasMatches })}
                            disabled={removeMutation.isPending}
                            className={`text-xs font-medium px-2 py-1 rounded text-white disabled:opacity-50 ${
                              hasMatches ? 'bg-slate-600 hover:bg-slate-700' : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            {removeMutation.isPending ? '…' : hasMatches ? 'Fela?' : 'Eyða?'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 px-1"
                          >
                            Hætta við
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(team.id)}
                          className="text-xs font-medium text-gray-400 hover:text-red-500 px-2 py-1 shrink-0"
                        >
                          {hasMatches ? 'Fela' : 'Eyða'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {renameMutation.error && (
        <p className="text-sm text-red-600">{(renameMutation.error as Error).message}</p>
      )}
      {removeMutation.error && (
        <p className="text-sm text-red-600">{(removeMutation.error as Error).message}</p>
      )}
      {restoreMutation.error && (
        <p className="text-sm text-red-600">{(restoreMutation.error as Error).message}</p>
      )}
      {createMutation.error && (
        <p className="text-sm text-red-600">{(createMutation.error as Error).message}</p>
      )}

      {onAddTeam ? (
        <button
          onClick={onAddTeam}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          + Add a new team
        </button>
      ) : addingNew ? (
        <div className="flex items-center gap-2">
          <input
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            placeholder="Team name"
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <button
            onClick={() => newTeamName.trim() && createMutation.mutate()}
            disabled={!newTeamName.trim() || createMutation.isPending}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 px-2 py-1.5 shrink-0"
          >
            {createMutation.isPending ? 'Saving…' : 'Vista'}
          </button>
          <button
            onClick={() => { setAddingNew(false); setNewTeamName('') }}
            className="text-xs text-gray-400 hover:text-gray-600 px-1 shrink-0"
          >
            Hætta við
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingNew(true)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          + Add a new team
        </button>
      )}

      {archivedTeams.length > 0 && (
        <div className="pt-2 border-t border-gray-100 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Falin lið</p>
          {archivedTeams.map(team => (
            <div key={team.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50">
              <span className="flex-1 text-sm text-gray-500 truncate">{team.name}</span>
              <button
                onClick={() => restoreMutation.mutate(team.id)}
                disabled={restoreMutation.isPending}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 px-2 py-1 shrink-0"
              >
                {restoreMutation.isPending ? '…' : 'Sýna aftur'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
