// Index definitions: every index is a list of named steps and a final formula,
// written in the formula language of ./formula.ts and evaluated against the
// inputs counted from events (computeIndices().raw). The six original indices
// are defined here the same way; users can edit them, reset them, and add their
// own. Definitions are settings only — events are never touched.
import type { Text } from '@/lib/i18n/lang'
import type { IndexRaw } from './indices'
import { parse, namesIn, evaluate, FUNCTIONS, FormulaError, type Node } from './formula'
import { EXTRA_INPUTS, type InputGroup } from './indexInputs'

export type Label = string | Text

export interface IndexStep {
  key: string          // name other formulas use
  label: Label         // shown in the breakdown
  formula: string
  show: boolean        // listed as a component in the breakdown
}

export interface IndexDef {
  id: string           // stable, never changes
  key: string          // short name, used in formulas and as the title (e.g. GIQI)
  name: Label          // full name
  steps: IndexStep[]
  formula: string
  green: number        // higher is better: green from this value up; lower is better: green up to it
  yellow: number
  higherIsBetter: boolean
  hidden?: boolean
  builtIn?: string     // the original this one started from (can be reset to it)
}

// ─── Inputs: the counted numbers formulas can use ────────────────────────────

export interface InputDef { key: string; label: Text; group: InputGroup; pct?: boolean }

const SEGMENTS = [0, 1, 2, 3, 4, 5]
export const segKey = (i: number) => `gkSave${i * 10}to${(i + 1) * 10}`

