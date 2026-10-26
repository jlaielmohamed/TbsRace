import { PERIODS } from './config.js';
import { supabase } from './supabaseClient.js';
import { toNumber } from './utils.js';

function normalizeRow(row) {
  if (!row) return null;
  return {
    rank: toNumber(row.rank),
    name: String(row.name ?? 'Student'),
    level: toNumber(row.level, 1),
    seconds: toNumber(row.seconds),
    isYou: Boolean(row.is_you),
    profileId: row.profile_id ? String(row.profile_id) : null,
    avatarPath: row.avatar_path ? String(row.avatar_path) : null
  };
}

/**
 * Safe leaderboard data from the database function. It never returns an email
 * or private account data. `profile_id` and `avatar_path` are the public
 * identity fields needed to open a student profile and show its picture.
 */
export async function getLeaderboard(period = 'today') {
  if (!supabase) throw new Error('Supabase is not configured.');
  const safePeriod = PERIODS.includes(period) ? period : 'today';

  const { data, error } = await supabase.rpc('get_leaderboard', {
    p_period: safePeriod
  });

  if (error) throw error;
  if (!data) throw new Error('Leaderboard is unavailable.');

  return {
    period: data.period ?? safePeriod,
    rows: Array.isArray(data.rows) ? data.rows.map(normalizeRow).filter(Boolean) : [],
    you: normalizeRow(data.you),
    totalStudents: toNumber(data.total_students),
    generatedAt: data.generated_at ? new Date(data.generated_at) : new Date()
  };
}

/** The signed-in student's best daily rank in the current month. */
export async function getMyBestRankThisMonth() {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('get_my_best_rank_this_month');
  if (error) throw error;
  return data == null ? null : toNumber(data);
}
