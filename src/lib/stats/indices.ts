import type { Event } from '@/lib/db/schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeDiv(num: number, den: number, fallback = 0): number {
  return den > 0 ? num / den : fallback
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, isNaN(v) ? 0 : v))
}

function stdev(arr: number[]): number {
  const n = arr.length
  if (n < 2) return 0
  const mean = arr.reduce((s, v) => s + v, 0) / n
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IndexRaw {
  ourGoals: number
  ourTotalShots: number
  ourShotEff: number
  oppGoals: number
  oppOnGoalShots: number   // shots on target (save + goal_conceded + parry)
  oppTotalShots: number    // includes missed (wide / post)
  oppMissed: number
  oppShotEff: number       // based on ALL opponent shots
  ourAttacks: number
  oppAttacks: number
  ourTurnovers: number
  ourAssists: number
  fiskaViti: number
  vitiASig: number
  twoMin: number
  rautt: number
  duelWon: number
  duelLost: number
  duelPct: number
  frikanst: number         // drew_offensive_foul
  harKontakt: number
  stolinn: number
  blokk: number
  oppLostBall: number
  tapAnd: number           // total opponent ball losses we caused
  emptyPhases: number
  ourFBShots: number
  ourFBGoals: number
  ourSWShots: number
  ourSWGoals: number
  oppFBShots: number
  oppSWShots: number
  gkSavePct: number        // on-goal save %
  gkSavePctBySegment: number[]
}

export interface IndexBreakdown {
  GIQI: number
  DQIdef: number
  DQIoff: number
  ELI: number
  FI: number
  GKI: number
  // Sub-components
  def_1v1Control: number
  def_disruption: number
  def_discipline: number
  def_foulQuality: number
  off_chanceCreation: number
  off_shotEfficiency: number
  off_ballControl: number
  eli_das: number
  eli_tis: number
  fi_ocss: number
  fi_dcss: number
  fi_ess: number
  gki_saveEff: number
  gki_saveVariability: number
  gki_emptyPhaseRate: number
  gki_saveStability: number
  raw: IndexRaw
}

// ─── Main computation ─────────────────────────────────────────────────────────

export function computeIndices(events: Event[], trackedTeamId: string): IndexBreakdown {
  const active = events.filter(e => !e.is_voided)

  // ── Our shots ──────────────────────────────────────────────────────────────
  const ourShots = active.filter(e => e.event_type === 'SHOT' && e.team_id === trackedTeamId)
  const ourGoals = ourShots.filter(e => e.sub_type === 'goal').length
  const ourTotalShots = ourShots.length
  const ourShotEff = safeDiv(ourGoals, ourTotalShots) * 100

  // ── Opponent shots (tracked via GK events) ─────────────────────────────────
  // 'missed' = opponent shot went wide/post (not on goal, not a GK action)
  const gkEvents = active.filter(
    e => e.event_type === 'GOALKEEPER_ACTION' && e.team_id === trackedTeamId,
  )
  const oppGoals    = gkEvents.filter(e => e.sub_type === 'goal_conceded').length
  const oppSaves    = gkEvents.filter(e => e.sub_type === 'save').length
  const oppParries  = gkEvents.filter(e => e.sub_type === 'parry').length
  const oppMissed   = gkEvents.filter(e => e.sub_type === 'missed').length
  const oppOnGoal   = oppSaves + oppParries + oppGoals
  const oppTotalShots = oppOnGoal + oppMissed
  // Skotnýting andstæðinga = goals / ALL opponent shots (not just on-goal)
  const oppShotEff  = safeDiv(oppGoals, oppTotalShots) * 100
  // GK save % = saves / shots on goal only
  const gkSavePct   = safeDiv(oppSaves + oppParries, oppOnGoal) * 100

  // GK save % by 10-min segments
  const gkSavePctBySegment: number[] = Array.from({ length: 6 }, (_, seg) => {
    const lo = seg * 10, hi = (seg + 1) * 10
    const seg_ev = gkEvents.filter(e => {
      const m = e.match_minute ?? 0
      return m >= lo && m < hi && ['save', 'goal_conceded', 'parry'].includes(e.sub_type ?? '')
    })
    const sv = seg_ev.filter(e => e.sub_type === 'save' || e.sub_type === 'parry').length
    const gl = seg_ev.filter(e => e.sub_type === 'goal_conceded').length
    return safeDiv(sv, sv + gl) * 100
  })

  // ── Attacks ────────────────────────────────────────────────────────────────
  const ourAttacks = active.filter(
    e => e.event_type === 'ATTACK' && e.team_id === trackedTeamId,
  ).length
  const oppAttacks = active.filter(
    e => e.event_type === 'ATTACK' && e.team_id !== trackedTeamId,
  ).length

  // ── Turnovers & assists ────────────────────────────────────────────────────
  const ourTurnovers = active.filter(
    e => e.event_type === 'TURNOVER' && e.team_id === trackedTeamId,
  ).length
  const ourAssists = ourShots.filter(e => e.context?.assist_player_id).length

  // ── Fouls ──────────────────────────────────────────────────────────────────
  // Fiskað víti = opponent committed a foul giving us a penalty
  const fiskaViti = active.filter(
    e => e.event_type === 'FOUL' && e.team_id !== trackedTeamId && e.sub_type === '7m_awarded',
  ).length
  // Víti á sig = we gave a penalty away
  const vitiASig = active.filter(
    e => e.event_type === 'FOUL' && e.team_id === trackedTeamId && e.sub_type === '7m_awarded',
  ).length

  // ── Suspensions ────────────────────────────────────────────────────────────
  const susp = active.filter(
    e => e.event_type === 'SUSPENSION' && e.team_id === trackedTeamId,
  )
  const twoMin = susp.filter(e => e.sub_type === '2min').length
  const rautt  = susp.filter(e => e.sub_type === 'red_card').length

  // ── Defensive actions ──────────────────────────────────────────────────────
  const def = active.filter(
    e => e.event_type === 'DEFENSIVE_ACTION' && e.team_id === trackedTeamId,
  )
  const duelWon    = def.filter(e => e.sub_type === 'duel_won').length
  const duelLost   = def.filter(e => e.sub_type === 'duel_lost').length
  const duelPct    = safeDiv(duelWon, duelWon + duelLost) * 100
  // fríkast = sum of the Fríkast column in the defense table (FOUL, attacking_foul)
  const frikanst = active.filter(
    e => e.event_type === 'FOUL' && e.team_id === trackedTeamId && e.sub_type === 'attacking_foul',
  ).length
  const harKontakt = def.filter(e => e.sub_type === 'high_contact').length
  const stolinn    = def.filter(e => e.sub_type === 'interception').length
  const blokk      = def.filter(e => e.sub_type === 'block').length
  const oppLostBall = def.filter(e => e.sub_type === 'opponent_lost_ball').length
  // Tapaðir boltar andstæðinga = stolinn + opponent_lost_ball (display value for L18)
  const tapAnd = stolinn + oppLostBall

  // ── Empty phases (3 goals in a row against us) ────────────────────────────
  const emptyPhases = gkEvents.filter(e => e.sub_type === 'empty_phase').length

  // ── Phase shots ────────────────────────────────────────────────────────────
  const ourFBShots  = ourShots.filter(e => e.phase_type === 'fast_break').length
  const ourFBGoals  = ourShots.filter(e => e.phase_type === 'fast_break'  && e.sub_type === 'goal').length
  const ourSWShots  = ourShots.filter(e => e.phase_type === 'second_wave').length
  const ourSWGoals  = ourShots.filter(e => e.phase_type === 'second_wave' && e.sub_type === 'goal').length
  // Opponent phase shots from GK events (exclude non-shot sub_types)
  const shotSubTypes = ['save', 'goal_conceded', 'parry', 'missed']
  const oppFBShots = gkEvents.filter(
    e => e.phase_type === 'fast_break' && shotSubTypes.includes(e.sub_type ?? ''),
  ).length
  const oppSWShots = gkEvents.filter(
    e => e.phase_type === 'second_wave' && shotSubTypes.includes(e.sub_type ?? ''),
  ).length

  const raw: IndexRaw = {
    ourGoals, ourTotalShots, ourShotEff,
    oppGoals, oppOnGoalShots: oppOnGoal, oppTotalShots, oppMissed, oppShotEff,
    ourAttacks, oppAttacks,
    ourTurnovers, ourAssists, fiskaViti,
    vitiASig, twoMin, rautt,
    duelWon, duelLost, duelPct,
    frikanst, harKontakt, stolinn, blokk, oppLostBall,
    tapAnd, emptyPhases,
    ourFBShots, ourFBGoals, ourSWShots, ourSWGoals,
    oppFBShots, oppSWShots,
    gkSavePct, gkSavePctBySegment,
  }

  // ── DQIdef ────────────────────────────────────────────────────────────────
  // 1á1 Control Score
  const def_1v1Control = clamp(
    0.4 * duelPct +
    0.3 * frikanst +
    0.3 * (100 - oppShotEff),
  )

  // Defensive Disruption Score
  const dds_ratio = safeDiv((harKontakt + frikanst + stolinn), oppTotalShots) * 100
  const dds_inner =
    0.75 * Math.min(1, safeDiv(dds_ratio, 45)) +
    0.25 * Math.min(1, (100 - oppShotEff) / 70)
  const def_disruption = clamp(Math.min(100, 100 * Math.pow(Math.max(0, dds_inner), 1.5)))

  // Defensive Discipline Score
  const def_discipline = clamp(
    100 - safeDiv((vitiASig * 1.5) + twoMin + (rautt * 2), oppTotalShots) * 100,
  )

  // Foul Quality Score
  const foulDenom = twoMin * 1.5 + rautt * 2 + frikanst
  const def_foulQuality = clamp(safeDiv(frikanst, foulDenom) * 100)

  const DQIdef = clamp(
    0.5 * def_1v1Control +
    0.3 * def_disruption +
    0.1 * def_discipline +
    0.1 * def_foulQuality,
  )

  // ── DQIoff ────────────────────────────────────────────────────────────────
  const off_chanceCreation = clamp(
    safeDiv(ourAssists + fiskaViti, ourAttacks) * 100 -
    safeDiv(ourTurnovers, ourAttacks) * 100,
  )
  const off_shotEfficiency = clamp(ourShotEff)
  const off_ballControl    = clamp(safeDiv(ourAttacks - ourTurnovers, ourAttacks) * 100)

  const DQIoff = clamp(
    0.4  * off_chanceCreation +
    0.35 * off_shotEfficiency +
    0.25 * off_ballControl,
  )

  // ── ELI ──────────────────────────────────────────────────────────────────
  // Defensive Activity Score
  const dasRaw = safeDiv(stolinn + blokk + harKontakt + frikanst + oppLostBall, oppAttacks) * 100
  const eli_das = clamp(100 * (1 - Math.exp(-0.03 * dasRaw)))

  // Transition Intensity Score
  // OTE = transition goal efficiency, OTV = transition volume, DTC = opponent transition control
  const OTE = safeDiv(ourFBGoals + ourSWGoals, ourFBShots + ourSWShots) * 100
  const OTV = safeDiv(ourFBShots  + ourSWShots, ourTotalShots) * 100
  const DTC = 100 * (1 - safeDiv(oppFBShots + oppSWShots, Math.max(1, oppTotalShots)))
  const eli_tis = clamp(0.35 * OTE + 0.30 * OTV + 0.35 * DTC)

  // OTS not separately defined — fold weight into TIS (0.35 + 0.30 + 0.35 = 1.0)
  const ELI = clamp(0.35 * eli_das + 0.65 * eli_tis)

  // ── FI ───────────────────────────────────────────────────────────────────
  // Offensive Consistency Score
  const fi_ocss = clamp(
    (100 * (1 - safeDiv(ourTurnovers, ourAttacks)) + ourShotEff) / 2,
  )

  // Defensive Consistency Score
  const oppDefEff = safeDiv(oppAttacks - oppGoals, Math.max(1, oppAttacks)) * 100
  const fi_dcss = clamp(
    0.7 * (0.3 * duelPct + 0.4 * oppDefEff + 0.15 * frikanst + 0.15 * stolinn) +
    0.3 * (100 - 0.5 * twoMin - 0.5 * vitiASig),
  )

  // Execution Stability Score
  const fi_ess = clamp(0.6 * ourShotEff + 0.4 * off_ballControl)

  const FI = clamp(0.35 * fi_ocss + 0.35 * fi_dcss + 0.3 * fi_ess)

  // ── GKI ──────────────────────────────────────────────────────────────────
  const gki_saveEff = clamp(gkSavePct)

  // Save Variability — only segments with data
  const segsWithData = gkSavePctBySegment.filter((_, i) => {
    const lo = i * 10, hi = (i + 1) * 10
    return gkEvents.some(e => {
      const m = e.match_minute ?? 0
      return m >= lo && m < hi && shotSubTypes.includes(e.sub_type ?? '')
    })
  })
  const gki_saveVariability = clamp(
    segsWithData.length >= 2 ? 100 * Math.exp(-stdev(segsWithData) / 15) : 100,
  )

  // Empty Phase Rate = 100 - (emptyPhases / (oppTotalShots - 2)) * 100
  const gki_emptyPhaseRate = clamp(
    100 - safeDiv(emptyPhases, Math.max(1, oppTotalShots - 2)) * 100,
  )

  const gki_saveStability = clamp(
    0.9 * gki_saveVariability + 0.1 * gki_emptyPhaseRate,
  )
  const GKI = clamp(0.7 * gki_saveEff + 0.3 * gki_saveStability)

  // ── GIQI ─────────────────────────────────────────────────────────────────
  const GIQI = clamp(0.25 * DQIdef + 0.25 * DQIoff + 0.25 * ELI + 0.25 * FI)

  return {
    GIQI, DQIdef, DQIoff, ELI, FI, GKI,
    def_1v1Control, def_disruption, def_discipline, def_foulQuality,
    off_chanceCreation, off_shotEfficiency, off_ballControl,
    eli_das, eli_tis,
    fi_ocss, fi_dcss, fi_ess,
    gki_saveEff, gki_saveVariability, gki_emptyPhaseRate, gki_saveStability,
    raw,
  }
}
