# Handbolti — AI Context

## What This Is

A Progressive Web App for live handball match statistics. A single operator logs events courtside on a tablet. Stats are stored in Supabase (PostgreSQL) and surfaced as a postgame report and a season analytics dashboard.

**The app has three surfaces:**
1. **Live event logger** — tablet-optimised, touch-first, works offline
2. **Postgame match report** — auto-generated from events after match finalization
3. **Season analytics dashboard** — desktop-optimised, filterable by season and competition

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` plugin — no `tailwind.config.js`) |
| Client state | Zustand v5 |
| Server state | TanStack Query v5 |
| Offline storage | Dexie.js (IndexedDB) |
| PWA | `vite-plugin-pwa` (installed with `--legacy-peer-deps` — Vite 8 peer dep conflict) |
| Charts | Recharts (requires `react-is` peer dep) |
| Backend | Supabase (PostgreSQL + anonymous auth + REST API) |
| DB migrations | `supabase/migrations/` — push with `npx supabase db push` |

---

## Architecture: Events as Source of Truth

**Never store computed statistics.** Every stat is derived from the `events` table via PostgreSQL views. This means:
- Any metric can be added later without re-entering data
- Voiding an event automatically corrects all downstream stats
- Full audit trail is always preserved

All views apply: `WHERE is_voided = false AND is_edited = false`

---

## Directory Map

```
src/
  App.tsx                          # Root: AuthGate → OnlineSync → AppInner (routing)
  main.tsx
  store/
    matchStore.ts                  # Zustand store — all live match state + input flow FSM
  lib/
    db/
      schema.ts                    # TypeScript types for ALL DB tables + event taxonomy
    supabase/
      client.ts                    # Supabase client (reads .env.local)
      queries.ts                   # CRUD: teams, players, matches, rosters
      reportQueries.ts             # Postgame report queries (reads from views)
      dashboardQueries.ts          # Season dashboard queries (views + materialized view)
    sync/
      syncQueue.ts                 # Dexie.js IndexedDB queue: enqueue/flush/void
      supabaseSync.ts              # upsertEvent (idempotent), syncPendingEvents, voidEventWithSync
  components/
    ui/index.tsx                   # Shared primitives: Button, Card, Input, Select, Spinner, etc.
    LiveInput/
      EventLogger.tsx              # Main tablet UI — player grid + action buttons + zone picker
  pages/
    Setup/
      MatchSetupWizard.tsx         # 4-step wizard: team setup → match details → roster → confirm
      steps/
        TeamSetupStep.tsx          # Create/select "my team" (stored in localStorage)
        MatchDetailsStep.tsx       # Opponent, home/away, date, venue, season, competition
        RosterStep.tsx             # Player selection, starter toggle, jersey override, add player
        ConfirmStep.tsx            # Review + "Start match"
    Report/
      MatchReport.tsx              # Postgame report: box score, player table, GK stats
    Dashboard/
      SeasonDashboard.tsx          # Season analytics: overview, players, matches, goalkeepers tabs
supabase/
  migrations/
    001_initial_schema.sql         # All 9 tables, indexes, RLS policies
    002_derived_views.sql          # All PostgreSQL views + materialized view v_season_player_totals
```

---

## App Routing (App.tsx)

There is no router library. Navigation is simple state in `AppInner`:

```
AppView = 'home' | 'setup' | 'dashboard'
```

Routing priority (top wins):
1. If `match` exists in store AND is in-progress → `EventLogger`
2. If `match` exists AND status is `'final'` → `MatchReport`
3. If `view === 'dashboard'` → `SeasonDashboard`
4. If `view === 'setup'` → `MatchSetupWizard`
5. Default → `HomeScreen`

The `HomeScreen` shows "Season Dashboard" button only if `localStorage` has a saved `trackedTeamId`.

---

## Database Schema (9 tables)

```
seasons          id, name, start_date, end_date
competitions     id, season_id, name, level (league|cup|friendly)
teams            id, name, short_name, home_venue
players          id, team_id, first_name, last_name, jersey_number, position (goalkeeper|field), is_active
matches          id, competition_id, home_team_id, away_team_id, match_date, venue,
                 status (planned|in_progress|final), home_score*, away_score*,
                 tracked_team_id, notes
                 * written only on finalization — derived from events
rosters          id, match_id, player_id, team_id, jersey_override, is_starter
                 UNIQUE(match_id, player_id)