export const INPUTS: InputDef[] = [
  { key: 'ourGoals', label: { en: 'Our goals', is: 'Mörk okkar' }, group: 'attack' },
  { key: 'ourTotalShots', label: { en: 'Our shots (all)', is: 'Skot okkar (alls)' }, group: 'attack' },
  { key: 'ourShotEff', label: { en: 'Our shooting %', is: 'Skotnýting okkar' }, pct: true, group: 'attack' },
  { key: 'ourAttacks', label: { en: 'Our possessions', is: 'Fjöldi sókna' }, group: 'attack' },
  { key: 'ourTurnovers', label: { en: 'Our turnovers', is: 'Tapaður bolti' }, group: 'attack' },
  { key: 'ourAssists', label: { en: 'Assists (chances created)', is: 'Sköpuð færi (stoðsendingar)' }, group: 'attack' },
  { key: 'fiskaViti', label: { en: 'Drew 7 m', is: 'Fiskað víti' }, group: 'attack' },
  { key: 'penGoals', label: { en: '7 m goals', is: 'Mörk úr víti' }, group: 'attack' },
  { key: 'penShots', label: { en: '7 m shots', is: 'Vítaskot' }, group: 'attack' },
  { key: 'ourFBGoals', label: { en: 'Fast-break goals', is: 'Mörk úr hraðaupphlaupum' }, group: 'attack' },
  { key: 'ourFBShots', label: { en: 'Fast-break shots', is: 'Skot úr hraðaupphlaupum' }, group: 'attack' },
  { key: 'ourSWGoals', label: { en: 'Second-wave goals', is: 'Mörk úr seinni bylgju' }, group: 'attack' },
  { key: 'ourSWShots', label: { en: 'Second-wave shots', is: 'Skot úr seinni bylgju' }, group: 'attack' },
  { key: 'oppGoals', label: { en: 'Opponent goals', is: 'Mörk andstæðinga' }, group: 'opponent' },
  { key: 'oppTotalShots', label: { en: 'Opponent shots (all)', is: 'Fjöldi skota andstæðinga' }, group: 'opponent' },
  { key: 'oppOnGoalShots', label: { en: 'Opponent shots on target', is: 'Skot andstæðinga á mark' }, group: 'opponent' },
  { key: 'oppMissed', label: { en: 'Opponent wide / post', is: 'Framhjá/stöng hjá andstæðingum' }, group: 'opponent' },
  { key: 'oppShotEff', label: { en: 'Opponent shooting %', is: 'Skotnýting andstæðinga' }, pct: true, group: 'opponent' },
  { key: 'oppAttacks', label: { en: 'Opponent possessions', is: 'Fjöldi sókna andstæðinga' }, group: 'opponent' },
  { key: 'oppFBShots', label: { en: 'Opponent fast-break shots', is: 'Skot andstæðinga úr hraðaupphlaupum' }, group: 'opponent' },
  { key: 'oppSWShots', label: { en: 'Opponent second-wave shots', is: 'Skot andstæðinga úr seinni bylgju' }, group: 'opponent' },
  { key: 'duelWon', label: { en: '1 v 1 won', is: '1á1 unnin' }, group: 'defence' },
  { key: 'duelLost', label: { en: '1 v 1 lost', is: '1á1 töpuð' }, group: 'defence' },
  { key: 'duelPct', label: { en: '1 v 1 %', is: '1á1 %' }, pct: true, group: 'defence' },
  { key: 'frikanst', label: { en: 'Free throws', is: 'Fríkast' }, group: 'defence' },
  { key: 'harKontakt', label: { en: 'High contact 9 m+', is: 'Hár kontakt 9m+' }, group: 'defence' },
  { key: 'stolinn', label: { en: 'Steals', is: 'Stolinn' }, group: 'defence' },
  { key: 'blokk', label: { en: 'Blocks', is: 'Blokk' }, group: 'defence' },
  { key: 'rebounds', label: { en: 'Rebounds', is: 'Fráköst' }, group: 'defence' },
  { key: 'oppLostBall', label: { en: 'Opponent lost ball', is: 'Andstæðingur tapaði bolta' }, group: 'defence' },
  { key: 'tapAnd', label: { en: 'Opponent turnovers forced', is: 'Tapaðir boltar andstæðinga' }, group: 'defence' },
  { key: 'vitiASig', label: { en: '7 m conceded', is: 'Víti á sig' }, group: 'defence' },
  { key: 'twoMin', label: { en: '2 minutes', is: '2 mínútur' }, group: 'defence' },
  { key: 'yellowCards', label: { en: 'Yellow cards', is: 'Gul spjöld' }, group: 'defence' },
  { key: 'rautt', label: { en: 'Red cards', is: 'Rautt' }, group: 'defence' },
  { key: 'gkSavePct', label: { en: 'Save %', is: 'Markvarsla %' }, pct: true, group: 'keeper' },
  { key: 'gkSaves', label: { en: 'Saves', is: 'Varin skot' }, group: 'keeper' },
  { key: 'emptyPhases', label: { en: 'Empty phases', is: 'Tómir fasar' }, group: 'keeper' },
  { key: 'positiveResponse', label: { en: 'Positive responses', is: 'Jákvæð viðbrögð' }, group: 'keeper' },
  { key: 'gkSegCount', label: { en: '10-min segments with keeper data', is: '10 mín. bil með markvörslu' }, group: 'keeper' },
  { key: 'gkSegStdev', label: { en: 'Spread of save % across segments', is: 'Sveifla í markvörslu milli bila' }, group: 'keeper' },
  ...SEGMENTS.map(i => ({
    key: segKey(i),
    label: { en: `Save % ${i * 10}–${(i + 1) * 10} min`, is: `Markvarsla % ${i * 10}–${(i + 1) * 10} mín` },
    pct: true,
    group: 'keeper' as const,
  })),
  ...EXTRA_INPUTS.map(({ key, label, group }) => ({ key, label, group })),
]
export const INPUT_KEYS = new Set(INPUTS.map(i => i.key))

/** Inputs that only mean something over a whole match (hidden under a minute filter). */
export const SEGMENT_INPUTS = new Set(['gkSegCount', 'gkSegStdev', ...SEGMENTS.map(segKey)])

export function inputValues(raw: IndexRaw): Record<string, number> {
  const out: Record<string, number> = {}
  for (const { key } of INPUTS) {
    const v = (raw as unknown as Record<string, unknown>)[key]
    if (typeof v === 'number') out[key] = v
  }
  SEGMENTS.forEach(i => { out[segKey(i)] = raw.gkSavePctBySegment[i] ?? 0 })
  Object.assign(out, raw.extra)
  return out
}

