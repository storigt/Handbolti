-- Soft-delete for teams: an archived team is hidden from all team pickers/lists
-- but its row, players, matches, and events are untouched and can be restored.
alter table teams add column if not exists is_archived boolean not null default false;

create index if not exists idx_teams_owner_archived on teams(owner_user_id, is_archived);
