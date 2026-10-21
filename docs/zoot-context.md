# Zoot! background
- App: gamified planner for travellers with 6–14h layovers in Singapore. Core promise is "time-safe": every plan is built around the user's return-by time, and the planner refuses rather than guesses when a window is too tight.
- Core pitch: decision paralysis under time pressure makes people waste a layover. Zoot turns the itinerary into a quest on a 3D map (MapLibre + Three.js), with XP, stamps, and a passport.
- My part (Eudale): Social Quests and Messaging. Teammates own the map, passport, itinerary AI (Gemini + Turf.js fallback), weather, and auth/DB. Don't refactor their areas; integrate with them.
- Design philosophy: simple beats clever. I rejected an earlier design (request/approve, lobby, ready-check, shared group deadline, crews) as too complicated. Prefer fewer screens, fewer options, deterministic logic over AI, and code that's easy to explain in a school demo.
- Constraints: school project assessed by teachers; demo is live with one account, so seed data for multiplayer is needed; mobile-first (users are in an airport); style guide: Sunshine #F5D547, Butter #FDE98A, Cloud #FFF6D8, Ink #1A1A1A, Quest Pink #E8457A, Fredoka + Poppins.
- Safety: public meeting points only; hidden stops must be hidden server-side; live location only while joined.
