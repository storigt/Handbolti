import type { Event, Player } from '@/lib/db/schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round(n / d * 100)}%` : '—'
}

export function v(n: number): number | string { return n > 0 ? n : '—' }

export function getCtx(e: Event): Record<string, unknown> {
  return (e.context ?? {}) as Record<string, unknown>
}

// ─── Attack ───────────────────────────────────────────────────────────────────

export interface AttackRow {
  player: Player
  goals: number; shots: number
  penGoals: number; penShots: number
  cornGoals: number; cornShots: number
  nineMGoals: number; nineMShots: number
  s78Goals: number; s78Shots: number
  s6mGoals: number; s6mShots: number
  lineGoals: number; lineShots: number
  fbGoals: number; fbShots: number
  swGoals: number; swShots: number
  spGoals: number; spShots: number
  infGoals: number; infShots: number
  supGoals: number; supShots: number
  s76Goals: number; s76Shots: number
  s66Goals: number; s66Shots: number
  chancesCreated: number
  assists: number
  penaltyAssists: number
  drewPenalty: number
  turnovers: number
  offensiveRebounds: number
  drewSuspension: number
  // Attack origin zones
  origLeftWingGoals: number; origLeftWingShots: number
  origLeftCenterGoals: number; origLeftCenterShots: number
  origCenterGoals: number; origCenterShots: number
  origRightCenterGoals: number; origRightCenterShots: number
  origRightWingGoals: number; origRightWingShots: number
  origLineGoals: number; origLineShots: number
  origOtherGoals: number; origOtherShots: number
  // Hand up
  handUpGoals: number; handUpShots: number
  handDownGoals: number; handDownShots: number
}

export function computeAttack(events: Event[], players: Player[], trackedTeamId: string): AttackRow[] {
  const shots = events.filter(e => e.event_type === 'SHOT' && e.team_id === trackedTeamId)
  const turnovers = events.filter(e => e.event_type === 'TURNOVER' && e.team_id === trackedTeamId)
  const atkAct = events.filter(e => e.event_type === 'ATTACKING_ACTION' && e.team_id === trackedTeamId)
  const fiskedViti = events.filter(e => e.event_type === 'FOUL' && e.sub_type === '7m_awarded' && e.team_id !== trackedTeamId)

  return players.map(player => {
    const pid = player.id
    const ps = shots.filter(e => e.player_id === pid)

    function rng(range: string): [number, number] {
      const rs = ps.filter(e => e.shot_range === range)
      return [rs.filter(e => e.sub_type === 'goal').length, rs.length]
    }
    function phase(ph: string): [number, number] {
      const rs = ps.filter(e => e.phase_type === ph)
      return [rs.filter(e => e.sub_type === 'goal').length, rs.length]
    }
    function num(ns: string): [number, number] {
      const rs = ps.filter(e => e.numerical_state === ns)
      return [rs.filter(e => e.sub_type === 'goal').length, rs.length]
    }

    const [penGoals, penShots] = rng('penalty')
    const [cornGoals, cornShots] = rng('corner_wing')
    const [nineMGoals, nineMShots] = rng('9m_plus')
    const [s78Goals, s78Shots] = rng('7_8m')
    const [s6mGoals, s6mShots] = rng('6m')
    const [lineGoals, lineShots] = rng('line')
    const [fbGoals, fbShots] = phase('fast_break')
    const [swGoals, swShots] = phase('second_wave')
    const [spGoals, spShots] = phase('set_play')
    const [infGoals, infShots] = num('inferiority')
    const [supGoals, supShots] = num('superiority')
    const [s76Goals, s76Shots] = num('7v6')
    const [s66Goals, s66Shots] = num('6v6')

    const assists = shots.filter(e => e.shot_range !== 'penalty' && getCtx(e).assist_player_id === pid).length
    const penaltyAssists = shots.filter(e => e.shot_range === 'penalty' && getCtx(e).assist_player_id === pid).length
    const drewPenalty = fiskedViti.filter(e => getCtx(e).fouled_player_id === pid).length

    function orig(zone: string): [number, number] {
      const rs = ps.filter(e => getCtx(e).attack_origin === zone)
      return [rs.filter(e => e.sub_type === 'goal').length, rs.length]
    }

    const [origLeftWingGoals, origLeftWingShots] = orig('left_wing')
    const [origLeftCenterGoals, origLeftCenterShots] = orig('left_center')
    const [origCenterGoals, origCenterShots] = orig('center')
    const [origRightCenterGoals, origRightCenterShots] = orig('right_center')
    const [origRightWingGoals, origRightWingShots] = orig('right_wing')
    const [origLineGoals, origLineShots] = orig('line')
    const [origOtherGoals, origOtherShots] = orig('other')

    const onTargetPs = ps.filter(e => e.sub_type === 'goal' || e.sub_type === 'saved')
    const handUpShotsArr = onTargetPs.filter(e => getCtx(e).hand_up === true)
    const handDownShotsArr = onTargetPs.filter(e => getCtx(e).hand_up === false)

    return {
      player,
      goals: ps.filter(e => e.sub_type === 'goal').length,
      shots: ps.length,
      penGoals, penShots, cornGoals, cornShots,
      nineMGoals, nineMShots, s78Goals, s78Shots,
      s6mGoals, s6mShots, lineGoals, lineShots,
      fbGoals, fbShots, swGoals, swShots, spGoals, spShots,
      infGoals, infShots, supGoals, supShots,
      s76Goals, s76Shots, s66Goals, s66Shots,
      assists, penaltyAssists,
      chancesCreated: assists + penaltyAssists,
      drewPenalty,
      turnovers: turnovers.filter(e => e.player_id === pid).length,
      offensiveRebounds: atkAct.filter(e => e.player_id === pid && e.sub_type === 'offensive_rebound').length,
      drewSuspension: atkAct.filter(e => e.player_id === pid && e.sub_type === 'drew_suspension').length,
      origLeftWingGoals, origLeftWingShots,
      origLeftCenterGoals, origLeftCenterShots,
      origCenterGoals, origCenterShots,
      origRightCenterGoals, origRightCenterShots,
      origRightWingGoals, origRightWingShots,
      origLineGoals, origLineShots,
      origOtherGoals, origOtherShots,
      handUpGoals: handUpShotsArr.filter(e => e.sub_type === 'goal').length,
      handUpShots: handUpShotsArr.length,
      handDownGoals: handDownShotsArr.filter(e => e.sub_type === 'goal').length,
      handDownShots: handDownShotsArr.length,
    }
  })
}

