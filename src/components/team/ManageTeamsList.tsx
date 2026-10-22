// Shared team management list: rename, delete/hide, restore, add — used both
// from the match-setup wizard's "Manage teams" tab and as a modal from the
// Season Dashboard.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Spinner } from '@/components/ui'
import { useT } from '@/lib/i18n/lang'
import { T } from '@/lib/i18n/terms'
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

  const teamIds = myTeams.map(tm => tm.id)
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

  const t = useT()
  const err = (e: unknown) => e ? <p className="text-[14px] text-[#c4242a]" role="alert">{(e as Error).message}</p> : null
  const textBtn = 'h-8 px-2.5 rounded-md text-[13px] font-medium transition-colors shrink-0 disabled:opacity-50'

  return (
    <div className="space-y-4">
      <div className="bg-white border border-line rounded-lg">
        {loadingTeams ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : myTeams.length === 0 ? (
          <p className="text-[15px] text-muted p-4">{t({ en: 'You have no teams yet. Add one below.', is: 'Þú átt engin lið enn. Bættu við liði hér fyrir neðan.' })}</p>
        ) : (
          <ul>
            {myTeams.map(team => {
              const count = matchCounts[team.id]
              const hasMatches = (count ?? 0) > 0
              const isMain = team.id === mainTeamId
              const isEditing = editingId === team.id
              const isConfirming = confirmDeleteId === team.id

              return (
                <li key={team.id} className="flex items-center gap-2 px-4 min-h-[56px] py-2 border-t border-[#eef0f2] first:border-t-0">
                  {isEditing ? (
                    <>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 !h-9" autoFocus
                        aria-label={t({ en: 'Team name', is: 'Nafn liðs' })} autoComplete="off" />
                      <Button size="sm" onClick={() => editName.trim() && renameMutation.mutate({ id: team.id, name: editName.trim() })}
                        disabled={!editName.trim() || renameMutation.isPending}>
                        {renameMutation.isPending ? '…' : t(T.save)}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>{t(T.cancel)}</Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 truncate text-[15px] font-medium">
                        {team.name}
                        {hasMatches && <span className="ml-2 text-[13px] font-normal text-muted num">{count} {count === 1 ? t({ en: 'match', is: 'leikur' }) : t({ en: 'matches', is: 'leikir' })}</span>}
                      </span>
                      <button type="button" onClick={() => { setEditingId(team.id); setEditName(team.name) }}
                        className={`${textBtn} text-muted hover:text-ink hover:bg-[#f5f6f8]`}>
                        {t({ en: 'Rename', is: 'Breyta' })}
                      </button>
                      {isMain ? (
                        <span className="text-[12px] font-medium px-2 py-0.5 rounded bg-[#eef0f3] shrink-0">{t({ en: 'Main team', is: 'Aðallið' })}</span>
                      ) : isConfirming ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[13px] text-muted hidden sm:inline">
                            {hasMatches ? t({ en: 'Hide this team?', is: 'Fela þetta lið?' }) : t({ en: 'Delete this team?', is: 'Eyða þessu liði?' })}
                          </span>
                          <button type="button" onClick={() => removeMutation.mutate({ id: team.id, hasMatches })} disabled={removeMutation.isPending}
                            className={`${textBtn} text-white ${hasMatches ? 'bg-[#111214]' : 'bg-[#c4242a]'}`}>
                            {removeMutation.isPending ? '…' : hasMatches ? t({ en: 'Hide', is: 'Fela' }) : t(T.delete)}
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className={`${textBtn} text-muted hover:text-ink`}>{t(T.cancel)}</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmDeleteId(team.id)}
                          className={`${textBtn} text-muted hover:text-[#c4242a] hover:bg-[#ffedea]`}>
                          {hasMatches ? t({ en: 'Hide', is: 'Fela' }) : t(T.delete)}
                        </button>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {err(renameMutation.error)}
      {err(removeMutation.error)}
      {err(restoreMutation.error)}
      {err(createMutation.error)}

      {onAddTeam ? (
        <Button variant="secondary" onClick={onAddTeam}>{t({ en: 'Add a new team', is: 'Bæta við nýju liði' })}</Button>
      ) : addingNew ? (
        <div className="flex items-center gap-2">
          <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} autoComplete="off"
            placeholder={t({ en: 'Team name', is: 'Nafn liðs' })} aria-label={t({ en: 'Team name', is: 'Nafn liðs' })} className="flex-1" autoFocus />
          <Button onClick={() => newTeamName.trim() && createMutation.mutate()} disabled={!newTeamName.trim() || createMutation.isPending}>
            {createMutation.isPending ? t(T.saving) : t(T.save)}
          </Button>
          <Button variant="ghost" onClick={() => { setAddingNew(false); setNewTeamName('') }}>{t(T.cancel)}</Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setAddingNew(true)}>{t({ en: 'Add a new team', is: 'Bæta við nýju liði' })}</Button>
      )}

      {archivedTeams.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-[14px] font-medium">{t({ en: 'Hidden teams', is: 'Falin lið' })}</p>
          <ul className="bg-[#f5f6f8] border border-line rounded-lg">
            {archivedTeams.map(team => (
              <li key={team.id} className="flex items-center gap-2 px-4 min-h-[48px] border-t border-line first:border-t-0">
                <span className="flex-1 text-[15px] text-muted truncate">{team.name}</span>
                <Button variant="secondary" size="sm" onClick={() => restoreMutation.mutate(team.id)} disabled={restoreMutation.isPending}>
                  {restoreMutation.isPending ? '…' : t({ en: 'Show again', is: 'Sýna aftur' })}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
