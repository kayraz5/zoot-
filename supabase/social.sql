-- ════════════════════════════════════════════════════════════════════════
-- Zoot · Social quests (Eudale) — spec: docs/social-quests-spec.md
-- Run in Supabase → SQL Editor AFTER schema.sql. Safe to re-run, and safe to run over the
-- earlier version of this file (it removes the old request/approve design first).
--
-- A host opens ONE window of consecutive stops from their itinerary. Guests join a
-- consecutive range inside it (one stop, several, or all), instantly, up to 2–4 people.
-- Everyone keeps their own return-by; there is no group deadline.
--
--   parties        = open windows. `stops` holds ONLY the window's stops: the host's other
--                    stops, airport and return-by are never sent here, so they can't leak.
--   party_members  = who's in, and which stops (from_seq..to_seq) they joined
--   messages       = chat for joined members (text | chip | system)
--   blocks/reports = safety;  party_locations = live location, joined members only
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Remove the earlier request/approve + ready-check + group-deadline design ──
drop trigger if exists parties_guard on public.parties;
drop trigger if exists party_members_guard on public.party_members;
drop trigger if exists party_members_changed on public.party_members;
drop function if exists public.guard_party();
drop function if exists public.guard_party_member();
drop function if exists public.party_members_changed();
drop function if exists public.request_to_join(uuid, timestamptz, int, text, text);
drop function if exists public.respond_to_request(uuid, uuid, boolean);
drop function if exists public.set_ready(uuid, boolean);
drop function if exists public.post_deadline_warning(uuid);
drop function if exists public.end_quest(uuid);
drop function if exists public.leave_party(uuid);
drop function if exists public.refresh_party(uuid);
drop function if exists public.quest_roster(uuid);   -- return type changed

-- Policies that mention columns we're about to change.
drop policy if exists "members readable" on public.party_members;
drop policy if exists "members request" on public.party_members;
drop policy if exists "members host approve" on public.party_members;
drop policy if exists "members self ready" on public.party_members;
drop policy if exists "members leave" on public.party_members;
drop policy if exists "parties host write" on public.parties;
drop policy if exists "parties host update" on public.parties;

-- ── 1. parties → open windows ───────────────────────────────────────────
alter table public.parties
  add column if not exists title text,
  add column if not exists stops jsonb not null default '[]',
  add column if not exists mission_id uuid,                     -- host's own mission (missions RLS keeps it private)
  add column if not exists style text,
  add column if not exists meeting_place_id text references public.places (id),
  add column if not exists meeting_label text,
  add column if not exists meeting_lat double precision,
  add column if not exists meeting_lng double precision,
  add column if not exists note text,
  add column if not exists ends_at timestamptz,                 -- last window stop's depart time
  add column if not exists window_version int not null default 1,
  add column if not exists closed_at timestamptz;
alter table public.parties
  drop column if exists return_by,                              -- no group deadline
  drop column if exists started_at,
  drop column if exists ended_at;

update public.parties set status = 'closed' where status not in ('open', 'full', 'closed');
alter table public.parties alter column capacity set default 4;
alter table public.parties drop constraint if exists parties_capacity_check;
alter table public.parties add constraint parties_capacity_check check (capacity between 2 and 4);
alter table public.parties drop constraint if exists parties_status_check;
alter table public.parties add constraint parties_status_check check (status in ('open', 'full', 'closed'));
alter table public.parties drop constraint if exists parties_note_len;
alter table public.parties add constraint parties_note_len check (note is null or length(note) <= 280);
alter table public.parties drop constraint if exists parties_title_len;
alter table public.parties add constraint parties_title_len check (title is null or length(title) between 1 and 120);
-- Public meeting points only: the meeting point is always the window's first stop, a catalog place.
alter table public.parties drop constraint if exists parties_meeting_public;
alter table public.parties add constraint parties_meeting_public check (meeting_place_id is not null);
create index if not exists parties_status_idx on public.parties (status, ends_at);

-- ── 2. party_members → joined ranges ────────────────────────────────────
alter table public.party_members
  add column if not exists from_seq int,
  add column if not exists to_seq int,
  add column if not exists joined_at timestamptz not null default now();

do $$ begin
  -- schema.sql scaffold: boolean `approved`
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'party_members' and column_name = 'approved') then
    delete from public.party_members where not approved;
    alter table public.party_members drop column approved;
  end if;
  -- earlier social.sql: status requested / approved / declined
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'party_members' and column_name = 'status') then
    delete from public.party_members where status <> 'approved';
    alter table public.party_members drop column status;
  end if;
