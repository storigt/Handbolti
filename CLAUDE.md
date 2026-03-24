# Handbolti — Claude Code Context

## What this project is
A progressive web app (PWA) for live handball match statistics. One operator logs events courtside on a tablet; stats are stored in Supabase (PostgreSQL) and surfaced as postgame reports and season dashboards.

## Architecture
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, Zustand (state), TanStack Query (server state)
- **Offline**: Dexie.js (IndexedDB) sync queue + Workbox PWA — events are written locally first, synced when online
- **Backend**: Supabase (PostgreSQL + auth + REST API). No custom API server.
- **Database**: Events-as-source-of-truth. All stats are derived from the `events` table via PostgreSQL views. Never store computed totals.

## Key files
- `src/lib/db/schema.ts` — TypeScript types for all DB tables and event taxonomy
- `src/lib/supabase/client.ts` — Supabase client (reads from `.env.local`)
- `src/lib/supabase/queries.ts` — All standard CRUD queries
- `src/lib/supabase/reportQueries.ts` — Postgame report queries (reads from views)
- `src/lib/sync/syncQueue.ts` — Dexie.js offline event queue
- `src/lib/sync/supabaseSync.ts` — Flush queue to Supabase, void events
- `src/store/matchStore.ts` — Zustand store for live match session
- `src/components/LiveInput/EventLogger.tsx` — Tablet event logging UI
- `src/pages/Setup/MatchSetupWizard.tsx` — Pre-match setup wizard (4 steps)
- `src/pages/Report/MatchReport.tsx` — Postgame report page
- `supabase/migrations/001_initial_schema.sql` — All DB tables, indexes, RLS
- `supabase/migrations/002_derived_views.sql` — All PostgreSQL views for stats

## Database
- Supabase project: `ialpsorjmphdxlupkilc` (eu-west-1, Ireland)
- Push schema changes: `npx supabase db push`
- All schema changes go through migration files in `supabase/migrations/` — never edit the DB directly in the Supabase dashboard

## Event flow (critical)
1. Operator taps → event created in Zustand store immediately (instant UI)
2. Written to IndexedDB sync queue simultaneously
3. POSTed to Supabase async (non-blocking)
4. If offline: stays in IndexedDB, replayed via `flushQueue()` on reconnect
5. `client_id` (UUID generated on client) is the idempotency key — server UPSERTs on this field

## Undo / void strategy
- **Still in queue** (not synced): remove from IndexedDB entirely
- **Already synced**: PATCH `is_voided = true` on the server
- Events are never hard-deleted — `is_voided` / `is_edited` flags only
- All views filter `WHERE is_voided = false AND is_edited = false`

## Auth
- Anonymous sign-in on app load (`supabase.auth.signInAnonymously()`)
- RLS requires `authenticated` role — anonymous users satisfy this
- Upgrade to proper auth in Phase 2 without changing RLS policies

## Event taxonomy (MVP)
`SHOT`, `TURNOVER`, `SUSPENSION`, `FOUL`, `GOALKEEPER_ACTION`, `TIMEOUT`, `PERIOD_MARKER`
See `src/lib/db/schema.ts` for full sub-type lists.

## Zustand selectors — important
Return primitives from selectors, not objects or arrays, to avoid Zustand v5 infinite loop.
If you must return an object/array, wrap the selector with `useShallow`: `useMatchStore(useShallow(mySelector))`.

## Local dev
```bash
npm run dev       # start dev server at localhost:5173
npx tsc --noEmit  # type check
npm run build     # production build
npx supabase db push  # push new migrations to Supabase
```

## Environment
`.env.local` contains `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN`.
This file is gitignored (`*.local`). Never commit credentials.

## Phase 2 (not yet built)
- Substitution tracking → enables +/- ratings
- Assist linking
- Video clip linking (add `context.video_url` to JSONB — no migration needed)
- API feed ingestion (Supabase Edge Function)
- Multi-user roles (admin / operator / coach)
- Season analytics dashboard
- PDF report export
