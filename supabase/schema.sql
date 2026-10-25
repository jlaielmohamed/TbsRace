-- ============================================================================
--  TbsRace - Supabase schema
--  ---------------------------------------------------------------------------
--  Run this whole file once in the Supabase SQL editor (or with `supabase db
--  push`). It is written to be safe to run again.
--
--  It creates:
--    * public.profiles and public.study_sessions
--    * Row Level Security policies (students can only read/write their own data)
--    * a trigger that creates a profile for every new auth user
--    * public.get_my_progress()      -> level, streak, bonus and total time
--    * public.get_leaderboard(text)  -> safe top 10 + the caller's own row
--    * public.get_my_best_rank_this_month()
--
--  Any valid email address may sign up (a normal Gmail account is fine); there
--  is no email-domain restriction and no confirmation step.
--
--  Values that must stay in sync with js/config.js:
--    timezone                 Europe/Paris
--    daily goal               60 minutes
--    levels                   0 / 10 / 30 / 75 / 150 / 300 hours
--    bonus                    0.25h per goal day, 0.05h per streak day, 2h cap
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Configuration helpers
-- ----------------------------------------------------------------------------

create or replace function public.app_timezone()
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'Europe/Paris'::text;
$$;

comment on function public.app_timezone() is
  'Single source of truth for the study-day timezone. Must match TIMEZONE in js/config.js.';

create or replace function public.daily_goal_default_minutes()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select 60;
$$;

create or replace function public.goal_day_bonus_hours()
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select 0.25::numeric;
$$;

create or replace function public.streak_day_bonus_hours()
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select 0.05::numeric;
$$;

create or replace function public.max_level_bonus_hours()
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select 2.00::numeric;
$$;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null
    constraint profiles_full_name_length check (char_length(btrim(full_name)) between 1 and 80),
  class_year text not null default 'Freshman'
    constraint profiles_class_year_valid check (class_year in ('Freshman', 'Sophomore', 'Junior', 'Senior')),
  daily_goal_minutes integer not null default public.daily_goal_default_minutes()
    constraint profiles_daily_goal_range check (daily_goal_minutes between 30 and 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Applies the configured default to databases created before it was a
-- function call, so re-running this file updates new profiles too.
alter table public.profiles
  alter column daily_goal_minutes set default public.daily_goal_default_minutes();

comment on table public.profiles is
  'Public identity used by the leaderboard. One row per auth user, created by trigger.';

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null
    constraint study_sessions_subject_length check (char_length(btrim(subject)) between 1 and 40),
  start_time timestamptz not null,
  end_time timestamptz not null,
  duration_seconds integer not null
    constraint study_sessions_duration_range check (duration_seconds between 60 and 43200),
  planned_duration_seconds integer not null
    constraint study_sessions_planned_range check (planned_duration_seconds between 60 and 43200),
  created_at timestamptz not null default now(),
  constraint study_sessions_time_order check (end_time > start_time),
  constraint study_sessions_duration_within_span check (
    duration_seconds <= floor(extract(epoch from (end_time - start_time))) + 1
  )
);

comment on table public.study_sessions is
  'One row per completed study session. Sessions are immutable once saved.';

comment on column public.study_sessions.duration_seconds is
  'Active study time, excluding paused time. 60s minimum, 12h maximum.';

comment on column public.study_sessions.planned_duration_seconds is
  'Length selected before the session started. Kept for reference and future analytics.';

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------

create index if not exists study_sessions_user_start_idx
  on public.study_sessions (user_id, start_time desc);

create index if not exists study_sessions_start_idx
  on public.study_sessions (start_time desc);

-- ----------------------------------------------------------------------------
-- 3. Triggers: profile creation and updated_at
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_class text;
begin
  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  if v_name = '' then
    v_name := btrim(split_part(coalesce(new.email, 'Student'), '@', 1));
  end if;
  if v_name = '' then
    v_name := 'Student';
  end if;
  v_name := left(v_name, 80);

  v_class := coalesce(new.raw_user_meta_data ->> 'class_year', '');
  if v_class not in ('Freshman', 'Sophomore', 'Junior', 'Senior') then
    v_class := 'Freshman';
  end if;

  insert into public.profiles (id, full_name, class_year)
  values (new.id, v_name, v_class)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- The old TBS-domain trigger is gone: any valid email address can register,