export function sumAttack(rows: AttackRow[]): Omit<AttackRow, 'player'> {
  const z: Omit<AttackRow, 'player'> = {
    goals: 0, shots: 0, penGoals: 0, penShots: 0, cornGoals: 0, cornShots: 0,
    nineMGoals: 0, nineMShots: 0, s78Goals: 0, s78Shots: 0, s6mGoals: 0, s6mShots: 0,
    lineGoals: 0, lineShots: 0, fbGoals: 0, fbShots: 0, swGoals: 0, swShots: 0,
    spGoals: 0, spShots: 0, infGoals: 0, infShots: 0, supGoals: 0, supShots: 0,
    s76Goals: 0, s76Shots: 0, s66Goals: 0, s66Shots: 0,
    chancesCreated: 0, assists: 0, penaltyAssists: 0, drewPenalty: 0,
    turnovers: 0, offensiveRebounds: 0, drewSuspension: 0,
    origLeftWingGoals: 0, origLeftWingShots: 0,
    origLeftCenterGoals: 0, origLeftCenterShots: 0,
    origCenterGoals: 0, origCenterShots: 0,
    origRightCenterGoals: 0, origRightCenterShots: 0,
    origRightWingGoals: 0, origRightWingShots: 0,
    origLineGoals: 0, origLineShots: 0,
    origOtherGoals: 0, origOtherShots: 0,
    handUpGoals: 0, handUpShots: 0,
    handDownGoals: 0, handDownShots: 0,
  }
  for (const r of rows) {
    for (const k of Object.keys(z) as (keyof typeof z)[]) {
      (z[k] as number) += r[k] as number
    }
  }
  return z
}

// ─── Defense ──────────────────────────────────────────────────────────────────

export interface DefenseRow {
  player: Player
  duels: number; duelsWon: number
  highContact: number
  freekick: number
  interceptions: number
  blocks: number
  rebounds: number
  penaltyAwarded: number
  yellowCards: number
  suspensions2min: number
  redCards: number
  protest: number
  drewOffensiveFoul: number
}

export function computeDefense(events: Event[], players: Player[], trackedTeamId: string): DefenseRow[] {
  const defAct = events.filter(e => e.event_type === 'DEFENSIVE_ACTION' && e.team_id === trackedTeamId)
  const fouls = events.filter(e => e.event_type === 'FOUL' && e.team_id === trackedTeamId)
  const susps = events.filter(e => e.event_type === 'SUSPENSION' && e.team_id === trackedTeamId)

  return players.map(player => {
    const pid = player.id
    const pd = defAct.filter(e => e.player_id === pid)
    const pf = fouls.filter(e => e.player_id === pid)
    const ps = susps.filter(e => e.player_id === pid)
    const duelsWon = pd.filter(e => e.sub_type === 'duel_won').length
    const duelsLost = pd.filter(e => e.sub_type === 'duel_lost').length

    return {
      player,
      duels: duelsWon + duelsLost,
      duelsWon,
      highContact: pd.filter(e => e.sub_type === 'high_contact').length,
      freekick: pf.filter(e => e.sub_type === 'attacking_foul').length,
      interceptions: pd.filter(e => e.sub_type === 'interception').length,
      blocks: pd.filter(e => e.sub_type === 'block').length,
      rebounds: pd.filter(e => e.sub_type === 'rebound').length,
      penaltyAwarded: pf.filter(e => e.sub_type === '7m_awarded').length,
      yellowCards: ps.filter(e => e.sub_type === 'yellow_card').length,
      suspensions2min: ps.filter(e => e.sub_type === '2min').length,
      redCards: ps.filter(e => e.sub_type === 'red_card').length,
      protest: pd.filter(e => e.sub_type === 'protest').length,
      drewOffensiveFoul: pd.filter(e => e.sub_type === 'drew_offensive_foul').length,
    }
  })
}

