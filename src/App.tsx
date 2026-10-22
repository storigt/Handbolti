import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { LiveMatchView } from '@/components/LiveInput/LiveMatchView'
import { MatchSetupWizard } from '@/pages/Setup/MatchSetupWizard'
import { MatchReport } from '@/pages/Report/MatchReport'
import { SeasonDashboard } from '@/pages/Dashboard/SeasonDashboard'
import { LoginPage, type AuthMode } from '@/pages/Auth/LoginPage'
import { useIndexStore } from '@/store/indexStore'
import { LangToggle } from '@/components/ui'
import { LandingPage } from '@/pages/Landing/LandingPage'
import { Wordmark } from '@/components/brand/Logo'
import { useT } from '@/lib/i18n/lang'
import { HomeScreen } from '@/pages/Home/HomeScreen'
import { AdminPage } from '@/pages/Admin/AdminPage'
import { useMatchStore } from '@/store/matchStore'
import { syncPendingEvents } from '@/lib/sync/supabaseSync'
import { getRoster, getTrackedTeamId, setTrackedTeamId, getTeams, getProfile, checkIsAdmin, getMatchById, getTeamById, getMatchEvents, updateProfileTeam } from '@/lib/supabase/queries'
import { reopenMatch } from '@/lib/supabase/reportQueries'
import { supabase } from '@/lib/supabase/client'
import { getSavedSession } from '@/store/matchStore'
import type { Match, Team, Profile } from '@/lib/db/schema'

const queryClient = new QueryClient()

function Spinner() {
  return (
    <div className="flex items-center justify-center h-svh bg-ground" role="status" aria-label="Loading">
      <div className="w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function TimedOutScreen() {
  const t = useT()
  return (
    <div className="flex flex-col items-center justify-center min-h-svh bg-ground text-ink gap-4 px-6">
      <p className="text-[16px] text-center">{t({ en: 'The connection took too long.', is: 'Tenging tók of langan tíma.' })}</p>
      <button
        onClick={() => window.location.reload()}
        className="h-11 px-5 rounded-md bg-accent hover:bg-accent-strong text-white font-medium transition-colors"
      >
        {t({ en: 'Try again', is: 'Reyna aftur' })}
      </button>
      <button
        onClick={async () => { await supabase.auth.signOut(); window.location.reload() }}
        className="text-[14px] text-muted hover:text-ink underline underline-offset-4"
      >
        {t({ en: 'Sign out and try again', is: 'Skrá út og reyna aftur' })}
      </button>
    </div>
  )
}

function OnlineSync() {
  const setOnline = useMatchStore(s => s.setOnline)

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
      void syncPendingEvents()
    }
    function handleOffline() { setOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', handleOnline)
    if (navigator.onLine) void syncPendingEvents()
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', handleOnline)
    }
  }, [setOnline])

  return null
}

type AppView = 'home' | 'setup' | 'dashboard' | 'admin'

function PendingApprovalScreen({ onSignOut, userEmail }: { onSignOut: () => void; userEmail: string }) {
  const t = useT()
  return (
    <div className="min-h-svh bg-ground text-ink flex flex-col">
      <header className="flex items-center justify-between gap-4 px-4 sm:px-8 py-5">
        <span className="font-bold uppercase tracking-tight text-[17px]"><Wordmark size={22} /></span>
        <LangToggle />
      </header>
      <main className="flex-1 grid place-items-center px-4 pb-16">
        <div className="w-full max-w-[440px] bg-white border border-line rounded-xl p-6 sm:p-8 flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">{t({ en: 'Your account is waiting for approval', is: 'Aðgangurinn bíður samþykkis' })}</h1>
          <p className="text-[16px] leading-relaxed">
            {t({
              en: 'Your account has been created. It is reviewed by hand, and you can start adding your team as soon as it is approved.',
              is: 'Aðgangurinn hefur verið búinn til. Hann er yfirfarinn og þú getur byrjað að bæta liðinu við um leið og hann hefur verið samþykktur.',
            })}
          </p>
          <p className="text-[14px] text-muted">{t({ en: 'Signed in as', is: 'Skráð inn sem' })} <span className="text-ink font-medium">{userEmail}</span></p>
          <button
            onClick={onSignOut}
            className="self-start h-10 px-4 rounded-md bg-[#e5e5e5] hover:bg-[#d9d9d9] active:scale-[0.98] text-[15px] font-medium transition"
          >
            {t({ en: 'Sign out', is: 'Skrá út' })}
          </button>
        </div>
      </main>
    </div>
  )
}

/**
 * Logged-out visitors: the landing page first, then sign-in or sign-up.
 * The URL hash reflects the screen (#signin, #request-access), so links can
 * be shared and the Back button returns to the landing page.
 */
function screenFromHash(): { view: 'landing' } | { view: 'auth'; mode: AuthMode } {
  const h = window.location.hash
  if (h === '#signin') return { view: 'auth', mode: 'signin' }
  if (h === '#request-access') return { view: 'auth', mode: 'signup' }
  return { view: 'landing' }
}

