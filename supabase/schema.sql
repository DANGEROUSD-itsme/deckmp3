-- DECK v4 sync schema.
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent.

-- One row per signed-in user. `data` is the whole Settings object, synced as
-- one blob since it's already persisted that way locally (see src/lib/db.ts).
create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Mirrors the local `playlists` IndexedDB store. `updated_at` is what lets
-- two devices merge without a full conflict-resolution UI: newer wins.
create table if not exists public.playlists (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  track_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Mirrors the local `stats` IndexedDB store (play counts, favourites,
-- ratings). Merged additively on sign-in — see src/lib/sync.ts — so there's
-- no last-write-wins timestamp needed here.
create table if not exists public.track_stats (
  track_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  plays integer not null default 0,
  skips integer not null default 0,
  last_played bigint not null default 0,
  favorite boolean not null default false,
  rating integer not null default 0,
  primary key (user_id, track_id)
);

alter table public.settings enable row level security;
alter table public.playlists enable row level security;
alter table public.track_stats enable row level security;

-- Row-level security: every user can only ever see or write their own rows.
-- `drop policy if exists` first makes the whole file re-runnable.
drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own playlists" on public.playlists;
create policy "own playlists" on public.playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own stats" on public.track_stats;
create policy "own stats" on public.track_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
