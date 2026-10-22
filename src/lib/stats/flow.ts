// Match flow: the running score, goal by goal, derived from events.
// Goals are counted exactly as the store's score selectors count them:
// ours = our SHOT goals; theirs = opponent SHOT goals + goal_conceded on our keeper.
import type { Event } from '@/lib/db/schema'

export interface GoalPoint {
  /** 1-based goal number in the match */
  n: number
  minute: number | null
  period: number
  ours: boolean
  us: number
  them: number
}

export interface Run { goals: number; conceded: number; fromMinute: number | null; toMinute: number | null }

export interface MatchFlow {
  points: GoalPoint[]
  /** Longest unanswered run of goals by each side */
  bestRun: Run | null
  worstRun: Run | null
  leadChanges: number
  /** Largest lead we held, and the largest deficit (as a positive number) */
  maxLead: number
  maxDeficit: number
}

const time = (e: Event) => new Date(e.wall_clock).getTime() || 0

export function isOurGoal(e: Event, trackedTeamId: string) {
  return e.event_type === 'SHOT' && e.sub_type === 'goal' && e.team_id === trackedTeamId
}
export function isTheirGoal(e: Event, trackedTeamId: string) {
  return (e.event_type === 'SHOT' && e.sub_type === 'goal' && e.team_id !== trackedTeamId)
    || (e.event_type === 'GOALKEEPER_ACTION' && e.sub_type === 'goal_conceded' && e.team_id === trackedTeamId)
}

export function computeFlow(events: Event[], trackedTeamId: string): MatchFlow {
  const goals = events
    .filter(e => !e.is_voided && (isOurGoal(e, trackedTeamId) || isTheirGoal(e, trackedTeamId)))
    // Log order: period, then the minute the operator set, then tap time
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.period - b.e.period) || ((a.e.match_minute ?? -1) - (b.e.match_minute ?? -1)) || (time(a.e) - time(b.e)) || (a.i - b.i))
    .map(x => x.e)

  let us = 0, them = 0
  const points: GoalPoint[] = goals.map((e, i) => {
    const ours = isOurGoal(e, trackedTeamId)
    if (ours) us++; else them++
    return { n: i + 1, minute: e.match_minute, period: e.period, ours, us, them }
  })

  // Runs: consecutive goals by one side
  let bestRun: Run | null = null, worstRun: Run | null = null
  for (let i = 0; i < points.length;) {
    let j = i
    while (j + 1 < points.length && points[j + 1].ours === points[i].ours) j++
    const len = j - i + 1
    const run: Run = { goals: points[i].ours ? len : 0, conceded: points[i].ours ? 0 : len, fromMinute: points[i].minute, toMinute: points[j].minute }
    if (points[i].ours && len > (bestRun?.goals ?? 0)) bestRun = run
    if (!points[i].ours && len > (worstRun?.conceded ?? 0)) worstRun = run
    i = j + 1
  }

  let leadChanges = 0, leader = 0, maxLead = 0, maxDeficit = 0
  for (const p of points) {
    const d = p.us - p.them
    const now = Math.sign(d)
    if (now !== 0 && leader !== 0 && now !== leader) leadChanges++
    if (now !== 0) leader = now
    maxLead = Math.max(maxLead, d)
    maxDeficit = Math.max(maxDeficit, -d)
  }

  return { points, bestRun, worstRun, leadChanges, maxLead, maxDeficit }
}
