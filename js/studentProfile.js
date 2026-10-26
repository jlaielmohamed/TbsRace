import { supabase } from './supabaseClient.js';
import { toNumber } from './utils.js';

function normalizeProfile(data) {
  if (!data) return null;
  return {
    profileId: String(data.profile_id ?? ''),
    name: String(data.full_name ?? 'Student'),
    classYear: String(data.class_year ?? 'Freshman'),
    level: toNumber(data.level, 1),
    levelName: String(data.level_name ?? 'Rookie'),
    todaySeconds: toNumber(data.today_seconds),
    totalSeconds: toNumber(data.total_seconds),
    avatarPath: data.avatar_path ? String(data.avatar_path) : null,
    isYou: Boolean(data.is_you)
  };
}

/**
 * Public profile fields for another student. The database function returns only
 * the display name, class year, level, study totals and avatar path - never an
 * email, daily goal or other private account data.
 */
export async function getStudentProfile(profileId) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const id = String(profileId ?? '').trim();
  if (!id) {
    const error = new Error('Student profile is missing.');
    error.code = 'student_missing';
    throw error;
  }

  const { data, error } = await supabase.rpc('get_public_profile', {
    p_user_id: id
  });

  if (error) throw error;

  const profile = normalizeProfile(data);
  if (!profile) {
    const missing = new Error('Student profile was not found.');
    missing.code = 'student_not_found';
    throw missing;
  }
  return profile;
}
