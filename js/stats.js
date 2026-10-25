import './nav.js';
import { DAILY_GOAL_DEFAULT_MINUTES } from './config.js';
import { requireAuth } from './guard.js';
import { getMyBestRankThisMonth } from './leaderboardData.js';
import { getMyProgress } from './progress.js';
import { getAllSessions } from './sessions.js';
import { renderLevelCard } from './levelView.js';
import {
  addDaysToKey,
  dateKeyFromDate,
  escapeHtml,
  formatDuration,
  formatDurationShort,
  formatShortDay,
  getZonedHour,
  monthKeyFromDateKey,
  startOfWeekKey,
  subjectColor,
  sumDuration,
  todayKey,
  toNumber,
  weekKeys
} from './utils.js';
import {
  friendlyError,
  renderEmptyState,
  renderErrorState
} from './ui.js';

const elements = {
  content: document.getElementById('stats-content'),
  error: document.getElementById('stats-error'),
  alert: document.getElementById('stats-alert'),
  status: document.getElementById('stats-status'),
  today: document.getElementById('stats-today'),
  week: document.getElementById('stats-week'),
  month: document.getElementById('stats-month'),
  all: document.getElementById('stats-all'),
  weekChart: document.getElementById('week-chart'),
  weekTotal: document.getElementById('week-chart-total'),
  subjects: document.getElementById('subject-breakdown'),
  peak: document.getElementById('peak-breakdown'),
  peakInsight: document.getElementById('peak-insight'),
  longest: document.getElementById('record-longest'),
  longestNote: document.getElementById('record-longest-note'),
  streak: document.getElementById('record-streak'),
  bestDay: document.getElementById('record-best-day'),
  bestDayNote: document.getElementById('record-best-day-note'),
  rank: document.getElementById('record-rank'),
  rankNote: document.getElementById('record-rank-note'),
  level: document.getElementById('stats-level')
};

const PERIOD_LABELS = ['Morning', 'Afternoon', 'Evening'];
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PERIOD_CUTOFFS = { Morning: 12, Afternoon: 18 };

let loading = false;
let requestId = 0;

function setLoading(isLoading) {
  loading = isLoading;
  elements.content?.classList.toggle('is-loading', isLoading);
  elements.content?.setAttribute('aria-busy', String(isLoading));
}

function groupByDay(sessions) {
  const map = new Map();
  sessions.forEach((session) => {
    const key = dateKeyFromDate(new Date(session.start_time));
    map.set(key, (map.get(key) ?? 0) + toNumber(session.duration_seconds));
  });
  return map;
}

function longestStreak(dayKeys) {
  const sorted = [...new Set(dayKeys)].sort();
  let best = 0;
  let current = 0;
  let previous = null;

  sorted.forEach((key) => {
    current = previous && addDaysToKey(previous, 1) === key ? current + 1 : 1;
    best = Math.max(best, current);
    previous = key;
  });

  return best;
}

function peakBreakdown(sessions) {
  const totals = { Morning: 0, Afternoon: 0, Evening: 0 };
  sessions.forEach((session) => {
    const hour = getZonedHour(session.start_time);
    if (hour < PERIOD_CUTOFFS.Morning) totals.Morning += toNumber(session.duration_seconds);
    else if (hour < PERIOD_CUTOFFS.Afternoon) totals.Afternoon += toNumber(session.duration_seconds);
    else totals.Evening += toNumber(session.duration_seconds);
  });

  const total = PERIOD_LABELS.reduce((sum, label) => sum + totals[label], 0);
  const rows = PERIOD_LABELS.map((label) => ({
    label,
    seconds: totals[label],
    percent: total ? Math.round((totals[label] / total) * 100) : 0
  }));

  if (total > 0) {
    const difference = 100 - rows.reduce((sum, row) => sum + row.percent, 0);
    const largest = rows.reduce((best, row) => (row.seconds > best.seconds ? row : best), rows[0]);
    largest.percent += difference;
  }

  return { rows, total };
}

