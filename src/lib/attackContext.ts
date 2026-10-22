// Shared "where did the attack come from / which way is it going" option data.
// Used by the live event-logging flow (EventLogger.tsx) and by season-stats
// breakdowns (matchStats.ts, OriginDirectionTable) — kept in one place so the
// labels and values never drift apart. The stored values (v) never change;
// only their labels are translated.
import type { Text } from '@/lib/i18n/lang'
import { ORIGIN_TEXT, DIRECTION_TEXT } from '@/lib/i18n/terms'

export type AttackDirection = 'right' | 'left' | 'neither'

const ORIGIN_ORDER = ['left_wing', 'left_center', 'center', 'right_center', 'right_wing', 'line', 'other'] as const

export const ORIGINS: { v: string; label: Text }[] = ORIGIN_ORDER.map(v => ({ v, label: ORIGIN_TEXT[v] }))

export const ORIGIN_LABEL: Record<string, Text> = ORIGIN_TEXT

export const DIRECTIONS: { v: AttackDirection; label: Text }[] = (['right', 'left', 'neither'] as AttackDirection[])
  .map(v => ({ v, label: DIRECTION_TEXT[v] }))

export const DIRECTION_LABEL: Record<AttackDirection, Text> = DIRECTION_TEXT as Record<AttackDirection, Text>