function PublicGate() {
  const [screen, setScreen] = useState(screenFromHash)
  const [email, setEmail] = useState('')

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => { if (screen.view === 'auth') window.scrollTo(0, 0) }, [screen.view])

  if (screen.view === 'auth') {
    return (
      <LoginPage
        key={screen.mode + email}
        initialMode={screen.mode}
        initialEmail={email}
        onBack={() => {
          // Back to the landing page without leaving a dead "#" in the address bar
          history.pushState(null, '', window.location.pathname + window.location.search)
          setScreen({ view: 'landing' })
        }}
      />
    )
  }
  return (
    <LandingPage
      onSignIn={() => { window.location.hash = 'signin' }}
      onRequestAccess={(e) => { setEmail(e ?? ''); window.location.hash = 'request-access' }}
    />
  )
}

function AppInner({ isAdmin, userEmail, profileTeamId }: { isAdmin: boolean; userEmail: string; profileTeamId: string | null }) {
  const t = useT()
  const match = useMatchStore(s => s.match)
  const setSession = useMatchStore(s => s.setSession)
  const resumeSession = useMatchStore(s => s.resumeSession)
  const clearSession = useMatchStore(s => s.clearSession)
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [view, setView] = useState<AppView>('home')
  const [hasSavedMatch, setHasSavedMatch] = useState(() => !!getSavedSession())

  // Source of truth: profile (cross-device). localStorage is just a fast cache —
  // when both are present and differ (e.g. main team switched on another device),
  // the profile always wins and the stale local cache is overwritten.
  const [savedTeamId, setSavedTeamId] = useState<string | null>(() => {
    const local = getTrackedTeamId()
    if (profileTeamId && local !== profileTeamId) {
      setTrackedTeamId(profileTeamId)
    }
    return profileTeamId ?? local
  })

  // Index settings follow the account
  useEffect(() => { void useIndexStore.getState().load() }, [])

  // Bootstrap: if this device has a team cached but the profile doesn't have one yet
  // (e.g. a pre-migration user), push it up to the profile.
  useEffect(() => {
    if (savedTeamId && !profileTeamId) {
      void updateProfileTeam(savedTeamId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleMainTeamChanged(teamId: string) {
    setTrackedTeamId(teamId)
    void updateProfileTeam(teamId)
    setSavedTeamId(teamId)
  }

  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: getTeams,
    enabled: view === 'dashboard' && !!savedTeamId,
  })
  const trackedTeam = allTeams.find(t => t.id === savedTeamId) ?? null

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  async function loadMatchIntoStore(matchId: string, savedPeriod?: number, savedMinute?: number, savedLineupIds?: string[], savedLineupId?: string | null) {
    const [match, allTeamsData] = await Promise.all([
      getMatchById(matchId),
      getTeams(),
    ])
    if (!match) throw new Error(t({ en: 'Match not found.', is: 'Leikur fannst ekki.' }))

    const homeTeam = allTeamsData.find(t => t.id === match.home_team_id) ?? await getTeamById(match.home_team_id)
    const awayTeam = allTeamsData.find(t => t.id === match.away_team_id) ?? await getTeamById(match.away_team_id)
    if (!homeTeam || !awayTeam) throw new Error(t({ en: 'Teams not found.', is: 'Lið fundust ekki.' }))

    const [rosterWithPlayers, events] = await Promise.all([
      getRoster(match.id),
      getMatchEvents(match.id),
    ])

    const trackedPlayers = rosterWithPlayers
      .filter(r => r.team_id === match.tracked_team_id)
      .map(r => ({ ...r.player, roster: r }))
    const opponentPlayers = rosterWithPlayers
      .filter(r => r.team_id !== match.tracked_team_id)
      .map(r => ({ ...r.player, roster: r }))

    const lineupPlayerIds = savedLineupIds ?? trackedPlayers.filter(p => p.roster.is_starter).map(p => p.id)

    resumeSession({
      match,
      homeTeam,
      awayTeam,
      trackedPlayers,
      opponentPlayers,
      events,
      period: savedPeriod ?? 1,
      matchMinute: savedMinute ?? 0,
      lineupPlayerIds,
      lineupId: savedLineupId ?? null,
    })
  }

  async function handleResumeMatch() {
    const saved = getSavedSession()
    if (!saved) return
    setStarting(true)
    setStartError(null)
    try {
      await loadMatchIntoStore(saved.matchId, saved.period, saved.matchMinute, saved.lineupPlayerIds, saved.lineupId)
      setHasSavedMatch(false)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : t({ en: 'Could not resume the match.', is: 'Tókst ekki að halda áfram leik.' }))
    } finally {
      setStarting(false)
    }
  }

  async function handleEditMatch(matchId: string) {
    setStarting(true)
    setStartError(null)
    setView('home')
    try {
      await reopenMatch(matchId)
      await loadMatchIntoStore(matchId)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : t({ en: 'Could not open the match for editing.', is: 'Tókst ekki að opna leik til breytinga.' }))
    } finally {
      setStarting(false)
    }
  }

  async function handleMatchStarted(match: Match, trackedTeam: Team, opponentTeam: Team) {
    setStarting(true)
    setStartError(null)
    try {
      const rosterWithPlayers = await getRoster(match.id)
      const trackedPlayers = rosterWithPlayers
        .filter(r => r.team_id === match.tracked_team_id)
        .map(r => ({ ...r.player, roster: r }))
      const opponentPlayers = rosterWithPlayers
        .filter(r => r.team_id !== match.tracked_team_id)
        .map(r => ({ ...r.player, roster: r }))
      const isTrackedHome = match.home_team_id === trackedTeam.id
      setSession({
        match: { ...match, status: 'in_progress' },
        homeTeam: isTrackedHome ? trackedTeam : opponentTeam,
        awayTeam: isTrackedHome ? opponentTeam : trackedTeam,
        trackedPlayers,
        opponentPlayers,
      })
      setStarting(false)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : t({ en: 'Could not start the match.', is: 'Tókst ekki að hefja leikinn.' }))
      setStarting(false)
    }
  }

  if (starting) {
    return (
      <div className="flex items-center justify-center min-h-svh bg-ground text-ink gap-3" role="status">
        <div className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
        <span className="text-[16px]">{t({ en: 'Loading the match…', is: 'Sæki leikinn…' })}</span>
      </div>
    )
  }

  if (startError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-svh bg-ground text-ink gap-3 px-6 text-center">
        <p className="text-[20px] font-semibold">{t({ en: 'The match could not be opened', is: 'Ekki tókst að opna leikinn' })}</p>
        <p className="text-[15px] text-muted max-w-md">{startError}</p>
        <button onClick={() => setStartError(null)} className="mt-2 h-10 px-4 rounded-md bg-[#111214] text-white text-[14px] font-medium hover:bg-black transition">
          {t({ en: 'Back', is: 'Til baka' })}
        </button>
      </div>
    )
  }

  if (match) {
    if (match.status === 'final') {
      return (
        <MatchReport
          onNewMatch={() => { clearSession(); setView('home') }}
          onDashboard={() => { clearSession(); setView('dashboard') }}
        />
      )
    }
    return <LiveMatchView />
  }

  if (view === 'admin') {
    return <AdminPage onBack={() => setView('home')} />
  }

  if (view === 'dashboard') {
    if (!trackedTeam) return <Spinner />
    return (
      <SeasonDashboard
        trackedTeam={trackedTeam}
        onNewMatch={() => setView('home')}
        onEditMatch={handleEditMatch}
        onMainTeamChanged={handleMainTeamChanged}
      />
    )
  }

  if (view === 'setup') {
    return <MatchSetupWizard initialTeamId={savedTeamId} onMatchStarted={handleMatchStarted} onCancel={() => setView('home')} />
  }

  return (
    <HomeScreen
      teamId={savedTeamId}
      onNewMatch={() => setView('setup')}
      onResumeMatch={handleResumeMatch}
      onDashboard={() => setView('dashboard')}
      onAdmin={() => setView('admin')}
      onSignOut={handleSignOut}
      hasSavedMatch={hasSavedMatch}
      isAdmin={isAdmin}
      userEmail={userEmail}
    />
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGateWithInner />
    </QueryClientProvider>
  )
}

