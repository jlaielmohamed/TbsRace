/**
 * TbsRace configuration.
 *
 * Replace the two Supabase placeholders before deploying. Only the public
 * anon key belongs here; never put a secret or service key in frontend code.
 */

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
export const SUPABASE_URL = 'https://nzqoihpxacdxntixucfn.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56cW9paHB4YWNkeG50aXh1Y2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NDcyNjksImV4cCI6MjEwODUyMzI2OX0.CiKfaiw99s_vfgPoTJYiFsu8kxIBKJef2bSvdXVC1V0';

// Only addresses on this domain may create an account or sign in.
// The same value is enforced in supabase/schema.sql by public.tbs_email_domain().
export const ALLOWED_EMAIL_DOMAIN = '@tbs.u-tunis.tn';

// ---------------------------------------------------------------------------
// App rules
// ---------------------------------------------------------------------------
// Every day boundary in the UI uses this timezone. Keep it in sync with
// public.app_timezone() in supabase/schema.sql.
export const TIMEZONE = 'Europe/Paris';

export const DAILY_GOAL_DEFAULT_MINUTES = 60;
export const MIN_SESSION_SECONDS = 60;
export const MAX_SESSION_SECONDS = 12 * 60 * 60;
export const LEADERBOARD_REFRESH_MS = 60_000;
export const TIMER_STORAGE_PREFIX = 'tbsrace.timer.';

export const SESSION_LENGTHS = Object.freeze([
  { minutes: 25, label: '25m' },
  { minutes: 45, label: '45m' },
  { minutes: 90, label: '1h 30m' },
  { minutes: 120, label: '2h' }
]);

// Level thresholds use effective study hours (total hours + bonus hours).
// Keep these values identical to v_thresholds in public.calculate_study_progress().
export const LEVELS = Object.freeze([
  { level: 1, name: 'Rookie', hours: 0 },
  { level: 2, name: 'Focused', hours: 10 },
  { level: 3, name: 'Grinder', hours: 30 },
  { level: 4, name: 'Scholar', hours: 75 },
  { level: 5, name: 'Master', hours: 150 },
  { level: 6, name: 'Legend', hours: 300 }
]);

// Modest level progress bonus. Total study time remains the main driver.
// These are mirrored in supabase/schema.sql; see README.md for the explanation.
export const GOAL_DAY_BONUS_HOURS = 0.25;
export const STREAK_DAY_BONUS_HOURS = 0.05;
export const MAX_LEVEL_BONUS_HOURS = 2;

// Stable subject colours. A subject always hashes to the same colour.
export const SUBJECT_COLORS = Object.freeze([
  '#d8b44a', // gold
  '#3ed19b', // green
  '#6b9df8', // blue
  '#ff7d67', // coral
  '#b59cff'  // lavender
]);

export const CLASS_COLORS = Object.freeze({
  Freshman: '#6b9df8',
  Sophomore: '#3ed19b',
  Junior: '#ff7d67',
  Senior: '#d8b44a'
});

export const CLASS_YEARS = Object.freeze([
  { value: 'Freshman', year: '1st year' },
  { value: 'Sophomore', year: '2nd year' },
  { value: 'Junior', year: '3rd year' },
  { value: 'Senior', year: '4th year' }
]);

export const PERIODS = Object.freeze(['today', 'month', 'all']);
