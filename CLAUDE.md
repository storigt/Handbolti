# Handbolti — AI Context

## What This Is

A Progressive Web App for live handball match statistics. A single operator logs events courtside on a tablet. Stats are stored in Supabase (PostgreSQL) and surfaced as a live stats panel, a postgame report, and a season analytics dashboard.

**The app has four surfaces:**
1. **Live event logger** (`EventLogger.tsx`) — tablet-optimised, touch-first, works offline. Multi-step flow to log shots (with range, phase, numerical state, zone, outcome), turnovers, suspensions, fouls, GK actions, defensive actions, and substitutions.
2. **Live stats panel** (`LiveStats.tsx`) — shown alongside the event logger (tabbed view). Real-time attack/defense/GK/team/shot map tabs with minute range filter.
3. **Postgame match report** (`MatchReport.tsx`) — auto-generated from events after match finalization.
4. **Season analytics dashboard** (`SeasonDashboard.tsx`) — filterable by season/competition. Tabs: Yfirlit (overview), Sókn, Vörn, Markvörður, Skotakort, Leikir. Per-match drill-down. CSV export.

**Admin panel** (`AdminPage.tsx`) — account approval, view all users and their teams.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite` plugin — **no `tailwind.config.js`**) |
| Client state | Zustand v5 |
| Server state | TanStack Query v5 |
| Offline storage | Dexie.js (IndexedDB) |
| PWA | `vite-plugin-pwa` (installed with `--legacy-peer-deps` — Vite 8 peer dep conflict) |
| Charts | Recharts (requires `react-is` peer dep — install explicitly) |
| Backend | Supabase (PostgreSQL + email auth + REST API) |
| DB migrations | `supabase/migrations/` — push with `npx supabase db push` |
| Hosting | Vercel (auto-deploys on push to GitHub main branch) |

---

## Architecture: Events as Source of Truth

**Never store computed statistics.** Every stat is derived from the `events` table via client-side computation (`src/lib/stats/matchStats.ts`) or PostgreSQL views. This means:
- Any metric can be added later without re-entering data
- Voiding an event automatically corrects all downstream stats
- Full audit trail is always preserved

All views and client-side filters apply: `WHERE is_voided = false`

---

## Directory Map

```
src/
  App.tsx                          # Root: AuthGateWithInner → OnlineSync → AppInner
  main.tsx
  store/
    matchStore.ts                  # Zustand store — match state, lineup tracking, input FSM
  lib/
    db/
      schema.ts                    # TypeScript types for ALL DB tables + event taxonomy
    supabase/
      client.ts                    # Supabase client (reads .env.local)
      queries.ts                   # CRUD: teams, players, matches, rosters, profiles, admin
      reportQueries.ts             # Match finalization + postgame report queries
      dashboardQueries.ts          # Season dashboard queries
    stats/
      matchStats.ts                # computeAttack/Defense/GK/TeamStats, sum*, pct helpers
      exportCsv.ts                 # buildCSV, downloadCSV for CSV export
    sync/
      syncQueue.ts                 # Dexie.js IndexedDB queue: enqueue/flush/void
      supabaseSync.ts              # upsertEvent (idempotent), syncPendingEvents, voidEventWithSync
  components/
    ui/index.tsx                   # Shared primitives: Button, Card, Input, Select, Spinner
    LiveInput/
      EventLogger.tsx              # Main tablet UI — multi-step flow for logging events
      LiveMatchView.tsx            # Split-pane wrapper: EventLogger (left) + LiveStats (right)
      LiveStats.tsx                # Real-time stats tabs shown during live match
    stats/
      StatTables.tsx               # Shared: AttackTable, DefenseTable, GKTable, TeamStatsTable
      ShotMap.tsx                  # Skotakort — goal grid with zone stats, attack + GK modes
      MinuteFilter.tsx             # useMinuteFilter hook + MinuteFilterBar + MinuteInput
      ExportModal.tsx              # CSV export modal with player/match/time filters
  pages/
    Auth/
      LoginPage.tsx                # Email/password, magic link, sign-up
    Admin/
      AdminPage.tsx                # Approve/revoke accounts, list all users
    Setup/
      MatchSetupWizard.tsx         # 4-step wizard: team → match details → roster → confirm
      steps/
        TeamSetupStep.tsx          # Create team (sets owner_user_id), add initial players
        MatchDetailsStep.tsx       # Opponent, home/away, date, venue, season, competition
        RosterStep.tsx             # Player selection, starter toggle, jersey override
        ConfirmStep.tsx            # Review + "Start match"
    Report/
      MatchReport.tsx              # Postgame report: box score, attack/defense/GK tables
    Dashboard/
      SeasonDashboard.tsx          # Season analytics dashboard
