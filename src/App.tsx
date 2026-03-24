import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventLogger } from '@/components/LiveInput/EventLogger'
import { MatchSetupWizard } from '@/pages/Setup/MatchSetupWizard'
import { MatchReport } from '@/pages/Report/MatchReport'
import { useMatchStore } from '@/store/matchStore'
import { syncPendingEvents } from '@/lib/sync/supabaseSync'
import { getRoster } from '@/lib/supabase/queries'
import { supabase } from '@/lib/supabase/client'
import type { Match, Team } from '@/lib/db/schema'

const queryClient = new QueryClient()

function OnlineSync() {
  const setOnline = useMatchStore(s => s.setOnline)

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
      void syncPendingEvents()
    }
    function handleOffline() {
      setOnline(false)
    }
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

function AppInner() {
  const match = useMatchStore(s => s.match)
  const homeTeam = useMatchStore(s => s.homeTeam)
  const awayTeam = useMatchStore(s => s.awayTeam)
  const setSession = useMatchStore(s => s.setSession)
  const clearSession = useMatchStore(s => s.clearSession)
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

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

      setSession({ match, homeTeam: trackedTeam, awayTeam: opponentTeam, trackedPlayers, opponentPlayers })
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
        <button
          onClick={() => setStartError(null)}
          className="px-4 py-2 bg-white text-slate-900 rounded-lg font-medium"
        >
          Go back
        </button>
      </div>
    )
  }

  if (!match) {
    return <MatchSetupWizard onMatchStarted={handleMatchStarted} />
  }

  if (match.status === 'final' && homeTeam && awayTeam) {
    const trackedTeam = match.tracked_team_id === homeTeam.id ? homeTeam : awayTeam
    const opponentTeam = match.tracked_team_id === homeTeam.id ? awayTeam : homeTeam
    return (
      <MatchReport
        match={match}
        trackedTeam={trackedTeam}
        opponentTeam={opponentTeam}
        onNewMatch={clearSession}
      />
    )
  }

  return <EventLogger />
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Check for an existing session first, sign in anonymously if none
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        await supabase.auth.signInAnonymously()
      }
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <OnlineSync />
        <AppInner />
      </AuthGate>
    </QueryClientProvider>
  )
}
