# Social Quests spec: Zoot!

## Context
Zoot! is a gamified layover planner for travellers with 6–14 hours in Singapore. Stack per the project: Vue 3 + Vite, Pinia, Bootstrap 5, Supabase (check the repo for what's actually used), Vercel. Style: Sunshine #F5D547, Butter #FDE98A, Cloud #FFF6D8, Ink #1A1A1A, Quest Pink #E8457A; Fredoka headings, Poppins body; cards 24–28px radius, 3px ink outline, hard 6px offset shadow. Mobile-first.

## Core idea
The unit of joining is a STOP, not a quest. A guest can join one stop (e.g. just dinner), several consecutive stops, or the whole open window. Nobody commits to a whole day. Everyone keeps their OWN return-by deadline (there is no shared group deadline).

## Host
- Host taps "Open to company" on their itinerary and picks ONE window of CONSECUTIVE stops with a range selector (two handles: from stop X to stop Y). Examples with stops 1–5: 1→3 OK, 3→5 OK, 1 alone OK; 1,2 and 4 is impossible (the range UI makes it impossible).
- Stops outside the window are hidden from guests, including the airport and return-by time. Host and guests coordinate the rest by message or in person.
- HIDING MUST BE ENFORCED SERVER-SIDE (the API/RLS must never return hidden stops to guests), not just in the UI.
- Options: max group size 2–4; instant join by default.

## Guest
1. Feed: open quests with a fit badge ("Fits your window" / "Ends after your return-by").
2. Quest detail: shows ONLY the open window's stops (name, area, time, who's going). The guest uses the same range selector to pick one stop or adjacent stops, or "Join the whole window".
3. One confirm sheet showing exactly what changes in their own plan: [Join & update my plan] / [Cancel].

## How joining changes the guest's itinerary (deterministic, one pass, NO silent reshuffle, NO extra options)
1. Joined stops become fixed-time blocks tagged "with <host>".
2. Remove any of the guest's own stops that overlap a fixed block.
3. Also remove a neighbouring own stop if the gap between it and the block is under 15 minutes (a flat constant for now; real travel time later).
4. Block the join if (window end + travel time to Changi, assume ~45 min) is after the guest's airport time; the button is disabled with "Ends too late for your flight".
5. If joining removes 2+ stops, or any stop of 2+ hours, show a red warning on the confirm sheet listing what's replaced and what's kept.
6. Nothing is moved to a new time; stops are only removed.
7. If the guest leaves, removed stops come back only if they still pass the same overlap and gap checks.

Worked example. Guest's plan: GBTB 13:30–16:30, Superpark 17:00–19:00, Dinner Esplanade 19:20–20:00, Drinks Paya Lebar 20:40–22:00, Airport 23:15.
- Join MBS 20:45–21:45 → Drinks removed (overlap); the rest kept.
- Join dinner 18:20–19:10 → Superpark removed (overlap) and Dinner Esplanade removed (10 min gap); the rest kept.
- Join 18:20–20:30 → Superpark, Dinner Esplanade, and Drinks (10 min gap) all removed.
- Join 15:00–18:00 → GBTB and Superpark removed.
Use these as unit-test cases for the join-resolution function.

## During the quest
- Map HUD chip: "With <host> until HH:MM", plus "Your plan resumes: <next stop>".
- Leaving: the window ending auto-returns the guest to their own plan; a manual "Go solo" button also exists. Proximity auto-leave is a stretch goal only.
- Co-op XP: stamps earned inside the window while at least one other member is checked in at the same stop get a co-op bonus (+20%) and a co-op stamp. Verify check-ins server-side.
- Members see each other's live location only while joined; it stops when they leave.

## Messaging
Keep it small: a chat drawer per joined window (not a full page), with quick-reply chips ("Running 5 min late", "I'm at the meeting point"), and system messages ("X checked in"). Report and block available. Public meeting points only.

## Explicitly cut
Requests/approval page, lobby, ready-check, shared group deadline, Crew Lobby. Persistent clans are pitch-slide only.

## Screens to build
1. Open Quests feed
2. Host: open-window range selector
3. Quest detail + guest range pick + confirm sheet
4. Map HUD co-op chip + chat drawer

## Suggested phases (stop after each and tell me what to test)
1. Data model + RLS (quests, open window, members, messages) with server-side hiding, plus seed data (3 fake users, 1 open quest) so I can demo multiplayer with one account.
2. Join-resolution function (pure, unit-tested with the examples above).
3. Host open-window UI + feed.
4. Quest detail + guest range pick + confirm sheet, wired to the resolver.
5. Map HUD chip, Go solo, window-end return to own plan.
6. Chat drawer with chips, then co-op XP.