supabase/
  migrations/
    001_initial_schema.sql         # Core 9 tables + RLS (open to all authenticated)
    002_derived_views.sql          # PostgreSQL views + v_season_player_totals (materialized)
    003_schema_enhancements.sql    # shot_range, phase_type, numerical_state, match_minute, lineup_id on events; SUBSTITUTION + DEFENSIVE_ACTION event types; court_lineups table
    004_new_views.sql              # Rebuilt views using new shot_range/phase_type/numerical_state columns
    005_stat_corrections.sql       # View fixes for correct aggregation
    006_defensive_drew_foul.sql    # Added drew_offensive_foul to DEFENSIVE_ACTION sub_types
    007_attack_events.sql          # Added ATTACK and ATTACKING_ACTION event types
    008_gk_and_subtype_fixes.sql   # GK sub_type additions (empty_phase, positive_response)
    009_season_view_fix.sql        # Fixed v_season_player_totals aggregation
    010_auth.sql                   # Added owner_user_id to teams; tightened RLS by team ownership
    011_profiles.sql               # profiles + admins tables; auto-create profile trigger
    012_performance_indexes.sql    # Indexes for RLS subquery paths + common query patterns
public/
  _redirects                       # Netlify SPA fallback (kept for reference)
vercel.json                        # Vercel SPA rewrite rule (active hosting)
```

---

## App Routing (App.tsx)

No router library. Navigation is state in `AppInner`:

```typescript
type AppView = 'home' | 'setup' | 'dashboard' | 'admin'
```

**Auth gate wraps everything** (`AuthGateWithInner`):
1. Loads session from Supabase
2. Fetches `profiles` + `admins` in parallel for the current user
3. If no session → `LoginPage`
4. If session but no profile (old anonymous session) → signs out → `LoginPage`
5. If profile exists but `is_approved = false` AND not admin → `PendingApprovalScreen`
6. Otherwise → app renders normally

**Routing priority inside AppInner (top wins):**
1. `match` in store AND status `'in_progress'` → `LiveMatchView` (EventLogger + LiveStats)
2. `match` in store AND status `'final'` → `MatchReport`
3. `view === 'admin'` → `AdminPage`
4. `view === 'dashboard'` → `SeasonDashboard`
5. `view === 'setup'` → `MatchSetupWizard`
6. Default → `HomeScreen`

`HomeScreen` shows "Season Dashboard" only if `localStorage` has `handbolti_tracked_team_id`. Shows "Admin" button only if user is in `admins` table.

---

## Authentication & Accounts

**Login methods:** email + password, or magic link (email OTP) — via Supabase Auth.

**Account approval flow:**
1. User signs up → Supabase trigger auto-creates a `profiles` row with `is_approved = false`
2. User sees "pending approval" screen
3. Admin logs in → Admin panel → approves the account
4. User can now access the app

**Admin setup (one-time manual step):**
After signing up, go to Supabase dashboard → Table Editor:
- `profiles` table → set your row's `is_approved = true`
- `admins` table → insert a row with your `user_id`

After that, all future approvals are done inside the app.

**Key auth queries in `src/lib/supabase/queries.ts`:**
- `getProfile(userId)` — fetch own profile
- `checkIsAdmin(userId)` — check admins table
- `getAllProfiles()` — admin only: all profiles with team names
- `setApproval(userId, approved)` — admin only: approve/revoke

---

## Database Schema (11 tables + 2 auth tables)

```
seasons          id, name, start_date, end_date
competitions     id, season_id, name, level (league|cup|friendly)
teams            id, name, short_name, home_venue, owner_user_id (FK → auth.users)
players          id, team_id, first_name, last_name, jersey_number, position (goalkeeper|field), is_active
matches          id, competition_id, home_team_id, away_team_id, match_date, venue,
                 status (planned|in_progress|final), home_score*, away_score*,
                 tracked_team_id, notes
                 * written only on finalization