// ─── The original six, as definitions ────────────────────────────────────────
// Each mirrors src/lib/stats/indices.ts operation for operation, so the numbers
// are identical (checked by scripts in development).

const step = (key: string, label: Label, formula: string, show = true): IndexStep => ({ key, label, formula, show })

export const DEFAULT_INDICES: IndexDef[] = [
  {
    id: 'builtin-GIQI', builtIn: 'GIQI', key: 'GIQI',
    name: { en: 'Game IQ index', is: 'Leikskilningsvísitala' },
    steps: [],
    formula: 'clamp(0.25×DQIdef + 0.25×DQIoff + 0.25×ELI + 0.25×FI)',
    green: 70, yellow: 50, higherIsBetter: true,
  },
  {
    id: 'builtin-DQIdef', builtIn: 'DQIdef', key: 'DQIdef',
    name: { en: 'Decision quality, defence', is: 'Ákvarðanagæði í vörn' },
    steps: [
      step('control1v1', { en: '1vs1 Control Score', is: 'Stjórn í 1á1' }, 'clamp(0.4×duelPct + 0.3×frikanst + 0.3×(100 − oppShotEff))'),
      step('ddsRatio', { en: 'Disruption ratio', is: 'Hlutfall truflunar' }, '(harKontakt + frikanst + stolinn) / oppTotalShots × 100', false),
      step('ddsInner', { en: 'Disruption base', is: 'Grunnur truflunar' }, '0.75×min(1, ddsRatio / 45) + 0.25×min(1, (100 − oppShotEff) / 70)', false),
      step('disruption', { en: 'Defensive Disruption Score', is: 'Truflun í vörn' }, 'clamp(min(100, 100 × max(0, ddsInner)^1.5))'),
      step('discipline', { en: 'Defensive Discipline Score', is: 'Agi í vörn' }, 'clamp(100 − (vitiASig×1.5 + twoMin + rautt×2) / oppTotalShots × 100)'),
      step('foulQuality', { en: 'Foul Quality Score', is: 'Gæði brota' }, 'clamp(frikanst / (twoMin×1.5 + rautt×2 + frikanst) × 100)'),
    ],
    formula: 'clamp(0.5×control1v1 + 0.3×disruption + 0.1×discipline + 0.1×foulQuality)',
    green: 70, yellow: 50, higherIsBetter: true,
  },
  {
    id: 'builtin-DQIoff', builtIn: 'DQIoff', key: 'DQIoff',
    name: { en: 'Decision quality, attack', is: 'Ákvarðanagæði í sókn' },
    steps: [
      step('chanceCreation', { en: 'Chance Creation Score', is: 'Sköpun færa' }, 'clamp((ourAssists + fiskaViti) / ourAttacks × 100 − ourTurnovers / ourAttacks × 100)'),
      step('shotEfficiency', { en: 'Shot Efficiency Score', is: 'Skotnýting' }, 'clamp(ourShotEff)'),
      step('ballControl', { en: 'Ball Control', is: 'Boltastjórn' }, 'clamp((ourAttacks − ourTurnovers) / ourAttacks × 100)'),
    ],
    formula: 'clamp(0.4×chanceCreation + 0.35×shotEfficiency + 0.25×ballControl)',
    green: 70, yellow: 50, higherIsBetter: true,
  },
  {
    id: 'builtin-ELI', builtIn: 'ELI', key: 'ELI',
    name: { en: 'Energy level index', is: 'Orkuvísitala' },
    steps: [
      step('dasRaw', { en: 'Defensive activity per opponent possession', is: 'Virkni í vörn á sókn andstæðinga' }, '(stolinn + blokk + harKontakt + frikanst + oppLostBall) / oppAttacks × 100', false),
      step('das', { en: 'DAS — Defensive Activity Score', is: 'DAS — virkni í vörn' }, 'clamp(100 × (1 − exp(−0.03 × dasRaw)))'),
      step('ote', { en: 'Transition goal efficiency', is: 'Nýting í skiptingum' }, '(ourFBGoals + ourSWGoals) / (ourFBShots + ourSWShots) × 100', false),
      step('otv', { en: 'Transition volume', is: 'Magn skiptinga' }, '(ourFBShots + ourSWShots) / ourTotalShots × 100', false),
      step('dtc', { en: 'Opponent transition control', is: 'Stjórn á skiptingum andstæðinga' }, '100 × (1 − (oppFBShots + oppSWShots) / max(1, oppTotalShots))', false),
      step('tis', { en: 'TIS — Transition Intensity Score', is: 'TIS — kraftur í skiptingum' }, 'clamp(0.35×ote + 0.30×otv + 0.35×dtc)'),
    ],
    formula: 'clamp(0.35×das + 0.65×tis)',
    green: 70, yellow: 50, higherIsBetter: true,
  },
  {
    id: 'builtin-FI', builtIn: 'FI', key: 'FI',
    name: { en: 'Focus index', is: 'Einbeitingarvísitala' },
    steps: [
      step('ocss', { en: 'OCSS — Offensive Control & Stability Score', is: 'OCSS — stjórn og stöðugleiki í sókn' }, 'clamp((100 × (1 − ourTurnovers / ourAttacks) + ourShotEff) / 2)'),
      step('oppDefEff', { en: 'Opponent possessions without a goal %', is: 'Sóknir andstæðinga án marks %' }, '(oppAttacks − oppGoals) / max(1, oppAttacks) × 100', false),
      step('dcss', { en: 'DCSS — Defensive Control & Stability Score', is: 'DCSS — stjórn og stöðugleiki í vörn' }, 'clamp(0.7 × (0.3×duelPct + 0.4×oppDefEff + 0.15×frikanst + 0.15×stolinn) + 0.3 × (100 − 0.5×twoMin − 0.5×vitiASig))'),
      step('ballControl', { en: 'Ball Control', is: 'Boltastjórn' }, 'clamp((ourAttacks − ourTurnovers) / ourAttacks × 100)', false),
      step('ess', { en: 'ESS — Execution Stability Score', is: 'ESS — stöðugleiki í framkvæmd' }, 'clamp(0.6×ourShotEff + 0.4×ballControl)'),
    ],
    formula: 'clamp(0.35×ocss + 0.35×dcss + 0.3×ess)',
    green: 70, yellow: 50, higherIsBetter: true,
  },
  {
    id: 'builtin-GKI', builtIn: 'GKI', key: 'GKI',
    name: { en: 'Goalkeeper index', is: 'Markmannsvísitala' },
    steps: [
      step('saveEff', { en: 'Save Efficiency', is: 'Markvarsla' }, 'clamp(gkSavePct)'),
      step('saveVariability', { en: 'Save Variability', is: 'Sveiflur í markvörslu' }, 'clamp(if(gkSegCount >= 2, 100 × exp(−gkSegStdev / 15), 100))'),
      step('emptyPhaseRate', { en: 'Empty Phase Rate', is: 'Tíðni tómra fasa' }, 'clamp(100 − emptyPhases / max(1, oppTotalShots − 2) × 100)'),
      step('saveStability', { en: 'Save Stability', is: 'Stöðugleiki markvörslu' }, 'clamp(0.9×saveVariability + 0.1×emptyPhaseRate)'),
    ],
    formula: 'clamp(0.7×saveEff + 0.3×saveStability)',
    green: 70, yellow: 50, higherIsBetter: true,
  },
]

