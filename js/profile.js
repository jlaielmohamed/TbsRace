import { DAILY_GOAL_DEFAULT_MINUTES } from './config.js';
import { supabase } from './supabaseClient.js';
import { toNumber } from './utils.js';

let cachedProfile = null;
let cachedUserId = null;
let inflight = null;

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
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, class_year, daily_goal_minutes, created_at')
      .eq('id', user.id)
      .maybeSingle();

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
      daily_goal_minutes: toNumber(data.daily_goal_minutes, DAILY_GOAL_DEFAULT_MINUTES)
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
