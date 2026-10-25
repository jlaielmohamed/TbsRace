import './nav.js';
import { DAILY_GOAL_DEFAULT_MINUTES } from './config.js';
import { requireAuth } from './guard.js';
import { getProfile } from './profile.js';
import { getMyProgress } from './progress.js';
import { getSessionsForDay, getSessionsForMonth } from './sessions.js';
import {
  addDaysToKey,
  addMonthsToKey,
  clamp,
  dateKeyFromDate,
  escapeHtml,
  formatClockTime,
  formatDuration,
  formatDurationShort,
  formatHourLabel,
  formatLongDay,
  formatMonthTitle,
  formatShortDay,
  getZonedHour,
  isDateKey,
  monthGridKeys,
  monthKeyFromDateKey,
  startOfDay,
  subjectColor,
  sumDuration,
  todayKey
} from './utils.js';
import {
  friendlyError,
  renderErrorState
} from './ui.js';

const elements = {
  subtitle: document.getElementById('calendar-subtitle'),
  title: document.getElementById('calendar-title'),
  prev: document.getElementById('calendar-prev'),
  next: document.getElementById('calendar-next'),
  viewButtons: Array.from(document.querySelectorAll('[data-calendar-view]')),
  monthView: document.getElementById('month-view'),
  dayView: document.getElementById('day-view'),
  grid: document.getElementById('calendar-grid'),
  timelineScroll: document.getElementById('timeline-scroll'),
  timeline: document.getElementById('timeline'),
  detail: document.getElementById('calendar-detail'),
  monthMini: document.getElementById('month-mini'),
  error: document.getElementById('calendar-error'),
  content: document.getElementById('calendar-content'),
  metaAlert: document.getElementById('calendar-meta-alert'),
  metaRetry: document.getElementById('calendar-meta-retry')
};

const DAY_VIEW_START_HOUR = 7;
const DAY_VIEW_END_HOUR = 22;
const LOW_INTENSITY_SECONDS = 2 * 60 * 60;
const HIGH_INTENSITY_SECONDS = 4 * 60 * 60;

const urlParams = new URLSearchParams(window.location.search);
let view = urlParams.get('view') === 'day' ? 'day' : 'month';
let selectedKey = isDateKey(urlParams.get('day')) ? urlParams.get('day') : todayKey();
let monthKey = monthKeyFromDateKey(selectedKey);
let sessions = [];
let profile = null;
let progress = null;
let requestId = 0;

function daySessionsFor(key) {
  return sessions.filter((session) => dateKeyFromDate(new Date(session.start_time)) === key);
}

function sessionsForSelectedMonth() {
  return sessions.filter((session) => dateKeyFromDate(new Date(session.start_time)).startsWith(monthKey));
}

function intensityClass(seconds) {
  if (seconds <= 0) return 'is-none';
  if (seconds < LOW_INTENSITY_SECONDS) return 'is-low';
  if (seconds < HIGH_INTENSITY_SECONDS) return 'is-medium';
  return 'is-high';
}

function sessionListMarkup(list) {
  if (!list.length) {
    return `<div class="detail-empty">No sessions on this day yet.</div>`;
  }
  return `<ul class="detail-session-list">${list
    .map((session) => `<li class="detail-session">
      <span class="subject-dot" style="--dot:${subjectColor(session.subject)}" aria-hidden="true"></span>
      <div class="detail-session-copy">
        <strong>${escapeHtml(session.subject)}</strong>
        <span>${escapeHtml(formatClockTime(session.start_time))} – ${escapeHtml(formatClockTime(session.end_time))}</span>
      </div>
      <span class="detail-session-time">${escapeHtml(formatDuration(session.duration_seconds))}</span>
    </li>`)
    .join('')}</ul>`;
}

