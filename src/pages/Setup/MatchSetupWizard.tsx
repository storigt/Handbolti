import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TeamSetupStep } from './steps/TeamSetupStep'
import { MatchDetailsStep } from './steps/MatchDetailsStep'
import { RosterStep } from './steps/RosterStep'
import { ConfirmStep } from './steps/ConfirmStep'
import { getTrackedTeamId, setTrackedTeamId } from '@/lib/supabase/queries'
import { supabase } from '@/lib/supabase/client'
import type { Match, Team } from '@/lib/db/schema'
import { Spinner } from '@/components/ui'

type Step = 'team-setup' | 'match-details' | 'roster' | 'confirm'

interface Props {
  initialTeamId?: string | null
  onMatchStarted: (match: Match, trackedTeam: Team, opponentTeam: Team) => void
  onCancel?: () => void
}

export function MatchSetupWizard({ initialTeamId, onMatchStarted, onCancel }: Props) {
  const storedTeamId = initialTeamId ?? getTrackedTeamId()
  const [step, setStep] = useState<Step>(storedTeamId ? 'match-details' : 'team-setup')
  const [trackedTeamId, setTrackedTeamIdState] = useState<string>(storedTeamId ?? '')
  const [matchId, setMatchId] = useState<string>('')
  const [opponentTeamId, setOpponentTeamId] = useState<string>('')

  // Fetch team objects once we have IDs
  const { data: trackedTeam, isLoading: loadingTracked } = useQuery<Team>({
    queryKey: ['team', trackedTeamId],
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').eq('id', trackedTeamId).single()
      if (error) throw error
      return data as Team
    },
    enabled: !!trackedTeamId,
  })

  const { data: opponentTeam, isLoading: loadingOpponent } = useQuery<Team>({
    queryKey: ['team', opponentTeamId],
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').eq('id', opponentTeamId).single()
      if (error) throw error
      return data as Team
    },
    enabled: !!opponentTeamId,
  })

  const { data: match, isLoading: loadingMatch } = useQuery<Match>({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const { data, error } = await supabase.from('matches').select('*').eq('id', matchId).single()
      if (error) throw error
      return data as Match
    },
    enabled: !!matchId,
  })

  const STEPS: Step[] = ['team-setup', 'match-details', 'roster', 'confirm']
  const visibleSteps = storedTeamId ? STEPS.slice(1) : STEPS
  const currentIndex = visibleSteps.indexOf(step)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        {onCancel && (
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 text-sm font-medium">
            ← Back
          </button>
        )}
        <h1 className="text-lg font-bold text-gray-900">New Match</h1>
      </div>

      {/* Progress bar */}
      <div className="flex bg-white border-b border-gray-100">
        {visibleSteps.map((s, i) => (
          <div
            key={s}
            className={`flex-1 py-2 text-center text-xs font-medium border-b-2 transition-colors ${
              i === currentIndex
                ? 'border-blue-600 text-blue-600'
                : i < currentIndex
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-400'
            }`}
          >
            {i < currentIndex ? '✓ ' : `${i + 1}. `}
            {s === 'team-setup' ? 'My team' :
             s === 'match-details' ? 'Match details' :
             s === 'roster' ? 'Roster' : 'Confirm'}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 flex justify-center py-8 px-4">
        <div className="w-full max-w-2xl">
          {step === 'team-setup' && (
            <TeamSetupStep
              onDone={(id) => {
                setTrackedTeamId(id)
                setTrackedTeamIdState(id)
                setStep('match-details')
              }}
            />
          )}

          {step === 'match-details' && trackedTeamId && (
            <MatchDetailsStep
              trackedTeamId={trackedTeamId}
              onDone={(mId, oppId) => {
                setMatchId(mId)
                setOpponentTeamId(oppId)
                setStep('roster')
              }}
              onBack={() => setStep('team-setup')}
            />
          )}

          {step === 'roster' && matchId && trackedTeamId && opponentTeamId && (
            <RosterStep
              matchId={matchId}
              trackedTeamId={trackedTeamId}
              opponentTeamId={opponentTeamId}
              onDone={() => setStep('confirm')}
              onBack={() => setStep('match-details')}
            />
          )}

          {step === 'confirm' && (
            loadingTracked || loadingOpponent || loadingMatch ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : trackedTeam && opponentTeam && match ? (
              <ConfirmStep
                match={match}
                trackedTeam={trackedTeam}
                opponentTeam={opponentTeam}
                onStart={() => onMatchStarted(match, trackedTeam, opponentTeam)}
                onBack={() => setStep('roster')}
              />
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}
