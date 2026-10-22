// Sample data for the landing page's interface fragments.
// FICTIONAL: the clubs (HK Norðri, ÍF Suðri), players and matches are invented
// so the fragments can be shown at real density. Every figure on the page is
// computed from these rows — never typed in separately.

export type Zone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type ShotOutcome = 'goal' | 'saved' | 'wide' | 'post' | 'blocked'
export type Range = '9m_plus' | '7_8m' | '6m' | 'line' | 'corner_wing_left' | 'corner_wing_right' | 'penalty'

export interface SamplePlayer { id: string; name: string; jersey: number; position: 'field' | 'goalkeeper' }
export interface SampleShot { playerId: string; zone: Zone | null; outcome: ShotOutcome; range: Range; minute: number }

export const HOME = 'HK Norðri'
export const AWAY = 'ÍF Suðri'

export const PLAYERS: SamplePlayer[] = [
  { id: 'kari',   name: 'Kári',   jersey: 9,  position: 'field' },
  { id: 'hlynur', name: 'Hlynur', jersey: 4,  position: 'field' },
  { id: 'einar',  name: 'Einar',  jersey: 13, position: 'field' },
  { id: 'atli',   name: 'Atli',   jersey: 2,  position: 'field' },
  { id: 'breki',  name: 'Breki',  jersey: 17, position: 'field' },
  { id: 'snorri', name: 'Snorri', jersey: 21, position: 'field' },
  { id: 'haukur', name: 'Haukur', jersey: 1,  position: 'goalkeeper' },
  { id: 'ivar',   name: 'Ívar',   jersey: 12, position: 'goalkeeper' },
]

// Compact shot list: [player, zone or null, outcome, range, minute]
type Row = [string, Zone | null, ShotOutcome, Range, number]
const ROWS: Row[] = [
  // Kári — left back, long range: 6 goals of 12
  ['kari', 1, 'goal', '9m_plus', 2], ['kari', 5, 'saved', '9m_plus', 6], ['kari', 1, 'goal', '9m_plus', 9],
  ['kari', null, 'blocked', '9m_plus', 13], ['kari', 3, 'goal', '9m_plus', 17], ['kari', 2, 'saved', '9m_plus', 21],
  ['kari', 7, 'goal', '9m_plus', 27], ['kari', null, 'wide', '9m_plus', 33], ['kari', 9, 'goal', '9m_plus', 38],
  ['kari', 8, 'saved', '7_8m', 44], ['kari', null, 'blocked', '9m_plus', 49], ['kari', 4, 'goal', '7_8m', 56],
  // Hlynur — centre back: 4 of 8
  ['hlynur', 3, 'goal', '9m_plus', 4], ['hlynur', 5, 'saved', '9m_plus', 11], ['hlynur', 9, 'goal', '7_8m', 19],
  ['hlynur', null, 'blocked', '9m_plus', 24], ['hlynur', 7, 'goal', '9m_plus', 31], ['hlynur', 1, 'saved', '9m_plus', 39],
  ['hlynur', null, 'post', '9m_plus', 46], ['hlynur', 6, 'goal', '7_8m', 53],
  // Einar — right back: 5 of 8, plus penalties 2 of 3
  ['einar', 1, 'goal', '9m_plus', 7], ['einar', 2, 'saved', '9m_plus', 15], ['einar', 7, 'goal', '7_8m', 22],
  ['einar', 4, 'goal', '9m_plus', 29], ['einar', null, 'wide', '9m_plus', 35], ['einar', 5, 'saved', '9m_plus', 42],
  ['einar', 9, 'goal', '7_8m', 50], ['einar', 3, 'goal', '9m_plus', 58],
  ['einar', 1, 'goal', 'penalty', 14], ['einar', 3, 'saved', 'penalty', 37], ['einar', 9, 'goal', 'penalty', 52],
  // Atli — left wing: 3 of 5
  ['atli', 9, 'goal', 'corner_wing_left', 10], ['atli', 7, 'saved', 'corner_wing_left', 26],
  ['atli', 6, 'goal', 'corner_wing_left', 34], ['atli', 1, 'saved', 'corner_wing_left', 47], ['atli', 3, 'goal', 'corner_wing_left', 57],
  // Breki — right wing: 2 of 4
  ['breki', 7, 'goal', 'corner_wing_right', 18], ['breki', 9, 'saved', 'corner_wing_right', 30],
  ['breki', null, 'post', 'corner_wing_right', 41], ['breki', 4, 'goal', 'corner_wing_right', 55],
  // Snorri — line player: 6 of 7
  ['snorri', 5, 'goal', 'line', 5], ['snorri', 8, 'goal', 'line', 16], ['snorri', 5, 'saved', 'line', 23],
  ['snorri', 7, 'goal', 'line', 32], ['snorri', 9, 'goal', '6m', 40], ['snorri', 2, 'goal', 'line', 45], ['snorri', 4, 'goal', '6m', 59],
]

export const SHOTS: SampleShot[] = ROWS.map(([playerId, zone, outcome, range, minute]) => ({ playerId, zone, outcome, range, minute }))

// Assists and turnovers per player (report fragment)
export const ASSISTS: Record<string, number> = { hlynur: 5, kari: 3, einar: 2, atli: 1, breki: 1, snorri: 0 }
export const TURNOVERS: Record<string, number> = { kari: 2, hlynur: 3, einar: 1, atli: 0, breki: 1, snorri: 1 }