function peakPeriod(list) {
  if (!list.length) return '—';
  const totals = { Morning: 0, Afternoon: 0, Evening: 0 };
  list.forEach((session) => {
    const hour = getZonedHour(session.start_time);
    if (hour < 12) totals.Morning += Number(session.duration_seconds);
    else if (hour < 18) totals.Afternoon += Number(session.duration_seconds);
    else totals.Evening += Number(session.duration_seconds);
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0];
}

function renderMonth() {
  const monthSessions = sessionsForSelectedMonth();
  const totalsByDay = new Map();
  monthSessions.forEach((session) => {
    const key = dateKeyFromDate(new Date(session.start_time));
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + Number(session.duration_seconds));
  });

  const today = todayKey();
  const keys = monthGridKeys(monthKey);
  elements.grid.innerHTML = keys.map((key) => {
    if (!key.startsWith(monthKey)) {
      return '<div class="calendar-day is-outside" aria-hidden="true"></div>';
    }
    const seconds = totalsByDay.get(key) ?? 0;
    const total = seconds > 0 ? formatDurationShort(seconds) : '';
    const classes = [
      'calendar-day',
      intensityClass(seconds),
      key === today ? 'is-today' : '',
      key === selectedKey ? 'is-selected' : ''
    ].filter(Boolean).join(' ');
    const label = `${formatLongDay(key)}, ${seconds > 0 ? `${formatDuration(seconds)} studied` : 'no study time'}`;
    return `<button class="${classes}" type="button" data-date="${key}"
      aria-pressed="${key === selectedKey}" aria-label="${escapeHtml(label)}">
      <span class="calendar-day-number">${Number(key.slice(-2))}</span>
      ${total ? `<span class="calendar-day-total">${escapeHtml(total)}</span>` : ''}
    </button>`;
  }).join('');

  const selectedSessions = daySessionsFor(selectedKey);
  const selectedTotal = sumDuration(selectedSessions);
  elements.detail.innerHTML = `
    <div class="detail-heading">
      <div>
        <p class="eyebrow">Selected day</p>
        <h2>${escapeHtml(formatShortDay(selectedKey))}</h2>
      </div>
      <strong class="detail-total">${escapeHtml(formatDuration(selectedTotal))}</strong>
    </div>
    ${sessionListMarkup(selectedSessions)}`;

  const hoursThisMonth = sumDuration(monthSessions);
  if (elements.monthMini) {
    elements.monthMini.innerHTML = `
      <div class="mini-stat">
        <strong>${escapeHtml(formatDuration(hoursThisMonth))}</strong>
        <span>This month</span>
      </div>
      <div class="mini-stat">
        <strong>${escapeHtml(peakPeriod(monthSessions))}</strong>
        <span>Peak time</span>
      </div>
      <div class="mini-stat">
        <strong>${progress ? `${progress.streak} days` : '—'}</strong>
        <span>Streak</span>
      </div>`;
  }
}

function buildTimeline(list) {
  const dayStart = startOfDay(selectedKey).getTime();
  const prepared = list
    .map((session) => {
      const start = new Date(session.start_time);
      const end = new Date(session.end_time);
      return {
        ...session,
        startMinute: (start.getTime() - dayStart) / 60_000,
        endMinute: (end.getTime() - dayStart) / 60_000
      };
    })
    .sort((a, b) => a.startMinute - b.startMinute);

  let startHour = DAY_VIEW_START_HOUR;
  let endHour = DAY_VIEW_END_HOUR;
  if (prepared.length) {
    startHour = Math.min(startHour, Math.floor(Math.min(...prepared.map((item) => item.startMinute)) / 60));
    endHour = Math.max(endHour, Math.ceil(Math.max(...prepared.map((item) => item.endMinute)) / 60));
  }
  startHour = Math.max(0, startHour);
  endHour = Math.max(startHour + 1, endHour);

  const totalMinutes = (endHour - startHour) * 60;
  const lanesEnd = [];
  prepared.forEach((session) => {
    let lane = lanesEnd.findIndex((end) => end <= session.startMinute);
    if (lane === -1) {
      lane = lanesEnd.length;
      lanesEnd.push(session.endMinute);
    } else {
      lanesEnd[lane] = session.endMinute;
    }
    session.lane = lane;
  });
  const laneCount = Math.max(1, lanesEnd.length);

  const hourMarks = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    const top = ((hour - startHour) * 60 / totalMinutes) * 100;
    hourMarks.push(`<div class="timeline-hour" style="top:${top}%">
      <span>${escapeHtml(formatHourLabel(hour))}</span>
    </div>`);
  }

  const blocks = prepared.map((session) => {
    const top = clamp(((session.startMinute - startHour * 60) / totalMinutes) * 100, 0, 100);
    const height = clamp(((session.endMinute - session.startMinute) / totalMinutes) * 100, 0.4, 100);
    const color = subjectColor(session.subject);
    const laneStyle = `--lane-left:${(session.lane / laneCount) * 100}%;--lane-width:calc(${100 / laneCount}% - 6px);`;
    return `<article class="timeline-block" style="--subject:${color};${laneStyle}top:${top}%;height:${height}%"
      aria-label="${escapeHtml(`${session.subject}, ${formatClockTime(session.start_time)} to ${formatClockTime(session.end_time)}, ${formatDuration(session.duration_seconds)}`)}">
      <strong>${escapeHtml(session.subject)}</strong>
      <span>${escapeHtml(formatClockTime(session.start_time))} – ${escapeHtml(formatClockTime(session.end_time))}</span>
    </article>`;
  }).join('');

  elements.timeline.innerHTML = `
    <div class="timeline-content" style="--hours:${endHour - startHour}">
      ${hourMarks.join('')}
      <div class="timeline-blocks">${blocks}</div>
      ${!prepared.length ? '<div class="timeline-empty">No sessions in this view. Time you study will appear here.</div>' : ''}
    </div>`;
}

