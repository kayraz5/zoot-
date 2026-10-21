-- ════════════════════════════════════════════════════════════════════════
-- Zoot · Social demo seed: 3 fake travellers + open windows to join.
-- Run in Supabase → SQL Editor AFTER social.sql.
-- Times are relative to now(), so RE-RUN THIS whenever the demo windows have ended.
--
--   Mei   opens Chinatown (4 stops, starts in ~30 min). Lina has joined stops 1–2.
--         Mei's other stops, airport and return-by were never sent; only the window is stored.
--   Lina  opens a late Gardens by the Bay window, so most layovers see "Ends after your return-by".
--   Arjun is free: dev_simulate('guest_joins') uses him to join YOUR window.
-- The fake accounts have no password and can't sign in.
-- ════════════════════════════════════════════════════════════════════════

-- ── Fake users (auth row → profile via the handle_new_user trigger) ─────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'mei@zoot.demo', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'arjun@zoot.demo', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'lina@zoot.demo', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values
  ('d0000000-0000-4000-8000-000000000001', 'Mei'),
  ('d0000000-0000-4000-8000-000000000002', 'Arjun'),
  ('d0000000-0000-4000-8000-000000000003', 'Lina')
on conflict (id) do nothing;

-- XP is guarded; open the guard for this script only.
select set_config('app.xp_write', 'on', false);
update public.profiles set display_name = 'Mei', style = 'budget', xp = 1450, cover_color = '#f83878', is_verified = true, home_city = 'Taipei'
 where id = 'd0000000-0000-4000-8000-000000000001';
update public.profiles set display_name = 'Arjun', style = 'adventurous', xp = 620, cover_color = '#3bceac', home_city = 'Bengaluru'
 where id = 'd0000000-0000-4000-8000-000000000002';
update public.profiles set display_name = 'Lina', style = 'party', xp = 2300, cover_color = '#ffcc00', is_verified = true, home_city = 'Berlin'
 where id = 'd0000000-0000-4000-8000-000000000003';
select set_config('app.xp_write', '', false);

insert into public.demo_users (user_id) values
  ('d0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000003')
on conflict (user_id) do nothing;

-- ── A window stop: same shape as a mission visit leg, timed from now() ──
create or replace function pg_temp.demo_stop(p_place text, p_arrive_min int, p_stay int, p_mode text, p_travel_min int, p_detail text, p_xp int)
returns jsonb language sql as $$
  select jsonb_build_object(
    'kind', 'visit', 'place_id', p.id, 'name', p.name, 'area', p.area, 'lat', p.lat, 'lng', p.lng, 'indoor', p.indoor,
    'stay_min', p_stay, 'travel_mode', p_mode, 'travel_min', p_travel_min, 'travel_detail', p_detail, 'xp', p_xp,
    'arrive_iso', to_jsonb(date_trunc('minute', now()) + make_interval(mins => p_arrive_min)) #>> '{}',
    'depart_iso', to_jsonb(date_trunc('minute', now()) + make_interval(mins => p_arrive_min + p_stay)) #>> '{}')
  from public.places p where p.id = p_place;
$$;

-- Re-running replaces the demo windows (members + chat cascade).
delete from public.parties where id in ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002');
delete from public.parties where host_id in (select user_id from public.demo_users);

-- ── Mei: Chinatown window, open, Lina joined stops 1–2 ──────────────────
insert into public.parties (id, host_id, title, style, capacity, starts_at, meeting_place_id, note, stops)
values (
  'd1000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'Chinatown hawker & temples',
  'budget',
  4,
  now(),                       -- recomputed from the stops by the trigger
  'maxwell-food-centre',       -- recomputed: always the first stop
  'Meet by the Tian Tian chicken rice queue. Easy pace, lots of food, all indoors if it rains.',
  jsonb_build_array(
    pg_temp.demo_stop('maxwell-food-centre',        30, 45, 'mrt',  0, 'Meeting point', 70),
    pg_temp.demo_stop('buddha-tooth-relic-temple',  78, 40, 'walk', 3, '240 m on foot', 60),
    pg_temp.demo_stop('sri-mariamman-temple',      122, 25, 'walk', 4, '300 m on foot', 50),
    pg_temp.demo_stop('ann-siang-hill',            152, 40, 'walk', 5, '350 m on foot', 60)
  )
);

insert into public.party_members (party_id, user_id, role, from_seq, to_seq)
values ('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'member', 1, 2);
select public.post_system('d1000000-0000-4000-8000-000000000001',
  'Lina joined for Maxwell Food Centre → Buddha Tooth Relic Temple', '{"kind":"joined","from":1,"to":2}'::jsonb);
insert into public.messages (party_id, user_id, type, body) values
  ('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'text', 'Hi! I''ll be at Maxwell in 30, wearing a yellow cap.'),
  ('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'chip', 'Running 5 min late');

-- ── Lina: late window (most short layovers can't fit it) ────────────────
insert into public.parties (id, host_id, title, style, capacity, starts_at, meeting_place_id, note, stops)
values (
  'd1000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000003',
  'Gardens by the Bay light show',
  'party',
  3,
  now(),
  'supertree-grove',
  'Garden Rhapsody, then satay by the water. Long layovers only!',
  jsonb_build_array(
    pg_temp.demo_stop('supertree-grove',  540, 60, 'mrt',  0, 'Meeting point', 90),
    pg_temp.demo_stop('satay-by-the-bay', 610, 50, 'walk', 10, '700 m on foot', 70)
  )
);

select title, status, capacity, sg_hhmm(starts_at) as starts, sg_hhmm(ends_at) as ends, jsonb_array_length(stops) as stops,
       (select count(*) from public.party_members m where m.party_id = p.id) as members
  from public.parties p where host_id in (select user_id from public.demo_users) order by starts_at;