events           SEE BELOW — this is the core table
event_links      id, match_id, primary_event_id, linked_event_id, link_type (goalkeeper_response|assist|caused_by)
api_feed_sources Phase 2 — external data ingestion
api_feed_log     Phase 2 — ingestion audit log
```

### Events Table (core)
```
id              UUID (= client_id — client-generated)
match_id        UUID FK
period          SMALLINT
match_clock     INTEGER | null  — seconds elapsed from period start
wall_clock      TIMESTAMPTZ     — set at tap time (not sync time)
team_id         UUID FK
player_id       UUID FK | null
event_type      TEXT            — see taxonomy below
sub_type        TEXT | null
situation       TEXT | null     — set_offense | fast_break | 7m_penalty | counter_attack | breakthrough
zone            SMALLINT | null — 1–9 (EHF goal face map) | 10 (wide/post) | null (blocked)
context         JSONB           — flexible bag for future fields
is_voided       BOOLEAN DEFAULT false
is_edited       BOOLEAN DEFAULT false
replaced_by     UUID | null     — points to correcting event
original_id     UUID | null     — if this IS a correction
client_id       TEXT UNIQUE     — idempotency key for offline sync deduplication
```

---

## Event Taxonomy

```
SHOT          sub_type: goal | saved | blocked | post | wide | technical
              situation: set_offense | fast_break | 7m_penalty | counter_attack | breakthrough
              zone: 1–9 (goal face) | 10 (wide/post) | null (blocked)

TURNOVER      sub_type: bad_pass | lost_dribble | offensive_foul | stepped |
                        double_dribble | out_of_bounds | shot_clock | other

SUSPENSION    sub_type: 2min | yellow_card | red_card | blue_card | disqualification

FOUL          sub_type: attacking_foul | 7m_awarded | passive_play_warning

GOALKEEPER_ACTION  sub_type: save | goal_conceded | parry
                   zone: zone the shot came from (optional)

TIMEOUT       sub_type: team_timeout | referee_timeout

PERIOD_MARKER sub_type: period_start | period_end | match_end
              Required — anchors all match_clock calculations
```

### Shot Zone Map (EHF standard)
```
| 1 top-left | 2 top-center | 3 top-right |
| 4 mid-left | 5 mid-center | 6 mid-right |
| 7 bot-left | 8 bot-center | 9 bot-right |
  10 = wide/post    null = blocked
```

---

## Live Input Flow (State Machine)

The `inputStep` field in Zustand is a discriminated union that drives the UI:

```
idle
  → player_selected       (tap player tile)
    → event_type_selected (tap event type)
      → sub_type_selected (tap sub-type)
        → context_selected  SHOT only: wait for zone picker
          → commitWithZone  → idle
        → commitEvent       non-SHOT: commit immediately → idle
```

Actions: `selectPlayer` → `selectEventType` → `selectSubType` → `selectContext` → `commitWithZone` / `commitEvent`

---

## Offline Sync: How Events Flow

```
Operator tap
  ↓
1. Event built with client-generated UUID (client_id = id)
2. Pushed to Zustand state immediately (UI updates instantly)
3. Written to IndexedDB via enqueue() simultaneously
4. If online: upsertEvent() → Supabase (UPSERT on client_id — idempotent)
   If offline: stays in IndexedDB