function renderDay() {
  const list = daySessionsFor(selectedKey);
  const total = sumDuration(list);
  const goalMinutes = profile?.daily_goal_minutes ?? DAILY_GOAL_DEFAULT_MINUTES;
  const goalSeconds = goalMinutes * 60;
  const remaining = goalSeconds - total;
  const goalPercent = goalSeconds > 0 ? clamp((total / goalSeconds) * 100, 0, 100) : 0;
  const goalCopy =
    total === 0
      ? `Your daily goal is ${formatDuration(goalSeconds)}`
      : remaining > 0
        ? `${formatDuration(remaining)} left to reach your goal`
        : `Goal reached · ${formatDuration(-remaining)} over`;

  buildTimeline(list);

  elements.detail.innerHTML = `
    <div class="day-total">
      <div>
        <p class="eyebrow">Total for the day</p>
        <strong class="day-total-value">${escapeHtml(formatDuration(total))}</strong>
      </div>
      <span class="day-goal-label">${escapeHtml(formatDuration(goalSeconds))} goal</span>
    </div>
    <div class="progress day-goal-progress" role="progressbar" aria-label="Daily goal progress"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(goalPercent)}">
      <span style="width:${goalPercent}%"></span>
    </div>
    <p class="day-goal-copy">${escapeHtml(goalCopy)}</p>
    <div class="detail-divider"></div>
    <h3 class="detail-subtitle">Sessions</h3>
    ${sessionListMarkup(list)}`;
}

function updateChrome() {
  elements.viewButtons.forEach((button) => {
    const selected = button.dataset.calendarView === view;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });

  if (view === 'month') {
    elements.title.textContent = formatMonthTitle(monthKey);
    elements.subtitle.textContent =
      'Every session you finish is saved here with the time you studied at.';
    elements.monthView.hidden = false;
    elements.dayView.hidden = true;
    elements.monthMini.hidden = false;
    elements.prev.setAttribute('aria-label', 'Previous month');
    elements.next.setAttribute('aria-label', 'Next month');
  } else {
    elements.title.textContent = formatLongDay(selectedKey);
    elements.subtitle.textContent = 'See exactly what time of day you studied.';
    elements.monthView.hidden = true;
    elements.dayView.hidden = false;
    elements.monthMini.hidden = true;
    elements.prev.setAttribute('aria-label', 'Previous day');
    elements.next.setAttribute('aria-label', 'Next day');
  }

  const url = new URL(window.location.href);
  url.searchParams.set('view', view);
  url.searchParams.set('day', selectedKey);
  window.history.replaceState({}, '', url);
}

function showError(error) {
  elements.content.hidden = true;
  elements.error.hidden = false;
  renderErrorState(elements.error, {
    title: 'Your calendar could not load',
    message: friendlyError(error, 'Check your connection and try again.'),
    onRetry: () => refresh()
  });
}