end $$;

update public.party_members m set from_seq = 1, to_seq = greatest(1, jsonb_array_length(p.stops))
  from public.parties p where p.id = m.party_id and (m.from_seq is null or m.to_seq is null);
alter table public.party_members
  drop column if exists ready,
  drop column if exists return_by,
  drop column if exists origin_label,
  drop column if exists intro,
  drop column if exists requested_at,
  drop column if exists decided_at;
alter table public.party_members alter column from_seq set not null;
alter table public.party_members alter column to_seq set not null;
alter table public.party_members drop constraint if exists party_members_range_check;
alter table public.party_members add constraint party_members_range_check check (from_seq >= 1 and to_seq >= from_seq);
create index if not exists party_members_user_idx on public.party_members (user_id);

-- ── 3. messages → chat ──────────────────────────────────────────────────
alter table public.messages
  add column if not exists type text not null default 'text',
  add column if not exists meta jsonb;
alter table public.messages alter column user_id drop not null;   -- system messages have no sender
alter table public.messages drop constraint if exists messages_type_check;
alter table public.messages add constraint messages_type_check check (type in ('text', 'chip', 'system'));
create index if not exists messages_party_idx on public.messages (party_id, created_at);

-- ── 4. Safety, live location, demo users ────────────────────────────────
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  reported_id uuid not null references auth.users (id) on delete cascade,
  party_id uuid references public.parties (id) on delete set null,
  message_id bigint references public.messages (id) on delete set null,
  reason text not null check (reason in ('harassment', 'spam', 'unsafe', 'inappropriate', 'other')),
  details text check (details is null or length(details) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.party_locations (
  party_id uuid not null references public.parties (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  updated_at timestamptz not null default now(),
  primary key (party_id, user_id)
);

create table if not exists public.demo_users (
  user_id uuid primary key references auth.users (id) on delete cascade
);
insert into public.app_config (key, value) values ('dev_social', '1') on conflict (key) do nothing;
-- Switch the multiplayer simulator off before real users:  update public.app_config set value = '0' where key = 'dev_social';

-- ════════════════════════════════════════════════════════════════════════
-- Helpers
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.is_party_member(p_party uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from party_members where party_id = p_party and user_id = auth.uid());
$$;

create or replace function public.is_party_host(p_party uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from parties where id = p_party and host_id = auth.uid());
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.sg_hhmm(t timestamptz)
returns text language sql immutable as $$ select to_char(t at time zone 'Asia/Singapore', 'HH24:MI') $$;

-- System chat line. Internal: clients can't call it (revoked at the bottom).
create or replace function public.post_system(p_party uuid, p_body text, p_meta jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into messages (party_id, user_id, type, body, meta) values (p_party, null, 'system', p_body, p_meta);
$$;

create or replace function public.display_name_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from profiles where id = p_user), 'A traveller');
$$;

/**
 * Check and tidy a window: 1+ stops, every place in the catalog (so public), times in order,
 * seq renumbered 1..n. Raises a readable error otherwise.
 * Each stop is REBUILT from an allow-list: place, times and XP from the host; name, area and
 * coordinates from the catalog. Anything else the app sends (travel notes such as
 * "MRT Changi Airport → …", which would reveal the host's airport) is dropped here, server-side.
 */
create or replace function public.normalize_window(p_stops jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_out jsonb;
  v_prev_depart timestamptz;
  s jsonb;
begin
  if p_stops is null or jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then
    raise exception 'Pick at least one stop to open';
  end if;
  for s in select value from jsonb_array_elements(p_stops) loop
    if not exists (select 1 from places where id = s ->> 'place_id') then
      raise exception 'Only catalog places can be shared (% is not one)', coalesce(s ->> 'name', s ->> 'place_id');
    end if;
    if (s ->> 'arrive_iso') is null or (s ->> 'depart_iso') is null or (s ->> 'depart_iso')::timestamptz < (s ->> 'arrive_iso')::timestamptz then
      raise exception 'Stop % has no valid time', coalesce(s ->> 'name', s ->> 'place_id');
    end if;
    if v_prev_depart is not null and (s ->> 'arrive_iso')::timestamptz < v_prev_depart then
      raise exception 'Window stops must be consecutive and in time order';
    end if;
    v_prev_depart := (s ->> 'depart_iso')::timestamptz;
  end loop;
  select jsonb_agg(jsonb_build_object(
           'seq', t.ord,
           'kind', 'visit',
           'place_id', p.id,
           'name', p.name,
           'area', p.area,
           'lat', p.lat,
           'lng', p.lng,
           'indoor', p.indoor,
           'arrive_iso', t.value ->> 'arrive_iso',
           'depart_iso', t.value ->> 'depart_iso',
           'stay_min', round(extract(epoch from (t.value ->> 'depart_iso')::timestamptz - (t.value ->> 'arrive_iso')::timestamptz) / 60)::int,
           'xp', coalesce((t.value ->> 'xp')::int, 40)
         ) order by t.ord) into v_out
    from jsonb_array_elements(p_stops) with ordinality t(value, ord)
    join places p on p.id = t.value ->> 'place_id';
  return v_out;
end $$;

-- open ↔ full by head count (closed stays closed).
create or replace function public.refresh_party(p_party uuid)
returns void language sql security definer set search_path = public as $$
  update parties p set status = case
      when p.status = 'closed' then 'closed'
      when (select count(*) from party_members m where m.party_id = p.id) >= p.capacity then 'full'
      else 'open' end
   where p.id = p_party;
$$;

-- "Maxwell Food Centre → Buddha Tooth Relic Temple" for stops a..b of a window.
create or replace function public.range_label(p_stops jsonb, p_from int, p_to int)
returns text language sql immutable as $$
  select case when p_from = p_to then p_stops -> (p_from - 1) ->> 'name'
              else (p_stops -> (p_from - 1) ->> 'name') || ' → ' || (p_stops -> (p_to - 1) ->> 'name') end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Publishing a window
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.parties_before_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  new.stops := normalize_window(new.stops);
  new.status := 'open';
  new.window_version := 1;
  new.closed_at := null;
  new.starts_at := (new.stops -> 0 ->> 'arrive_iso')::timestamptz;
  new.ends_at := (new.stops -> (jsonb_array_length(new.stops) - 1) ->> 'depart_iso')::timestamptz;
  if new.ends_at <= now() then raise exception 'Those stops are already over'; end if;
  new.meeting_place_id := new.stops -> 0 ->> 'place_id';
  select name, lat, lng into new.meeting_label, new.meeting_lat, new.meeting_lng from places where id = new.meeting_place_id;
  return new;
end $$;
drop trigger if exists parties_before_insert on public.parties;
create trigger parties_before_insert before insert on public.parties
  for each row execute function public.parties_before_insert();

create or replace function public.parties_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into party_members (party_id, user_id, role, from_seq, to_seq)
  values (new.id, new.host_id, 'host', 1, jsonb_array_length(new.stops))
  on conflict (party_id, user_id) do nothing;
  perform post_system(new.id,
    display_name_of(new.host_id) || ' opened ' || range_label(new.stops, 1, jsonb_array_length(new.stops)) || '. Meet at ' || new.meeting_label || '.',
    jsonb_build_object('kind', 'opened'));
  return null;
end $$;
drop trigger if exists parties_after_insert on public.parties;
create trigger parties_after_insert after insert on public.parties
  for each row execute function public.parties_after_insert();

-- Leaving (Go solo, removed by the host, quest closed) stops sharing your location at once.
create or replace function public.party_members_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from party_locations where party_id = old.party_id and user_id = old.user_id;
  return null;
end $$;
drop trigger if exists party_members_after_delete on public.party_members;
create trigger party_members_after_delete after delete on public.party_members
  for each row execute function public.party_members_after_delete();

-- ════════════════════════════════════════════════════════════════════════
-- RPCs (what the app calls)
-- ════════════════════════════════════════════════════════════════════════

/**
 * Join stops p_from..p_to of a window, instantly.
 * p_airport_by = when the guest must be back at THEIR airport (strict), p_back_min = the app's real
 * travel estimate from the last joined stop back there. Used for the check, never stored.
 */
create or replace function public.join_window(p_party uuid, p_from int, p_to int, p_airport_by timestamptz, p_back_min int)
returns public.party_members language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_party parties;
  v_row party_members;
  v_other parties;
  v_end timestamptz;
  v_n int;
begin
  if v_uid is null then raise exception 'Sign in to join quests'; end if;
  select * into v_party from parties where id = p_party for update;   -- serialise joins (capacity)
  if not found then raise exception 'That quest no longer exists'; end if;
  if v_party.host_id = v_uid then raise exception 'This is your own quest'; end if;
  if v_party.status = 'closed' or v_party.ends_at <= now() then raise exception 'This quest has ended'; end if;
  if exists (select 1 from party_members m where m.party_id = p_party
             and (m.user_id = v_uid or is_blocked_between(v_uid, m.user_id))) then
    raise exception '%', case when exists (select 1 from party_members where party_id = p_party and user_id = v_uid)
                              then 'You''re already in this quest' else 'You can''t join this quest' end;
  end if;
  select p.* into v_other from parties p join party_members m on m.party_id = p.id
   where m.user_id = v_uid and m.role = 'member' and p.status <> 'closed' and p.ends_at > now() limit 1;
  if found then raise exception 'You''re already with "%". Go solo there first.', v_other.title; end if;
  if (select count(*) from party_members where party_id = p_party) >= v_party.capacity then raise exception 'This quest is full'; end if;

  v_n := jsonb_array_length(v_party.stops);
  if p_from is null or p_to is null or p_from < 1 or p_to > v_n or p_from > p_to then
    raise exception 'Pick stops from this window (1 to %)', v_n;
  end if;
  v_end := (v_party.stops -> (p_to - 1) ->> 'depart_iso')::timestamptz;
  if v_end <= now() then raise exception 'Those stops are already over'; end if;
  if p_airport_by is null then raise exception 'Plan your layover first'; end if;
  if v_end + make_interval(mins => greatest(coalesce(p_back_min, 0), 0)) > p_airport_by then
    raise exception 'Ends too late for your flight: these stops end at % and you need % min to get back, but you must be at the airport by %.',
      sg_hhmm(v_end), greatest(coalesce(p_back_min, 0), 0), sg_hhmm(p_airport_by);
  end if;

  insert into party_members (party_id, user_id, role, from_seq, to_seq)
  values (p_party, v_uid, 'member', p_from, p_to) returning * into v_row;
  perform post_system(p_party, display_name_of(v_uid) || ' joined for ' || range_label(v_party.stops, p_from, p_to),
    jsonb_build_object('kind', 'joined', 'user_id', v_uid, 'from', p_from, 'to', p_to));
  perform refresh_party(p_party);
  return v_row;
end $$;

-- Close a window (host). Guests are returned to their own plans.
create or replace function public.close_window(p_party uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_party_host(p_party) then raise exception 'Only the host can close this quest'; end if;
  update parties set status = 'closed', closed_at = now() where id = p_party and status <> 'closed';
  if found then
    delete from party_members where party_id = p_party and role = 'member';
    perform post_system(p_party, 'The host closed this quest. Everyone is back on their own plan.', jsonb_build_object('kind', 'closed'));
  end if;
end $$;

-- "Go solo": a guest leaves (their app restores their own stops), or their joined stops are over.
-- The host leaving closes the window.
create or replace function public.leave_window(p_party uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_m party_members;
  v_done boolean;
begin
  if is_party_host(p_party) then perform close_window(p_party); return; end if;
  delete from party_members where party_id = p_party and user_id = auth.uid() and role = 'member' returning * into v_m;
  if found then
    select coalesce((p.stops -> (v_m.to_seq - 1) ->> 'depart_iso')::timestamptz <= now(), false) into v_done from parties p where p.id = p_party;
    perform post_system(p_party, display_name_of(auth.uid()) || case when v_done then ' finished their stops' else ' went solo' end,
      jsonb_build_object('kind', case when v_done then 'finished' else 'left' end, 'user_id', auth.uid()));
    perform refresh_party(p_party);
  end if;
end $$;

/**
 * The host edited their itinerary: replace the window's stops. Hosts keep their freedom;
 * a guest whose joined stops were removed, re-timed by 5+ min, or split apart is returned
 * to their own plan (with a system message). Everyone else keeps their spot.
 * Returns { removed: [user ids], window_version }. An empty window closes the quest.
 */
create or replace function public.update_window(p_party uuid, p_stops jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_party parties;
  v_new jsonb;
  v_n int;
  m record;
  v_seqs int[];
  v_changed text;
  v_removed uuid[] := '{}';
  v_ord bigint;
  i int;
  o jsonb;
  s jsonb;
begin
  if not is_party_host(p_party) then raise exception 'Only the host can change this quest'; end if;
  select * into v_party from parties where id = p_party for update;
  if v_party.status = 'closed' then raise exception 'This quest is closed'; end if;
  if p_stops is null or jsonb_array_length(p_stops) = 0 then
    perform close_window(p_party);
    return jsonb_build_object('removed', '[]'::jsonb, 'closed', true);
  end if;
  v_new := normalize_window(p_stops);
  v_n := jsonb_array_length(v_new);

  for m in select * from party_members where party_id = p_party and role = 'member' loop
    v_seqs := '{}';
    v_changed := null;
    -- Each stop the guest joined must still be in the window at (about) the same time.
    for i in m.from_seq .. m.to_seq loop
      o := v_party.stops -> (i - 1);
      s := null;
      v_ord := null;
      select t.value, t.ord into s, v_ord
        from jsonb_array_elements(v_new) with ordinality t(value, ord)
       where t.value ->> 'place_id' = o ->> 'place_id';
      if s is null
         or abs(extract(epoch from (s ->> 'arrive_iso')::timestamptz - (o ->> 'arrive_iso')::timestamptz)) >= 300
         or abs(extract(epoch from (s ->> 'depart_iso')::timestamptz - (o ->> 'depart_iso')::timestamptz)) >= 300 then
        v_changed := coalesce(o ->> 'name', 'a stop');
        exit;
      end if;
      v_seqs := v_seqs || v_ord::int;
    end loop;
    -- Still consecutive in the new window? (e.g. host squeezed a new stop in between)
    if v_changed is null and (select max(x) - min(x) + 1 from unnest(v_seqs) x) <> (m.to_seq - m.from_seq + 1) then
      v_changed := 'the order of stops';
    end if;
    if v_changed is not null then
      delete from party_members where party_id = p_party and user_id = m.user_id;
      v_removed := v_removed || m.user_id;
      perform post_system(p_party, display_name_of(v_party.host_id) || ' changed ' || v_changed || '. '
        || display_name_of(m.user_id) || ' is back on their own plan.',
        jsonb_build_object('kind', 'window_changed', 'user_id', m.user_id));
    else
      update party_members set from_seq = (select min(x) from unnest(v_seqs) x), to_seq = (select max(x) from unnest(v_seqs) x)
       where party_id = p_party and user_id = m.user_id;
    end if;
  end loop;

  update parties set
    stops = v_new,
    starts_at = (v_new -> 0 ->> 'arrive_iso')::timestamptz,
    ends_at = (v_new -> (v_n - 1) ->> 'depart_iso')::timestamptz,
    meeting_place_id = v_new -> 0 ->> 'place_id',
    meeting_label = (select name from places where id = v_new -> 0 ->> 'place_id'),
    meeting_lat = (select lat from places where id = v_new -> 0 ->> 'place_id'),
    meeting_lng = (select lng from places where id = v_new -> 0 ->> 'place_id'),
    window_version = window_version + 1
   where id = p_party;
  update party_members set from_seq = 1, to_seq = v_n where party_id = p_party and role = 'host';
  perform post_system(p_party, 'The host updated the open stops.', jsonb_build_object('kind', 'window_updated'));
  perform refresh_party(p_party);
  return jsonb_build_object('removed', to_jsonb(v_removed), 'window_version', v_party.window_version + 1);
end $$;

-- Delete for good (host): members and chat go with it.
create or replace function public.delete_quest(p_party uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_party_host(p_party) then raise exception 'Only the host can delete this quest'; end if;
  delete from parties where id = p_party;
end $$;

-- "Who's going": public profile + joined range for anyone who can see the quest.
create or replace function public.quest_roster(p_party uuid)
returns table (user_id uuid, role text, from_seq int, to_seq int, display_name text, avatar_seed int,
               cover_color text, style text, xp int, is_verified boolean, home_city text)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, m.from_seq, m.to_seq, p.display_name, p.avatar_seed, p.cover_color, p.style, p.xp, p.is_verified, p.home_city
    from party_members m
    join profiles p on p.id = m.user_id
    join parties q on q.id = m.party_id
   where m.party_id = p_party and auth.uid() is not null
     and (is_party_member(p_party) or (q.status in ('open', 'full') and q.ends_at > now() and not is_blocked_between(auth.uid(), q.host_id)))
   order by (m.role = 'host') desc, m.joined_at;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════════
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.party_locations enable row level security;
alter table public.demo_users enable row level security;

-- Windows: browse open/full ones that haven't ended (unless blocked); members always see theirs.
-- Rows only ever contain the window's stops, so nothing hidden can be read.
drop policy if exists "parties readable" on public.parties;
create policy "parties readable" on public.parties for select using (
  auth.uid() is not null and (
    host_id = auth.uid()
    or public.is_party_member(id)
    or (status in ('open', 'full') and ends_at > now() and not public.is_blocked_between(auth.uid(), host_id))
  )
);
drop policy if exists "parties host insert" on public.parties;
create policy "parties host insert" on public.parties for insert with check (host_id = auth.uid());
-- No update/delete policies: changes go through update_window / close_window / delete_quest.

-- Members see each other; outsiders only get quest_roster(). Joining/leaving only via RPCs.
create policy "members readable" on public.party_members for select using (public.is_party_member(party_id));

-- Chat: joined members only; hide people I blocked; posting closes 30 min after the window ends.
drop policy if exists "messages members read" on public.messages;
create policy "messages members read" on public.messages for select using (
  public.is_party_member(party_id)
  and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = messages.user_id)
);
drop policy if exists "messages members post" on public.messages;
create policy "messages members post" on public.messages for insert with check (
  user_id = auth.uid() and type in ('text', 'chip') and public.is_party_member(party_id)
  and exists (select 1 from public.parties p where p.id = party_id and p.status <> 'closed' and now() < p.ends_at + interval '30 minutes')
);

drop policy if exists "blocks own" on public.blocks;
create policy "blocks own" on public.blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
drop policy if exists "reports own insert" on public.reports;
create policy "reports own insert" on public.reports for insert with check (reporter_id = auth.uid());
drop policy if exists "reports own read" on public.reports;
create policy "reports own read" on public.reports for select using (reporter_id = auth.uid());

-- Live location: only between joined members, only until the window ends; gone when you leave.
drop policy if exists "locations members read" on public.party_locations;
create policy "locations members read" on public.party_locations for select using (
  public.is_party_member(party_id) and exists (select 1 from public.party_members m where m.party_id = party_locations.party_id and m.user_id = party_locations.user_id)
  and exists (select 1 from public.parties p where p.id = party_id and p.status <> 'closed' and now() < p.ends_at)
);
drop policy if exists "locations self write" on public.party_locations;
create policy "locations self write" on public.party_locations for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_party_member(party_id)
    and exists (select 1 from public.parties p where p.id = party_id and p.status <> 'closed' and now() < p.ends_at));

drop policy if exists "demo users readable" on public.demo_users;
create policy "demo users readable" on public.demo_users for select using (auth.uid() is not null);

-- ════════════════════════════════════════════════════════════════════════
-- Dev: drive the seeded fake travellers so one person can demo multiplayer.
-- Only while app_config.dev_social = '1', and only on quests you're in.
--   guest_joins  a fake traveller joins YOUR open window (random consecutive stops)
--   guest_leaves a fake guest goes solo
--   chat         a fake member sends a message / quick reply
--   checkin      a fake member checks in at one of their stops (system message)
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.dev_simulate(p_party uuid, p_action text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_party parties;
  v_bot uuid;
  v_n int;
  v_from int;
  v_to int;
  v_body text;
  v_m party_members;
  v_stop jsonb;
begin
  if coalesce((select value from app_config where key = 'dev_social'), '0') <> '1' then
    raise exception 'The multiplayer simulator is switched off (app_config.dev_social)';
  end if;
  if v_uid is null then raise exception 'Sign in first'; end if;
  select * into v_party from parties where id = p_party;
  if not found then raise exception 'Unknown quest'; end if;
  if not exists (select 1 from party_members where party_id = p_party and user_id = v_uid) then
    raise exception 'You''re not in this quest';
  end if;

  if p_action = 'guest_joins' then
    if v_party.host_id <> v_uid then raise exception 'Only works on your own quest'; end if;
    if v_party.status <> 'open' then raise exception 'Your quest isn''t taking guests (it''s %)', v_party.status; end if;
    select d.user_id into v_bot from demo_users d
     where not exists (select 1 from party_members m where m.party_id = p_party and m.user_id = d.user_id)
     order by random() limit 1;
    if v_bot is null then raise exception 'Every demo traveller is already in'; end if;
    v_n := jsonb_array_length(v_party.stops);
    v_from := 1 + floor(random() * v_n)::int;
    v_to := v_from + floor(random() * (v_n - v_from + 1))::int;
    insert into party_members (party_id, user_id, role, from_seq, to_seq) values (p_party, v_bot, 'member', v_from, v_to);
    perform post_system(p_party, display_name_of(v_bot) || ' joined for ' || range_label(v_party.stops, v_from, v_to),
      jsonb_build_object('kind', 'joined', 'user_id', v_bot, 'from', v_from, 'to', v_to));
    perform refresh_party(p_party);
    return display_name_of(v_bot) || ' joined for ' || range_label(v_party.stops, v_from, v_to);

  elsif p_action = 'guest_leaves' then
    select m.user_id into v_bot from party_members m
     where m.party_id = p_party and m.role = 'member' and m.user_id in (select user_id from demo_users) order by random() limit 1;
    if v_bot is null then raise exception 'No demo guests in this quest'; end if;
    delete from party_members where party_id = p_party and user_id = v_bot;
    perform post_system(p_party, display_name_of(v_bot) || ' went solo', jsonb_build_object('kind', 'left', 'user_id', v_bot));
    perform refresh_party(p_party);
    return display_name_of(v_bot) || ' went solo';

  elsif p_action = 'locate' then
    -- Put every demo traveller in this quest on the map, a short walk from the stop they're at now.
    v_n := 0;
    for v_m in select * from party_members m where m.party_id = p_party and m.user_id in (select user_id from demo_users) loop
      select e into v_stop from jsonb_array_elements(v_party.stops) with ordinality as t(e, i)
       where i between v_m.from_seq and v_m.to_seq
       order by ((e ->> 'depart_iso')::timestamptz <= now()), i limit 1;
      insert into party_locations (party_id, user_id, lat, lng, accuracy_m)
      values (p_party, v_m.user_id, (v_stop ->> 'lat')::float8 + (random() - 0.5) * 0.0012, (v_stop ->> 'lng')::float8 + (random() - 0.5) * 0.0012, 15)
      on conflict (party_id, user_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m, updated_at = now();
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then raise exception 'No demo travellers in this quest yet'; end if;
    return v_n || ' demo traveller' || case when v_n = 1 then '' else 's' end || ' placed on the map';

  elsif p_action in ('chat', 'checkin') then
    select * into v_m from party_members m
     where m.party_id = p_party and m.user_id <> v_uid and m.user_id in (select user_id from demo_users) order by random() limit 1;
    if v_m.user_id is null then raise exception 'No demo travellers in this quest yet'; end if;
    if p_action = 'chat' then
      v_body := (array['Running 5 min late', 'I''m at the meeting point', 'This place is amazing', 'Grabbing a drink, back in 2', 'Which exit are you at?'])[1 + floor(random() * 5)::int];
      insert into messages (party_id, user_id, type, body)
      values (p_party, v_m.user_id, case when v_body in ('Running 5 min late', 'I''m at the meeting point') then 'chip' else 'text' end, v_body);
      return display_name_of(v_m.user_id) || ': ' || v_body;
    end if;
    perform post_system(p_party, display_name_of(v_m.user_id) || ' checked in at ' || (v_party.stops -> (v_m.from_seq - 1) ->> 'name'),
      jsonb_build_object('kind', 'checkin', 'user_id', v_m.user_id, 'place_id', v_party.stops -> (v_m.from_seq - 1) ->> 'place_id'));
    return display_name_of(v_m.user_id) || ' checked in';
  end if;
  raise exception 'Unknown action %', p_action;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- Grants + Realtime
-- ════════════════════════════════════════════════════════════════════════
revoke all on function public.post_system(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.refresh_party(uuid) from public, anon, authenticated;
grant execute on function public.join_window(uuid, int, int, timestamptz, int) to authenticated;
grant execute on function public.leave_window(uuid) to authenticated;
grant execute on function public.close_window(uuid) to authenticated;
grant execute on function public.update_window(uuid, jsonb) to authenticated;
grant execute on function public.delete_quest(uuid) to authenticated;
grant execute on function public.quest_roster(uuid) to authenticated;
grant execute on function public.dev_simulate(uuid, text) to authenticated;

do $$ begin alter publication supabase_realtime add table public.party_members; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.parties; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.party_locations; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.messages; exception when others then null; end $$;
