import { supabase } from '@/lib/supabase/client'
import type { EventInsert, CourtLineupInsert } from '@/lib/db/schema'
import { flushQueue } from './syncQueue'

/**
 * Upsert a single event to Supabase.
 * Uses client_id as the conflict target so replays are idempotent.
 */
export async function upsertEvent(event: EventInsert): Promise<void> {
  const { error } = await supabase
    .from('events')
    .upsert(event, { onConflict: 'client_id' })

  if (error) throw error
}

/**
 * Upsert a court lineup. The id is client-generated, so replays are idempotent.
 */
export async function upsertLineup(lineup: CourtLineupInsert & { id: string }): Promise<void> {
  const { error } = await supabase
    .from('court_lineups')
    .upsert(lineup, { onConflict: 'id' })

  if (error) throw error
}

// ─── Serialized sync ──────────────────────────────────────────────────────────
// Every upload goes through ONE flush at a time, in queue order. This matters
// for undo: an event and its later void are both queued, and running them
// one after another guarantees the void is never overtaken by the original.

let running: Promise<{ synced: number; failed: number }> | null = null
let rerun = false

async function runFlush(
  onProgress?: (synced: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
  let result = { synced: 0, failed: 0 }
  do {
    rerun = false
    result = await flushQueue(upsertEvent, upsertLineup, onProgress)
  } while (rerun)
  return result
}

/**
 * Flush all pending lineups and events to Supabase.
 * Safe to call any time and as often as you like: if a flush is already
 * running, another pass is scheduled right after it, so anything queued in the
 * meantime is picked up.
 */
export function syncPendingEvents(
  onProgress?: (synced: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
  if (running) {
    rerun = true
    return running
  }
  running = runFlush(onProgress).finally(() => { running = null })
  return running
}
