-- Run once after schema.sql: extra columns used by the daily places sync (api/sync-places.js)
alter table public.places
  add column if not exists source text not null default 'seed',      -- seed | osm
  add column if not exists source_ref text,                            -- id in the source dataset
  add column if not exists active boolean not null default true,      -- false = no longer listed, kept for old stamps
  add column if not exists hours_verified boolean not null default true,
  add column if not exists website text,
  add column if not exists blurb_source text;                          -- 'wikipedia' = cached, not refetched

create index if not exists places_active_idx on public.places (active);