export const defaultFor = (builtIn: string) => DEFAULT_INDICES.find(d => d.builtIn === builtIn)

// ─── Checking ────────────────────────────────────────────────────────────────

export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface DefProblem { where: 'key' | 'name' | 'step' | 'formula' | 'colours'; step?: number; message: Text }

const tx = (en: string, is: string): Text => ({ en, is })

/** Everything wrong with one definition, given the others (for name clashes and references). */
export function checkDef(def: IndexDef, all: IndexDef[]): DefProblem[] {
  const out: DefProblem[] = []
  const otherKeys = new Set(all.filter(d => d.id !== def.id).map(d => d.key))
  if (!NAME_RE.test(def.key)) out.push({ where: 'key', message: tx('Use letters, digits and _ only, starting with a letter.', 'Notaðu bókstafi, tölustafi og _ eingöngu, og byrjaðu á bókstaf.') })
  else if (otherKeys.has(def.key)) out.push({ where: 'key', message: tx(`Another index is already called ${def.key}.`, `Önnur vísitala heitir nú þegar ${def.key}.`) })
  else if (INPUT_KEYS.has(def.key) || FUNCTIONS[def.key.toLowerCase()]) out.push({ where: 'key', message: tx(`${def.key} is already the name of an input or function.`, `${def.key} er nú þegar heiti á grunntölu eða falli.`) })

  const known = new Set<string>([...INPUT_KEYS, ...otherKeys])
  const seen = new Set<string>()
  def.steps.forEach((s, i) => {
    if (!NAME_RE.test(s.key)) out.push({ where: 'step', step: i, message: tx('Step names use letters, digits and _ only, starting with a letter.', 'Heiti skrefa nota bókstafi, tölustafi og _, og byrja á bókstaf.') })
    else if (seen.has(s.key) || known.has(s.key) || s.key === def.key) out.push({ where: 'step', step: i, message: tx(`The name ${s.key} is already used.`, `Heitið ${s.key} er nú þegar í notkun.`) })
    const p = problemIn(s.formula, new Set([...known, ...seen]))
    if (p) out.push({ where: 'step', step: i, message: p })
    seen.add(s.key)
  })
  const p = problemIn(def.formula, new Set([...known, ...seen]))
  if (p) out.push({ where: 'formula', message: p })
  if (!Number.isFinite(def.green) || !Number.isFinite(def.yellow)) out.push({ where: 'colours', message: tx('Enter a number for each colour.', 'Sláðu inn tölu fyrir hvern lit.') })
  else if (def.higherIsBetter ? def.green < def.yellow : def.green > def.yellow) {
    out.push({ where: 'colours', message: def.higherIsBetter
      ? tx('Green must start at or above yellow.', 'Grænt verður að byrja við eða ofan við gult.')
      : tx('Green must end at or below yellow.', 'Grænt verður að enda við eða neðan við gult.') })
  }
  return out
}

