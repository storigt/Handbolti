import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TeamSetupStep } from './steps/TeamSetupStep'
import { MatchDetailsStep } from './steps/MatchDetailsStep'
import { RosterStep } from './steps/RosterStep'
import { ConfirmStep } from './steps/ConfirmStep'
import { getTrackedTeamId } from '@/lib/supabase/queries'
import { supabase } from '@/lib/supabase/client'
import type { Match, Team } from '@/lib/db/schema'
import { AppBar, Spinner } from '@/components/ui'
import { useT } from '@/lib/i18n/lang'

type Step = 'team-setup' | 'match-details' | 'roster' | 'confirm'

interface Props {
  initialTeamId?: string | null
  onMatchStarted: (match: Match, trackedTeam: Team, opponentTeam: Team) => void
  onCancel?: () => void
}

export function MatchSetupWizard({ initialTeamId, onMatchStarted, onCancel }: Props) {
  const mainTeamId = initialTeamId ?? getTrackedTeamId()
  const [step, setStep] = useState<Step>('team-setup')
  const [trackedTeamId, setTrackedTeamIdState] = useState<string>('')
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

  const visibleSteps: Step[] = ['team-setup', 'match-details', 'roster', 'confirm']
  const currentIndex = visibleSteps.indexOf(step)

  const t = useT()
  const stepNames: Record<Step, string> = {
    'team-setup': t({ en: 'Team', is: 'Lið' }),
    'match-details': t({ en: 'Match', is: 'Leikur' }),
    roster: t({ en: 'Roster', is: 'Hópur' }),
    confirm: t({ en: 'Start', is: 'Byrja' }),
  }

  return (
    <div className="min-h-svh bg-ground text-ink flex flex-col">
      <AppBar title={t({ en: 'New match', is: 'Nýr leikur' })} onBack={onCancel} backLabel={t({ en: 'Home', is: 'Heim' })} />

      {/* Progress: where you are in four steps */}
      <nav aria-label={t({ en: 'Setup steps', is: 'Skref' })} className="bg-white border-b border-line">
        <ol className="max-w-2xl mx-auto px-4 grid grid-cols-4">
          {visibleSteps.map((st, i) => (
            <li key={st} aria-current={i === currentIndex ? 'step' : undefined}
              className={`relative h-11 flex items-center justify-center gap-1.5 text-[14px] ${
                i === currentIndex ? 'text-ink font-medium' : i < currentIndex ? 'text-ink' : 'text-muted'
              }`}>
              {i < currentIndex && (
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
              {stepNames[st]}
              <span className={`absolute left-2 right-2 bottom-0 h-0.5 ${i <= currentIndex ? 'bg-ink' : 'bg-transparent'}`} aria-hidden="true" />
            </li>
          ))}
        </ol>
      </nav>

      {/* Step content */}
      <div className="flex-1 flex justify-center py-8 px-4">
        <div className="w-full max-w-2xl">
          {step === 'team-setup' && (
            <TeamSetupStep
              mainTeamId={mainTeamId}
              onDone={(id) => {
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
