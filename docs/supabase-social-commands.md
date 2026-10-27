# Supabase commands: Social Quests

Everything here runs in **Supabase → SQL Editor** (paste, then **Run**).
Replace `you@example.com` with the email of the account you're testing with.

---

## 1. Set up / update the database

Run these **in this order**. Run them again whenever `social.sql` changes (after a pull or merge).

| Step | File | What it does |
|---|---|---|
| 1 | `supabase/social.sql` | Tables, rules (RLS), functions and triggers for quests, chat, live location, co-op stamps. Safe to re-run. |
| 2 | `supabase/social_seed.sql` | Demo travellers **Mei, Arjun, Lina** and two demo quests. Clears the demo travellers' stamps. |

Open the file in VS Code, select all (Ctrl+A), copy, paste into the SQL Editor, Run.

**`social.sql` vs `social_seed.sql`:** `social.sql` changes how the database works (new functions/tables). `social_seed.sql` only resets the demo data. Error *"Could not find the function public.…"* → you need to re-run **`social.sql`**, not the seed.

If the app still says a function is missing right after running `social.sql`, refresh the API's cache:
```sql
notify pgrst, 'reload schema';
```

---

## 2. Demo quests expired? Re-run the seed

The demo quests are timed from the moment you run the seed (Mei's starts ~30 min later and lasts ~3 h; Lina's is ~9 h later).
When they've ended, just run **`social_seed.sql`** again.

Check what's open right now:
```sql
select title, status, capacity, sg_hhmm(starts_at) as starts, sg_hhmm(ends_at) as ends,
       jsonb_array_length(stops) as stops,
       (select count(*) from party_members m where m.party_id = p.id) as members
  from parties p
 where status <> 'closed' and ends_at > now()
 order by starts_at;
```

---

## 3. Start over with a fresh layover (wipe one account's plans)

Keeps the profile, XP, stamps and passport.

```sql
-- Leave any quest this account joined
delete from public.party_members
 where role = 'member'
   and user_id = (select id from auth.users where email = 'you@example.com');

-- Close any quest this account is hosting
update public.parties set status = 'closed', closed_at = now()
 where status <> 'closed'
   and host_id = (select id from auth.users where email = 'you@example.com');

-- Delete the trips and missions (mission legs go with them)
delete from public.trips
 where user_id = (select id from auth.users where email = 'you@example.com');
delete from public.missions
 where user_id = (select id from auth.users where email = 'you@example.com');
```

Then in the browser (signed in as that account), open DevTools (F12) → Console:
```js
localStorage.removeItem('zoot.activeMission'); location.href = '/plan'
```

---

## 4. Co-op stamps: test again

A co-op stamp only counts on **the first visit** to a place, for both people.
After one successful test, forget your stamp at that place:

```sql
delete from public.stamps
 where place_id = 'maxwell-food-centre'
   and user_id = (select id from auth.users where email = 'you@example.com');
```

(Re-running `social_seed.sql` already clears the demo travellers' stamps.)

### Make a demo traveller check in from SQL
Normally done with the 🤖 demo in the app (`dev_simulate`, which needs you signed in).
From the SQL Editor you can stamp for **Lina** (she joined stops 1–2 of Mei's quest) directly. The co-op trigger runs exactly as it does in the app:

```sql
insert into public.stamps (user_id, place_id, lat, lng, accuracy_m, xp)
select 'd0000000-0000-4000-8000-000000000003', id, lat, lng, 10, 70
  from public.places where id = 'maxwell-food-centre';
```

Demo traveller ids:

| Name | id |
|---|---|
| Mei (hosts Chinatown) | `d0000000-0000-4000-8000-000000000001` |
| Arjun | `d0000000-0000-4000-8000-000000000002` |
| Lina (in Chinatown, stops 1–2; hosts Gardens) | `d0000000-0000-4000-8000-000000000003` |

See co-op stamps:
```sql
select u.email, c.place_id, c.bonus_xp, c.notified, c.created_at
  from coop_stamps c join auth.users u on u.id = c.user_id
 order by c.created_at desc limit 20;
```

---

## 5. Demo actions (`dev_simulate`)

These run as **you** (`auth.uid()`), so use the 🤖 buttons in the app rather than the SQL Editor.

| Action | What it does | In the app |
|---|---|---|
| `guest_joins` | A demo traveller joins **your** open quest | Open-to-company sheet / your quest page: *Demo: a traveller joins* |
| `guest_leaves` | A demo guest leaves your quest | (none) |
| `chat` | A demo traveller sends a message | Chat drawer header 🤖 |
| `checkin` | A demo traveller really stamps (at the place you just stamped, else their current stop) | (none) |
| `locate` | Puts the demo travellers on the map near their stop | Map chip 🤖 (from 30 min before the meet-up) |

Turn the simulator off/on:
```sql
update app_config set value = '0' where key = 'dev_social';   -- off
update app_config set value = '1' where key = 'dev_social';   -- on
```

---

## 6. Safety: reports and blocks

```sql
-- Latest reports
select r.created_at, rep.email as reporter, bad.email as reported, r.reason, r.details
  from reports r
  join auth.users rep on rep.id = r.reporter_id
  join auth.users bad on bad.id = r.reported_id
 order by r.created_at desc limit 20;

-- Who has this account blocked?
select u.email as blocked
  from blocks b join auth.users u on u.id = b.blocked_id
 where b.blocker_id = (select id from auth.users where email = 'you@example.com');

-- Unblock everyone for this account (testing)
delete from blocks
 where blocker_id = (select id from auth.users where email = 'you@example.com');
```

---

## 7. Stuck quest? Close it

```sql
-- Close every open quest this account hosts (guests go back to their own plan)
update parties set status = 'closed', closed_at = now()
 where status <> 'closed'
   and host_id = (select id from auth.users where email = 'you@example.com');
delete from party_members
 where role = 'member'
   and party_id in (select id from parties where status = 'closed');
```

---

## Notes

- **Never paste keys** from `.env` into SQL or commit them.
- The SQL Editor runs as an admin, so it ignores the access rules (RLS). The app always goes through them.
- The demo accounts (`mei@zoot.demo`, …) have no password and can't sign in.
