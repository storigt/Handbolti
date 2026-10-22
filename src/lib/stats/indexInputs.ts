// Every number the app can count from events, as named inputs for index formulas.
// Each one is counted with the same rules as the stat tables (matchStats.ts), so
// a number in a formula always matches the table — but for the whole team.
// The original index inputs (indices.ts → IndexRaw) are separate and unchanged.
import type { Event } from '@/lib/db/schema'
import type { Text } from '@/lib/i18n/lang'
import { getCtx } from './matchStats'

export type InputGroup =
  | 'attack' | 'attackRange' | 'attackPhase' | 'attackOrigin' | 'attackZone'
  | 'defence' | 'keeper' | 'keeperRange' | 'keeperPhase' | 'keeperOrigin' | 'keeperZone'
  | 'opponent'

export const GROUP_TEXT: Record<InputGroup, Text> = {
  attack: { en: 'Attack', is: 'Sókn' },
  attackRange: { en: 'Attack · by range', is: 'Sókn · eftir færi' },
  attackPhase: { en: 'Attack · phase and numbers on court', is: 'Sókn · tegund sóknar og leiktala' },
  attackOrigin: { en: 'Attack · origin, direction, hand', is: 'Sókn · hvaðan, átt, hönd' },
  attackZone: { en: 'Attack · goal zones', is: 'Sókn · svæði í marki' },
  defence: { en: 'Defence', is: 'Vörn' },
  keeper: { en: 'Goalkeeping', is: 'Markvarsla' },
  keeperRange: { en: 'Goalkeeping · by range', is: 'Markvarsla · eftir færi' },
  keeperPhase: { en: 'Goalkeeping · phase and numbers on court', is: 'Markvarsla · tegund sóknar og leiktala' },
  keeperOrigin: { en: 'Goalkeeping · origin, direction, hand', is: 'Markvarsla · hvaðan, átt, hönd' },
  keeperZone: { en: 'Goalkeeping · goal zones', is: 'Markvarsla · svæði í marki' },
  opponent: { en: 'Opponent', is: 'Andstæðingur' },
}

export interface ExtraInput { key: string; label: Text; group: InputGroup; count: (c: Ctx) => number }

interface Ctx {
  ourShots: Event[]; gkShots: Event[]; gkAll: Event[]
  turnovers: Event[]; atkAct: Event[]; defAct: Event[]; fouls: Event[]; susps: Event[]
  fiskedViti: Event[]; attacks: Event[]; oppEvents: Event[]; subs: Event[]
}

const n = (xs: Event[], f: (e: Event) => boolean) => xs.reduce((a, e) => a + (f(e) ? 1 : 0), 0)
const goal = (e: Event) => e.sub_type === 'goal'
const save = (e: Event) => e.sub_type === 'save'            // the GK table counts 'save' as saved
const L = (en: string, is: string): Text => ({ en, is })