export function sumDefense(rows: DefenseRow[]): Omit<DefenseRow, 'player'> {
  const z: Omit<DefenseRow, 'player'> = {
    duels: 0, duelsWon: 0, highContact: 0, freekick: 0, interceptions: 0,
    blocks: 0, rebounds: 0, penaltyAwarded: 0, yellowCards: 0,
    suspensions2min: 0, redCards: 0, protest: 0, drewOffensiveFoul: 0,
  }
  for (const r of rows) {
    for (const k of Object.keys(z) as (keyof typeof z)[]) {
      (z[k] as number) += r[k] as number
    }
  }
  return z
}

// ─── Goalkeeping ──────────────────────────────────────────────────────────────

export interface GKRow {
  player: Player
  saves: number; shotsFaced: number
  savedPen: number; facedPen: number
  savedCorn: number; facedCorn: number
  savedNineM: number; facedNineM: number
  savedS78: number; facedS78: number
  savedS6m: number; facedS6m: number
  savedLine: number; facedLine: number
  savedFb: number; facedFb: number
  savedSw: number; facedSw: number
  savedInf: number; facedInf: number
  savedSup: number; facedSup: number
  savedS67: number; facedS67: number
  emptyPhase: number
  positiveResponse: number
  // Attack origin zones (saves / faced)
  origLeftWingSaves: number; origLeftWingFaced: number
  origLeftCenterSaves: number; origLeftCenterFaced: number
  origCenterSaves: number; origCenterFaced: number
  origRightCenterSaves: number; origRightCenterFaced: number
  origRightWingSaves: number; origRightWingFaced: number
  origLineSaves: number; origLineFaced: number
  origOtherSaves: number; origOtherFaced: number
  // Hand up (attacker's hand)
  handUpSaves: number; handUpFaced: number
  handDownSaves: number; handDownFaced: number
}

export function computeGK(events: Event[], goalkeepers: Player[], trackedTeamId: string): GKRow[] {
  const gkEvents = events.filter(e => e.event_type === 'GOALKEEPER_ACTION' && e.team_id === trackedTeamId)

  return goalkeepers.map(player => {
    const pid = player.id
    const pe = gkEvents.filter(e => e.player_id === pid)
    const shotEv = pe.filter(e => e.sub_type === 'save' || e.sub_type === 'goal_conceded' || e.sub_type === 'parry' || e.sub_type === 'missed')

    function rng(range: string): [number, number] {
      const rs = shotEv.filter(e => e.shot_range === range)
      return [rs.filter(e => e.sub_type === 'save').length, rs.length]
    }
    function phase(ph: string): [number, number] {
      const rs = shotEv.filter(e => e.phase_type === ph)
      return [rs.filter(e => e.sub_type === 'save').length, rs.length]
    }
    function num(ns: string): [number, number] {
      const rs = shotEv.filter(e => e.numerical_state === ns)
      return [rs.filter(e => e.sub_type === 'save').length, rs.length]
    }

    const [savedPen, facedPen] = rng('penalty')
    const [savedCorn, facedCorn] = rng('corner_wing')
    const [savedNineM, facedNineM] = rng('9m_plus')
    const [savedS78, facedS78] = rng('7_8m')
    const [savedS6m, facedS6m] = rng('6m')
    const [savedLine, facedLine] = rng('line')
    const [savedFb, facedFb] = phase('fast_break')
    const [savedSw, facedSw] = phase('second_wave')
    const [savedInf, facedInf] = num('inferiority')
    const [savedSup, facedSup] = num('superiority')
    const [savedS67, facedS67] = num('6v7')

    function origGK(zone: string): [number, number] {
      const rs = shotEv.filter(e => getCtx(e).attack_origin === zone)
      return [rs.filter(e => e.sub_type === 'save').length, rs.length]
    }

    const [origLeftWingSaves, origLeftWingFaced] = origGK('left_wing')
    const [origLeftCenterSaves, origLeftCenterFaced] = origGK('left_center')
    const [origCenterSaves, origCenterFaced] = origGK('center')
    const [origRightCenterSaves, origRightCenterFaced] = origGK('right_center')
    const [origRightWingSaves, origRightWingFaced] = origGK('right_wing')
    const [origLineSaves, origLineFaced] = origGK('line')
    const [origOtherSaves, origOtherFaced] = origGK('other')

    const onTargetEv = shotEv.filter(e => e.sub_type === 'save' || e.sub_type === 'goal_conceded')
    const handUpEv = onTargetEv.filter(e => getCtx(e).hand_up === true)
    const handDownEv = onTargetEv.filter(e => getCtx(e).hand_up === false)

    return {
      player,
      saves: shotEv.filter(e => e.sub_type === 'save').length,
      shotsFaced: shotEv.length,
      savedPen, facedPen, savedCorn, facedCorn,
      savedNineM, facedNineM, savedS78, facedS78,
      savedS6m, facedS6m, savedLine, facedLine,
      savedFb, facedFb, savedSw, facedSw,
      savedInf, facedInf, savedSup, facedSup,
      savedS67, facedS67,
      emptyPhase: pe.filter(e => e.sub_type === 'empty_phase').length,
      positiveResponse: pe.filter(e => e.sub_type === 'positive_response').length,
      origLeftWingSaves, origLeftWingFaced,
      origLeftCenterSaves, origLeftCenterFaced,
      origCenterSaves, origCenterFaced,
      origRightCenterSaves, origRightCenterFaced,
      origRightWingSaves, origRightWingFaced,
      origLineSaves, origLineFaced,
      origOtherSaves, origOtherFaced,
      handUpSaves: handUpEv.filter(e => e.sub_type === 'save').length,
      handUpFaced: handUpEv.length,
      handDownSaves: handDownEv.filter(e => e.sub_type === 'save').length,
      handDownFaced: handDownEv.length,
    }
  })
}

