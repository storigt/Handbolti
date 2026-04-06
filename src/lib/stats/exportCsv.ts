import {
  computeAttack, computeDefense, computeGK,
  sumAttack, sumDefense, sumGK,
  pct,
  type AttackRow, type DefenseRow, type GKRow,
} from './matchStats'
import type { Event, Player } from '@/lib/db/schema'

// ─── CSV primitives ───────────────────────────────────────────────────────────

function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows.map(row => row.map(cell).join(',')).join('\r\n')
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Attack CSV ───────────────────────────────────────────────────────────────

const ATTACK_HEADERS = [
  'Nafn', 'Númer',
  'Mörk', 'Skot', 'Skotnýting%',
  'Mörk víti', 'Skot víti', 'Víti%',
  'Mörk horn', 'Skot horn', 'Horn%',
  'Mörk 9m+', 'Skot 9m+', '9m+%',
  'Mörk 7-8m', 'Skot 7-8m', '7-8m%',
  'Mörk 6m', 'Skot 6m', '6m%',
  'Mörk lína', 'Skot lína', 'Lína%',
  'Mörk hraðaupphlaup', 'Skot hraðaupphlaup', 'Hraðaupphlaup%',
  'Mörk seinni bylgja', 'Skot seinni bylgja', 'Seinni bylgja%',
  'Mörk uppstilltur leikur', 'Skot uppstilltur leikur', 'Uppstilltur leikur%',
  'Mörk undirtala', 'Skot undirtala', 'Undirtala%',
  'Mörk yfirtala', 'Skot yfirtala', 'Yfirtala%',
  'Mörk 7á6', 'Skot 7á6', '7á6%',
  'Mörk 6á6', 'Skot 6á6', '6á6%',
  'Sköpuð færi', 'Stoðsendingar', 'Vítasendingar', 'Fiskuð víti',
  'Tapinn bolti', 'Sóknarfráköst', 'Fiskaðar 2mín',
]

function attackRow(name: string, num: string | number | null, r: Omit<AttackRow, 'player'>): (string | number | null)[] {
  return [
    name, num,
    r.goals, r.shots, r.shots > 0 ? Math.round(r.goals / r.shots * 100) : '',
    r.penGoals, r.penShots, r.penShots > 0 ? Math.round(r.penGoals / r.penShots * 100) : '',
    r.cornGoals, r.cornShots, r.cornShots > 0 ? Math.round(r.cornGoals / r.cornShots * 100) : '',
    r.nineMGoals, r.nineMShots, r.nineMShots > 0 ? Math.round(r.nineMGoals / r.nineMShots * 100) : '',
    r.s78Goals, r.s78Shots, r.s78Shots > 0 ? Math.round(r.s78Goals / r.s78Shots * 100) : '',
    r.s6mGoals, r.s6mShots, r.s6mShots > 0 ? Math.round(r.s6mGoals / r.s6mShots * 100) : '',
    r.lineGoals, r.lineShots, r.lineShots > 0 ? Math.round(r.lineGoals / r.lineShots * 100) : '',
    r.fbGoals, r.fbShots, r.fbShots > 0 ? Math.round(r.fbGoals / r.fbShots * 100) : '',
    r.swGoals, r.swShots, r.swShots > 0 ? Math.round(r.swGoals / r.swShots * 100) : '',
    r.spGoals, r.spShots, r.spShots > 0 ? Math.round(r.spGoals / r.spShots * 100) : '',
    r.infGoals, r.infShots, r.infShots > 0 ? Math.round(r.infGoals / r.infShots * 100) : '',
    r.supGoals, r.supShots, r.supShots > 0 ? Math.round(r.supGoals / r.supShots * 100) : '',
    r.s76Goals, r.s76Shots, r.s76Shots > 0 ? Math.round(r.s76Goals / r.s76Shots * 100) : '',
    r.s66Goals, r.s66Shots, r.s66Shots > 0 ? Math.round(r.s66Goals / r.s66Shots * 100) : '',
    r.chancesCreated, r.assists, r.penaltyAssists, r.drewPenalty,
    r.turnovers, r.offensiveRebounds, r.drewSuspension,
  ]
}

// ─── Defense CSV ──────────────────────────────────────────────────────────────

const DEFENSE_HEADERS = [
  'Nafn', 'Númer',
  'Árás 1á1', 'Vinnur 1á1', '1á1%',
  'Hár kontakt', 'Fríköst', 'Stolinn', 'Blokk', 'Fráköst',
  'Víti á', 'Gult kort', '2 mín', 'Rautt kort',
  'Værukærð', 'Fiskað sóknarbrot',
]

