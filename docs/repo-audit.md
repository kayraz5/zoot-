# Repo audit for Social Quests

Audited against [social-quests-spec.md](social-quests-spec.md) and [zoot-context.md](zoot-context.md) on branch `eudale-missions-social`.

**State of the code**
- `origin/main` is the same GitHub repo (`kayraz5/zoot-`), 11 commits ahead of this branch: map pins, passport pages, and Steven's own `updateProfile` fix.
- **This branch has uncommitted Phase 1–2 social work** built on the older request/approve design (§2).
- **`supabase/social.sql` from that work has already been run on the team's Supabase project.**

Visual style: follow the existing `src/view/styles/app.css` (`--zt-*` tokens), not the colours in the spec (decided by Eudale).

---

## 1. What already exists that the spec touches

### Database (Supabase)

**`supabase/schema.sql`** (Kayra/Steven, committed):

| Table | Relevant columns | RLS |
|---|---|---|
| `profiles` | `display_name`, `style`, `xp` (guarded by a trigger: only RPCs can change it), `cover_color`, `avatar_seed`, `is_verified`, `home_city` | anyone signed in can read; owner edits |
| `places` | catalog (396 rows), `lat`/`lng`, `area` | public read |
| `trips` | `origin_*`, `start_at`, `must_return_at` | own rows |
| `missions` | `payload_json` (**the whole itinerary object**), `trip_id`, `title` | own rows |
| `mission_legs` | `seq`, `kind` (`visit`/`return`), `place_id`, `arrive_at`, `depart_at`, `status`, `xp` | own rows (via mission) |
| `stamps` | `user_id`, `place_id`, `mission_id`, `lat`/`lng`, `xp`, `stamped_at` | read own; **no insert policy** (only `stamp_place()` can insert) |
| `parties`, `party_members`, `messages` | the "P1" social scaffold: host, `capacity`, `status`; member `role` + `approved`; `messages.party_id`, `body` | browse, request/approve and member-only chat policies |
| `app_config` | `dev_fake_gps` flag | public read |

- `messages` is already in the `supabase_realtime` publication.
- **`stamp_place()` RPC:** re-checks every check-in on the server (80 m radius, 120 m when accuracy is poor, rejects accuracy over 150 m unless fake GPS is allowed, one stamp per place per Singapore day), takes the XP from the caller's own `mission_legs` row, adds it to `profiles.xp`, and bumps `passport_pages`.
- **`award_return_bonus()` RPC:** adds the on-time return XP, capped at 100.
- `supabase/passport_pages.sql` (on `origin/main`): adds `slammed_areas` and similar columns.

**`supabase/social.sql` + `social_seed.sql`** (mine, uncommitted, **already applied to the live project**):
- Extends the scaffold for request/approve plus a shared deadline (see §2).
- Adds `blocks`, `reports`, `party_locations` and `demo_users`, with RLS.
- Adds `dev_simulate()` and `delete_quest()`.
- Seeds Mei, Arjun and Lina (`d0000000-…`), plus two demo quests.

### Itinerary data shape
- **Built by:** `src/model/services/planner.js` `assembleMission()`. **Stored by:** `src/model/stores/mission.js` → `persist()` → `getDb().saveMission()`.
  - Guest: `localStorage['zoot.missions']`.
  - Supabase: `missions.payload_json`, plus one `mission_legs` row per leg (`src/model/services/db/remote.js` `saveMission`).
- **Mission:** `{ id, trip_id, title, style, origin: { id, label, kind, lat, lng }, start_iso, must_return_iso, buffers: { exit_min, reentry_min, safety_min }, legs[], buffer_min, total_out_min, prefs, source, replans, edits }`
- **Visit leg:** `{ seq, kind: 'visit', place_id, name, area, lat, lng, indoor, arrive_iso, depart_iso, stay_min, travel_mode, travel_min, travel_detail, xp, status: 'pending'|'stamped'|'skipped', why, sidequest? }`
  - `arrive_iso`–`depart_iso` is the time spent **at** the stop.
  - Travel to the stop is `travel_min`, taken out of the gap before it.
- **Return leg:** `{ kind: 'return', arrive_by, … }`. Two different "return-by" times exist:
  - `must_return_iso`: the gate/boarding time the user typed in.
  - `returnLeg.arrive_by` = `must_return` − re-entry − safety: when they must be **back at the airport**. This matches "Airport 23:15" in the spec's worked example.
- **Editing:** `mission.editLegs()` (`mission.js:168`) is used by `addStop`, `swapStop`, `removeStop`, `moveStop` and `changeStay`. It **re-times every leg** through `planner.retimeMission()` after each edit.