function setLoading(isLoading) {
  elements.content?.setAttribute('aria-busy', String(isLoading));
  elements.content?.classList.toggle('is-loading', isLoading);
}

async function refresh() {
  const currentRequest = ++requestId;
  elements.error.hidden = true;
  elements.content.hidden = false;
  setLoading(true);

  try {
    let result;
    if (view === 'month') {
      result = await getSessionsForMonth(monthKey);
    } else {
      result = await getSessionsForDay(selectedKey);
    }
    if (currentRequest !== requestId) return;
    sessions = result;
    setLoading(false);
    updateChrome();
    if (view === 'month') renderMonth();
    else renderDay();
  } catch (error) {
    if (currentRequest !== requestId) return;
    setLoading(false);
    showError(error);
  }
}

function changePeriod(direction) {
  if (view === 'month') {
    selectedKey = addMonthsToKey(selectedKey, direction);
    monthKey = monthKeyFromDateKey(selectedKey);
  } else {
    selectedKey = addDaysToKey(selectedKey, direction);
    monthKey = monthKeyFromDateKey(selectedKey);
  }
  updateChrome();
  refresh();
}

function selectMonthDay(key) {
  if (!isDateKey(key)) return;
  selectedKey = key;
  monthKey = monthKeyFromDateKey(key);
  elements.grid.querySelectorAll('[data-date]').forEach((button) => {
    const selected = button.dataset.date === selectedKey;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const selectedSessions = daySessionsFor(selectedKey);
  elements.detail.innerHTML = `
    <div class="detail-heading">
      <div>
        <p class="eyebrow">Selected day</p>
        <h2>${escapeHtml(formatShortDay(selectedKey))}</h2>
      </div>
      <strong class="detail-total">${escapeHtml(formatDuration(sumDuration(selectedSessions)))}</strong>
    </div>
    ${sessionListMarkup(selectedSessions)}`;
  const url = new URL(window.location.href);
  url.searchParams.set('day', selectedKey);
  window.history.replaceState({}, '', url);
}

function selectView(nextView) {
  if (!['month', 'day'].includes(nextView) || nextView === view) return;
  view = nextView;
  updateChrome();
  refresh();
}

async function loadMeta() {
  if (elements.metaAlert) elements.metaAlert.hidden = true;
  const [profileResult, progressResult] = await Promise.allSettled([getProfile(), getMyProgress()]);

  if (profileResult.status === 'fulfilled') profile = profileResult.value;
  if (progressResult.status === 'fulfilled') progress = progressResult.value;

  if (profileResult.status === 'rejected' || progressResult.status === 'rejected') {
    const reason =
      profileResult.status === 'rejected' ? profileResult.reason : progressResult.reason;
    const text = elements.metaAlert?.querySelector('[data-meta-error]');
    if (text) {
      text.textContent = friendlyError(
        reason,
        'Some details could not load. Your calendar still works.'
      );
    }
    if (elements.metaAlert) elements.metaAlert.hidden = false;
  }

  if (view === 'month' && sessions.length) renderMonth();
  if (view === 'day' && !elements.dayView.hidden) renderDay();
}

function setUpViewTabs() {
  elements.viewButtons.forEach((button) => {
    button.addEventListener('click', () => selectView(button.dataset.calendarView));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const index = elements.viewButtons.indexOf(button);
      const nextIndex =
        event.key === 'ArrowRight'
          ? (index + 1) % elements.viewButtons.length
          : (index - 1 + elements.viewButtons.length) % elements.viewButtons.length;
      selectView(elements.viewButtons[nextIndex].dataset.calendarView);
      elements.viewButtons[nextIndex].focus();
    });
  });
}

async function init() {
  const session = await requireAuth();
  if (!session) return;

  setUpViewTabs();
  elements.prev.addEventListener('click', () => changePeriod(-1));
  elements.next.addEventListener('click', () => changePeriod(1));
  elements.metaRetry?.addEventListener('click', loadMeta);
  elements.grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-date]');
    if (button) selectMonthDay(button.dataset.date);
  });

  updateChrome();
  await Promise.all([loadMeta(), refresh()]);
}

init();