function defenseRow(name: string, num: string | number | null, r: Omit<DefenseRow, 'player'>): (string | number | null)[] {
  return [
    name, num,
    r.duels, r.duelsWon, r.duels > 0 ? Math.round(r.duelsWon / r.duels * 100) : '',
    r.highContact, r.freekick, r.interceptions, r.blocks, r.rebounds,
    r.penaltyAwarded, r.yellowCards, r.suspensions2min, r.redCards,
    r.protest, r.drewOffensiveFoul,
  ]
}

// ─── GK CSV ───────────────────────────────────────────────────────────────────

const GK_HEADERS = [
  'Nafn', 'Númer',
  'Varið', 'Á móti', 'Vörn%',
  'Varið víti', 'Víti á móti', 'Víti vörn%',
  'Varið horn', 'Horn á móti', 'Horn vörn%',
  'Varið 9m+', '9m+ á móti', '9m+ vörn%',
  'Varið 7-8m', '7-8m á móti', '7-8m vörn%',
  'Varið 6m', '6m á móti', '6m vörn%',
  'Varið lína', 'Lína á móti', 'Lína vörn%',
  'Varið hraðaupphlaup', 'Hraðaupphlaup á móti', 'Hraðaupphlaup vörn%',
  'Varið seinni bylgja', 'Seinni bylgja á móti', 'Seinni bylgja vörn%',
  'Varið undirtala', 'Undirtala á móti', 'Undirtala vörn%',
  'Varið yfirtala', 'Yfirtala á móti', 'Yfirtala vörn%',
  'Varið 6á7', '6á7 á móti', '6á7 vörn%',
  'Tómar fasir', 'Jákvæð viðbrögð',
]

function gkRow(name: string, num: string | number | null, r: Omit<GKRow, 'player'>): (string | number | null)[] {
  function savePct(saved: number, faced: number) { return faced > 0 ? Math.round(saved / faced * 100) : '' }
  return [
    name, num,
    r.saves, r.shotsFaced, savePct(r.saves, r.shotsFaced),
    r.savedPen, r.facedPen, savePct(r.savedPen, r.facedPen),
    r.savedCorn, r.facedCorn, savePct(r.savedCorn, r.facedCorn),
    r.savedNineM, r.facedNineM, savePct(r.savedNineM, r.facedNineM),
    r.savedS78, r.facedS78, savePct(r.savedS78, r.facedS78),
    r.savedS6m, r.facedS6m, savePct(r.savedS6m, r.facedS6m),
    r.savedLine, r.facedLine, savePct(r.savedLine, r.facedLine),
    r.savedFb, r.facedFb, savePct(r.savedFb, r.facedFb),
    r.savedSw, r.facedSw, savePct(r.savedSw, r.facedSw),
    r.savedInf, r.facedInf, savePct(r.savedInf, r.facedInf),
    r.savedSup, r.facedSup, savePct(r.savedSup, r.facedSup),
    r.savedS67, r.facedS67, savePct(r.savedS67, r.facedS67),
    r.emptyPhase, r.positiveResponse,
  ]
}

// ─── Main export function ─────────────────────────────────────────────────────

export type ExportStatsType = 'attack' | 'defense' | 'gk'

export function buildCSV(
  events: Event[],
  players: Player[],
  trackedTeamId: string,
  statsType: ExportStatsType,
  includeTotals: boolean,
): string {
  const goalkeepers = players.filter(p => p.position === 'goalkeeper')

  if (statsType === 'attack') {
    const rows = computeAttack(events, players, trackedTeamId)
    const data: (string | number | null)[][] = rows.map(r =>
      attackRow(`${r.player.first_name} ${r.player.last_name}`, r.player.jersey_number, r),
    )
    if (includeTotals) {
      const totals = sumAttack(rows)
      data.push(attackRow('SAMTALS', '', totals))
    }
    return toCSV([ATTACK_HEADERS, ...data])
  }

  if (statsType === 'defense') {
    const rows = computeDefense(events, players, trackedTeamId)
    const data: (string | number | null)[][] = rows.map(r =>
      defenseRow(`${r.player.first_name} ${r.player.last_name}`, r.player.jersey_number, r),
    )
    if (includeTotals) {
      const totals = sumDefense(rows)
      data.push(defenseRow('SAMTALS', '', totals))
    }
    return toCSV([DEFENSE_HEADERS, ...data])
  }

  // gk
  const rows = computeGK(events, goalkeepers, trackedTeamId)
  const data: (string | number | null)[][] = rows.map(r =>
    gkRow(`${r.player.first_name} ${r.player.last_name}`, r.player.jersey_number, r),
  )
  if (includeTotals && rows.length > 1) {
    const totals = sumGK(rows)
    data.push(gkRow('SAMTALS', '', totals))
  }
  return toCSV([GK_HEADERS, ...data])
}

// suppress unused import warning
void pct