-- including a normal Gmail account. These statements remove it from databases
-- that were created by an earlier version of this file.
drop trigger if exists enforce_tbs_email_domain_on_auth_users on auth.users;
drop function if exists public.enforce_tbs_email_domain();
-- cascade only covers leftovers from very old versions of this file.
drop function if exists public.tbs_email_domain() cascade;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.study_sessions enable row level security;

-- Profiles: a student can read and edit only their own row. Inserts happen in
-- the security-definer trigger above, so students never insert profiles.
drop policy if exists "Profiles: read own" on public.profiles;
create policy "Profiles: read own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Profiles: update own" on public.profiles;
create policy "Profiles: update own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Sessions: a student can read and insert only their own sessions. There is
-- intentionally no update or delete policy, which keeps leaderboard history
-- immutable from the client.
drop policy if exists "Sessions: read own" on public.study_sessions;
create policy "Sessions: read own"
  on public.study_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Sessions: insert own" on public.study_sessions;
create policy "Sessions: insert own"
  on public.study_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 5. Table privileges
-- ----------------------------------------------------------------------------
-- RLS decides which rows are visible; grants decide which operations and
-- columns are available at all. This also prevents a student from changing
-- profile ids/created_at or writing sessions for somebody else.

revoke all on table public.profiles from public, anon, authenticated;
grant select (id, full_name, class_year, daily_goal_minutes, created_at, updated_at)
  on table public.profiles to authenticated;
grant update (full_name, class_year, daily_goal_minutes)
  on table public.profiles to authenticated;

revoke all on table public.study_sessions from public, anon, authenticated;
grant select (id, user_id, subject, start_time, end_time, duration_seconds,
              planned_duration_seconds, created_at)
  on table public.study_sessions to authenticated;
grant insert (user_id, subject, start_time, end_time, duration_seconds,
              planned_duration_seconds)
  on table public.study_sessions to authenticated;

grant usage on schema public to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Progress calculation
-- ----------------------------------------------------------------------------
-- Effective hours = total study hours + capped bonus.
-- Bonus = 0.25h per all-time goal day + 0.05h per current streak day, max 2h.
--
-- The function is security definer because the leaderboard needs to calculate
-- levels for other students. It is NOT executable by anon/authenticated; only
-- the safe RPCs below may call it.

