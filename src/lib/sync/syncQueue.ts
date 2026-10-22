import Dexie, { type Table } from 'dexie'
import type { EventInsert, CourtLineupInsert } from '@/lib/db/schema'

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

/** A court_lineups row waiting to reach the server. Its id is client-generated
 *  so events can reference it immediately, even while offline. */
export interface LineupQueueItem {
  id: string            // PK — same as court_lineups.id
  match_id: string
  payload: CourtLineupInsert & { id: string }
  created_at: string
  attempts: number
  status: SyncStatus
}

class HandboltiDB extends Dexie {
  syncQueue!: Table<SyncQueueItem, string>
  lineupQueue!: Table<LineupQueueItem, string>

  constructor() {
    super('HandboltiDB')
    this.version(1).stores({
      syncQueue: 'client_id, match_id, status, created_at',
    })
    // v2 only ADDS the lineup queue — the existing event queue is untouched.
    this.version(2).stores({
      syncQueue: 'client_id, match_id, status, created_at',
      lineupQueue: 'id, match_id, status',
    })
  }
}

export const db = new HandboltiDB()

// ─── Event queue operations ───────────────────────────────────────────────────

/**
 * Put an event in the sync queue as 'pending'. Called on every tap, and again
 * when an event is voided (with is_voided = true) — the newest version of an
 * event always replaces the older one, so a void can never be lost.
 */
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
    .where('status').anyOf('pending', 'failed', 'syncing')
    .toArray()
}

/**
 * Mark an item as synced — but only if the queued version is still the one we
 * sent. If the event was voided while the upload was in flight, the queue now
 * holds the voided version, which must stay pending so it gets sent too.
 */
export async function markSynced(clientId: string, sent: EventInsert): Promise<void> {
  await db.transaction('rw', db.syncQueue, async () => {
    const item = await db.syncQueue.get(clientId)
    if (!item) return
    if (item.payload.is_voided !== sent.is_voided) return
    await db.syncQueue.update(clientId, { status: 'synced' })
  })
  // Clean up synced items older than 1 hour to keep IndexedDB lean
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  await db.syncQueue
    .where('status').equals('synced')
    .and(item => item.created_at < oneHourAgo)
    .delete()
}

/** Record a failed sync attempt. The item stays in the queue and is retried. */
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
    .where('status').anyOf('pending', 'syncing', 'failed')
    .count()
}

// ─── Lineup queue operations ──────────────────────────────────────────────────

export async function enqueueLineup(lineup: CourtLineupInsert & { id: string }): Promise<void> {
  await db.lineupQueue.put({
    id: lineup.id,
    match_id: lineup.match_id,
    payload: lineup,
    created_at: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  })
}

async function getAllPendingLineups(): Promise<LineupQueueItem[]> {
  return db.lineupQueue
    .where('status').anyOf('pending', 'failed', 'syncing')
    .toArray()
}

// ─── Sync engine ──────────────────────────────────────────────────────────────

/** Attempt to flush all pending lineups, then all pending events, to Supabase.
 *  Lineups go first because events reference them (events.lineup_id FK).
 *  Each item is sent individually so partial failures don't block others.
 */
export async function flushQueue(
  upsertEvent: (event: EventInsert) => Promise<void>,
  upsertLineup: (lineup: CourtLineupInsert & { id: string }) => Promise<void>,
  onProgress?: (synced: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
  for (const item of await getAllPendingLineups()) {
    try {
      await upsertLineup(item.payload)
      await db.lineupQueue.delete(item.id)
    } catch {
      await db.lineupQueue.update(item.id, {
        status: item.attempts >= 5 ? 'failed' : 'pending',
        attempts: item.attempts + 1,
      })
    }
  }

  const pending = await getAllPending()
  let synced = 0
  let failed = 0

  for (const item of pending) {
    await db.syncQueue.update(item.client_id, { status: 'syncing' })
    try {
      await upsertEvent(item.payload)
      await markSynced(item.client_id, item.payload)
      synced++
      onProgress?.(synced, pending.length)
    } catch {
      await markFailed(item.client_id)
      failed++
    }
  }

  return { synced, failed }
}
