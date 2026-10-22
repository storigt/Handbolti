import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAllProfiles, setApproval, type ProfileWithTeam } from '@/lib/supabase/queries'
import { useLang, useT } from '@/lib/i18n/lang'
import { AppBar, Button, EmptyLine, PageTitle, Spinner, Tabs } from '@/components/ui'

interface Props {
  onBack: () => void
}

type Filter = 'all' | 'pending' | 'approved'

export function AdminPage({ onBack }: Props) {
  const t = useT()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Filter>('pending')

  const { data: profiles = [], isLoading, isError, refetch } = useQuery({
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
  const approvedCount = profiles.length - pendingCount
  const count = (n: number) => <span className="ml-1.5 text-muted num">{n}</span>

  return (
    <div className="min-h-svh bg-ground text-ink">
      <AppBar title={t({ en: 'Accounts', is: 'Aðgangar' })} onBack={onBack} backLabel={t({ en: 'Home', is: 'Heim' })} />

      <main className="max-w-[880px] mx-auto px-4 sm:px-6 pt-8 pb-16 flex flex-col gap-4">
        <PageTitle
          title={t({ en: 'Accounts', is: 'Aðgangar' })}
          sub={pendingCount > 0
            ? t({ en: `${pendingCount} waiting for approval.`, is: `${pendingCount} bíða samþykkis.` })
            : t({ en: 'Nobody is waiting for approval.', is: 'Enginn bíður samþykkis.' })}
        />

        <section className="bg-white border border-line rounded-lg overflow-hidden">
          <div className="px-2">
            <Tabs<Filter> value={filter} onChange={setFilter} label={t({ en: 'Filter accounts', is: 'Sía aðganga' })} options={[
              { v: 'pending', label: <>{t({ en: 'Waiting', is: 'Bíða' })}{count(pendingCount)}</> },
              { v: 'approved', label: <>{t({ en: 'Approved', is: 'Samþykktir' })}{count(approvedCount)}</> },
              { v: 'all', label: <>{t({ en: 'All', is: 'Allir' })}{count(profiles.length)}</> },
            ]} />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          ) : isError ? (
            <p className="px-5 py-6 text-[14px] flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#c4242a]" aria-hidden="true" />
              {t({ en: 'Couldn’t load accounts.', is: 'Ekki tókst að sækja aðganga.' })}
              <button type="button" onClick={() => refetch()} className="font-medium underline underline-offset-4">{t({ en: 'Retry', is: 'Reyna aftur' })}</button>
            </p>
          ) : filtered.length === 0 ? (
            <div className="p-5">
              <EmptyLine>{filter === 'pending' ? t({ en: 'No accounts are waiting for approval.', is: 'Engir notendur bíða samþykkis.' }) : t({ en: 'No accounts here.', is: 'Engir notendur hér.' })}</EmptyLine>
            </div>
          ) : (
            <ul>
              {filtered.map(profile => (
                <ProfileRow
                  key={profile.id}
                  profile={profile}
                  onApprove={() => approveMutation.mutate({ userId: profile.id, approved: true })}
                  onRevoke={() => approveMutation.mutate({ userId: profile.id, approved: false })}
                  loading={approveMutation.isPending}
                />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

function ProfileRow({ profile, onApprove, onRevoke, loading }: {
  profile: ProfileWithTeam
  onApprove: () => void
  onRevoke: () => void
  loading: boolean
}) {
  const t = useT()
  const lang = useLang(s => s.lang)
  const date = new Date(profile.created_at).toLocaleDateString(lang === 'is' ? 'is-IS' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <li className="flex items-center gap-4 px-5 min-h-[68px] py-3 border-t border-[#eef0f2]">
      <div className="w-9 h-9 rounded-full bg-[#eef0f3] flex items-center justify-center text-[14px] font-semibold shrink-0" aria-hidden="true">
        {profile.email.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium truncate">{profile.email}</p>
        <p className="text-[13px] text-muted truncate">
          {profile.teamName ?? t({ en: 'No team yet', is: 'Ekkert lið enn' })} · {t({ en: 'joined', is: 'skráð' })} {date}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {profile.is_approved ? (
          <>
            <span className="hidden sm:inline text-[12px] font-medium px-2 py-0.5 rounded bg-[#dcfae5] text-[#04250e]">{t({ en: 'Approved', is: 'Samþykkt' })}</span>
            <Button variant="danger" size="sm" onClick={onRevoke} disabled={loading}>{t({ en: 'Revoke', is: 'Afturkalla' })}</Button>
          </>
        ) : (
          <>
            <span className="hidden sm:inline text-[12px] font-medium px-2 py-0.5 rounded bg-[#fffbeb] text-[#92400e] border border-[#fde68a]">{t({ en: 'Waiting', is: 'Bíður' })}</span>
            <Button variant="primary" size="sm" onClick={onApprove} disabled={loading}>{t({ en: 'Approve', is: 'Samþykkja' })}</Button>
          </>
        )}
      </div>
    </li>
  )
}
