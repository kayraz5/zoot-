-- Run once after schema.sql: passport progress per user (read/write own row only, see "passport own" policy)
alter table public.passport_pages
  add column if not exists slammed_areas text[] not null default '{}', -- area chops already slammed onto the passport
  add column if not exists seen_places text[] not null default '{}';   -- place ids shown as "seen" in the Codex