// Ranges, phases, numbers on court, origins, directions — same groupings as the tables
const RANGES: [string, string[], Text][] = [
  ['Pen', ['penalty'], L('7 m', 'Víti')],
  ['Wing', ['corner_wing', 'corner_wing_left', 'corner_wing_right'], L('Wing (both)', 'Horn (bæði)')],
  ['WingL', ['corner_wing_left'], L('Left wing', 'Vinstra horn')],
  ['WingR', ['corner_wing_right'], L('Right wing', 'Hægra horn')],
  ['9m', ['9m_plus'], L('9 m+', '9m+')],
  ['78m', ['7_8m'], L('7–8 m', '7–8m')],
  ['6m', ['6m'], L('6 m', '6m')],
  ['Line', ['line'], L('Line', 'Lína')],
]
const PHASES: [string, string, Text][] = [
  ['FastBreak', 'fast_break', L('Fast break', 'Hraðaupphlaup')],
  ['SecondWave', 'second_wave', L('Second wave', 'Seinni bylgja')],
  ['SetPlay', 'set_play', L('Set play', 'Uppstilltur leikur')],
]
const NUMERICAL: [string, string, Text][] = [
  ['6v6', '6v6', L('6 v 6', '6á6')],
  ['Short', 'inferiority', L('Shorthanded', 'Undirtala')],
  ['Extra', 'superiority', L('Extra player', 'Yfirtala')],
  ['7v6', '7v6', L('7 v 6', '7á6')],
  ['6v7', '6v7', L('6 v 7', '6á7')],
]
const ORIGINS: [string, string, Text][] = [
  ['LeftWing', 'left_wing', L('Left wing', 'Vinstra horn')],
  ['LeftBack', 'left_center', L('Left back', 'Vinstri skytta')],
  ['LeftCentre', 'center', L('Left centre', 'Vinstri miðja')],
  ['RightCentre', 'right_center', L('Right centre', 'Hægri miðja')],
  ['RightBack', 'right_wing', L('Right back', 'Hægri skytta')],
  ['RightWing', 'line', L('Right wing', 'Hægra horn')],
  ['Other', 'other', L('Other (attack)', 'Annað (árás)')],
]
const DIRECTIONS: [string, string, Text][] = [
  ['Right', 'right', L('Went right', 'Fór til hægri')],
  ['Left', 'left', L('Went left', 'Fór til vinstri')],
  ['Neither', 'neither', L('Neither way', 'Hvorugt')],
]
const ZONES = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const ZONE_TEXT: Text[] = [
  L('top left', 'efst vinstra'), L('top centre', 'efst miðja'), L('top right', 'efst hægra'),
  L('middle left', 'miðja vinstra'), L('centre', 'miðja'), L('middle right', 'miðja hægra'),
  L('bottom left', 'neðst vinstra'), L('bottom centre', 'neðst miðja'), L('bottom right', 'neðst hægra'),
]

const both = (a: Text, b: Text): Text => ({ en: `${a.en} · ${b.en}`, is: `${a.is} · ${b.is}` })
const G = L('Goals', 'Mörk'), S = L('Shots', 'Skot'), SV = L('Saves', 'Varin'), F = L('Shots faced', 'Skot á mark')

