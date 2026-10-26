import {
  ALLOWED_EMAIL_DOMAIN,
  SUBJECT_COLORS,
  TIMEZONE
} from './config.js';

const datePartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric'
});

const weekdayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short'
});

const longWeekdayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short'
});

const dayMonthFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long'
});

/** Escape text before placing it into an HTML string. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function initials(fullName) {
  const parts = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function firstName(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0] || 'Student';
}

export function titleCase(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function normalizeSubject(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function hashString(value) {
  let hash = 0;
  const text = String(value ?? '').trim().toLowerCase();
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/** Stable subject colour used by dots, chips and calendar blocks. */
export function subjectColor(subject) {
  if (!String(subject ?? '').trim()) return SUBJECT_COLORS[0];
  return SUBJECT_COLORS[hashString(subject) % SUBJECT_COLORS.length];
}

/** Format seconds as "3h 05m", "45m" or "1h". */
export function formatDuration(seconds) {
  const totalMinutes = Math.max(0, Math.round(toNumber(seconds) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/** Compact calendar form: "1h30", "45m", "2h". */
export function formatDurationShort(seconds) {
  const totalMinutes = Math.max(0, Math.round(toNumber(seconds) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h${String(minutes).padStart(2, '0')}`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/** HH:MM:SS for the timer, rounded down so it never shows a future second. */
export function formatTimerClock(seconds) {
  const whole = Math.max(0, Math.floor(toNumber(seconds)));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
}

/** Remaining time, rounded up to the next minute. */
export function remainingMinutes(seconds) {
  return Math.max(0, Math.ceil(toNumber(seconds) / 60));
}

export function getZonedParts(date = new Date()) {
  const parts = datePartsFormatter.formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

/** Convert wall-clock parts in the app timezone to a real Date. */
export function zonedToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getZonedParts(new Date(candidate));
    const rendered = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const adjustment = target - rendered;
    if (adjustment === 0) break;
    candidate += adjustment;
  }
  return new Date(candidate);
}

export function dateKeyFromDate(date = new Date()) {
  const parts = getZonedParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function dateKeyFromParts({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return { year, month, day };
}

export function todayKey() {
  return dateKeyFromDate(new Date());
}

export function addDaysToKey(dateKey, amount) {
  const { year, month, day } = parseDateKey(dateKey);
  const probe = new Date(Date.UTC(year, month - 1, day + amount));
  return dateKeyFromParts({
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate()
  });
}

/** Monday = 0, Sunday = 6. */
export function weekdayIndex(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function startOfWeekKey(dateKey) {
  return addDaysToKey(dateKey, -weekdayIndex(dateKey));
}

export function weekKeys(dateKey) {
  const start = startOfWeekKey(dateKey);
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(start, index));
}

export function monthKeyFromDateKey(dateKey) {
  return String(dateKey).slice(0, 7);
}

export function daysInMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonthsToKey(dateKey, amount) {
  const { year, month, day } = parseDateKey(dateKey);
  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const safeDay = Math.min(day, daysInMonth(`${targetYear}-${String(targetMonth).padStart(2, '0')}`));
  return dateKeyFromParts({ year: targetYear, month: targetMonth, day: safeDay });
}

export function monthGridKeys(monthKey) {
  const firstKey = `${monthKey}-01`;
  const gridStart = addDaysToKey(firstKey, -weekdayIndex(firstKey));
  return Array.from({ length: 42 }, (_, index) => addDaysToKey(gridStart, index));
}

/** Local midnight for a YYYY-MM-DD date key. */
export function startOfDay(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  return zonedToUtc({ year, month, day });
}

/** Local midnight after the given date key (exclusive query bound). */
export function endOfDay(dateKey) {
  return startOfDay(addDaysToKey(dateKey, 1));
}

export function weekRange(dateKey) {
  const startKey = startOfWeekKey(dateKey);
  return {
    startKey,
    endKey: addDaysToKey(startKey, 7),
    start: startOfDay(startKey),
    end: startOfDay(addDaysToKey(startKey, 7)),
    keys: weekKeys(dateKey)
  };
}

export function monthRange(monthKey) {
  const startKey = `${monthKey}-01`;
  const nextKey = addMonthsToKey(startKey, 1);
  return {
    startKey,
    endKey: nextKey,
    start: startOfDay(startKey),
    end: startOfDay(nextKey)
  };
}

export function formatMonthTitle(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

export function formatWeekdayShort(dateKey) {
  return weekdayFormatter.format(new Date(`${dateKey}T12:00:00Z`));
}

export function formatWeekdayLong(dateKey) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long'
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

export function formatLongDay(dateKey) {
  return longWeekdayFormatter.format(new Date(`${dateKey}T12:00:00Z`));
}

export function formatShortDay(dateKey) {
  return shortDateFormatter.format(new Date(`${dateKey}T12:00:00Z`));
}

export function formatDayAndMonth(dateKey) {
  return dayMonthFormatter.format(new Date(`${dateKey}T12:00:00Z`));
}

export function formatClockTime(dateOrIso) {
  return timeFormatter.format(dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso));
}

export function formatMinutesOfDay(minutes) {
  const normalized = ((Math.floor(minutes / 60) % 24) + 24) % 24;
  const minute = Math.floor(minutes % 60);
  return `${String(normalized).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatHourLabel(hour) {
  return `${String(((hour % 24) + 24) % 24).padStart(2, '0')}:00`;
}

export function formatTimeRange(startIso, endIso) {
  return `${formatClockTime(startIso)} – ${formatClockTime(endIso)}`;
}

export function getZonedHour(dateOrIso) {
  return getZonedParts(dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso)).hour;
}

export function getZonedWeekday(dateOrIso) {
  return weekdayIndex(dateKeyFromDate(dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso)));
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Accept any well-formed address (Gmail, Outlook, school, ...). When
 * ALLOWED_EMAIL_DOMAIN is set, the domain suffix must match as well.
 */
export function isAllowedEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || email.includes(' ')) return false;

  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0 || atIndex !== email.indexOf('@')) return false;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (domain.length > 253) return false;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) return false;

  const restricted = ALLOWED_EMAIL_DOMAIN.trim().toLowerCase();
  if (!restricted) return true;
  if (!restricted.startsWith('@')) return false;
  return email.endsWith(restricted);
}

export function formatCount(value) {
  return new Intl.NumberFormat('en-GB').format(toNumber(value));
}

export function percent(part, total) {
  if (!toNumber(total)) return 0;
  return Math.round((toNumber(part) / toNumber(total)) * 100);
}

/** Sum duration_seconds from an array of session rows. */
export function sumDuration(sessions) {
  return (sessions ?? []).reduce((total, session) => total + toNumber(session.duration_seconds), 0);
}

export function safeInternalNext(rawNext) {
  const value = String(rawNext ?? '').trim();
  if (!/^(timer|leaderboard|calendar|levels|stats|student)\.html(?:\?[^#]*)?$/.test(value)) {
    return 'timer.html';
  }
  return value;
}