rosters          id, match_id, player_id, team_id, jersey_override, is_starter
                 UNIQUE(match_id, player_id)
events           SEE BELOW — core table
event_links      id, match_id, primary_event_id, linked_event_id,
                 link_type (goalkeeper_response|assist|caused_by|penalty_assist)
court_lineups    id, match_id, period, match_minute, player_ids UUID[]
profiles         id (FK → auth.users), email, is_approved, created_at
admins           user_id (FK → auth.users), created_at
api_feed_sources Phase 2 — external data ingestion
api_feed_log     Phase 2 — ingestion audit log
```

### Events Table (core)
```
id              UUID (= client_id — client-generated)
match_id        UUID FK
period          SMALLINT
match_clock     INTEGER | null   — seconds elapsed from period start
match_minute    SMALLINT | null  — operator-set game minute (set via minute counter in UI)
wall_clock      TIMESTAMPTZ      — set at tap time (not sync time)
team_id         UUID FK
player_id       UUID FK | null
event_type      TEXT             — see taxonomy below
sub_type        TEXT | null
shot_range      TEXT | null      — 6m | 7_8m | 9m_plus | line | penalty | corner_wing
phase_type      TEXT | null      — set_play | fast_break | second_wave
numerical_state TEXT | null      — 6v6 | inferiority | superiority | 7v6 | 6v7
zone            SMALLINT | null  — 1–9 (EHF goal face) | null (blocked/off-target)
context         JSONB            — flexible bag (assist_player_id, player_out_id, etc.)
lineup_id       UUID | null      FK → court_lineups
is_voided       BOOLEAN DEFAULT false
is_edited       BOOLEAN DEFAULT false
replaced_by     UUID | null
original_id     UUID | null
client_id       TEXT UNIQUE      — idempotency key for offline sync deduplication
```

**Important zone logic:**
- Zones 1–9 = specific goal face positions (EHF standard)
- `zone = null` means off-target: differentiated by `sub_type`:
  - `sub_type = 'blocked'` → shot was blocked (Blokk)
  - `sub_type = 'wide'` or `'post'` → missed / hit post (Ekki á mark)
- GK events use `zone = null` for all saves where shot was blocked/missed (can't distinguish)

### Shot Zone Map (EHF standard)
```
| 1 top-left | 2 top-center | 3 top-right |
| 4 mid-left | 5 mid-center | 6 mid-right |
| 7 bot-left | 8 bot-center | 9 bot-right |
  null = blocked/wide/post (check sub_type to distinguish)
```

---

## Event Taxonomy

```
SHOT
  sub_type:        goal | saved | blocked | post | wide | technical
  shot_range:      6m | 7_8m | 9m_plus | line | penalty | corner_wing
  phase_type:      set_play | fast_break | second_wave
  numerical_state: 6v6 | inferiority | superiority | 7v6 | 6v7
  zone:            1–9 (goal face) | null (blocked/off-target)

TURNOVER
  sub_type: offensive_foul | bad_pass | delay | other

SUSPENSION
  sub_type: 2min | yellow_card | red_card | blue_card | disqualification

FOUL
  sub_type: attacking_foul | 7m_awarded | passive_play_warning | drew_penalty

GOALKEEPER_ACTION
  sub_type: save | goal_conceded | parry | empty_phase | positive_response
  shot_range/phase_type/numerical_state: mirrors the corresponding SHOT event
  zone: where in goal the shot went (1–9) | null

DEFENSIVE_ACTION
  sub_type: block | interception | high_contact | duel_won | duel_lost |
            rebound | drew_offensive_foul | protest

