-- Run once after schema.sql: shared cache for /api/route (api/route.js), the OpenRouteService
-- failover behind routing.js's primary OSRM calls. No policies on purpose — only the service-role
-- key (server-side, see api/_lib/supabase.js) ever touches this table; the client never queries it
-- directly, so there's nothing here an anon key needs to read or write.
create table if not exists public.route_cache (
  id text primary key, -- `${profile}:${startLng,startLat};${endLng,endLat}` rounded to ~11 m, see api/route.js
  profile text not null check (profile in ('walk', 'taxi')),
  start_lng double precision not null,
  start_lat double precision not null,
  end_lng double precision not null,
  end_lat double precision not null,
  geometry jsonb not null, -- { coords: [[lng,lat]…], distance_m }
  provider text not null,
  created_at timestamptz not null default now()
);

alter table public.route_cache enable row level security;