// Opponent shots on target faced by our goalkeepers: [keeper, range, zone, saved]
export type GkRange = '9m_plus' | '6m' | 'wing' | 'penalty'
export interface SampleGkShot { keeperId: string; range: GkRange; zone: Zone; saved: boolean }
type GkRow = [string, GkRange, Zone[], Zone[]] // keeper, range, saved zones, conceded zones
const GK_ROWS: GkRow[] = [
  ['haukur', '9m_plus', [5, 2, 8, 4, 6, 1], [1, 3, 7, 9, 9, 3]],
  ['haukur', '6m',      [5, 8],             [7, 9, 1, 3, 4, 6, 7]],
  ['haukur', 'wing',    [3, 1],             [7, 9, 4]],
  ['haukur', 'penalty', [5],                [1, 9, 3]],
  ['ivar',   '9m_plus', [5, 2],             [3, 7]],
  ['ivar',   '6m',      [8],                [9, 1]],
  ['ivar',   'wing',    [4],                [7]],
  ['ivar',   'penalty', [],                 [3]],
]
export const GK_SHOTS: SampleGkShot[] = GK_ROWS.flatMap(([keeperId, range, saves, goals]) => [
  ...saves.map(zone => ({ keeperId, range, zone, saved: true })),
  ...goals.map(zone => ({ keeperId, range, zone, saved: false })),
])

// Per keeper, per range: [saved, faced]
export const GK_FACED: Record<string, Record<GkRange, [number, number]>> = Object.fromEntries(
  ['haukur', 'ivar'].map(k => [k, Object.fromEntries((['9m_plus', '6m', 'wing', 'penalty'] as GkRange[]).map(r => {
    const rows = GK_SHOTS.filter(s => s.keeperId === k && s.range === r)
    return [r, [rows.filter(s => s.saved).length, rows.length]]
  }))]),
) as Record<string, Record<GkRange, [number, number]>>

// Season so far: one row per match, oldest first. The last row is this match.
export interface SeasonMatch { date: string; opponent: string; goals: number; shots: number }
export const SEASON: SeasonMatch[] = [
  { date: '2026-09-05', opponent: 'UMF Austri',  goals: 24, shots: 44 },
  { date: '2026-09-12', opponent: 'KA Vestri',   goals: 27, shots: 49 },
  { date: '2026-09-19', opponent: 'ÍF Suðri',    goals: 22, shots: 45 },
  { date: '2026-09-26', opponent: 'Fram Hekla',  goals: 30, shots: 50 },
  { date: '2026-10-03', opponent: 'UMF Austri',  goals: 26, shots: 47 },
  { date: '2026-10-10', opponent: 'HK Esja',     goals: 25, shots: 48 },
  { date: '2026-10-17', opponent: 'KA Vestri',   goals: 29, shots: 49 },
]

// ─── Derived figures ─────────────────────────────────────────────────────────

export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

export const ourGoals = SHOTS.filter(s => s.outcome === 'goal').length
export const ourShots = SHOTS.length
export const gkSaves = Object.values(GK_FACED).reduce((s, r) => s + Object.values(r).reduce((a, [sv]) => a + sv, 0), 0)
export const gkFaced = Object.values(GK_FACED).reduce((s, r) => s + Object.values(r).reduce((a, [, f]) => a + f, 0), 0)
export const theirGoals = gkFaced - gkSaves

// This match appended to the season, computed from the shots above
export const SEASON_WITH_THIS: SeasonMatch[] = [
  ...SEASON,
  { date: '2026-10-24', opponent: AWAY, goals: ourGoals, shots: ourShots },
]

export function playerLine(id: string) {
  const own = SHOTS.filter(s => s.playerId === id)
  const goals = own.filter(s => s.outcome === 'goal').length
  return { goals, shots: own.length, assists: ASSISTS[id] ?? 0, turnovers: TURNOVERS[id] ?? 0 }
}

export function gkLine(id: string) {
  const r = GK_FACED[id]
  const saves = Object.values(r).reduce((a, [s]) => a + s, 0)
  const faced = Object.values(r).reduce((a, [, f]) => a + f, 0)
  return { saves, faced, byRange: r }
}

// Figures that must agree wherever they appear
console.assert(ourGoals === 28 && ourShots === 47, 'sample: 28 goals from 47 shots')
console.assert(theirGoals === 25, 'sample: opponent scored 25 (faced − saved)')
console.assert(
  PLAYERS.filter(p => p.position === 'field').reduce((s, p) => s + playerLine(p.id).goals, 0) === ourGoals,
  'sample: player goals sum to team goals',
)

// Defensive actions: [player, kind, minute]
export type DefKind = 'block' | 'steal' | 'duel_won' | 'duel_lost' | 'rebound' | 'two_min'
export interface SampleDef { playerId: string; kind: DefKind; minute: number }
const DEF_ROWS: [string, DefKind, number][] = [
  ['hlynur', 'block', 3], ['kari', 'steal', 8], ['einar', 'duel_won', 11], ['snorri', 'duel_lost', 12],
  ['hlynur', 'duel_won', 16], ['atli', 'rebound', 19], ['hlynur', 'two_min', 21], ['breki', 'steal', 25],
  ['einar', 'block', 28], ['snorri', 'duel_won', 31], ['hlynur', 'block', 36], ['kari', 'duel_lost', 39],
  ['atli', 'steal', 43], ['einar', 'duel_won', 47], ['snorri', 'rebound', 51], ['hlynur', 'steal', 54],
  ['breki', 'duel_won', 57],
]
export const DEFENCE: SampleDef[] = DEF_ROWS.map(([playerId, kind, minute]) => ({ playerId, kind, minute }))

export function defLine(id: string, rows: SampleDef[] = DEFENCE) {
  const own = rows.filter(r => r.playerId === id)
  const c = (k: DefKind) => own.filter(r => r.kind === k).length
  return { blocks: c('block'), steals: c('steal'), duelsWon: c('duel_won'), duels: c('duel_won') + c('duel_lost'), rebounds: c('rebound'), twoMin: c('two_min') }
}
