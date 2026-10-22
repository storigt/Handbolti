// Index settings for the signed-in account: which indices exist, their formulas
// and colour limits. Saved to Supabase (index_settings, one row per account) so
// they follow the user to every device, with a local copy per account for
// offline use. The account's copy wins unless this device holds a newer edit
// that has not reached it yet; that edit is then sent up.
import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import { DEFAULT_INDICES, type IndexDef } from '@/lib/stats/indexDefs'

interface Cached { defs: IndexDef[]; updatedAt: string; synced: boolean }
interface Config { version: 1; indices: IndexDef[] }

interface IndexStore {
  defs: IndexDef[]
  userId: string | null
  /** 'local' = saved on this device only so far (offline or the table isn't there yet) */
  syncState: 'idle' | 'saving' | 'saved' | 'local'
  load: () => Promise<void>
  save: (defs: IndexDef[]) => Promise<void>
}

const cacheKey = (userId: string) => `handball_stats_indices:${userId}`

function readCache(userId: string): Cached | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    return raw ? (JSON.parse(raw) as Cached) : null
  } catch { return null }
}
function writeCache(userId: string, c: Cached) {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(c)) } catch { /* storage full or blocked */ }
}

async function push(userId: string, defs: IndexDef[], updatedAt: string): Promise<boolean> {
  const config: Config = { version: 1, indices: defs }
  const { error } = await supabase.from('index_settings').upsert({ user_id: userId, config, updated_at: updatedAt })
  return !error
}

export const useIndexStore = create<IndexStore>((set, get) => ({
  defs: DEFAULT_INDICES,
  userId: null,
  syncState: 'idle',

  async load() {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user.id
    if (!userId) return
    const local = readCache(userId)
    // Never carry another account's settings over on a shared device
    set({ defs: local?.defs ?? DEFAULT_INDICES, userId })

    const { data, error } = await supabase.from('index_settings').select('config, updated_at').eq('user_id', userId).maybeSingle()
    if (error) { set({ syncState: local && !local.synced ? 'local' : 'idle' }); return }
    const server = data as { config: Config; updated_at: string } | null

    const localNewer = local && !local.synced && (!server || new Date(local.updatedAt) > new Date(server.updated_at))
    if (localNewer) {
      const ok = await push(userId, local.defs, local.updatedAt)
      if (ok) writeCache(userId, { ...local, synced: true })
      set({ syncState: ok ? 'saved' : 'local' })
    } else if (server?.config?.indices) {
      writeCache(userId, { defs: server.config.indices, updatedAt: server.updated_at, synced: true })
      set({ defs: server.config.indices, syncState: 'saved' })
    } else if (!server) {
      set({ defs: local?.defs ?? DEFAULT_INDICES })
    }
  },

  async save(defs) {
    const updatedAt = new Date().toISOString()
    set({ defs, syncState: 'saving' })
    const userId = get().userId
    if (!userId) { set({ syncState: 'local' }); return }   // dev previews: no account
    writeCache(userId, { defs, updatedAt, synced: false })
    const ok = navigator.onLine && await push(userId, defs, updatedAt)
    if (ok) writeCache(userId, { defs, updatedAt, synced: true })
    set({ syncState: ok ? 'saved' : 'local' })
  },
}))

// Retry an unsent edit when the connection returns
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const { userId, syncState, load } = useIndexStore.getState()
    if (userId && syncState === 'local') void load()
  })
}