### Stores (`src/model/stores/`)
- `mission.js`: active mission, `nextLeg`, `stamp()`, `replan()`, edits, `here()`, sidequests.
- `trip.js`: plan form draft.
- `user.js`: session and profile; `userId`, `isAuthed`.
- `passport.js`: stamps, `addStamp()`, chops, passport pages (larger on `origin/main`).
- `ui.js`: toasts, `celebrate()`, weather, `loadAdvisories`.
- `party.js`: **mine, uncommitted**. Replaced the empty placeholder; holds open quests, quest detail, requests, publish, delete, simulate.
- `counter.js`: unused Vue template leftover.

### Routes (`src/controller/router/index.js`)
- Existing: `/`, `/auth`, `/onboard`, `/plan`, `/mission(/:id)`, `/map` (`3D_Map.vue`), `/place/:id`, `/passport`, `/codex`, `/me`, `/swipe`, `/dev`.
- **Mine, uncommitted:**
  - `/quests`, `/quests/requests`, `/quests/:id`
  - `/party/:id?` redirecting to `/quests`
  - a Quests tab in `src/view/components/AppNav.vue`

### Components and views
- **Existing, reusable:** `UserAvatar`-style avatar CSS in `ProfileView.vue`, `TimeToGate`, `BufferBar`, `StopGallery` (place photos), `PlaceArt`, `PlacePicker`, `WeatherChip`, `StampCelebration`, `ToastHost`.
- **Mine, uncommitted:**
  - Components: `UserAvatar`, `MemberAvatarStack`, `ProfilePreviewModal`, `DeadlineChip`, `QuestCard`, `JoinRequestCard`, `OpenToCompanySheet`.
  - Views: `QuestsView`, `QuestDetailView`, `QuestRequestsView`.
  - Data: `src/model/services/social.js`.
