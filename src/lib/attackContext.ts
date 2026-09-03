// Shared "where did the attack come from / which way is it going" option data.
// Used by the live event-logging flow (EventLogger.tsx) and by season-stats
// breakdowns (matchStats.ts, OriginDirectionTable) — kept in one place so the
// labels and values never drift apart.

export type AttackDirection = 'right' | 'left' | 'neither'

export const ORIGINS: { v: string; label: string }[] = [
  { v: 'left_wing',    label: 'Vinstra Horn' },
  { v: 'left_center',  label: 'Vinstri Skytta' },
  { v: 'center',       label: 'Vinstri Miðja' },
  { v: 'right_center', label: 'Hægri Miðja' },
  { v: 'right_wing',   label: 'Hægri Skytta' },
  { v: 'line',         label: 'Hægra Horn' },
  { v: 'other',        label: 'Annað (Árás)' },
]

export const ORIGIN_LABEL: Record<string, string> = {
  left_wing: 'Vinstra Horn', left_center: 'Vinstri Skytta', center: 'Vinstri Miðja',
  right_center: 'Hægri Miðja', right_wing: 'Hægri Skytta', line: 'Hægra Horn', other: 'Annað (Árás)',
}

export const DIRECTIONS: { v: AttackDirection; label: string }[] = [
  { v: 'right',   label: 'Hægri' },
  { v: 'left',    label: 'Vinstri' },
  { v: 'neither', label: 'Hvorugt' },
]

export const DIRECTION_LABEL: Record<AttackDirection, string> = {
  right: 'Hægri', left: 'Vinstri', neither: 'Hvorugt',
}
