import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { LiveMatchView } from '@/components/LiveInput/LiveMatchView'
import { MatchSetupWizard } from '@/pages/Setup/MatchSetupWizard'
import { MatchReport } from '@/pages/Report/MatchReport'
import { SeasonDashboard } from '@/pages/Dashboard/SeasonDashboard'
import { LoginPage } from '@/pages/Auth/LoginPage'
import { AdminPage } from '@/pages/Admin/AdminPage'
import { useMatchStore } from '@/store/matchStore'
import { syncPendingEvents } from '@/lib/sync/supabaseSync'
import { getRoster, getTrackedTeamId, getTeams, getProfile, checkIsAdmin } from '@/lib/supabase/queries'
import { supabase } from '@/lib/supabase/client'
import type { Match, Team, Profile } from '@/lib/db/schema'

const queryClient = new QueryClient()

function Spinner() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-900">
      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

function HomeScreen({
  onNewMatch,
  onDashboard,
  onAdmin,
  onSignOut,
  hasSavedTeam,
  isAdmin,
  userEmail,
}: {
  onNewMatch: () => void
  onDashboard: () => void
  onAdmin: () => void
  onSignOut: () => void
  hasSavedTeam: boolean
  isAdmin: boolean
  userEmail: string
}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white gap-6 px-6">
      <h1 className="text-3xl font-bold tracking-tight">Handbolti</h1>
      <p className="text-slate-400 text-sm">Handball match statistics</p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onNewMatch}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl text-lg transition-colors"
        >
          New Match
        </button>
        {hasSavedTeam && (
          <button
            onClick={onDashboard}
            className="w-full py-4 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white font-semibold rounded-xl text-lg transition-colors"
          >
            Season Dashboard
          </button>
        )}
        {isAdmin && (
          <button
            onClick={onAdmin}
            className="w-full py-4 bg-amber-700 hover:bg-amber-600 active:bg-amber-800 text-white font-semibold rounded-xl text-lg transition-colors"
          >
            Admin
          </button>
        )}
      </div>

      <div className="absolute bottom-6 flex flex-col items-center gap-1">
        <p className="text-xs text-slate-500">{userEmail}</p>
        <button
          onClick={onSignOut}
          className="text-xs text-slate-500 hover:text-slate-300 underline"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function PendingApprovalScreen({ onSignOut, userEmail }: { onSignOut: () => void; userEmail: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white px-6 gap-5">
      <div className="text-5xl">⏳</div>
      <h2 className="text-xl font-bold text-center">Aðgangur bíður samþykkis</h2>
      <p className="text-slate-400 text-sm text-center max-w-sm">
        Reikningurinn þinn hefur verið búinn til en þarfnast samþykkis stjórnanda áður en þú getur skráð þig inn.
      </p>
      <p className="text-xs text-slate-500">{userEmail}</p>
      <button
        onClick={onSignOut}
        className="mt-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors"
      >
        Sign out
      </button>
    </div>
  )
}

function AppInner({ isAdmin, userEmail }: { isAdmin: boolean; userEmail: string }) {
  const match = useMatchStore(s => s.match)
  const setSession = useMatchStore(s => s.setSession)
  const clearSession = useMatchStore(s => s.clearSession)
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [view, setView] = useState<AppView>('home')

  const savedTeamId = getTrackedTeamId()
  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: getTeams,
    enabled: view === 'dashboard' && !!savedTeamId,
  })
  const trackedTeam = allTeams.find(t => t.id === savedTeamId) ?? null

  async function handleSignOut() {
    await supabase.auth.signOut()
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
        match,
        homeTeam: isTrackedHome ? trackedTeam : opponentTeam,
        awayTeam: isTrackedHome ? opponentTeam : trackedTeam,
        trackedPlayers,
        opponentPlayers,
      })
      setStarting(false)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start match')
      setStarting(false)
    }
  }

  if (starting) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white gap-3">
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        <span>Loading match…</span>
      </div>
    )
  }

  if (startError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white gap-4">
        <p className="text-red-400 text-lg">Failed to start match</p>
        <p className="text-slate-400 text-sm">{startError}</p>
        <button onClick={() => setStartError(null)} className="px-4 py-2 bg-white text-slate-900 rounded-lg font-medium">
          Go back
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
      />
    )
  }

  if (view === 'setup') {
    return <MatchSetupWizard onMatchStarted={handleMatchStarted} onCancel={() => setView('home')} />
  }

  return (
    <HomeScreen
      onNewMatch={() => setView('setup')}
      onDashboard={() => setView('dashboard')}
      onAdmin={() => setView('admin')}
      onSignOut={handleSignOut}
      hasSavedTeam={!!savedTeamId}
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

  useEffect(() => {
    async function loadProfile(s: Session) {
      const p = await getProfile(s.user.id)
      if (!p) {
        await supabase.auth.signOut()
        return
      }
      const admin = await checkIsAdmin(s.user.id)
      setProfile(p)
      setIsAdmin(admin)
    }

    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session
      if (s) {
        await loadProfile(s)
      } else {
        setProfile(null)
      }
      setSession(s)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, s) => {
      setSession(s)
      if (s) {
        await loadProfile(s)
      } else {
        setProfile(null)
        setIsAdmin(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined || (session && profile === undefined)) {
    return <Spinner />
  }

  if (!session || !profile) {
    return <LoginPage />
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
      <AppInner isAdmin={isAdmin} userEmail={profile.email} />
    </>
  )
}