- **Map:** `src/view/views/3D_Map.vue` (Matthew's, with my mission wiring: route, check-in ring, stop card `#CenterInfo`, Demo-Walk), plus `src/view/map/questLayers.js` and `src/model/services/walkRoute.js`. `origin/main` adds 3D pins (`gl/pinPoint.js`, `components/placeMarker.js`).

### Check-ins and XP
- **Client pre-check:** `src/model/services/checkin.js` `checkInStatus()`, using radius rules from `config.js` `CHECKIN`.
- **Flow:**
  - `mission.stamp(leg)` → `db.stampPlace()`.
  - Guest (`db/local.js`): checks locally and adds XP in `localStorage`.
  - Supabase (`db/remote.js`): calls the `stamp_place` RPC (server-verified), then re-reads the profile.
  - Then `passport.addStamp()` (first chop in an area), the leg becomes `stamped`, and `ui.celebrate()` runs.
- **Levels:** `src/model/services/xp.js` `levelFor()` (100·n² curve) and `titleFor()`.
- **No co-op concept anywhere yet.**

### Test setup
- `vitest.config.js` (jsdom) with `pnpm test:unit`. The only test is `src/__tests__/App.spec.js`. Good fit for the join-resolution unit tests.

---

## 2. Where the repo conflicts with the spec

All of these are **my own uncommitted Phase 1–2 work**, built before this spec. Nothing committed by teammates conflicts.

| Spec says | Repo has | Where |
|---|---|---|
| No requests/approval page | Request → host approve/decline flow | `social.sql` `request_to_join()`, `respond_to_request()`, `party_members.status` (`requested`/`declined`); `QuestRequestsView.vue`, `JoinRequestCard.vue`, `social.js` `listRequests`/`respondToRequest`/`watchMembers` |
| No lobby / ready-check | Ready flag; all-ready starts the quest | `social.sql` `set_ready()`, `refresh_party()` start logic, `guard_party_member()` ready rules, `party_members.ready`; Phase 3 plan |
| No shared group deadline | `parties.return_by` = earliest approved member's return-by | `social.sql` `refresh_party()`, `post_deadline_warning()`; `DeadlineChip.vue`, `QuestCard.vue`, `QuestDetailView.vue` copy |
| Host's airport and return-by hidden from guests (server-side) | Host's `return_by` stored on `parties` (readable by anyone browsing) and on the host's `party_members` row | `social.sql`, `social.js` `publishQuest` |
| Host picks ONE consecutive window (two handles) | Host picks a meeting stop; the group gets every stop from there to the end | `OpenToCompanySheet.vue`, `social.js` `publishQuest` |
| Unit of joining is a stop range | Join = whole quest | everywhere above |
| Instant join, max 2–4 | Approval required; capacity 2–4 ✓ | `request_to_join`, `parties_capacity_check` ✓ |
| Join changes the guest's plan (remove overlapping stops, nothing re-timed) | Joining never touches the guest's mission; existing hand edits always re-time | `mission.editLegs()` → `retimeMission()` (`mission.js:168`) would move stops, which the spec forbids |
| Crew Lobby cut | Not built (was Phase 6) | n/a |
| Chat = drawer per joined window | Planned as a full `/quests/:id/chat` page | plan only |

**Not a conflict, but needs a decision:** the `party` / `parties` names stay as the database names (the spec doesn't name tables).

---

## 3. Reuse, delete, missing

### Reuse (adapt)
- **Tables:** `parties`, `party_members`, `messages`, `blocks`, `reports`, `party_locations`, `demo_users`.
  - `parties.stops` becomes **the open window only**. Stops outside it never reach the server, which is the strongest form of server-side hiding.
  - `party_members` gets a joined range (`from_seq`, `to_seq`).
- **SQL helpers:** `is_party_member`, `is_party_host`, `is_blocked_between`, `post_system`, `sg_hhmm`, `delete_quest`, the `parties_before_insert` checks (meeting point = first window stop, always a catalog place), `dev_simulate()` (new actions), `quest_roster()` (for "who's going").
- **Front end:**
  - `social.js`: `sb()`, `GuestModeError`, profiles, `windowFit()` (becomes rule 4).
  - `party.js` store skeleton.
  - `UserAvatar`, `MemberAvatarStack`, `ProfilePreviewModal`.
  - `QuestCard` (minus deadline), `QuestsView` (feed and filters), `QuestDetailView` (layout).
  - `OpenToCompanySheet` (swap the meeting picker for the range selector).
  - The Quests tab and `/quests`, `/quests/:id`.
- **Map:** `3D_Map.vue` `#CenterInfo` (where the HUD chip goes), `stamp_place()` (add co-op), `checkin.js`, `StampCelebration`.

### Delete
- `QuestRequestsView.vue`, `JoinRequestCard.vue`, the `/quests/requests` route, and the Requests button in `QuestsView`.
- `DeadlineChip.vue` as a *group* deadline. It could come back as "your own back-by" on the confirm sheet, or be deleted.
- **SQL:** `request_to_join`, `respond_to_request`, `set_ready`, `post_deadline_warning`, the ready and shared-deadline logic in `refresh_party`, the status/ready rules in `guard_party_member`, `parties.return_by`, and `party_members.ready` / `return_by` / `requested`/`declined`.
  - Needs a migration that **drops** them, because they're live in Supabase.
- **Seed:** Arjun's "approved" member row and the shared-deadline demo. Re-seed per the new spec.
- `src/model/stores/counter.js` (unused; not mine, so ask the team).

### Missing
1. **Join-resolution function:** pure, with Vitest tests for the 4 worked examples, rules 1–7, and the restore-on-leave rule.
2. **Range selector component:** two handles, consecutive only. Used by both the host and the guest.
3. **Applying a join to the guest's mission without re-timing:** a new mission-store action that inserts "with <host>" fixed blocks, removes stops, remembers what it removed, and restores them on leave. It can't reuse `editLegs()`, because that re-times everything.
4. **Join/leave on the server:** an instant `join_window(party, from_seq, to_seq)` that checks capacity, the range, blocks and closed quests. A guest can only ever read window stops.
5. **Guest confirm sheet:** what's replaced and kept, plus the red warning (rule 5).
6. **Map HUD chip** ("With <host> until HH:MM / Your plan resumes: …"), a **Go solo** button, and **auto-return** when the window ends.
7. **Chat drawer:** Realtime, quick-reply chips, system messages, report/block.
8. **Co-op XP:** `stamp_place()` gives +20% and a co-op flag when another member has stamped the same place in the window; a co-op stamp in the passport.
9. **Live location** for joined members only (`party_locations` table exists; nothing writes to it yet).
10. **New seed:** 3 fake users and 1 open quest with a window, plus `dev_simulate` actions (a fake guest joins my window, fake chat, fake check-in) for one-account demos.

---

## 4. Open questions

1. **Rewrite or patch?** OK to rewrite `social.sql` as a migration that **drops** the request/approve and deadline pieces already live in Supabase? It only affects demo data.
2. **"Airport time" for rule 4:** I'd use the guest's `returnLeg.arrive_by` (when they must be back at the airport, like the spec's "Airport 23:15"), not the gate time. OK?
3. **Travel to Changi:** the spec says a flat ~45 min, but the app can compute it (`travel.js`, e.g. 52 min from Chinatown to T3). Flat 45 for now, as the spec says, or the real number?
4. **Gap rule:** "gap under 15 min" between an own stop's end and the block's start (or the block's end and the next stop's start). Measured stop-to-stop, ignoring travel time, as in the worked examples?
5. **Host re-plans after opening the window:** freeze the window as published (recommended; the host can close and reopen it), or keep it in sync?
6. **One window at a time:** can a guest join only one host's window at a time, and can a host also join someone else's window?
7. **Co-op timing:** if A stamps first and B stamps second at the same stop, does only B get the +20%, or should A get it retroactively when B arrives? Retroactive is fairer but more complex.
8. **What guests see of each other:** is joined range plus avatar enough on the quest detail page ("Mei · stops 2–3")?
9. **Window end:** when the last joined stop's `depart_iso` passes, the guest is automatically back on their own plan, and their chat drawer becomes read-only. Correct?
10. **`counter.js` and the `parties` naming:** leave both alone (not mine / works fine)?
