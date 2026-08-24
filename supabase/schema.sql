-- Spindle collection schema. Run once in the Supabase SQL editor.
-- Three tables: pressings (one row per distinct recording), plays (who played what, when),
-- profiles (per-user Last.fm session key — service-key-only, browsers have zero access).

create table public.pressings (
  id uuid primary key default gen_random_uuid(),
  -- AudD's fingerprint id when known, else lower(artist|title|album)
  dedupe_key text unique not null,
  artist text not null,
  title text not null,
  album text,
  release_date text,
  label text,
  apple_music_url text,
  spotify_url text,
  created_at timestamptz not null default now()
);

create table public.plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pressing_id uuid not null references public.pressings(id),
  played_at timestamptz not null default now(),
  raw jsonb, -- the full AudD payload, kept for later mining
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  lastfm_sk text,
  lastfm_user text
);

alter table public.pressings enable row level security;
alter table public.plays enable row level security;
alter table public.profiles enable row level security;

-- pressings: everyone reads, authenticated users create/update (first listener wins the insert).
-- ponytail: update is all-columns/all-authenticated; narrow to fill-nulls-only before
-- pressings become shared social data (Feed & social step).
create policy "pressings readable by anyone"
  on public.pressings for select using (true);
create policy "authenticated users add pressings"
  on public.pressings for insert to authenticated with check (true);
create policy "authenticated users enrich pressings"
  on public.pressings for update to authenticated using (true);

-- plays: strictly owner-only
create policy "read own plays"
  on public.plays for select using (auth.uid() = user_id);
create policy "insert own plays"
  on public.plays for insert to authenticated with check (auth.uid() = user_id);

-- profiles: no policies at all -> RLS denies every client read/write.
-- Only the service key (used inside /api/lastfm) touches this table.