function problemIn(formula: string, known: Set<string>): Text | null {
  let tree: Node
  try { tree = parse(formula) } catch (e) {
    const m = e instanceof FormulaError ? e.message : 'Invalid formula'
    return tx(m, `Villa í formúlu: ${m}`)
  }
  const unknown = [...namesIn(tree)].filter(n => !known.has(n))
  if (unknown.length) return tx(`Unknown name: ${unknown.join(', ')}`, `Óþekkt heiti: ${unknown.join(', ')}`)
  return null
}

// ─── Evaluating ──────────────────────────────────────────────────────────────

export interface IndexResult {
  value: number | null          // null when the definition has an error
  steps: Record<string, number>
  error?: Text
  usesSegments: boolean          // depends on whole-match keeper segments
  inputsUsed: string[]           // inputs its formulas read directly, in INPUTS order
}

export interface Evaluated {
  byId: Record<string, IndexResult>
  values: Record<string, number> // by index key (errors count as 0 when referenced)
}

/** Other indices a definition reads, by key (formulas that don't parse are skipped). */
function indexRefs(def: IndexDef, keys: Set<string>): string[] {
  const out = new Set<string>()
  for (const f of [...def.steps.map(s => s.formula), def.formula]) {
    try { for (const n of namesIn(parse(f))) if (keys.has(n) && n !== def.key) out.add(n) } catch { /* reported by checkDef */ }
  }
  return [...out]
}

