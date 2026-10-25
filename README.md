# TbsRace

A study tracker and friendly leaderboard for TBS students. Start a focus session, watch your time add up, keep a streak alive and see how you rank against the rest of the school.

TbsRace is a static site: plain HTML, CSS and JavaScript ES modules. There is no framework, bundler or build step. Supabase provides authentication, the Postgres database and row-level security; Render serves the files.

---

## What is included

- **Focus timer** with real-timestamp accuracy, background-safe ticking, reload restore, pause/resume, a visual and audible alert at the planned end, subject required, locked length during a session and automatic discard under one minute.
- **Calendar** with month and day views, a live day timeline, daily totals, goal progress and session details.
- **Levels** 1-6 (Rookie to Legend) with capped bonus progress, streak and goal-day stats.
- **Stats** for today, this week, this month and all time, plus a weekly chart, subject mix, best time of day, records and level progress.
- **Leaderboard** for today, this month and all time, with a safe top 10 and an isolated row for the signed-in student.
- **Auth** with email/password sign-up (Gmail or any other provider, no confirmation step), sign-in, password reset and persistent sessions.
- **Responsive, accessible dark UI** designed at 360, 768, 1024 and 1440 px, with 44 px touch targets wherever the layout allows (the dense calendar grid still clears the 24 px accessible minimum with clear spacing), safe-area padding, focus states, skip links and reduced-motion support.

---

## Project structure

```text
tbsrace/
├── index.html                  # tiny router: timer if signed in, otherwise sign in
├── pages/
│   ├── sign-in.html
│   ├── sign-up.html
│   ├── forgot-password.html
│   ├── reset-password.html
│   ├── timer.html
│   ├── calendar.html
│   ├── levels.html
│   ├── stats.html
│   └── leaderboard.html
├── css/
│   ├── base.css                # tokens, reset, typography, accessibility
│   ├── layout.css              # shell, header, navigation, containers
│   ├── components.css          # buttons, cards, forms, states, level widgets
│   └── pages/
│       ├── index.css
│       ├── auth.css
│       ├── timer.css
│       ├── calendar.css
│       ├── levels.css
│       ├── stats.css
│       └── leaderboard.css
├── js/
│   ├── config.js               # Supabase keys, timezone and product rules
│   ├── supabaseClient.js       # pinned CDN client, one shared instance
│   ├── utils.js                # dates, durations, escaping, colours
│   ├── ui.js                   # friendly errors, toasts, empty/error/loading states
│   ├── nav.js                  # shared header, mobile nav, account menu
│   ├── guard.js                # private-page guard and auth redirects
│   ├── profile.js
│   ├── progress.js
│   ├── sessions.js
│   ├── leaderboardData.js
│   ├── levelView.js
│   ├── env-check.js            # explains that file:// cannot run the app
│   ├── index.js
│   ├── auth.js
│   ├── timer.js
│   ├── calendar.js
│   ├── levels.js
│   ├── stats.js
│   └── leaderboard.js
├── assets/
│   ├── favicon.svg
│   └── apple-touch-icon.png
├── supabase/
│   ├── schema.sql              # tables, triggers, RLS, indexes and RPCs
│   └── README.md               # database-specific setup and test notes
├── render.yaml                 # optional Render Blueprint with security headers
├── serve.mjs                   # zero-dependency local web server
└── README.md
```

The Supabase JS client is pinned to `@supabase/supabase-js@2.49.8` from jsDelivr in `js/supabaseClient.js`. It is the only third-party JavaScript.

The original `TbsRace - Study Leaderboard Design.pdf` is kept at the project root as a design reference. The app does not load or depend on it.

---

## Quick start

### 1. Prerequisites

