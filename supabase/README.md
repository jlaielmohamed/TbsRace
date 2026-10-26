# TbsRace database

Everything the app needs in Postgres is in [`schema.sql`](./schema.sql). Run the whole file once in the **SQL Editor** of a fresh project. It is idempotent, so you can run it again after changing a mirrored constant or updating the schema.

The private `app-files` Storage bucket and its object policies are created in the Supabase dashboard, not by `schema.sql`. See [Storage](#storage).

For the full application setup, deployment and manual checklist, start with the [root README](../README.md).

---

## What the schema creates

### Tables

| Table | Purpose |
| --- | --- |
| `public.profiles` | Display name, class year, daily goal and profile-picture path for every auth user |
| `public.study_sessions` | Immutable completed study sessions |

`profiles.id` and `study_sessions.user_id` reference `auth.users(id)` with `on delete cascade`. Deleting a user therefore removes their profile, sessions and leaderboard presence. Storage objects are not deleted by a database cascade; remove them with the Storage API or the dashboard.

### Triggers on `auth.users`

| Trigger | Timing | Purpose |
| --- | --- | --- |
| `on_auth_user_created` | `after insert` | Creates the matching `profiles` row from sign-up metadata |

Any valid email address may register, including a normal Gmail account. There is no domain restriction and no email confirmation step, so `supabase/schema.sql` also drops the `enforce_tbs_email_domain_on_auth_users` trigger from older databases.

The profile trigger falls back to the local part of the email if no `full_name` metadata is present, trims the name to 80 characters and validates the class year.

### Other triggers

- `profiles_set_updated_at` maintains `profiles.updated_at`.

### Storage

The app uses one private bucket, **`app-files`**, for profile pictures and any future uploads. `schema.sql` does not create the bucket; configure it once under **Storage → Buckets**. The current project already has it.

#### Path convention

Every object must start with the signed-in user id:

```text
<auth.uid()>/<featureName>/<itemId>/<uuid>.<extension>
```

The current feature is the profile picture:

```text
<auth.uid()>/profile/<auth.uid()>/<uuid>.jpg
```

`js/storage.js` builds this path. A check constraint on `profiles.avatar_path` accepts only the user's own `/profile/` folder and a `.jpg`, `.jpeg`, `.png` or `.webp` suffix. Store the object path, never a public or signed URL.

#### Bucket and policies

Create the bucket with **Public bucket off**, then add five policies on `storage.objects` for `authenticated`. `(storage.foldername(name))[1]` is the first path segment, so it equals the owner's user id for a valid path:

```sql
create policy "TbsRace: read own app files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Profile pictures must be visible to every signed-in student, because they
-- appear on the leaderboard and public student profiles. A signed URL for
-- another user's object fails without this read policy.
create policy "TbsRace: read student profile pictures"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'app-files'
    and (storage.foldername(name))[2] = 'profile'
    and array_length(storage.foldername(name), 1) = 3
  );

create policy "TbsRace: insert own app files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "TbsRace: update own app files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "TbsRace: delete own app files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
```

If these policy names already exist, do not create duplicates. Policies are the security boundary; the path builder and check constraint are defence in depth. Set the bucket's file-size limit to **5 MB** to mirror the frontend check.

#### Display and deletion

- The bucket is private, so `getSignedFileUrl()` calls `createSignedUrl(path, 3600)` and the page displays that URL. The client caches signed URLs per page and refreshes them after expiry. The header, leaderboard and public student profile all use the same helper.
- **Upload:** upload the object → write `avatar_path` to `profiles` → delete the previous object. If the profile update fails, the new object is removed immediately.
- **Remove:** set `avatar_path = null` → delete the object. The database reference is cleared first so a failed Storage delete never leaves a broken image.
- `removeStoredFile(path, { userId })` refuses paths that do not start with the given user id.

#### Verify

Inspect references and the bucket:

```sql
select id, full_name, avatar_path
from public.profiles
where avatar_path is not null;

select name, owner, created_at
from storage.objects
where bucket_id = 'app-files'
order by created_at desc;
```

An orphan is an object with no matching `profiles.avatar_path`; remove it in **Storage → app-files**. Never delete an object while its path is still stored in a row.

### RPCs

| Function | Returns | Who can call it |
| --- | --- | --- |
| `public.get_my_progress()` | `jsonb` progress object | `authenticated` |
| `public.get_leaderboard(p_period text default 'today')` | `jsonb` leaderboard payload | `authenticated` |
| `public.get_public_profile(p_user_id uuid)` | `jsonb` public student profile or `null` | `authenticated` |
| `public.get_my_best_rank_this_month()` | `integer` or `null` | `authenticated` |
| `public.calculate_study_progress(uuid)` | `jsonb` internal helper | no API role |

`calculate_study_progress` is `security definer` because the leaderboard and public profiles need to calculate levels for other students. Execute is revoked from `public`, `anon` and `authenticated`; only the safe RPCs call it.

### RPC payloads

`get_my_progress()`:

```json
{
  "total_seconds": 12345,
  "total_hours": 3.43,
  "bonus_hours": 0.3,
  "effective_hours": 3.73,
  "level": 1,
  "level_name": "Rookie",
  "next_level": 2,
  "next_level_name": "Focused",
  "next_level_hours": 10,
  "hours_to_next": 7,
  "progress_percent": 37.3,
  "streak": 1,
  "goal_days": 1,
  "daily_goal_minutes": 60
}
```

`get_leaderboard('today')`:

```json
{
  "period": "today",
  "rows": [
    {
      "rank": 1,
      "profile_id": "00000000-0000-4000-8000-000000000001",
      "name": "Ada Lovelace",
      "level": 3,
      "seconds": 7200,
      "avatar_path": "00000000-0000-4000-8000-000000000001/profile/00000000-0000-4000-8000-000000000001/7c9e…jpg",
      "is_you": false
    }
  ],
  "you": {
    "rank": 4,
    "profile_id": "00000000-0000-4000-8000-000000000002",
    "name": "Grace Hopper",
    "level": 2,
    "seconds": 1800,
    "avatar_path": null,
    "is_you": true
  },
  "total_students": 42,
  "generated_at": "2026-10-25T10:00:00+00:00"
}
```

`you` is `null` when the caller has no session in the selected period. Rows include `profile_id` so the leaderboard can link to `pages/student.html?id=…`, and `avatar_path` so it can request a signed image URL. They never include emails or other private profile columns.

`get_public_profile('<profile uuid>')`:

```json
{
  "profile_id": "00000000-0000-4000-8000-000000000001",
  "full_name": "Ada Lovelace",
  "class_year": "Senior",
  "level": 3,
  "level_name": "Grinder",
  "today_seconds": 5400,
  "total_seconds": 123456,
  "avatar_path": "00000000-0000-4000-8000-000000000001/profile/00000000-0000-4000-8000-000000000001/7c9e…jpg",
  "is_you": false
}
```

The function returns `null` when the profile does not exist. It exposes only public identity and study totals; `daily_goal_minutes`, email addresses, account metadata and session rows stay private.

`get_my_best_rank_this_month()` returns the caller's best **daily** rank in the current local month, or `null` if they have not studied this month.

---

## Security model

- RLS is enabled on both tables.
- `profiles`: select/update only rows where `id = auth.uid()`. Students cannot insert profiles directly; the auth trigger does that with definer rights.
- `study_sessions`: select/insert only rows where `user_id = auth.uid()`. There is no update or delete policy, so history is immutable from the client.
- Table grants are column-scoped. This prevents changing `profiles.id`, `created_at`, `updated_at` or writing a session for another user even if a future policy were too broad. The writable profile columns are `full_name`, `class_year`, `daily_goal_minutes` and `avatar_path`.
- `app-files` is private. Its Storage policies restrict every write/delete to objects whose first path segment equals `auth.uid()`, while reads are allowed for the owner or for objects in a `/profile/` folder so students can see each other's pictures. The `profiles.avatar_path` check constraint enforces the `<id>/profile/<id>/<uuid>.<ext>` shape as a second layer.
- `anon` has no table privileges and no RPC execute privileges.
- The leaderboard, public-profile and best-rank functions are `security definer` but return only the public fields needed by the UI. The public profile exposes name, class year, level, today/all-time study time and avatar path - never the daily goal, email or session history.
- All definer functions pin `search_path = public, pg_temp`.

RLS is the security boundary. The frontend guard only decides where to send a signed-out visitor.

---

## Auth settings that must match the schema

In the Supabase dashboard:

1. **Authentication → Sign In / Providers → Email**: enabled.
2. **Confirm email** (on that same Email provider page, under the provider-specific settings): **disabled**. Sign-up must return a session immediately; the app redirects straight to the timer and no longer waits for a confirmation link.
3. **Minimum password length**: 8.
4. **Authentication → URL Configuration → Site URL**: your deployed origin.
5. **Redirect URLs**: every origin/path that can receive an email link, including:
   ```text
   http://localhost:8080/**
   https://YOUR-APP.onrender.com/**
   ```
6. **Google** (optional): enable the provider under **Sign In / Providers → Google** with a Google Cloud OAuth client whose authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
7. **SMTP**: configure a real provider before inviting students. The built-in sender is rate-limited. It is still needed for password reset emails.

The frontend requests these return paths:

- Password reset → `pages/reset-password.html`
- Google OAuth → `pages/timer.html` (session is read from the URL by `detectSessionInUrl`)

Make sure both are covered by the redirect allow list for every origin you use.

---

## RLS test

The full step-by-step test is in the [root README](../README.md#verify-rls-with-two-accounts). The core check is:

```sql
begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ACCOUNT_A_UUID>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select id, full_name from public.profiles;                                  -- only A
select count(*) from public.study_sessions where user_id = '<ACCOUNT_B_UUID>'; -- 0
select public.get_my_progress();
select public.get_leaderboard('today');
select public.get_public_profile('<ACCOUNT_B_UUID>'); -- public fields only
insert into public.study_sessions
  (user_id, subject, start_time, end_time, duration_seconds, planned_duration_seconds)
values
  ('<ACCOUNT_B_UUID>', 'RLS test', now() - interval '10 minutes', now(), 600, 600); -- must fail
rollback;
```

Find account ids with:

```sql
select id, email
from auth.users
order by created_at;
```

Then run the same block as `anon` and confirm that table reads and RPC calls are denied:

```sql
begin;
set local role anon;
select count(*) from public.study_sessions;
select public.get_leaderboard('today');
rollback;
```

Both statements should fail with permission-denied errors.

---

## Progress and ranking rules

### Timezone

All day, week and month boundaries use `Europe/Paris`. A session belongs to the local date of its **start time**. The timezone is defined in two places that must match:

- `public.app_timezone()` in `schema.sql`
- `TIMEZONE` in `js/config.js`

`AT TIME ZONE` handles daylight-saving changes. If you change the timezone, historical groupings and rankings are recalculated in the new zone.

### Levels

Effective hours are total study hours plus bonus:

```text
bonus = min(2, goal_days × 0.25 + streak_days × 0.05)
effective = total_hours + bonus
```

Thresholds, names and next-level progress are defined in `public.calculate_study_progress()`:

| Level | Name | Effective hours |
| --- | --- | --- |
| 1 | Rookie | 0 |
| 2 | Focused | 10 |
| 3 | Grinder | 30 |
| 4 | Scholar | 75 |
| 5 | Master | 150 |
| 6 | Legend | 300 |

`progress_percent` is calculated inside the current level band, not against the absolute 300-hour top. Level 6 always reports 100% and has no next level.

### Streak and goal days

- A **goal day** is a local day with total saved seconds at or above `daily_goal_minutes × 60`.
- A **streak day** is a local day with at least one session. The streak walks backwards from today; if today has no session yet, yesterday can anchor it because today is not over.
- Both are recalculated from the immutable session history each time progress is requested.
- If a student edits `daily_goal_minutes` on the **Edit profile** page, historical goal days are recalculated using the current goal.

### Leaderboard

1. Aggregate seconds per student within the selected period.
2. Keep only students with at least one second.
3. Rank by seconds descending, then earliest `max(end_time)`, then `user_id`.
4. Return the top 10 and the caller's own row separately.
5. `total_students` is the number of profile rows, i.e. registered students.

The best monthly rank is computed by ranking each local day separately this month and taking the caller's best position. Only days with at least one session participate.

---

## Changing product constants

The database is the source of truth for progress, bonus and ranking. Change both sides, then rerun the relevant SQL.

| Change | Frontend | Database |
| --- | --- | --- |
| Email restriction | `ALLOWED_EMAIL_DOMAIN` (empty = any address) | none by default; see below |
| Timezone | `TIMEZONE` | `public.app_timezone()` |
| Daily goal default | `DAILY_GOAL_DEFAULT_MINUTES` | `public.daily_goal_default_minutes()` |
| Level thresholds/names | `LEVELS` | arrays in `public.calculate_study_progress()` |
| Goal-day bonus | `GOAL_DAY_BONUS_HOURS` | `public.goal_day_bonus_hours()` |
| Streak-day bonus | `STREAK_DAY_BONUS_HOURS` | `public.streak_day_bonus_hours()` |
| Bonus cap | `MAX_LEVEL_BONUS_HOURS` | `public.max_level_bonus_hours()` |
| Profile-picture limit | `MAX_IMAGE_BYTES` in `js/storage.js` | `app-files` bucket file-size limit |

After editing `schema.sql`, either rerun the whole file or run only the changed `create or replace function` statements. Rerunning the whole file is safe; it does not drop data.

`ALLOWED_EMAIL_DOMAIN` is empty by default, so the client accepts any email address (Gmail included) and the database enforces no domain. If you ever want a domain restriction again, set the constant in `js/config.js` and add a `before insert or update of email` trigger on `auth.users` that rejects other domains; the frontend check alone is only a convenience.

---

## Maintenance

### Reload the PostgREST schema cache

After adding or changing functions in the SQL Editor, PostgREST usually notices. If the API still returns “function not found” or a stale signature, run:

```sql
notify pgrst, 'reload schema';
```

Then reload the page.

### Inspect progress for a user

```sql
select public.calculate_study_progress('<USER_UUID>');
```

This is only for the SQL Editor, which runs as the database owner; API roles cannot execute it.

### Check leaderboard output without the UI

```sql
begin;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<USER_UUID>', 'role', 'authenticated')::text,
  true
);
set local role authenticated;
select jsonb_pretty(public.get_leaderboard('month'));
rollback;
```

Confirm the JSON has no emails, daily goals or session rows. The only id is `profile_id`, which the leaderboard needs to link to a public profile.

### Clean up test accounts

Delete them in **Authentication → Users**. Cascading foreign keys remove profiles and sessions. Alternatively:

```sql
delete from auth.users where email in ('test-a@gmail.com', 'test-b@gmail.com');
```

Only do this for accounts you own.

### Development reset (destructive)

This deletes all profiles and sessions. Use it only on a throwaway project.

```sql
drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.get_my_best_rank_this_month();
drop function if exists public.get_public_profile(uuid);
drop function if exists public.get_leaderboard(text);
drop function if exists public.get_my_progress();
drop function if exists public.calculate_study_progress(uuid);
drop function if exists public.set_updated_at();
drop function if exists public.handle_new_user();

drop table if exists public.study_sessions;
drop table if exists public.profiles;

drop function if exists public.max_level_bonus_hours();
drop function if exists public.streak_day_bonus_hours();
drop function if exists public.goal_day_bonus_hours();
drop function if exists public.daily_goal_default_minutes();
drop function if exists public.app_timezone();
-- Left over from older databases that enforced an email domain.
drop function if exists public.enforce_tbs_email_domain();
drop function if exists public.tbs_email_domain();
```

Then run `schema.sql` again. Existing auth users will not automatically get profiles until you backfill them; the root README includes a backfill query. Storage objects in `app-files` are not removed by dropping these tables; empty the bucket separately in the dashboard if you are throwing the project away.

---

## Common database errors

| Message | Likely cause | Fix |
| --- | --- | --- |
| `Only @tbs.u-tunis.tn email addresses may create a TbsRace account.` | An older database still runs the removed domain trigger | Rerun `supabase/schema.sql`; it drops the trigger |
| `Database error saving new user` | Auth insert failed inside a trigger | Check Postgres/Auth logs; rerun `schema.sql`; verify the profile trigger exists |
| `new row violates row-level security policy` | A client tried to write another user's row or upload outside its own Storage folder | Expected. Keep RLS on; do not add update/delete policies for sessions, and keep the `auth.uid()` folder check on `app-files` |
| `Bucket not found` | The `app-files` bucket is missing or renamed | Create it under **Storage → Buckets**; do not change `STORAGE_BUCKET` unless you deliberately rename it |
| `Payload too large` / maximum size exceeded | The image is over the frontend or bucket limit | Choose an image under 5 MB; raise both `MAX_IMAGE_BYTES` and the bucket limit if the product rule changes |
| A profile photo uploads but the image is blank | The bucket is private and the signed URL or CSP is failing | Add the Storage `select` policies (own files and `/profile/` pictures), and keep `img-src ... https://*.supabase.co` in the CSP |
| `permission denied for table study_sessions` | Anonymous role or missing grant | Expected for `anon`; make sure the request is authenticated |
| `function public.get_leaderboard(text) does not exist` | Schema not applied or stale PostgREST cache | Run `schema.sql`; `notify pgrst, 'reload schema';` |
| `Your profile could not be found` | User predates the trigger or the trigger failed | Run the backfill query in the root README |
| `duration_seconds` check violation | Session duration longer than its wall-clock span, under 1 minute or over 12 hours | Fix the client state; do not relax the constraint without a reason |
| `Invalid leaderboard period` | RPC called with something other than `today`, `month`, `all` | Use one of those values |

---

## Notes

- `gen_random_uuid()` is provided by modern Postgres; no extension is required on Supabase.
- The schema assumes the standard Supabase roles `anon`, `authenticated` and `service_role`.
- Keep the `service_role` key out of the frontend and out of version control. It bypasses RLS and Storage policies.
- Timing is client-reported. The schema validates limits and ownership but is not a full anti-cheat system. See the security notes in the root README.