export function sumGK(rows: GKRow[]): Omit<GKRow, 'player'> {
  const z: Omit<GKRow, 'player'> = {
    saves: 0, shotsFaced: 0,
    savedPen: 0, facedPen: 0, savedCorn: 0, facedCorn: 0,
    savedNineM: 0, facedNineM: 0, savedS78: 0, facedS78: 0,
    savedS6m: 0, facedS6m: 0, savedLine: 0, facedLine: 0,
    savedFb: 0, facedFb: 0, savedSw: 0, facedSw: 0,
    savedInf: 0, facedInf: 0, savedSup: 0, facedSup: 0,
    savedS67: 0, facedS67: 0,
    emptyPhase: 0, positiveResponse: 0,
    origLeftWingSaves: 0, origLeftWingFaced: 0,
    origLeftCenterSaves: 0, origLeftCenterFaced: 0,
    origCenterSaves: 0, origCenterFaced: 0,
    origRightCenterSaves: 0, origRightCenterFaced: 0,
    origRightWingSaves: 0, origRightWingFaced: 0,
    origLineSaves: 0, origLineFaced: 0,
    origOtherSaves: 0, origOtherFaced: 0,
    handUpSaves: 0, handUpFaced: 0,
    handDownSaves: 0, handDownFaced: 0,
  }
  for (const r of rows) {
    for (const k of Object.keys(z) as (keyof typeof z)[]) {
      (z[k] as number) += r[k] as number
    }
  }
  return z
}

// ─── Team Stats ───────────────────────────────────────────────────────────────

export interface TeamStatsRow {
  myGoals: number
  myShots: number
  myAttacks: number
  opponentGoals: number  // from GK goal_conceded events
  opponentShots: number  // from GK shotsFaced events
  opponentAttacks: number
}

export function computeTeamStats(events: Event[], trackedTeamId: string): TeamStatsRow {
  const myShots = events.filter(e => e.event_type === 'SHOT' && e.team_id === trackedTeamId)
  const gkEvents = events.filter(
    e => e.event_type === 'GOALKEEPER_ACTION' && e.team_id === trackedTeamId
    && (e.sub_type === 'save' || e.sub_type === 'goal_conceded' || e.sub_type === 'parry' || e.sub_type === 'missed'),
  )
  return {
    myGoals: myShots.filter(e => e.sub_type === 'goal').length,
    myShots: myShots.length,
    myAttacks: events.filter(e => e.event_type === 'ATTACK' && e.team_id === trackedTeamId).length,
    opponentGoals: gkEvents.filter(e => e.sub_type === 'goal_conceded').length,
    opponentShots: gkEvents.length,
    opponentAttacks: events.filter(e => e.event_type === 'ATTACK' && e.team_id !== trackedTeamId).length,
  }
}