- A [Supabase](https://supabase.com) project.
- A [Render](https://render.com) account for deployment (the free static tier is enough).
- Node.js 18+ **or** any static file server for local testing. Opening the `.html` files directly with `file://` will not work because the app uses ES modules.

### 2. Prepare Supabase

1. Create a Supabase project and wait for the database to be ready.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it. It is safe to run again.
3. Go to **Authentication → Providers → Email** and make sure Email is enabled.
4. Go to **Authentication → Settings** and:
   - turn **Confirm email** **off** (this app signs students in immediately after sign-up),
   - set **Minimum password length** to `8`,
   - set **Site URL** to your production origin (for example `https://YOUR-APP.onrender.com`).
5. Under **Authentication → URL Configuration → Redirect URLs**, add every URL the app can return to:
   ```text
   http://localhost:8080/**
   https://YOUR-APP.onrender.com/**
   ```
   Replace the production origin with your real Render URL or custom domain. If you use a different local port, change it here too. These URLs are used by password reset links.
6. Password reset emails still need a working sender. Configure **custom SMTP** under **Authentication → SMTP Settings** for production; Supabase's built-in sender is rate-limited and not intended for a whole school.

Detailed database notes and an RLS test script are in [`supabase/README.md`](supabase/README.md).

### 3. Configure the frontend

Edit `js/config.js`:

```js
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

Use **Project Settings → API**:

- `SUPABASE_URL` is the Project URL.
- `SUPABASE_ANON_KEY` is the publishable/anon key. A legacy `anon` JWT or a newer `sb_publishable_...` key is fine.

Never put the `service_role` key, a database password or any other secret in this file. Everything in a static frontend is public.

While the placeholders are present, every page shows a setup notice instead of failing silently.

### 4. Run locally

From the project root:

```bash
node serve.mjs
```

Then open <http://localhost:8080/>. To use another port: `node serve.mjs 3000`.

Any equivalent static server works too, for example:

```bash
npx --yes http-server . -p 8080 -c-1
```

**Do not double-click `index.html`.** The app is built from ES modules, and browsers block module scripts and Supabase requests on `file://` URLs, so a double-clicked page cannot start. It must be served over HTTP. If you do open it from disk, the page now explains this instead of sitting on the loading screen.

Create two test accounts with any valid email addresses (a normal Gmail account works) and save a session with each.

---

## Configuration reference

All product rules live in `js/config.js` and are mirrored in `supabase/schema.sql`.

| Setting | Frontend | Database | Current value |
| --- | --- | --- | --- |
| Supabase URL | `SUPABASE_URL` | — | your project URL |
| Supabase public key | `SUPABASE_ANON_KEY` | — | your anon/publishable key |
| Email restriction | `ALLOWED_EMAIL_DOMAIN` | — | empty, so any valid email is accepted |
| Study-day timezone | `TIMEZONE` | `public.app_timezone()` | `Europe/Paris` |
| Default daily goal | `DAILY_GOAL_DEFAULT_MINUTES` | `public.daily_goal_default_minutes()` | `60` minutes |
| Level thresholds | `LEVELS` | arrays in `calculate_study_progress()` | 0 / 10 / 30 / 75 / 150 / 300 h |
| Goal-day bonus | `GOAL_DAY_BONUS_HOURS` | `goal_day_bonus_hours()` | `0.25` h |
| Streak-day bonus | `STREAK_DAY_BONUS_HOURS` | `streak_day_bonus_hours()` | `0.05` h |
| Bonus cap | `MAX_LEVEL_BONUS_HOURS` | `max_level_bonus_hours()` | `2` h |

**Important:** the database is the source of truth for levels, bonus, streaks and rankings. If you change a threshold or the timezone, update both the JavaScript and the SQL, then rerun `supabase/schema.sql` (or just the changed functions). Do not change only one side.

The daily goal default applies to **new** profiles. Existing rows keep whatever value they were created with, so after changing it run this once to bring everyone onto the new goal:

```sql
update public.profiles set daily_goal_minutes = public.daily_goal_default_minutes();
```

Sign-up accepts any valid email address, including a normal Gmail account. `ALLOWED_EMAIL_DOMAIN` is empty by default; setting it to a domain such as `@gmail.com` restricts the client-side check, but the database no longer enforces a domain, so treat that as a convenience rather than a security boundary.

### Timezone and day boundaries

Every “day”, “week” and “month” boundary is calculated in `Europe/Paris`, including in SQL. A session belongs to the local date of its **start time**, matching the Calendar and Stats pages. This rule is consistent across the database RPCs. DST changes are handled by `AT TIME ZONE`.

### Level and bonus rules

- **Effective hours** = total saved study hours + bonus hours.
- **Bonus hours** = `0.25 × all-time goal days + 0.05 × current streak days`, capped at `2 h`.
- A **goal day** is a local day whose saved study time is at least the daily goal.
- A **streak day** is a consecutive local day with at least one saved session. If today has no session yet, yesterday can still anchor the streak because today is not over.
- Level thresholds are `0, 10, 30, 75, 150, 300` effective hours. Level 6 has no next level and shows 100%.
- Progress to the next level is computed from effective hours *within* the current band, so bonus progress can move the bar without making raw study time irrelevant.

### Leaderboard rules

- Periods: `today`, `month`, `all` in `Europe/Paris`.
- Only students with at least one session in the period are ranked.
- Ranking: total seconds descending, then the earliest `max(end_time)` (the student who finished their latest session first), then `user_id` as a deterministic final tie-break.
- The RPC returns the **top 10** plus the caller's own row. Rows contain only `rank`, display name, level, seconds and `is_you`. No ids, emails or other profile fields are returned.
- The monthly “best rank” on the Stats page is the caller's best **daily** rank within the current month.

---

## Deploy to Render

> **Important:** create a **Static Site** (or use the Blueprint), never a **Web Service**. TbsRace is plain HTML, CSS and JavaScript, so it has no server to start. A Web Service form asks for a Start Command and refuses to deploy without one; that requirement does not apply here.

### Option A — Blueprint (recommended)

1. Push this folder to a Git repository.
2. In Render, choose **New → Blueprint**, connect the repository and apply it. `render.yaml` creates a static site named `tbsrace`.
3. The blueprint uses:
   - **Publish directory:** `.` (project root)
   - **Build command:** none
   - **Security headers:** CSP, nosniff, frame denial, referrer policy, permissions policy and HSTS
4. Wait for the deploy and open the generated `https://tbsrace-xxxx.onrender.com` URL.
5. Update Supabase **Site URL** and **Redirect URLs** with that exact origin, then redeploy if you changed `js/config.js`.
6. Optionally add a custom domain under **Settings → Custom Domains** and update the Supabase URLs again.

### Option B — Manual static site

1. In Render, choose **New → Static Site** and connect the repository.
2. Leave the **Build Command** empty.
3. Set **Publish Directory** to `.`.
4. Deploy.
5. Add the headers from `render.yaml` under the service's **Headers** settings if you are not using the Blueprint. The CSP is important: it must allow your Supabase project (`https://*.supabase.co` and `wss://*.supabase.co`), jsDelivr and Google Fonts.

No SPA rewrite is required. Every internal link includes `.html`, and Render serves `index.html` at `/`.

### After the first deploy

- [ ] Set the production URL in Supabase Site URL and Redirect URLs.
- [ ] Confirm the app loads without a setup notice.
- [ ] Sign up with a real email address (Gmail works) and land on the timer immediately.
- [ ] Sign in, save a session, reload the timer and verify it restores.
- [ ] Sign out and confirm private pages redirect to sign in.
- [ ] Run the two-account RLS test below.
- [ ] Check the browser console and network tab for CSP or 404 errors.

---

## Verify RLS with two accounts

RLS is the real security boundary. The UI guard only improves the experience.

1. Create **Account A** and **Account B**, both with valid email addresses.
2. Sign in as A and save a session. Sign in as B and save a different session.
3. In the Supabase SQL Editor, find their ids:
   ```sql
   select id, email
   from auth.users
   order by created_at;
   ```
4. Copy A's id into the block below and run it as one transaction. Replace `<A_UUID>` and `<B_UUID>`.

```sql
begin;

-- Pretend to be Account A for this transaction.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<A_UUID>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- 1. Only A's profile is visible; B's profile is not.
select id, full_name from public.profiles;

-- 2. Only A's sessions are visible. This must return 0.
select count(*) from public.study_sessions where user_id = '<B_UUID>';

-- 3. A can read their own progress and the safe leaderboard payload.
select public.get_my_progress();
select public.get_leaderboard('today');

-- 4. Inserting a session for B must fail with an RLS/privilege error.
insert into public.study_sessions
  (user_id, subject, start_time, end_time, duration_seconds, planned_duration_seconds)
values
  ('<B_UUID>', 'RLS test', now() - interval '10 minutes', now(), 600, 600);

rollback;
```

Expected: the profile query returns only A, the count is `0`, the RPCs return safe JSON, and the insert fails. The `rollback` discards everything, including the attempted insert.

5. Repeat with B's id. B must not see A's rows.
6. Check the anonymous role:

```sql
begin;
set local role anon;
select count(*) from public.study_sessions;          -- permission denied
select public.get_leaderboard('today');              -- permission denied
rollback;
```

7. Inspect the leaderboard JSON from step 4. It must contain only `rank`, `name`, `level`, `seconds`, `is_you` per row — never a user id or email.

If you need to clean up test accounts afterwards, delete them from **Authentication → Users**; the foreign keys cascade to `profiles` and `study_sessions`.

---

## Database overview

### `public.profiles`

One row per auth user, created automatically by an `after insert` trigger on `auth.users`.

| Column | Notes |
| --- | --- |
| `id` | `uuid`, primary key, references `auth.users(id)` on delete cascade |
| `full_name` | 1-80 characters after trimming |
| `class_year` | `Freshman`, `Sophomore`, `Junior` or `Senior` |
| `daily_goal_minutes` | 30-720, default 60 |
| `created_at`, `updated_at` | timestamps; `updated_at` is maintained by trigger |

### `public.study_sessions`

Immutable session history. Students can select and insert their own rows; there are deliberately no update or delete policies.

| Column | Notes |
| --- | --- |
| `id` | `uuid` primary key |
| `user_id` | owner, references `auth.users(id)` on delete cascade |
| `subject` | 1-40 characters after trimming |
| `start_time`, `end_time` | timestamptz; `end_time > start_time` |
| `duration_seconds` | 60-43,200; must not exceed the wall-clock span (+1 s tolerance) |
| `planned_duration_seconds` | 60-43,200; the length chosen before starting |
| `created_at` | server timestamp |

### RPCs

| Function | Returns | Access |
| --- | --- | --- |
| `get_my_progress()` | JSON progress object | `authenticated` only |
| `get_leaderboard(p_period text)` | JSON with `period`, `rows`, `you`, `total_students`, `generated_at` | `authenticated` only |
| `get_my_best_rank_this_month()` | integer or null | `authenticated` only |
| `calculate_study_progress(uuid)` | internal JSON helper | not executable by API roles |

The `p_period` value must be `today`, `month` or `all`; anything else raises a validation error.

---

## Pre-deployment checklist

### Configuration

- [ ] `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `js/config.js` are your real project values.
- [ ] No `service_role` key or other secret exists anywhere in the repository.
- [ ] `ALLOWED_EMAIL_DOMAIN` is empty unless you deliberately restricted sign-ups.
- [ ] `TIMEZONE` matches `public.app_timezone()` in the database.
- [ ] `LEVELS`, daily goal and bonus constants match their SQL counterparts.
- [ ] The Supabase JS CDN version is still `2.49.8` (or deliberately upgraded and retested).

### Supabase

- [ ] `supabase/schema.sql` ran without errors.
- [ ] Email provider is enabled and **Confirm email** is **off**.
- [ ] Minimum password length is 8.
- [ ] Site URL is the production origin.
- [ ] All local and production redirect URLs are allow-listed.
- [ ] Custom SMTP is configured for real users.
- [ ] RLS is enabled on both tables and the two-account test passes.
- [ ] The anonymous role cannot read tables or call the RPCs.
- [ ] Leaderboard JSON contains no ids or emails.
- [ ] Test accounts and their sessions have been removed.

### Render

- [ ] Static site publishes the repository root, with no build command.
- [ ] Security headers from `render.yaml` are active.
- [ ] The CSP allows your Supabase project, jsDelivr and Google Fonts.
- [ ] HTTPS works and the custom domain (if any) is verified.
- [ ] Supabase URLs were updated after the final domain was known.
- [ ] A password reset email returns to the deployed site.

### Product checks

- [ ] Sign-up rejects a malformed email address in the UI and accepts a normal Gmail address.
- [ ] Signing up lands directly on the timer with no email confirmation step.
- [ ] Sign-in, sign-out, forgot password and reset password all work.
- [ ] A refresh during a running timer restores the session and keeps counting.
- [ ] Finishing under one minute discards the session; finishing at or above one minute saves it.
- [ ] The plan-end alert is visible and audible (after the first user interaction unlocks audio).
- [ ] Calendar month/day views, timeline, Levels, Stats and all three leaderboard periods render.
- [ ] Empty, loading and error states are reachable and understandable.
- [ ] No console errors, broken imports or 404s.
- [ ] No horizontal page scroll at 360, 768, 1024 and 1440 px.
- [ ] Keyboard navigation, focus rings, skip link and screen-reader names work.
- [ ] Reduced-motion preference is respected.

---

## Troubleshooting

**Every page shows “Finish setting up TbsRace”.**
`js/config.js` still has placeholders, or the URL/key is malformed. Replace both values and hard-refresh.

**Sign-up returns “Database error saving new user”.**
The schema or its trigger is missing, or an older database still runs the removed TBS-domain trigger. Run `supabase/schema.sql` again (it drops that trigger) and check **Logs → Auth** / Postgres logs.

**Reset emails point to localhost.**
Supabase uses the **Site URL** and **Redirect URLs** settings, not the frontend config. Set the production origin and add the deployed `reset-password.html` URL.

**Sign-up succeeds but the student is not signed in.**
Supabase still has **Confirm email** enabled. Turn it off in **Authentication → Settings**; the app creates the account and expects an immediate session.

**“Your profile could not be found.”**
The `on_auth_user_created` trigger was added after the user was created. Backfill missing profiles:

```sql
insert into public.profiles (id, full_name, class_year)
select
  u.id,
  left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1), 'Student'), 80),
  case
    when u.raw_user_meta_data ->> 'class_year' in ('Freshman', 'Sophomore', 'Junior', 'Senior')
      then u.raw_user_meta_data ->> 'class_year'
    else 'Freshman'
  end