ATTACKING_ACTION
  sub_type: offensive_rebound | drew_suspension

ATTACK
  No sub_type. Logged once per possession to count Fjöldi sókna.
  Both teams can have ATTACK events (tracked and opponent).

SUBSTITUTION
  player_id = player coming ON
  context.player_out_id = player going OFF
  Triggers a new court_lineups row in the store.

TIMEOUT
  sub_type: team_timeout | referee_timeout

PERIOD_MARKER
  sub_type: period_start | period_end | match_end
  Required — anchors all match_clock calculations
```

---

## Live Input Flow (EventLogger.tsx)

The `FlowStep` type is a large discriminated union (not Zustand — it's local React state in EventLogger). It drives the multi-step logging UI:

**Attack flow:**
```
idle
  → category (player tapped)
    → atk_sub (Sókn category)
      → atk_shot_range       (pick: Víti | Horn | 9m+ | 7-8m | 6m | Lína)
        → atk_shot_phase     (pick: Hraðaupphlaup | Seinni bylgja | Uppstilltur leikur)
          → atk_shot_numerical (pick: 6á6 | Undirtala | Yfirtala | 7á6)
            → atk_shot_assist  (optional: pick assisting player or skip)
              → atk_shot_vitasending (if penalty: pick player who drew it, or skip)
                → atk_shot_fiskad_viti (pick player who drew foul, or skip)
                  → atk_shot_zone (pick zone 1–9 on goal grid)
                    → atk_shot_outcome (Mörk | Vörn | Blokk | Stöng/Framhjá | Tæknilegt)
                      → commit → idle
      → atk_turnover (Tapinn bolti)
      → atk_other (Sóknarfrákast | Fengnar 2 mín)
```

**GK flow (opponent shots against our goalkeeper):**
```
  → gk_sub (Vörn GK category)
    → gk_shot_range → gk_shot_phase → gk_shot_numerical
      → gk_shot_zone → gk_shot_outcome (Vörn | Mark | Framhjá/Blokk)
      → gk_other (Tóm fasi | Jákvæð viðbrögð)
```

**Defense flow:**
```
  → def_sub (Vörn category)
    → def_brot_type (Brot: Fríkast | Víti á)
      → def_brot_card (Viðurlög: 2 mín | Gult kort | ...)
    → def_other (Blokk | Stolinn | Hár kontakt | ...)
    → def_duel_outcome (1á1: Vinnur | Tapar)
    → def_refsing (2 mín | Gult | Rautt | Blár)
```

**Substitution flow:**
```
  → sub_pick_in (pick player coming on)
    → sub_pick_out (pick player going off)
      → commits SUBSTITUTION event + updates lineup
```

**Opponent actions** (logged from opponent panel): Vörn = logs opponent ATTACK event. Other opponent actions use same flow but with opponent team_id.

**Minute counter:** Displayed in UI header. Operator increments it manually. All events logged while it reads `N` get `match_minute = N`.

---

## Stats Computation (`src/lib/stats/matchStats.ts`)

All stats are computed client-side from the raw events array. Key functions:

```typescript
computeAttack(events, players, trackedTeamId): AttackRow[]
// Per player: goals/shots by range, phase, numerical; assists; turnovers; drew suspension; drew penalty

computeDefense(events, players, trackedTeamId): DefenseRow[]
// Per player: blocks, interceptions, duels won/lost, rebounds, freekick, cards, penalty awarded

computeGK(events, goalkeepers, trackedTeamId): GKRow[]
// Per GK: saves/shots by range, phase, numerical; empty_phase; positive_response

computeTeamStats(events, trackedTeamId): TeamStatsRow
// Totals for both teams: goals, shots, attacks (from ATTACK events), skotnýting%

