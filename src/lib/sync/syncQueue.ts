import Dexie, { type Table } from 'dexie'
import type { EventInsert } from '@/lib/db/schema'

// ─── IndexedDB schema ─────────────────────────────────────────────────────────

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export interface SyncQueueItem {
  client_id: string     // PK — same as event.id
  match_id: string
  payload: EventInsert
  created_at: string    // ISO 8601
  attempts: number
  last_attempt: string | null
  status: SyncStatus
}

class HandboltiDB extends Dexie {
  syncQueue!: Table<SyncQueueItem, string>

  constructor() {
    super('HandboltiDB')
    this.version(1).stores({
      syncQueue: 'client_id, match_id, status, created_at',
    })
  }
}

export const db = new HandboltiDB()

// ─── Queue operations ─────────────────────────────────────────────────────────

/** Add a new event to the sync queue (called immediately on every tap) */
export async function enqueue(event: EventInsert): Promise<void> {
  await db.syncQueue.put({
    client_id: event.client_id,
    match_id: event.match_id,
    payload: event,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_attempt: null,
    status: 'pending',
  })
}

/** Remove an event from the queue (after successful void — before it ever syncs) */
export async function dequeue(clientId: string): Promise<void> {
  await db.syncQueue.delete(clientId)
}

/** Get all pending items for a match (for display/retry) */
export async function getPending(matchId: string): Promise<SyncQueueItem[]> {
  return db.syncQueue
    .where('match_id').equals(matchId)
    .and(item => item.status === 'pending' || item.status === 'failed')
    .toArray()
}

/** Get all unsynced items regardless of match */
export async function getAllPending(): Promise<SyncQueueItem[]> {
  return db.syncQueue
    .where('status').anyOf('pending', 'failed')
    .toArray()
}

/** Mark an item as synced and clean it up */
export async function markSynced(clientId: string): Promise<void> {
  await db.syncQueue.update(clientId, {
    status: 'synced',
  })
  // Clean up synced items older than 1 hour to keep IndexedDB lean
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  await db.syncQueue
    .where('status').equals('synced')
    .and(item => item.created_at < oneHourAgo)
    .delete()
}

/** Mark an item as failed after a sync attempt */
export async function markFailed(clientId: string): Promise<void> {
  const item = await db.syncQueue.get(clientId)
  if (!item) return
  await db.syncQueue.update(clientId, {
    status: item.attempts >= 5 ? 'failed' : 'pending',
    attempts: item.attempts + 1,
    last_attempt: new Date().toISOString(),
  })
}

/** Count how many items are waiting to sync (used for UI indicator) */
export async function getPendingCount(): Promise<number> {
  return db.syncQueue
    .where('status').anyOf('pending', 'syncing')
    .count()
}

// ─── Sync engine ──────────────────────────────────────────────────────────────

/** Attempt to flush all pending events to Supabase.
 *  Called on: app startup, window focus, navigator.onLine = true.
 *  Each item is sent individually so partial failures don't block others.
 */
export async function flushQueue(
  upsertEvent: (event: EventInsert) => Promise<void>,
  onProgress?: (synced: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
  const pending = await getAllPending()
  let synced = 0
  let failed = 0

  for (const item of pending) {
    await db.syncQueue.update(item.client_id, { status: 'syncing' })
    try {
      await upsertEvent(item.payload)
      await markSynced(item.client_id)
      synced++
      onProgress?.(synced, pending.length)
    } catch {
      await markFailed(item.client_id)
      failed++
    }
  }

  return { synced, failed }
}

// ─── Void handling ────────────────────────────────────────────────────────────

/**
 * Void an event. Two cases:
 * 1. Still in queue (not synced) → remove from queue entirely
 * 2. Already synced → send void PATCH to server
 */
export async function voidEvent(
  clientId: string,
  patchVoid: (clientId: string) => Promise<void>,
): Promise<void> {
  const item = await db.syncQueue.get(clientId)

  if (item && (item.status === 'pending' || item.status === 'failed')) {
    // Event never reached server — just remove it
    await dequeue(clientId)
  } else {
    // Event is synced — patch the void flag on the server
    await patchVoid(clientId)
  }
}