function strongestWeekday(sessions) {
  const totals = Array.from({ length: 7 }, () => 0);
  sessions.forEach((session) => {
    const key = dateKeyFromDate(new Date(session.start_time));
    const index = (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
    totals[index] += toNumber(session.duration_seconds);
  });
  const max = Math.max(...totals);
  if (max <= 0) return null;
  return WEEKDAY_LABELS[totals.indexOf(max)];
}

function renderSummary(sessions) {
  const byDay = groupByDay(sessions);
  const today = todayKey();
  const currentWeek = new Set(weekKeys(today));
  const month = monthKeyFromDateKey(today);
  let weekSeconds = 0;
  let monthSeconds = 0;

  byDay.forEach((seconds, key) => {
    if (currentWeek.has(key)) weekSeconds += seconds;
    if (key.startsWith(month)) monthSeconds += seconds;
  });

  if (elements.today) elements.today.textContent = formatDuration(byDay.get(today) ?? 0);
  if (elements.week) elements.week.textContent = formatDuration(weekSeconds);
  if (elements.month) elements.month.textContent = formatDuration(monthSeconds);
  if (elements.all) elements.all.textContent = formatDuration(sumDuration(sessions));
  if (elements.weekTotal) {
    elements.weekTotal.textContent = `${formatDuration(weekSeconds)} this week`;
  }
}

function renderWeekChart(sessions, dailyGoalSeconds) {
  if (!elements.weekChart) return;
  const byDay = groupByDay(sessions);
  const keys = weekKeys(todayKey());
  const values = keys.map((key) => byDay.get(key) ?? 0);
  const maxValue = Math.max(dailyGoalSeconds, ...values, 1);
  const goalPercent = Math.max(0, Math.min(100, (dailyGoalSeconds / maxValue) * 100));

  elements.weekChart.style.setProperty('--goal', `${goalPercent}%`);
  elements.weekChart.innerHTML = `
    <div class="week-goal" aria-hidden="true"><span>Goal ${formatDurationShort(dailyGoalSeconds)}</span></div>
    <div class="week-bars">
      ${keys
        .map((key, index) => {
          const seconds = values[index];
          const percent = Math.max(0, Math.min(100, (seconds / maxValue) * 100));
          const dayLabel = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'UTC',
            weekday: 'short'
          }).format(new Date(`${key}T12:00:00Z`));
          return `<div class="week-col">
            <span class="week-value">${seconds > 0 ? escapeHtml(formatDurationShort(seconds)) : ''}</span>
            <div class="week-track" aria-hidden="true">
              <span class="week-bar${key === todayKey() ? ' is-today' : ''}" style="height:${percent}%"></span>
            </div>
            <span class="week-day">${dayLabel}</span>
            <span class="visually-hidden">${escapeHtml(formatShortDay(key))}: ${formatDuration(seconds)} studied</span>
          </div>`;
        })
        .join('')}
    </div>`;
}

function renderSubjects(sessions) {
  if (!elements.subjects) return;
  const totals = new Map();
  sessions.forEach((session) => {
    const subject = String(session.subject ?? '').trim() || 'Study';
    totals.set(subject, (totals.get(subject) ?? 0) + toNumber(session.duration_seconds));
  });

  const rows = [...totals.entries()]
    .map(([subject, seconds]) => ({ subject, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
  const total = rows.reduce((sum, row) => sum + row.seconds, 0);

  if (!rows.length) {
    renderEmptyState(elements.subjects, {
      icon: '◌',
      title: 'No subjects yet',
      message: 'Finish a session and your subject mix will appear here.'
    });
    return;
  }

  elements.subjects.innerHTML = `<ul class="subject-list">${rows
    .map((row) => {
      const percent = total ? Math.round((row.seconds / total) * 100) : 0;
      return `<li class="subject-row">
        <span class="subject-dot" style="--dot:${subjectColor(row.subject)}" aria-hidden="true"></span>
        <div class="subject-row-main">
          <div class="subject-row-head">
            <span class="subject-name">${escapeHtml(row.subject)}</span>
            <span class="subject-percent">${percent}%</span>
          </div>
          <div class="subject-track" aria-hidden="true">
            <span style="width:${percent}%;background:${subjectColor(row.subject)}"></span>
          </div>
        </div>
        <span class="subject-duration">${escapeHtml(formatDuration(row.seconds))}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

function renderPeak(sessions) {
  if (!elements.peak) return;
  const { rows, total } = peakBreakdown(sessions);

  if (!total) {
    renderEmptyState(elements.peak, {
      icon: '◔',
      title: 'No pattern yet',
      message: 'A few sessions will reveal when you focus best.'
    });
    if (elements.peakInsight) {
      elements.peakInsight.textContent = 'Start studying to see your strongest time of day.';
    }
    return;
  }

  elements.peak.innerHTML = `<ul class="peak-list">${rows
    .map(
      (row) => `<li class="peak-row">
        <div class="peak-head">
          <span>${row.label}</span>
          <strong>${row.percent}%</strong>
        </div>
        <div class="peak-track" aria-hidden="true">
          <span style="width:${row.percent}%"></span>
        </div>
      </li>`
    )
    .join('')}</ul>`;

  const best = rows.reduce((top, row) => (row.seconds > top.seconds ? row : top), rows[0]);
  const weekday = strongestWeekday(sessions);
  if (elements.peakInsight) {
    elements.peakInsight.textContent = weekday
      ? `You study most in the ${best.label.toLowerCase()}, and ${weekday}s are your strongest day.`
      : `You study most in the ${best.label.toLowerCase()}.`;
  }
}

function renderRecords(sessions, bestRank, rankFailed = false) {
  const longest = sessions.reduce(
    (top, session) =>
      toNumber(session.duration_seconds) > toNumber(top?.duration_seconds)
        ? session
        : top,
    null
  );
  if (elements.longest) {
    elements.longest.textContent = longest ? formatDuration(longest.duration_seconds) : '—';
  }
  if (elements.longestNote) {
    elements.longestNote.textContent = longest
      ? `${longest.subject} · ${formatShortDay(dateKeyFromDate(new Date(longest.start_time)))}`
      : 'No sessions yet';
  }

  const byDay = groupByDay(sessions);
  const streak = longestStreak([...byDay.keys()]);
  if (elements.streak) {
    elements.streak.textContent = streak > 0 ? `${streak} ${streak === 1 ? 'day' : 'days'}` : '—';
  }

  const bestDayEntry = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (elements.bestDay) {
    elements.bestDay.textContent = bestDayEntry ? formatDuration(bestDayEntry[1]) : '—';
  }
  if (elements.bestDayNote) {
    elements.bestDayNote.textContent = bestDayEntry
      ? `Best day · ${formatShortDay(bestDayEntry[0])}`
      : 'No study day yet';
  }

  if (elements.rank) {
    elements.rank.textContent = bestRank ? `#${bestRank}` : '—';
  }
  if (elements.rankNote) {
    elements.rankNote.textContent = rankFailed
      ? 'Could not load this month’s rank'
      : bestRank
        ? 'Best daily rank this month'
        : 'No ranked day this month';
  }
}

function showAlert(message) {
  if (!elements.alert) return;
  elements.alert.hidden = !message;
  const text = elements.alert.querySelector('[data-alert-message]');
  if (text) text.textContent = message;
}

function showError(error) {
  if (elements.content) elements.content.hidden = true;
  if (elements.error) elements.error.hidden = false;
  renderErrorState(elements.error, {
    title: 'Your stats are out of reach',
    message: friendlyError(error, 'Check your connection and try again.'),
    onRetry: load
  });
  if (elements.status) elements.status.textContent = 'Your stats could not load.';
}

async function load() {
  if (loading) return;
  const currentRequest = ++requestId;
  setLoading(true);
  showAlert('');
  if (elements.error) {
    elements.error.hidden = true;
    elements.error.replaceChildren();
  }
  if (elements.content) elements.content.hidden = false;

  const [sessionsResult, progressResult, rankResult] = await Promise.allSettled([
    getAllSessions(),
    getMyProgress(),
    getMyBestRankThisMonth()
  ]);

  if (currentRequest !== requestId) return;

  try {
    if (sessionsResult.status === 'rejected') throw sessionsResult.reason;
    const sessions = sessionsResult.value;
    const progress = progressResult.status === 'fulfilled' ? progressResult.value : null;
    const bestRank = rankResult.status === 'fulfilled' ? rankResult.value : null;
    const dailyGoalSeconds =
      toNumber(progress?.daily_goal_minutes, DAILY_GOAL_DEFAULT_MINUTES) * 60;

    renderSummary(sessions);
    renderWeekChart(sessions, dailyGoalSeconds);
    renderSubjects(sessions);
    renderPeak(sessions);
    renderRecords(sessions, bestRank, rankResult.status === 'rejected');

    if (progress) {
      renderLevelCard(elements.level, progress);
    } else {
      renderErrorState(elements.level, {
        title: 'Level unavailable',
        message: 'We could not load your level right now.',
        onRetry: load
      });
    }

    const partial = progressResult.status === 'rejected' || rankResult.status === 'rejected';
    showAlert(
      partial
        ? 'Some details could not load. Your session totals are still accurate.'
        : ''
    );
    if (elements.status) {
      elements.status.textContent = `Stats loaded. ${formatDuration(sumDuration(sessions))} studied all time.`;
    }
  } catch (error) {
    showError(error);
  } finally {
    if (currentRequest === requestId) setLoading(false);
  }
}

async function init() {
  const session = await requireAuth();
  if (!session) return;

  await load();
}

init();
