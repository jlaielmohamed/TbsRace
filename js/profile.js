import { DAILY_GOAL_DEFAULT_MINUTES } from './config.js';
import { supabase } from './supabaseClient.js';
import { toNumber } from './utils.js';

let cachedProfile = null;
let cachedUserId = null;
let inflight = null;

const PROFILE_COLUMNS =
  'id, full_name, class_year, daily_goal_minutes, avatar_path, created_at';
const PROFILE_COLUMNS_WITHOUT_AVATAR =
  'id, full_name, class_year, daily_goal_minutes, created_at';

/** True when the database predates `profiles.avatar_path`. */
export function isMissingAvatarColumn(error) {
  if (!error) return false;
  const code = String(error.code ?? '').toUpperCase();
  const message = String(error.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (message.includes('avatar_path') &&
      (message.includes('does not exist') || message.includes('schema cache')))
  );
}

/**
 * Read the profile row. Before `schema.sql` adds avatar_path, fall back to the
 * previous column list so the rest of the app keeps working during rollout.
 */
async function readProfileRow(userId) {
  let result = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (isMissingAvatarColumn(result.error)) {
    result = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS_WITHOUT_AVATAR)
      .eq('id', userId)
      .maybeSingle();
  }

  return result;
}

export function clearProfileCache() {
  cachedProfile = null;
  cachedUserId = null;
  inflight = null;
}

async function currentUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

/**
 * Read the signed-in user's profile once per page. Concurrent callers share
 * the same request, and later calls use the cached row.
 */
export async function getProfile({ force = false } = {}) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const user = await currentUser();
  if (!user) throw new Error('Not signed in.');

  if (!force && cachedProfile && cachedUserId === user.id) return cachedProfile;
  if (!force && inflight && cachedUserId === user.id) return inflight;

  cachedUserId = user.id;
  inflight = (async () => {
    const { data, error } = await readProfileRow(user.id);

    if (error) throw error;
    if (!data) {
      const missing = new Error('Profile not found.');
      missing.code = 'profile_missing';
      throw missing;
    }

    cachedProfile = {
      ...data,
      full_name: String(data.full_name ?? '').trim(),
      class_year: data.class_year || 'Freshman',
      daily_goal_minutes: toNumber(data.daily_goal_minutes, DAILY_GOAL_DEFAULT_MINUTES),
      avatar_path: data.avatar_path || null
    };
    inflight = null;
    return cachedProfile;
  })();

  try {
    return await inflight;
  } catch (error) {
    inflight = null;
    throw error;
  }
}

export function getCachedProfile() {
  return cachedProfile;
}