create or replace function public.calculate_study_progress(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_timezone text := public.app_timezone();
  v_goal_minutes integer;
  v_total_seconds bigint := 0;
  v_total_hours numeric := 0;
  v_goal_days integer := 0;
  v_streak integer := 0;
  v_bonus numeric := 0;
  v_effective numeric := 0;
  v_level integer := 1;
  v_next_level integer;
  v_progress numeric := 0;
  v_hours_to_next numeric := 0;
  v_today date;
  v_expected date;
  v_day date;
  i integer;

  -- Keep these in the same order as LEVELS in js/config.js.
  v_level_names text[] := array['Rookie', 'Focused', 'Grinder', 'Scholar', 'Master', 'Legend'];
  v_thresholds numeric[] := array[0, 10, 30, 75, 150, 300];
begin
  if p_user_id is null then
    return null;
  end if;

  select coalesce(p.daily_goal_minutes, public.daily_goal_default_minutes())
    into v_goal_minutes
  from public.profiles p
  where p.id = p_user_id;

  v_goal_minutes := coalesce(v_goal_minutes, public.daily_goal_default_minutes());

  select coalesce(sum(s.duration_seconds), 0)::bigint
    into v_total_seconds
  from public.study_sessions s
  where s.user_id = p_user_id;

  v_total_hours := v_total_seconds::numeric / 3600;

  -- All-time days where the student reached their daily goal.
  select count(*)
    into v_goal_days
  from (
    select ((s.start_time at time zone v_timezone)::date) as day,
           sum(s.duration_seconds)::bigint as seconds
    from public.study_sessions s
    where s.user_id = p_user_id
    group by 1
  ) daily
  where daily.seconds >= v_goal_minutes * 60;

  -- Current streak: consecutive local days with at least one session. If
  -- today has no session yet, yesterday can still anchor the streak, because
  -- today is not over.
  v_today := (now() at time zone v_timezone)::date;
  v_expected := case
    when exists (
      select 1
      from public.study_sessions s
      where s.user_id = p_user_id
        and ((s.start_time at time zone v_timezone)::date) = v_today
    ) then v_today
    else v_today - 1
  end;

  for v_day in
    select distinct ((s.start_time at time zone v_timezone)::date) as day
    from public.study_sessions s
    where s.user_id = p_user_id
    order by day desc
  loop
    if v_day = v_expected then
      v_streak := v_streak + 1;
      v_expected := v_expected - 1;
    elsif v_day < v_expected then
      exit;
    end if;
  end loop;

  v_bonus := least(
    public.max_level_bonus_hours(),
    (v_goal_days * public.goal_day_bonus_hours())
      + (v_streak * public.streak_day_bonus_hours())
  );

  v_effective := v_total_hours + v_bonus;

  for i in 1..6 loop
    if v_effective >= v_thresholds[i] then
      v_level := i;
    end if;
  end loop;

  if v_level < 6 then
    v_next_level := v_level + 1;
    v_progress := round(
      greatest(
        0,
        least(
          100,
          ((v_effective - v_thresholds[v_level])
            / (v_thresholds[v_next_level] - v_thresholds[v_level])) * 100
        )
      ),
      1
    );
    v_hours_to_next := greatest(0, ceil(v_thresholds[v_next_level] - v_effective));
  else
    v_next_level := null;
    v_progress := 100;
    v_hours_to_next := 0;
  end if;

  return jsonb_build_object(
    'total_seconds', v_total_seconds,
    'total_hours', round(v_total_hours, 2),
    'bonus_hours', round(v_bonus, 2),
    'effective_hours', round(v_effective, 2),
    'level', v_level,
    'level_name', v_level_names[v_level],
    'next_level', v_next_level,
    'next_level_name', case when v_next_level is null then null else v_level_names[v_next_level] end,
    'next_level_hours', case when v_next_level is null then null else v_thresholds[v_next_level] end,
    'hours_to_next', v_hours_to_next,
    'progress_percent', v_progress,
    'streak', v_streak,
    'goal_days', v_goal_days,
    'daily_goal_minutes', v_goal_minutes
  );
end;
$$;

revoke all on function public.calculate_study_progress(uuid)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. RPC: current student's progress
-- ----------------------------------------------------------------------------

create or replace function public.get_my_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_progress jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Your profile could not be found.' using errcode = 'P0002';
  end if;

  v_progress := public.calculate_study_progress(v_uid);

  if v_progress is null then
    raise exception 'Your profile could not be found.' using errcode = 'P0002';
  end if;

  return v_progress;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC: leaderboard
-- ----------------------------------------------------------------------------
-- Ranking rules (must match the product copy):
--   1. most studied seconds in the period
--   2. the student who finished their last session earliest
--   3. user id, only to make the order deterministic
--
-- Only students with at least one session in the period are ranked. The
-- returned row exposes a display name, level and seconds - never an id/email.

create or replace function public.get_leaderboard(p_period text default 'today')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_period text := lower(btrim(coalesce(p_period, 'today')));
  v_timezone text := public.app_timezone();
  v_today date;
  v_start timestamptz;
  v_end timestamptz;
  v_rows jsonb := '[]'::jsonb;
  v_you jsonb := null;
  v_total_students integer := 0;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  if v_period not in ('today', 'month', 'all') then
    raise exception 'Invalid leaderboard period.' using errcode = '22023';
  end if;

  v_today := (now() at time zone v_timezone)::date;

  if v_period = 'today' then
    v_start := v_today::timestamp at time zone v_timezone;
    v_end := (v_today + 1)::timestamp at time zone v_timezone;
  elsif v_period = 'month' then
    v_start := date_trunc('month', v_today)::date::timestamp at time zone v_timezone;
    v_end := (date_trunc('month', v_today) + interval '1 month')::date::timestamp at time zone v_timezone;
  else
    v_start := null;
    v_end := null;
  end if;

  select count(*)::integer
    into v_total_students
  from public.profiles;

  with totals as (
    select s.user_id,
           sum(s.duration_seconds)::bigint as seconds,
           max(s.end_time) as finished_at
    from public.study_sessions s
    where (v_start is null or s.start_time >= v_start)
      and (v_end is null or s.start_time < v_end)
    group by s.user_id
    having sum(s.duration_seconds) > 0
  ),
  ranked as (
    select t.user_id,
           t.seconds,
           t.finished_at,
           (row_number() over (
             order by t.seconds desc, t.finished_at asc, t.user_id asc
           ))::integer as rank
    from totals t
  ),
  safe_rows as (
    select r.rank,
           r.user_id,
           r.seconds,
           coalesce(nullif(btrim(p.full_name), ''), 'Student') as name,
           coalesce((public.calculate_study_progress(r.user_id) ->> 'level')::integer, 1) as level
    from ranked r
    join public.profiles p on p.id = r.user_id
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'rank', sr.rank,
               'name', sr.name,
               'level', sr.level,
               'seconds', sr.seconds,
               'is_you', sr.user_id = v_uid
             )
             order by sr.rank
           ),
           '[]'::jsonb
         )
    into v_rows
  from safe_rows sr
  where sr.rank <= 10;

  select jsonb_build_object(
           'rank', sr.rank,
           'name', sr.name,
           'level', sr.level,
           'seconds', sr.seconds,
           'is_you', true
         )
    into v_you
  from (
    select r.rank,
           r.user_id,
           r.seconds,
           coalesce(nullif(btrim(p.full_name), ''), 'Student') as name,
           coalesce((public.calculate_study_progress(r.user_id) ->> 'level')::integer, 1) as level
    from (
      select t.user_id,
             t.seconds,
             t.finished_at,
             (row_number() over (
               order by t.seconds desc, t.finished_at asc, t.user_id asc
             ))::integer as rank
      from (
        select s.user_id,
               sum(s.duration_seconds)::bigint as seconds,
               max(s.end_time) as finished_at
        from public.study_sessions s
        where (v_start is null or s.start_time >= v_start)
          and (v_end is null or s.start_time < v_end)
        group by s.user_id
        having sum(s.duration_seconds) > 0
      ) t
    ) r
    join public.profiles p on p.id = r.user_id
    where r.user_id = v_uid
  ) sr;

  return jsonb_build_object(
    'period', v_period,
    'rows', v_rows,
    'you', v_you,
    'total_students', v_total_students,
    'generated_at', now()
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. RPC: best daily rank in the current month
-- ----------------------------------------------------------------------------

create or replace function public.get_my_best_rank_this_month()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_timezone text := public.app_timezone();
  v_today date;
  v_start timestamptz;
  v_end timestamptz;
  v_best integer;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  v_today := (now() at time zone v_timezone)::date;
  v_start := date_trunc('month', v_today)::date::timestamp at time zone v_timezone;
  v_end := (date_trunc('month', v_today) + interval '1 month')::date::timestamp at time zone v_timezone;

  with daily as (
    select ((s.start_time at time zone v_timezone)::date) as day,
           s.user_id,
           sum(s.duration_seconds)::bigint as seconds,
           max(s.end_time) as finished_at
    from public.study_sessions s
    where s.start_time >= v_start
      and s.start_time < v_end
    group by 1, 2
    having sum(s.duration_seconds) > 0
  ),
  ranked as (
    select d.day,
           d.user_id,
           (row_number() over (
             partition by d.day
             order by d.seconds desc, d.finished_at asc, d.user_id asc
           ))::integer as rank
    from daily d
  )
  select min(r.rank)::integer
    into v_best
  from ranked r
  where r.user_id = v_uid;

  return v_best;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. Function privileges
-- ----------------------------------------------------------------------------

revoke all on function public.get_my_progress() from public, anon;
revoke all on function public.get_leaderboard(text) from public, anon;
revoke all on function public.get_my_best_rank_this_month() from public, anon;

grant execute on function public.get_my_progress() to authenticated;
grant execute on function public.get_leaderboard(text) to authenticated;
grant execute on function public.get_my_best_rank_this_month() to authenticated;

-- Trigger functions and internal helpers are not callable from the API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ============================================================================
--  Done.
--
--  Next steps:
--    1. Authentication -> Providers -> Email: keep "Confirm email" OFF.
--    2. Authentication -> URL Configuration: set Site URL and redirect URLs
--       for your deployed domain (see README.md).
--    3. Test RLS with two real accounts (see README.md).
-- ============================================================================
