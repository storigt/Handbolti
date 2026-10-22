// Zone cells for the goal grid, computed from shot rows.
import { SHOTS, GK_SHOTS, type Zone } from './sample'

export interface ZoneCell { zone: Zone; n: number; d: number }

const ZONES: Zone[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export function attackCells(shots = SHOTS): ZoneCell[] {
  return ZONES.map(zone => {
    const inZone = shots.filter(s => s.zone === zone)
    return { zone, n: inZone.filter(s => s.outcome === 'goal').length, d: inZone.length }
  })
}

export function keeperCells(rows = GK_SHOTS): ZoneCell[] {
  return ZONES.map(zone => {
    const inZone = rows.filter(s => s.zone === zone)
    return { zone, n: inZone.filter(s => s.saved).length, d: inZone.length }
  })
}