const LOOP = tx('This index uses itself through another index.', 'Þessi vísitala notar sjálfa sig í gegnum aðra vísitölu.')

/**
 * Evaluate every index. Indices may use each other by key (GIQI uses DQIdef …);
 * they are evaluated in dependency order. An index in a loop, or one that uses an
 * index with an error, gets an error instead of a number.
 */
export function evaluateIndices(defs: IndexDef[], raw: IndexRaw): Evaluated {
  const inputs = inputValues(raw)
  const keys = new Set(defs.map(d => d.key))
  const byKey = new Map(defs.map(d => [d.key, d]))
  const refs = new Map(defs.map(d => [d.id, indexRefs(d, keys)]))

  // Indices that sit on a loop
  const inLoop = new Set<string>()
  const colour = new Map<string, 0 | 1 | 2>()
  const stack: string[] = []
  const visit = (d: IndexDef) => {
    colour.set(d.id, 1); stack.push(d.id)
    for (const k of refs.get(d.id) ?? []) {
      const o = byKey.get(k)!
      const c = colour.get(o.id) ?? 0
      if (c === 1) stack.slice(stack.indexOf(o.id)).forEach(id => inLoop.add(id))
      else if (c === 0) visit(o)
    }
    stack.pop(); colour.set(d.id, 2)
  }
  defs.forEach(d => { if (!colour.get(d.id)) visit(d) })

  const byId: Record<string, IndexResult> = {}
  const values: Record<string, number> = {}
  const run = (def: IndexDef): IndexResult => {
    if (byId[def.id]) return byId[def.id]
    const result: IndexResult = { value: null, steps: {}, usesSegments: false, inputsUsed: [] }
    byId[def.id] = result
    values[def.key] = 0
    const problems = checkDef(def, defs).filter(p => p.where !== 'colours')
    if (problems.length) { result.error = problems[0].message; return result }
    if (inLoop.has(def.id)) { result.error = LOOP; return result }
    const vars: Record<string, number> = { ...inputs }
    for (const k of refs.get(def.id) ?? []) {
      const r = run(byKey.get(k)!)
      if (r.value === null) { result.error = tx(`Uses ${k}, which has an error.`, `Notar ${k}, sem er með villu.`); return result }
      vars[k] = r.value
      if (r.usesSegments) result.usesSegments = true
    }
    const read = new Set<string>()
    const tree = (f: string) => { const t = parse(f); namesIn(t).forEach(n => { if (INPUT_KEYS.has(n)) read.add(n) }); return t }
    try {
      for (const s of def.steps) {
        const v = evaluate(tree(s.formula), vars)
        vars[s.key] = v
        result.steps[s.key] = v
      }
      result.value = evaluate(tree(def.formula), vars)
    } catch {
      result.error = tx('The formula could not be calculated.', 'Ekki tókst að reikna formúluna.')
      result.value = null
      return result
    }
    if ([...read].some(k => SEGMENT_INPUTS.has(k))) result.usesSegments = true
    result.inputsUsed = INPUTS.map(i => i.key).filter(k => read.has(k))
    values[def.key] = result.value
    return result
  }
  defs.forEach(run)
  return { byId, values }
}

// ─── Colours ─────────────────────────────────────────────────────────────────

export type Band = 'green' | 'yellow' | 'red'

export function band(def: Pick<IndexDef, 'green' | 'yellow' | 'higherIsBetter'>, v: number): Band {
  if (def.higherIsBetter) return v >= def.green ? 'green' : v >= def.yellow ? 'yellow' : 'red'
  return v <= def.green ? 'green' : v <= def.yellow ? 'yellow' : 'red'
}

export const BAND_TEXT: Record<Band, string> = { green: 'text-[#247b50]', yellow: 'text-[#a15c07]', red: 'text-[#c4242a]' }
export const BAND_BG: Record<Band, string> = { green: 'bg-[#2f9461]', yellow: 'bg-[#d08a1a]', red: 'bg-[#d4454a]' }

export function newIndexId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
