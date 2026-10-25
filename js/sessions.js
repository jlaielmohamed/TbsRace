import { MAX_SESSION_SECONDS, MIN_SESSION_SECONDS } from './config.js';
import { supabase } from './supabaseClient.js';
import {
  endOfDay,
  monthRange,
  normalizeSubject,
  startOfDay,
  todayKey,
  toNumber
} from './utils.js';

const SESSION_FIELDS =
  'id, subject, start_time, end_time, duration_seconds, planned_duration_seconds, created_at';
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

function dataError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}

async function getUserId() {
  if (!supabase) throw dataError('Supabase is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user?.id;
  if (!userId) throw dataError('Please sign in again.');
  return userId;
}

async function fetchSessionRange({ start = null, end = null } = {}) {
  const userId = await getUserId();
  const rows = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = supabase
      .from('study_sessions')
      .select(SESSION_FIELDS)
      .eq('user_id', userId);

    if (start) query = query.gte('start_time', start.toISOString());
    if (end) query = query.lt('start_time', end.toISOString());

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await query
      .order('start_time', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

/** All sessions that started in the given half-open range [start, end). */
export function getSessionsBetween(start, end) {
  return fetchSessionRange({ start, end });
}

export function getTodaySessions() {
  const key = todayKey();
  return fetchSessionRange({ start: startOfDay(key), end: endOfDay(key) });
}

export function getSessionsForDay(dateKey) {
  return fetchSessionRange({ start: startOfDay(dateKey), end: endOfDay(dateKey) });
}

export function getSessionsForMonth(monthKey) {
  const range = monthRange(monthKey);
  return fetchSessionRange({ start: range.start, end: range.end });
}

/**
 * Stats need all-time records, so this is the only unbounded read. It is
 * paginated in 1,000-row pages and selected to the minimum needed columns.
 */
export function getAllSessions() {
  return fetchSessionRange();
}

export async function createSession({
  subject,
  startTime,
  endTime,
  durationSeconds,
  plannedDurationSeconds
}) {
  const cleanSubject = normalizeSubject(subject);
  if (cleanSubject.length < 1 || cleanSubject.length > 40) {
    throw dataError('Choose a subject between 1 and 40 characters.');
  }

  const startedAt = new Date(startTime);
  const endedAt = new Date(endTime);
  const duration = Math.floor(toNumber(durationSeconds));
  const planned = Math.floor(toNumber(plannedDurationSeconds));

  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    throw dataError('That session has an invalid time range.');
  }
  if (endedAt <= startedAt) {
    throw dataError('A session must end after it starts.');
  }
  if (duration < MIN_SESSION_SECONDS) {
    throw dataError('Sessions need at least one minute of study time.');
  }
  if (duration > MAX_SESSION_SECONDS) {
    throw dataError('A single session cannot be longer than 12 hours.');
  }
  if (planned < MIN_SESSION_SECONDS || planned > MAX_SESSION_SECONDS) {
    throw dataError('Choose a session length between 1 minute and 12 hours.');
  }
  const wallSeconds = (endedAt.getTime() - startedAt.getTime()) / 1000;
  if (duration > wallSeconds + 1) {
    throw dataError('The session duration does not match its start and end time.');
  }

  const userId = await getUserId();
  const { data, error } = await supabase
    .from('study_sessions')
    .insert({
      user_id: userId,
      subject: cleanSubject,
      start_time: startedAt.toISOString(),
      end_time: endedAt.toISOString(),
      duration_seconds: duration,
      planned_duration_seconds: planned
    })
    .select('id')
    .single();

  if (error) throw error;
  return data;
}