sumAttack(rows): Omit<AttackRow, 'player'>   // Team totals row
sumDefense(rows): Omit<DefenseRow, 'player'>
sumGK(rows): Omit<GKRow, 'player'>
```

**ATTACK events** are used for Fjöldi sókna (possession count). Both the tracked team and opponent have ATTACK events. Logged via the "Vörn" button for opponent and the attack counter for tracked team.

---

## Stats Display Components

### `StatTables.tsx`
- `AttackTable({ events, players, trackedTeamId })` — full attack breakdown table
- `DefenseTable({ events, players, trackedTeamId })` — defensive stats table
- `GKTable({ events, players, trackedTeamId })` — goalkeeper stats table
- `TeamStatsTable({ events, trackedTeamId, myTeamName, opponentTeamName })` — two rows (one per team) with goals, shots, attacks, efficiency

### `ShotMap.tsx` (Skotakort)
- `ShotMap({ events, players, trackedTeamId })` — goal grid with zone stats
- Two modes: `'attack'` (our shots) and `'gk'` (shots against our GK)
- Player filter: field players in attack mode, goalkeepers in GK mode
- Zone display: goals/shots ratio + percentage per zone
- Below grid: "Ekki á mark" (wide/post) and "Blokk" (blocked) categories
- GK mode: shows saves/shots, colors inverted (high save% = green)
- Minute filter applied externally before passing events

### `MinuteFilter.tsx`
- `useMinuteFilter()` hook — returns `{ range, setRange, filterEvents, clear }`
- `MinuteFilterBar({ range, setRange, onClear })` — UI bar shown above tables
- `MinuteInput` — exported for use in ExportModal
- Events without `match_minute` are always included in filtered results

### `ExportModal.tsx`
- Filters: stats type (Sókn/Vörn/Markvörður), minute range, player selection, match selection
- Generates filename from team name + type + match count + minute range
- Uses `buildCSV` from `exportCsv.ts` → `downloadCSV` (BOM-prefixed for Excel)

---

## Season Dashboard (`SeasonDashboard.tsx`)

**Tabs:** `'overview' | 'attack' | 'defense' | 'gk' | 'shotmap' | 'matches'`

**Filters:**
- Season dropdown (top)
- Competition dropdown (top)
- Match chip filter (shown on attack/defense/gk/shotmap tabs) — click matches to include/exclude specific games

**Overview tab:** W/L/D record, goals for/against, shot efficiency chart (per match), top scorers list.

**Attack/Defense/GK/Shotmap tabs:** Full stat tables for all filtered matches. Minute filter bar above tables.

**Leikir tab:** List of matches with scores. Tap a match → drill-down view showing that match's attack/defense/GK/shotmap stats.

**CSV Export:** "↓ CSV" button in header → ExportModal. Export scope = all season-filtered matches (not chip-filtered), so you can pick specific matches inside the modal.

**DrillDownView:** Extracted as a separate function component (needed for hooks — `useMinuteFilter` can only be called inside a component).

---

## RLS (Row Level Security)

Policies are in `010_auth.sql`. Summary:

| Table | Read | Write |
|---|---|---|
| `teams` | All authenticated (team names are public) | Owner only (`owner_user_id = auth.uid()`) or null owner (opponent teams) |
| `players` | Own team's players | Own team's players |
| `matches` | Own team's matches (`tracked_team_id` owner) | Own team's matches |
| `events` | Own matches' events | Own matches' events |
| `rosters` | Own matches' rosters | Own matches' rosters |
| `event_links` | Own matches' links | Own matches' links |
| `profiles` | Own profile | Admin can read/update all |
| `admins` | All authenticated | Existing admins only |
| `seasons`, `competitions` | All authenticated | All authenticated |

**Opponent teams** have `owner_user_id = null` — readable and writable by anyone. This is intentional; team names are not sensitive.

**Performance:** `012_performance_indexes.sql` adds indexes on the JOIN paths used by RLS subqueries so that nested ownership checks don't cause table scans.

---

## Offline Sync

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

- `src/lib/sync/syncQueue.ts` — `enqueue`, `flushQueue`, `voidEvent`
- `src/lib/sync/supabaseSync.ts` — `upsertEvent`, `syncPendingEvents`, `voidEventWithSync`
- Undo: `undoLast()` in store voids the most recent non-voided event
- Events synced to server are soft-voided (`is_voided = true`), never deleted

---

## Match Finalization

Called from `EventLogger.tsx` → `src/lib/supabase/reportQueries.ts`:
1. Counts goals from events per team
2. Writes `home_score`, `away_score` to matches row
3. Sets `status = 'final'`
4. Attempts `REFRESH MATERIALIZED VIEW v_season_player_totals` (may fail without elevated privileges — non-critical, dashboard reads live events anyway)

---

## Known Gotchas

### Zustand v5 — Selectors Must Return Primitives
Re-renders on reference inequality. Selectors returning new objects/arrays cause infinite loops.
```ts
// Wrong:
const score = useMatchStore(s => ({ tracked: s.tracked, opponent: s.opponent }))
// Right — primitives:
const tracked = useMatchStore(selectTrackedScore)
// Right — objects/arrays need useShallow:
const events = useMatchStore(useShallow(selectActiveEvents))
```

### TanStack Query v5 — No `onSuccess` in `useQuery`
Use `useEffect` watching `data` instead.

### TanStack Query v5 — `async/await` in `queryFn`
Supabase returns `PromiseLike`, not `Promise`. Always use `async/await` in `queryFn`.

### Supabase PostgREST Joins
`player:players(*)` join syntax caused ambiguity issues. All multi-table fetches use **two separate queries** joined in TypeScript. See `getRoster` in `queries.ts`.

### `vite-plugin-pwa` Peer Dep Conflict
Incompatible with Vite 8. Always install new packages with `--legacy-peer-deps`.

### `react-is` Must Be Installed Explicitly
Recharts depends on it but doesn't declare it: `npm install react-is --legacy-peer-deps`.

### Vite Dep Cache
Stale import errors after installing packages: `rm -rf node_modules/.vite` then restart dev server.

### Supabase Free Tier Cold Starts
Free projects sleep after 1 week of inactivity. First request after sleep takes 5–10 seconds. Upgrade to Pro to disable, or accept it.

### `tsc -b` vs `tsc --noEmit`
`npm run build` uses `tsc -b` (project references). `npx tsc --noEmit` uses flat tsconfig. They may catch different errors. Always check `npm run build` before committing if you changed types.

### Hooks in Conditional Renders
Components that need hooks (e.g. `useMinuteFilter`) must be proper function components, not inline JSX. See `DrillDownView` in `SeasonDashboard.tsx` — extracted as a component specifically for this reason.

---

## Local Dev

```bash
npm run dev              # dev server at localhost:5173
npx tsc --noEmit         # type check (fast)
npm run build            # full production build (tsc -b + vite)
npx supabase db push     # push new migration files to Supabase
git push                 # triggers Vercel auto-deploy
```

**Environment** — `.env.local` (gitignored, never commit):
```
VITE_SUPABASE_URL=https://ialpsorjmphdxlupkilc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
SUPABASE_ACCESS_TOKEN=<service token — needed for db push, never expose>
```

**Supabase project:** `ialpsorjmphdxlupkilc` (eu-west-1, Ireland)

All schema changes go through migration files in `supabase/migrations/` — never edit the DB directly in the Supabase dashboard.

**Vercel:** Connected to GitHub. Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel dashboard. Install command is `npm install --legacy-peer-deps`.

---

## Not Yet Built (Future Work)

- **`event_links` population** — table exists but is empty. Needed for linking assists, penalty assists, and GK actions to their corresponding SHOT events for full cross-referenced breakdowns.
- **Video clip linking** — add `context.video_url` to JSONB — no migration needed
- **PDF export** — `window.print()` exists; proper PDF needs headless renderer
- **Edge Function for materialized view refresh** — `REFRESH MATERIALIZED VIEW v_season_player_totals` currently runs client-side (may fail due to permissions); should move to a Supabase Edge Function triggered on match finalization
- **API feed ingestion** — `api_feed_sources` and `api_feed_log` tables exist but are unused
- **Plus/minus stats** — court_lineups table and lineup_id on events exist, but `v_lineup_stats` / v_plus_minus views are not yet built
- **Resume match on different device** — match session (period, lineup, minute) is in-memory Zustand state only; if you close the app mid-match you can't resume the live input UI (historical events are safe in Supabase)
