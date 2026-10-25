import { supabase } from './supabaseClient.js';
import { toNumber } from './utils.js';
import { DAILY_GOAL_DEFAULT_MINUTES } from './config.js';

/**
 * Server-computed level, streak and bonus progress. The database is the single
 * source of truth so the leaderboard and Levels page always agree.
 */
export async function getMyProgress() {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase.rpc('get_my_progress');
  if (error) throw error;
  if (!data) throw new Error('Progress is unavailable.');

  return {
    total_seconds: toNumber(data.total_seconds),
    total_hours: toNumber(data.total_hours),
    bonus_hours: toNumber(data.bonus_hours),
    effective_hours: toNumber(data.effective_hours),
    level: toNumber(data.level, 1),
    level_name: String(data.level_name ?? 'Rookie'),
    next_level: data.next_level == null ? null : toNumber(data.next_level),
    next_level_name: data.next_level_name ? String(data.next_level_name) : null,
    next_level_hours: data.next_level_hours == null ? null : toNumber(data.next_level_hours),
    hours_to_next: toNumber(data.hours_to_next),
    progress_percent: toNumber(data.progress_percent),
    streak: toNumber(data.streak),
    goal_days: toNumber(data.goal_days),
    daily_goal_minutes: toNumber(data.daily_goal_minutes, DAILY_GOAL_DEFAULT_MINUTES)
  };
}
