import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAllProfiles, setApproval, type ProfileWithTeam } from '@/lib/supabase/queries'

interface Props {
  onBack: () => void
}

export function AdminPage({ onBack }: Props) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('pending')

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['admin', 'profiles'],
    queryFn: getAllProfiles,
  })

  const approveMutation = useMutation({
    mutationFn: ({ userId, approved }: { userId: string; approved: boolean }) =>
      setApproval(userId, approved),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'profiles'] }),
  })

  const filtered = profiles.filter(p => {
    if (filter === 'pending') return !p.is_approved
    if (filter === 'approved') return p.is_approved
    return true
  })

  const pendingCount = profiles.filter(p => !p.is_approved).length

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
        <div>
          <h1 className="text-lg font-bold">Stjórnborð</h1>
          <p className="text-xs text-slate-400">Notendastjórnun</p>
        </div>
        <button
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Til baka
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-slate-700">
        {(['pending', 'approved', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-3 text-sm font-medium transition-colors relative ${
              filter === f ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {f === 'pending' ? 'Bíður samþykkis' : f === 'approved' ? 'Samþykktir' : 'Allir'}
            {f === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
            {filter === f && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="divide-y divide-slate-800">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-500 py-12 text-sm">
            {filter === 'pending' ? 'Engir notendur bíða samþykkis' : 'Engir notendur'}
          </p>
        ) : (
          filtered.map(profile => (
            <ProfileRow
              key={profile.id}
              profile={profile}
              onApprove={() => approveMutation.mutate({ userId: profile.id, approved: true })}
              onRevoke={() => approveMutation.mutate({ userId: profile.id, approved: false })}
              loading={approveMutation.isPending}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ProfileRow({
  profile,
  onApprove,
  onRevoke,
  loading,
}: {
  profile: ProfileWithTeam
  onApprove: () => void
  onRevoke: () => void
  loading: boolean
}) {
  const date = new Date(profile.created_at).toLocaleDateString('is-IS', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 shrink-0">
        {profile.email.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{profile.email}</p>
        <p className="text-xs text-slate-400">
          {profile.teamName ? `Lið: ${profile.teamName}` : 'Ekkert lið enn'} · {date}
        </p>
      </div>

      {/* Status + actions */}
      <div className="flex items-center gap-2 shrink-0">
        {profile.is_approved ? (
          <>
            <span className="text-xs text-green-400 font-medium">Samþykkt</span>
            <button
              onClick={onRevoke}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 text-slate-300 hover:bg-red-900 hover:text-red-300 disabled:opacity-40 transition-colors"
            >
              Afturkalla
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-yellow-400 font-medium">Bíður</span>
            <button
              onClick={onApprove}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
            >
              Samþykkja
            </button>
          </>
        )}
      </div>
    </div>
  )
}
