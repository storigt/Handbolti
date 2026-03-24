import { supabase } from '@/lib/supabase/client'
import type { EventInsert } from '@/lib/db/schema'
import { flushQueue, voidEvent } from './syncQueue'

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
 * Patch the void flag on a synced event.
 */
export async function patchVoidOnServer(clientId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({
      is_voided: true,
      void_reason: 'operator_undo',
      voided_at: new Date().toISOString(),
    })
    .eq('client_id', clientId)

  if (error) throw error
}

/**
 * Flush all pending queue items to Supabase.
 * Call this when the app comes online or on focus.
 */
export async function syncPendingEvents(
  onProgress?: (synced: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
  return flushQueue(upsertEvent, onProgress)
}

/**
 * Void an event — removes from queue if unsynced, patches server if synced.
 */
export async function voidEventWithSync(clientId: string): Promise<void> {
  return voidEvent(clientId, patchVoidOnServer)
}
