-- Run after schema.sql (safe to re-run): passport progress per user (read/write own row only, see "passport own" policy)
alter table public.passport_pages
  add column if not exists slammed_areas text[] not null default '{}', -- area chops already slammed onto the passport
  add column if not exists seen_places text[] not null default '{}',   -- place ids shown as "seen" in the Codex
  add column if not exists nationality text,                           -- passport country (ISO 3166 alpha-2), for the entry check
  add column if not exists transit_visa boolean;                       -- holds a visa that qualifies for the 96 h transit facility