5. On reconnect / focus / online event: syncPendingEvents() flushes queue
```

**Key file: `src/lib/sync/syncQueue.ts`**
- `enqueue(event)` — write to IndexedDB
- `flushQueue(upsertFn)` — send all pending to Supabase
- `voidEvent(clientId, patchVoid)` — if pending: delete from queue; if synced: PATCH server

**Key file: `src/lib/sync/supabaseSync.ts`**
- `upsertEvent(event)` — `INSERT ... ON CONFLICT (client_id) DO UPDATE`
- `syncPendingEvents()` — calls flushQueue with upsertEvent
- `voidEventWithSync(clientId)` — delegates to syncQueue.voidEvent

---

## Undo / Void Strategy

- **Undo last:** `undoLast()` finds the most recent non-voided event and calls `voidEvent()`
- **Still in queue (not synced):** remove from IndexedDB entirely — never reaches server
- **Already synced:** PATCH `is_voided = true` on server
- Events are **never hard-deleted** — always soft-voided
- All views filter `WHERE is_voided = false AND is_edited = false`

---

## PostgreSQL Views

All stats live in views. See `supabase/migrations/002_derived_views.sql`.

| View | Purpose |
|---|---|
| `v_shots` | Filtered SHOT events with boolean flags: `is_goal`, `is_on_target`, `is_7m`, `is_fast_break` |
| `v_shot_efficiency_by_player` | Per player/match: goals, shots_attempted, shot_efficiency, on_target_pct |
| `v_shot_efficiency_by_zone` | Per zone/situation: shots_attempted, goals, efficiency |
| `v_goalkeeper_performance` | Per GK/match: shots_faced, saves, goals_conceded, save_pct |
| `v_goalkeeper_save_pct_by_zone` | GK stats broken out by zone (requires event_links) |
| `v_turnovers_by_player` | Per player/match: total_turnovers + by sub_type |
| `v_turnover_rate` | turnovers / (shots + turnovers) per player/match |
| `v_fast_break_efficiency` | Per team/match where situation = 'fast_break' |
| `v_7m_efficiency` | Per player/match where situation = '7m_penalty' |
| `v_suspensions_by_player` | Per player/match: 2min, yellow, red, blue cards |
| `v_match_summary` | All key metrics per match per team (used for dashboard + report) |
| `v_season_player_totals` | **Materialized** — season-wide player aggregates. Must `REFRESH MATERIALIZED VIEW v_season_player_totals` after each match finalization |

---

## Auth

- Anonymous sign-in on app load (`supabase.auth.signInAnonymously()`)
- RLS requires `authenticated` role — anonymous users satisfy this
- `AuthGate` in `App.tsx` checks for an existing session first; signs in anonymously only if none
- Phase 2: replace with proper login without changing RLS policies

---

## Team Identity (localStorage)

The "tracked team" (the team being coached) is stored in `localStorage` under key `handbolti_tracked_team_id`. Helper functions in `src/lib/supabase/queries.ts`:
- `getTrackedTeamId()` — returns stored team ID or null
- `setTrackedTeamId(id)` — persists after team setup step

The setup wizard skips the team setup step if a saved team ID exists.

---

## Match Finalization

Called from `EventLogger.tsx` → `src/lib/supabase/reportQueries.ts`:
1. Counts goals from events: `SELECT count(*) WHERE event_type='SHOT' AND sub_type='goal' AND team_id=...`
2. Writes `home_score`, `away_score` to the matches row
3. Sets `status = 'final'`
4. `REFRESH MATERIALIZED VIEW v_season_player_totals` (anonymous users don't have REFRESH privilege — this currently runs client-side; may need an Edge Function in production)

---

## Known Gotchas

### Zustand v5 — Selectors Must Return Primitives
Zustand v5 triggers re-renders on reference inequality. Selectors returning new objects/arrays every render cause infinite loops.

**Wrong:**
```ts
const score = useMatchStore(s => ({ tracked: s.tracked, opponent: s.opponent }))
```

**Right — return primitives:**
```ts
const tracked = useMatchStore(selectTrackedScore)  // returns a number
const opponent = useMatchStore(selectOpponentScore)
```

**Right — use `useShallow` for arrays/objects:**
```ts
import { useShallow } from 'zustand/react/shallow'
const events = useMatchStore(useShallow(selectActiveEvents))
```

### TanStack Query v5 — No `onSuccess` in `useQuery`
`onSuccess` was removed in v5. Use `useEffect` watching the returned data instead.

### TanStack Query v5 — Use `async/await`, Not `.then()`
Supabase `.then()` returns `PromiseLike`, not `Promise`. TanStack Query v5 requires `Promise`. Always use `async/await` in `queryFn`.

### Supabase PostgREST Joins — Use Separate Queries
The join syntax `player:players(*)` in `getRoster` caused issues. It now uses two separate queries (fetch rosters, then fetch players) and joins them in TypeScript.

### `vite-plugin-pwa` Peer Dep Conflict
Incompatible with Vite 8. Always install new packages with `--legacy-peer-deps`.

### `react-is` Must Be Installed
Recharts depends on `react-is` but doesn't declare it. Install explicitly: `npm install react-is --legacy-peer-deps`.

### Vite Dep Cache
If you see stale import errors after installing packages: `rm -rf node_modules/.vite` then restart the dev server.

---

## Local Dev

```bash
npm run dev              # dev server at localhost:5173
npx tsc --noEmit         # type check
npm run build            # production build
npx supabase db push     # push new migration files to Supabase
```

**Environment** — `.env.local` (gitignored, never commit):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_ACCESS_TOKEN=...
```

**Supabase project:** `ialpsorjmphdxlupkilc` (eu-west-1, Ireland)

All schema changes go through migration files in `supabase/migrations/` — never edit the DB directly in the Supabase dashboard.

---

## Phase 2 (Not Yet Built)

- **Substitution tracking** → unlocks `v_plus_minus` (goals for/against while player on court)
- **Assist linking** — follow-up prompt after goals (adds UI friction, deferred)
- **`event_links` population** — currently empty; needed for `v_goalkeeper_save_pct_by_zone`
- **Video clip linking** — add `context.video_url` to JSONB — no migration needed
- **API feed ingestion** — Supabase Edge Function + `api_feed_log` table
- **Multi-user roles** — admin / operator / coach read-only
- **PDF export** — `window.print()` exists; proper PDF needs headless renderer
- **Edge Function for finalization** — move `REFRESH MATERIALIZED VIEW` server-side
