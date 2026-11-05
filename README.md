<p align="center" style="background-color: yellow;">
  <img src="public/brand/zoot-wordmark.png" width="260">
</p>

<h1 align="center">Zoot: Turn a Singapore layover into a quest </h1>

Tell Zoot when you land at Changi and when your next flight leaves. It plans a few hours out in the city that fit your time and budget, guides you there on a 3D map, stamps a passport at each stop, and gets you back to the gate on time.

Live app: **https://tryzoot.vercel.app**

---

## Contents

- [Try it with the test account](#try-it-with-the-test-account)
- [Run it locally](#run-it-locally)
- [Main features](#main-features)
- [Tech stack](#tech-stack)
- [How the code is organised](#how-the-code-is-organised)
- [Setting up your own Supabase](#setting-up-your-own-supabase)
- [Testing](#testing)
- [Deployment](#deployment)
- [Team](#team)

---

## Try it with the test account

| | |
|---|---|
| Email | `test@gmail.com` |
| Password | `adminuser` |

You can also tap **Continue as guest**, which needs no account. Guest progress is saved in your browser only (via localStorage) but multiplayer quests feature is off.

---

## Run it locally

### 1. Install the tools

- **Node.js** 22.18+ or 24.12+ (`node -v` to check)
- **pnpm** 10 (`npm install -g pnpm`, or `corepack enable`)

### 2. Install and start

```sh
git clone https://github.com/kayraz5/zoot-.git
cd zoot-
pnpm install
pnpm dev
```

### 3. Add keys for the full app (Localhost, optional)

Copy the example env file, with the following details:

| Variable | What it turns on | Without it |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Accounts, saved missions across devices, multiplayer quests | Guest mode only |
| `GROQ_API_KEY`, `GROQ_MODEL` | AI-written itineraries | Offline planner |
| `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` | Full bus + MRT routes with changes ([free account](https://www.onemap.gov.sg/apidocs/register)) | MRT and direct buses from bundled data |
| `LTA_ACCOUNT_KEY` | Live bus arrival times from LTA DataMall | Public arrivals mirror |
| `ORS_API_KEY` | Backup street routing if the free routers are down | Free routers only |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_SECRET` | Daily places sync and the shared route cache (server only) | Place list |
| `VITE_DEV_PANEL` | The `/dev` panel on a production build (always on in `pnpm dev`) | Hidden in production |

### Useful commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server with hot reload, plus the `api/` functions |
| `pnpm build` | Production build into `dist/` |
| `pnpm preview` | Serve the production build locally |
| `pnpm test:unit` | Unit tests (Vitest) |
| `pnpm test:e2e` | Browser tests (Playwright) |
| `pnpm sync:places` | Refresh the place catalog from OpenStreetMap |
| `pnpm sync:transit` | Refresh MRT stations and bus stops/routes |
| `pnpm sync:mrt-lines` | Refresh the MRT track shapes drawn on the map |

---

## Main features

| Feature | What it does | Built by |
|---|---|---|
| **Landing story** | A scroll-driven 3D flight over Singapore that introduces the app | Matthew |
| **Sign in & accounts** | Email + password, magic link, and guest mode; sessions that survive closing the browser | Matthew, Steven |
| **Onboarding quiz** | Four quick questions that pick your travel style (budget, foodie, culture, and so on) | Steven, Hulbert |
| **Layover planner** | Enter arrival and departure times and your terminals; Zoot works out how long you can safely spend outside, with immigration and airport buffers | Kayra |
| **Visa / entry check** | Warns if your passport may need a visa to leave Changi, with a link to ICA's official check | Shrey |
| **AI itinerary** | Groq picks stops that fit your time, style and the weather, with an offline planner as backup | Kayra, Hulbert |
| **Mission page** | Your timeline: stops, travel between them, "head back by" countdown, swap/add/remove stops, reorder, replan ("I'm behind", "Rain plan", "Less walking"), finish early | Kayra |
| **3D quest map** | Live position, the route to your next stop, stamp button, "Need help?" replans and "get me to the airport" | Matthew |
| **Public transport** | MRT and bus directions in plain language, live bus arrivals at any stop, and the itinerary's next leg following your live location | Kayra, Matthew |
| **3D traveller** | The otter avatar on the map, and a wardrobe to dress it | Matthew |
| **Explore** | Browse and search every place in the catalog, with real photos | Kayra (page), Eudale (photos) |
| **Place catalog** | Hand-picked places plus a daily sync from OpenStreetMap, with opening hours | Shrey |
| **Check-ins & XP** | Stamp a stop when you're within range; earn XP and level up | Hulbert |
| **Passport & stamps** | A flip-book passport that fills with stamps and badges, plus the City Codex of everything you've found | Shrey, Hulbert |
| **Weather** | Live rain, haze and temperature; rain effects on screen, and indoor swaps when rain is likely | Hulbert |
| **Sidequest deck** | Swipe right on small nearby detours that still fit your time | Hulbert |
| **Multiplayer quests** | Open some of your stops to other travellers, join someone else's, chat, see each other live on the map, and earn co-op stamps together | Eudale (Kayra: live map chips) |
| **Testing & CI** | Unit, browser and Supabase-gated test suites, run on every push | Steven |

---

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Vue 3, Vite, Vue Router, Pinia |
| UI | Bootstrap 5, Bootstrap Icons, custom CSS (`src/view/styles/`) |
| Maps & 3D | MapLibre GL (OpenFreeMap tiles), Three.js, Turf |
| Backend | Supabase (Postgres, Auth, Realtime, row-level security) and Vercel serverless functions (`api/`) |
| AI | Groq (itinerary and trip summary) |
| Data sources | OneMap (routing), LTA DataMall (bus arrivals), Open-Meteo and data.gov.sg (weather, haze), OpenStreetMap (places), Wikimedia Commons (photos), OSRM / OpenRouteService (street routes) |
| Testing | Vitest + Vue Test Utils (unit), Playwright (browser), GitHub Actions (CI) |
| Hosting | Vercel, with a daily cron job for the places sync |

There is no separate server to run. The browser talks to Supabase directly. Row-level security decides what each user can read or write. Anything that needs a secret key is run as a Vercel function in  `api/`.

---

## How the code is organised

The app follows a **Model / View / Controller** split, and the view is grouped **by feature**.

```
zoot-/
├── api/                    Vercel serverless functions, served at /api/*
│   ├── plan.js             AI itinerary (Groq)
│   ├── summary.js          AI trip summary
│   ├── route.js            Street routing with failover and a shared cache
│   ├── transit.js          OneMap bus + MRT itineraries
│   ├── bus-arrival.js      Live bus arrival times
│   ├── entry-rule.js       Visa / entry rules by passport
│   ├── sync-places.js      Daily places sync (Vercel cron)
│   └── _lib/               Shared server helpers (Groq, Supabase admin client, places sync)
├── src/
│   ├── main.js, App.vue    Start-up and the app shell
│   ├── controller/
│   │   └── router/         Routes and navigation guards (sign-in, onboarding)
│   ├── model/              State and logic, no UI
│   │   ├── stores/         Pinia stores: user, trip, mission, party, passport, character, ui
│   │   ├── services/       Business logic: planner, travel times, opening hours, check-ins,
│   │   │   ├── db/         weather, social quests…  db/ is the database layer (Supabase or guest)
│   │   │   └── transit/    MRT and bus routing
│   │   └── data/           Static data: places, MRT network, interests, sidequests
│   ├── view/               Everything you see
│   │   ├── views/          One file per page (PlanView, MissionView, MapView, …)
│   │   ├── components/     Page parts, one folder per feature:
│   │   │                   character, map, mission, passport, places, plan,
│   │   │                   profile, quests, story
│   │   ├── common/         Pieces used by more than one feature (weather, place art, galleries)
│   │   ├── app/            App shell: bottom nav, toasts, dialogs
│   │   └── styles/         Global CSS and design tokens
│   └── assets/             Images, stamp art, videos
├── public/                 Static files served as-is (brand images, story frames)
├── supabase/               SQL to set up the database (tables, security rules, seed data)
├── scripts/                Data sync and generation scripts (places, transit, seed)
├── tests/                  Unit and integration tests (Vitest)
├── e2e/                    Browser tests (Playwright)
└── vercel.json             SPA rewrites and the daily cron job
```

### Where new code goes

- **New page:** add a file in `src/view/views/` and a route in `src/controller/router/index.js`.
- **A part of a page:** put it in `src/view/components/<feature>/`. Move it to `src/view/common/` only once a second feature needs it.
- **State shared between pages:** a Pinia store in `src/model/stores/`.
- **Logic (calculations, API calls, rules):** a service in `src/model/services/`, not inside a component. That keeps it testable without a browser.
- **Anything that needs a secret key:** a function in `api/`, never in `src/`.

---

## Testing

```sh
pnpm test:unit            # fast logic and component tests, no network
pnpm test:e2e             # browser tests against a local dev server, in guest mode
```

Run `pnpm exec playwright install chromium` once before the first browser test run.

The Supabase-backed tests (multiplayer, chat, live location) only run when a test account is configured in `.env`:

```sh
E2E_SUPABASE_EMAIL=...
E2E_SUPABASE_PASSWORD=...
E2E_SUPABASE_WRITES=1     # lets tests create and clean up their own quests
```

Then run `pnpm test:supabase`. Use `pnpm test:env` to see which test variables are set, without printing their values.

---

## Team

| | Main areas |
|---|---|
| **Matthew** | 3D quest map, traveller avatar and wardrobe, landing story, sign-in |
| **Eudale** | Multiplayer quests: hosting, joining, chat, live location, co-op stamps; place photos |
| **Shrey** | Place catalog and daily sync, passport and stamps, visa / entry check |
| **Hulbert** | AI itinerary prompts, weather, check-ins and XP, sidequests, place pages, dev panel |
| **Steven** | Supabase integration, onboarding, test suites and CI |
| **Kayra** | Layover planner, itinerary engine, mission page, public transport, Supabase integration |