from auth.users u
on conflict (id) do nothing;
```

**The leaderboard RPC is missing or returns 404.**
The schema was not run, or PostgREST has a stale schema cache. Run `notify pgrst, 'reload schema';` in the SQL Editor and reload the page.

**The timer resets when I close the browser.**
Timer state is stored in `localStorage` per browser and device. Signing out clears it deliberately. Private browsing may also clear it.

**CSP blocks Supabase or fonts.**
Update the `Content-Security-Policy` in `render.yaml` (and in Render's dashboard if you are not using the Blueprint). `connect-src` must include your Supabase URL; `font-src` must include `fonts.gstatic.com`.

**Sessions appear on the wrong day.**
Day grouping uses the `Europe/Paris` start date, not the viewer's device timezone. Keep `TIMEZONE` and `public.app_timezone()` in sync. If you change the timezone, historical grouping and rankings are recalculated in the new timezone.

**A session is rejected as not matching its times.**
The database requires `duration_seconds` to fit inside `end_time - start_time` (plus one second), 60 seconds minimum and 12 hours maximum. This catches corrupted client state and obvious tampering; it is not a full anti-cheat system.

---

## Security notes and limitations

- **RLS is enabled** on `profiles` and `study_sessions`. Students can read and write only their own rows. Column grants also prevent changing ids, timestamps or other students' data.
- **Sign-up is open to any valid email address**, so there is no server-side domain check. RLS still keeps every student's data separate; use Supabase's Auth settings (rate limits, CAPTCHA) if you open the site to the public.
- **Leaderboard data is minimized** and computed by a `security definer` RPC. The client never receives another student's id or email.
- **Internal progress helper is not callable** by `anon` or `authenticated`.
- **Sessions are immutable** from the client: no update or delete policy exists.
- **Time is client-reported.** A determined student could insert a fabricated but internally consistent session for their own account. The schema validates shape and limits but cannot prove real-world focus. If cheating becomes a concern, add server-side session start/stop tokens or a moderation workflow.
- **No realtime subscription** for the leaderboard; it refreshes every 60 seconds and when the tab becomes visible.
- **Daily goal editing** is supported by the schema but there is no settings screen in this version; all profiles start at 60 minutes.
- **Static hosting** means there is no server-side rendering and no secrets in the frontend. That is intentional.

---

## License

Internal TBS project. All rights reserved. Do not redistribute outside TBS without permission.