function AuthGateWithInner() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authTimedOut, setAuthTimedOut] = useState(false)

  // Step 1: Listen for auth state changes — synchronous only, no async work here.
  // Doing async work inside onAuthStateChange deadlocks the Supabase auth lock.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setIsAdmin(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Step 2: Once session is known, load the profile separately.
  useEffect(() => {
    if (session === undefined) return  // still waiting for initial auth state

    const timeout = setTimeout(() => setAuthTimedOut(true), 15_000)

    if (!session) {
      clearTimeout(timeout)
      return
    }

    let cancelled = false
    async function loadProfile() {
      try {
        const [p, admin] = await Promise.all([
          getProfile(session!.user.id),
          checkIsAdmin(session!.user.id),
        ])
        if (cancelled) return
        if (!p) {
          setProfile(null)
          setIsAdmin(false)
          await supabase.auth.signOut().catch(() => {})
          return
        }
        setProfile(p)
        setIsAdmin(admin)
      } catch {
        if (cancelled) return
        setProfile(null)
        setIsAdmin(false)
      } finally {
        clearTimeout(timeout)
      }
    }
    void loadProfile()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [session])

  if (session === undefined || (session && profile === undefined)) {
    if (authTimedOut) {
      return <TimedOutScreen />
    }
    return <Spinner />
  }

  if (!session || !profile) {
    return <PublicGate />
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (!profile.is_approved && !isAdmin) {
    return <PendingApprovalScreen onSignOut={handleSignOut} userEmail={profile.email} />
  }

  return (
    <>
      <OnlineSync />
      <AppInner isAdmin={isAdmin} userEmail={profile.email} profileTeamId={profile.tracked_team_id ?? null} />
    </>
  )
}