function build(): ExtraInput[] {
  const out: ExtraInput[] = []
  const add = (key: string, label: Text, group: InputGroup, count: (c: Ctx) => number) => out.push({ key, label, group, count })

  // ── Attack (our SHOT events and attacking actions) ──
  add('shotsSaved', L('Shots saved by their keeper', 'Skot varin af markmanni'), 'attack', c => n(c.ourShots, e => e.sub_type === 'saved'))
  add('shotsBlocked', L('Shots blocked', 'Skot í blokk'), 'attack', c => n(c.ourShots, e => e.sub_type === 'blocked'))
  add('shotsPost', L('Shots off the post', 'Skot í stöng'), 'attack', c => n(c.ourShots, e => e.sub_type === 'post'))
  add('shotsWide', L('Shots wide', 'Skot fram hjá'), 'attack', c => n(c.ourShots, e => e.sub_type === 'wide'))
  add('shotsTechnical', L('Technical shots', 'Tæknileg skot'), 'attack', c => n(c.ourShots, e => e.sub_type === 'technical'))
  add('shotsOnTarget', L('Shots on target (goal or saved)', 'Skot á mark (mark eða varið)'), 'attack', c => n(c.ourShots, e => e.sub_type === 'goal' || e.sub_type === 'saved'))
  add('assists', L('Assists (not 7 m)', 'Stoðsendingar (ekki víti)'), 'attack', c => n(c.ourShots, e => e.shot_range !== 'penalty' && !!getCtx(e).assist_player_id))
  add('penaltyAssists', L('7 m assists', 'Vítasendingar'), 'attack', c => n(c.ourShots, e => e.shot_range === 'penalty' && !!getCtx(e).assist_player_id))
  add('offensiveRebounds', L('Offensive rebounds', 'Sóknarfráköst'), 'attack', c => n(c.atkAct, e => e.sub_type === 'offensive_rebound'))
  add('drewSuspension', L('Drew 2 minutes', 'Fengnar 2 mín'), 'attack', c => n(c.atkAct, e => e.sub_type === 'drew_suspension'))
  add('turnoversOffensiveFoul', L('Turnovers · offensive foul', 'Tapaðir · sóknarbrot'), 'attack', c => n(c.turnovers, e => e.sub_type === 'offensive_foul'))
  add('turnoversBadPass', L('Turnovers · bad pass', 'Tapaðir · sendingarmistök'), 'attack', c => n(c.turnovers, e => e.sub_type === 'bad_pass'))
  add('turnoversPassive', L('Turnovers · passive play', 'Tapaðir · töf'), 'attack', c => n(c.turnovers, e => e.sub_type === 'delay'))
  add('turnoversOther', L('Turnovers · other', 'Tapaðir · annað'), 'attack', c => n(c.turnovers, e => e.sub_type === 'other'))

  for (const [k, ranges, label] of RANGES) {
    add(`goals${k}`, both(G, label), 'attackRange', c => n(c.ourShots, e => ranges.includes(e.shot_range ?? '') && goal(e)))
    add(`shots${k}`, both(S, label), 'attackRange', c => n(c.ourShots, e => ranges.includes(e.shot_range ?? '')))
  }
  for (const [k, v, label] of PHASES) {
    add(`goals${k}`, both(G, label), 'attackPhase', c => n(c.ourShots, e => e.phase_type === v && goal(e)))
    add(`shots${k}`, both(S, label), 'attackPhase', c => n(c.ourShots, e => e.phase_type === v))
  }
  for (const [k, v, label] of NUMERICAL) {
    add(`goals${k}`, both(G, label), 'attackPhase', c => n(c.ourShots, e => e.numerical_state === v && goal(e)))
    add(`shots${k}`, both(S, label), 'attackPhase', c => n(c.ourShots, e => e.numerical_state === v))
  }
  for (const [k, v, label] of ORIGINS) {
    add(`goalsFrom${k}`, both(G, label), 'attackOrigin', c => n(c.ourShots, e => getCtx(e).attack_origin === v && goal(e)))
    add(`shotsFrom${k}`, both(S, label), 'attackOrigin', c => n(c.ourShots, e => getCtx(e).attack_origin === v))
  }
  for (const [k, v, label] of DIRECTIONS) {
    add(`goals${k}`, both(G, label), 'attackOrigin', c => n(c.ourShots, e => getCtx(e).attack_direction === v && goal(e)))
    add(`shots${k}`, both(S, label), 'attackOrigin', c => n(c.ourShots, e => getCtx(e).attack_direction === v))
  }
  // Hand up/down: on-target shots only, as in the attack table
  add('goalsHandUp', both(G, L('hand up', 'hönd uppi')), 'attackOrigin', c => n(c.ourShots, e => (goal(e) || e.sub_type === 'saved') && getCtx(e).hand_up === true && goal(e)))
  add('shotsHandUp', both(S, L('hand up (on target)', 'hönd uppi (á mark)')), 'attackOrigin', c => n(c.ourShots, e => (goal(e) || e.sub_type === 'saved') && getCtx(e).hand_up === true))
  add('goalsHandDown', both(G, L('hand down', 'hönd niðri')), 'attackOrigin', c => n(c.ourShots, e => (goal(e) || e.sub_type === 'saved') && getCtx(e).hand_up === false && goal(e)))
  add('shotsHandDown', both(S, L('hand down (on target)', 'hönd niðri (á mark)')), 'attackOrigin', c => n(c.ourShots, e => (goal(e) || e.sub_type === 'saved') && getCtx(e).hand_up === false))
  ZONES.forEach((z, i) => {
    add(`goalsZone${z}`, both(G, { en: `zone ${z}, ${ZONE_TEXT[i].en}`, is: `svæði ${z}, ${ZONE_TEXT[i].is}` }), 'attackZone', c => n(c.ourShots, e => e.zone === z && goal(e)))
    add(`shotsZone${z}`, both(S, { en: `zone ${z}, ${ZONE_TEXT[i].en}`, is: `svæði ${z}, ${ZONE_TEXT[i].is}` }), 'attackZone', c => n(c.ourShots, e => e.zone === z))
  })

  // ── Defence (as the defence table) ──
  add('drewOffensiveFoul', L('Drew an offensive foul', 'Fiskaði sóknarbrot'), 'defence', c => n(c.defAct, e => e.sub_type === 'drew_offensive_foul'))
  add('dissent', L('Dissent', 'Værukærð'), 'defence', c => n(c.defAct, e => e.sub_type === 'protest'))
  add('blueCards', L('Blue cards', 'Blá spjöld'), 'defence', c => n(c.susps, e => e.sub_type === 'blue_card'))
  add('disqualifications', L('Disqualifications', 'Útilokanir'), 'defence', c => n(c.susps, e => e.sub_type === 'disqualification'))
  add('suspensionsAll', L('All suspensions and cards', 'Allar brottvísanir og spjöld'), 'defence', c => c.susps.length)
  add('substitutions', L('Substitutions', 'Skiptingar'), 'defence', c => c.subs.length)

  // ── Goalkeeping (as the goalkeeper table: faced = save + goal conceded + parry) ──
  add('gkShotsFaced', L('Shots faced', 'Skot á mark'), 'keeper', c => c.gkShots.length)
  add('gkGoalsConceded', L('Goals conceded', 'Mörk á sig'), 'keeper', c => n(c.gkShots, e => e.sub_type === 'goal_conceded'))
  add('gkParries', L('Parries', 'Varið út'), 'keeper', c => n(c.gkShots, e => e.sub_type === 'parry'))
  add('gkWideOrPost', L('Opponent shots wide or post', 'Skot andstæðinga fram hjá/í stöng'), 'keeper', c => n(c.gkAll, e => e.sub_type === 'missed'))
  for (const [k, ranges, label] of RANGES) {
    add(`gkSaves${k}`, both(SV, label), 'keeperRange', c => n(c.gkShots, e => ranges.includes(e.shot_range ?? '') && save(e)))
    add(`gkFaced${k}`, both(F, label), 'keeperRange', c => n(c.gkShots, e => ranges.includes(e.shot_range ?? '')))
  }
  for (const [k, v, label] of PHASES) {
    add(`gkSaves${k}`, both(SV, label), 'keeperPhase', c => n(c.gkShots, e => e.phase_type === v && save(e)))
    add(`gkFaced${k}`, both(F, label), 'keeperPhase', c => n(c.gkShots, e => e.phase_type === v))
  }
  for (const [k, v, label] of NUMERICAL) {
    add(`gkSaves${k}`, both(SV, label), 'keeperPhase', c => n(c.gkShots, e => e.numerical_state === v && save(e)))
    add(`gkFaced${k}`, both(F, label), 'keeperPhase', c => n(c.gkShots, e => e.numerical_state === v))
  }
  for (const [k, v, label] of ORIGINS) {
    add(`gkSavesFrom${k}`, both(SV, label), 'keeperOrigin', c => n(c.gkShots, e => getCtx(e).attack_origin === v && save(e)))
    add(`gkFacedFrom${k}`, both(F, label), 'keeperOrigin', c => n(c.gkShots, e => getCtx(e).attack_origin === v))
  }
  for (const [k, v, label] of DIRECTIONS) {
    add(`gkSaves${k}`, both(SV, label), 'keeperOrigin', c => n(c.gkShots, e => getCtx(e).attack_direction === v && save(e)))
    add(`gkFaced${k}`, both(F, label), 'keeperOrigin', c => n(c.gkShots, e => getCtx(e).attack_direction === v))
  }
  // Hand up/down: save or goal conceded only, as in the goalkeeper table
  const onT = (e: Event) => e.sub_type === 'save' || e.sub_type === 'goal_conceded'
  add('gkSavesHandUp', both(SV, L('shooter’s hand up', 'hönd skyttu uppi')), 'keeperOrigin', c => n(c.gkShots, e => onT(e) && getCtx(e).hand_up === true && save(e)))
  add('gkFacedHandUp', both(F, L('shooter’s hand up', 'hönd skyttu uppi')), 'keeperOrigin', c => n(c.gkShots, e => onT(e) && getCtx(e).hand_up === true))
  add('gkSavesHandDown', both(SV, L('shooter’s hand down', 'hönd skyttu niðri')), 'keeperOrigin', c => n(c.gkShots, e => onT(e) && getCtx(e).hand_up === false && save(e)))
  add('gkFacedHandDown', both(F, L('shooter’s hand down', 'hönd skyttu niðri')), 'keeperOrigin', c => n(c.gkShots, e => onT(e) && getCtx(e).hand_up === false))
  ZONES.forEach((z, i) => {
    add(`gkSavesZone${z}`, both(SV, { en: `zone ${z}, ${ZONE_TEXT[i].en}`, is: `svæði ${z}, ${ZONE_TEXT[i].is}` }), 'keeperZone', c => n(c.gkShots, e => e.zone === z && save(e)))
    add(`gkFacedZone${z}`, both(F, { en: `zone ${z}, ${ZONE_TEXT[i].en}`, is: `svæði ${z}, ${ZONE_TEXT[i].is}` }), 'keeperZone', c => n(c.gkShots, e => e.zone === z))
  })

  // ── Opponent: anything logged for the other team ──
  add('oppShotsLogged', L('Opponent shots logged in attack', 'Skot andstæðinga skráð í sókn'), 'opponent', c => n(c.oppEvents, e => e.event_type === 'SHOT'))
  add('oppGoalsLogged', L('Opponent goals logged in attack', 'Mörk andstæðinga skráð í sókn'), 'opponent', c => n(c.oppEvents, e => e.event_type === 'SHOT' && goal(e)))
  add('oppTurnovers', L('Opponent turnovers logged', 'Tapaðir boltar andstæðinga skráðir'), 'opponent', c => n(c.oppEvents, e => e.event_type === 'TURNOVER'))
  add('oppTwoMin', L('Opponent 2 minutes', '2 mínútur andstæðinga'), 'opponent', c => n(c.oppEvents, e => e.event_type === 'SUSPENSION' && e.sub_type === '2min'))
  add('oppYellowCards', L('Opponent yellow cards', 'Gul spjöld andstæðinga'), 'opponent', c => n(c.oppEvents, e => e.event_type === 'SUSPENSION' && e.sub_type === 'yellow_card'))
  add('oppRedCards', L('Opponent red cards', 'Rauð spjöld andstæðinga'), 'opponent', c => n(c.oppEvents, e => e.event_type === 'SUSPENSION' && e.sub_type === 'red_card'))
  add('oppFreeThrows', L('Opponent free throws conceded', 'Fríköst andstæðinga'), 'opponent', c => n(c.oppEvents, e => e.event_type === 'FOUL' && e.sub_type === 'attacking_foul'))

  return out
}

export const EXTRA_INPUTS: ExtraInput[] = build()

/** Count every extra input for a set of events (voided events are ignored). */
export function computeExtraInputs(events: Event[], trackedTeamId: string): Record<string, number> {
  const active = events.filter(e => !e.is_voided)
  const ours = active.filter(e => e.team_id === trackedTeamId)
  const by = (t: string) => ours.filter(e => e.event_type === t)
  const gkAll = by('GOALKEEPER_ACTION')
  const c: Ctx = {
    ourShots: by('SHOT'),
    gkAll,
    gkShots: gkAll.filter(e => e.sub_type === 'save' || e.sub_type === 'goal_conceded' || e.sub_type === 'parry'),
    turnovers: by('TURNOVER'), atkAct: by('ATTACKING_ACTION'), defAct: by('DEFENSIVE_ACTION'),
    fouls: by('FOUL'), susps: by('SUSPENSION'), attacks: by('ATTACK'), subs: by('SUBSTITUTION'),
    fiskedViti: active.filter(e => e.event_type === 'FOUL' && e.sub_type === '7m_awarded' && e.team_id !== trackedTeamId),
    oppEvents: active.filter(e => e.team_id !== trackedTeamId),
  }
  const out: Record<string, number> = {}
  for (const i of EXTRA_INPUTS) out[i.key] = i.count(c)
  return out
}
