import './nav.js';
import {
  MAX_SESSION_SECONDS,
  MIN_SESSION_SECONDS,
  SESSION_LENGTHS,
  TIMER_STORAGE_PREFIX
} from './config.js';
import { requireAuth } from './guard.js';
import { createSession, getTodaySessions } from './sessions.js';
import { getMyProgress } from './progress.js';
import { getLeaderboard } from './leaderboardData.js';
import { renderLevelCard } from './levelView.js';
import {
  escapeHtml,
  formatClockTime,
  formatDuration,
  formatTimerClock,
  normalizeSubject,
  remainingMinutes,
  subjectColor,
  sumDuration,
  toNumber
} from './utils.js';
import {
  friendlyError,
  renderEmptyState,
  renderErrorState,
  setButtonBusy,
  setFieldError,
  showToast
} from './ui.js';

const elements = {
  statusText: document.getElementById('timer-status-text'),
  dot: document.getElementById('timer-dot'),
  display: document.getElementById('timer-display'),
  subline: document.getElementById('timer-subline'),
  ringWrap: document.getElementById('timer-ring-wrap'),
  ringProgress: document.getElementById('timer-ring-progress'),
  toggle: document.getElementById('timer-toggle'),
  finish: document.getElementById('timer-finish'),
  subject: document.getElementById('subject-input'),
  subjectError: document.getElementById('subject-error'),
  lengthChips: document.getElementById('length-chips'),
  customLength: document.getElementById('custom-length'),
  customMinutes: document.getElementById('custom-minutes'),
  lengthError: document.getElementById('length-error'),
  alert: document.getElementById('timer-alert'),
  todayTotal: document.getElementById('today-total'),
  streak: document.getElementById('streak-value'),
  rank: document.getElementById('rank-value'),
  level: document.getElementById('timer-level'),
  sessions: document.getElementById('today-sessions'),
  dashboardAlert: document.getElementById('dashboard-alert'),
  dashboardRetry: document.getElementById('dashboard-retry')
};

const DEFAULT_LENGTH_SECONDS = 90 * 60;
const TICK_MS = 250;

let userId = null;
let timerState = null;
let selectedSeconds = DEFAULT_LENGTH_SECONDS;
let customSelected = false;
let ticker = null;
let saving = false;
let dashboardRequest = 0;
let audioContext = null;
let alertedThisSession = false;

function storageKey() {
  return userId ? `${TIMER_STORAGE_PREFIX}${userId}` : '';
}

function readStoredState() {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const stored = JSON.parse(raw);
    if (
      stored?.version !== 1 ||
      !['running', 'paused'].includes(stored.status) ||
      typeof stored.subject !== 'string' ||
      stored.subject.length < 1 ||
      stored.subject.length > 40 ||
      !Number.isFinite(stored.plannedSeconds) ||
      stored.plannedSeconds < MIN_SESSION_SECONDS ||
      stored.plannedSeconds > MAX_SESSION_SECONDS ||
      !Number.isFinite(stored.startedAt) ||
      !Number.isFinite(stored.accumulatedMs) ||
      stored.accumulatedMs < 0
    ) {
      localStorage.removeItem(storageKey());
      return null;
    }
    if (stored.status === 'running' && !Number.isFinite(stored.lastResumedAt)) {
      localStorage.removeItem(storageKey());
      return null;
    }
    if (stored.status === 'paused' && !Number.isFinite(stored.pausedAt)) {
      localStorage.removeItem(storageKey());
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

function persistState() {
  if (!userId) return;
  try {
    if (timerState) localStorage.setItem(storageKey(), JSON.stringify(timerState));
    else localStorage.removeItem(storageKey());
  } catch {
    // Storage can be unavailable in strict private modes. The timer still
    // works for this page and the user gets a clear save error if needed.
  }
}

function elapsedMilliseconds(now = Date.now()) {
  if (!timerState) return 0;
  if (timerState.status === 'running') {
    return timerState.accumulatedMs + Math.max(0, now - timerState.lastResumedAt);
  }
  return timerState.accumulatedMs;
}

function activeElapsedSeconds(now = Date.now()) {
  return elapsedMilliseconds(now) / 1000;
}

function selectedLabel(seconds) {
  const match = SESSION_LENGTHS.find((item) => item.minutes * 60 === seconds);
  if (match) return match.label;
  return formatDuration(seconds);
}

function primeAudio() {
  if (audioContext) {
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch {
    audioContext = null;
  }
}

function playChime() {
  if (!audioContext || audioContext.state !== 'running') return;
  try {
    const now = audioContext.currentTime;
    [0, 0.2].forEach((offset, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = index === 0 ? 740 : 988;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.2);
    });
  } catch {
    // Sound is a bonus, never a requirement.
  }
}

function renderLengthOptions() {
  if (!elements.lengthChips) return;
  elements.lengthChips.innerHTML = SESSION_LENGTHS.map((item) => {
    const seconds = item.minutes * 60;
    return `<button class="chip length-chip${!customSelected && selectedSeconds === seconds ? ' is-selected' : ''}"
      type="button" data-length="${seconds}"${timerState ? ' disabled' : ''}>${item.label}</button>`;
  }).join('');

  if (elements.customLength) {
    elements.customLength.classList.toggle('is-selected', customSelected);
    elements.customLength.disabled = Boolean(timerState);
  }
  if (elements.customMinutes) {
    elements.customMinutes.disabled = Boolean(timerState);
    if (customSelected) elements.customMinutes.value = String(Math.round(selectedSeconds / 60));
  }
}

function setCustomLength({ focus = false } = {}) {
  if (timerState) return;
  customSelected = true;
  const minutes = Math.round(toNumber(elements.customMinutes?.value, 0));
  if (minutes >= 1 && minutes <= 720) {
    selectedSeconds = minutes * 60;
    setFieldError(elements.customMinutes, elements.lengthError, '');
  }
  renderLengthOptions();
  if (focus) elements.customMinutes?.focus();
  renderTimer();
}

function selectLength(seconds) {
  if (timerState) return;
  selectedSeconds = seconds;
  customSelected = false;
  setFieldError(elements.customMinutes, elements.lengthError, '');
  renderLengthOptions();
  renderTimer();
}

function showCompletionAlert({ silent = false } = {}) {
  if (!elements.alert) return;
  elements.alert.hidden = false;
  elements.ringWrap?.classList.add('is-complete');
  if (!silent && !alertedThisSession) {
    alertedThisSession = true;
    playChime();
  }
}

function hideCompletionAlert() {
  if (elements.alert) {
    elements.alert.hidden = true;
    const text = elements.alert.querySelector('[data-alert-text]');
    if (text) text.textContent = 'Time’s up — keep going or finish and save.';
  }
  elements.ringWrap?.classList.remove('is-complete');
  alertedThisSession = false;
}

function setCompletionNotification(now = Date.now()) {
  if (!timerState) return;
  if (activeElapsedSeconds(now) < timerState.plannedSeconds) return;
  const alreadyNotified = Boolean(timerState.completedNotified);
  if (!alreadyNotified) {
    timerState.completedNotified = true;
    persistState();
  }
  showCompletionAlert({ silent: alreadyNotified });
}

function renderTimer() {
  if (!elements.display) return;

  const elapsedSeconds = timerState ? activeElapsedSeconds() : 0;
  const plannedSeconds = timerState?.plannedSeconds ?? selectedSeconds;
  const progress = plannedSeconds > 0 ? Math.min(1, elapsedSeconds / plannedSeconds) : 0;

  elements.display.textContent = formatTimerClock(elapsedSeconds);

  if (elements.ringProgress) {
    const radius = elements.ringProgress.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    elements.ringProgress.style.strokeDasharray = String(circumference);
    elements.ringProgress.style.strokeDashoffset = String(circumference * (1 - progress));
  }

  if (!timerState) {
    elements.statusText.textContent = 'Ready to focus';
    elements.dot.dataset.state = 'idle';
    elements.subline.textContent = `of ${formatDuration(selectedSeconds)} · ready when you are`;
    elements.toggle.textContent = 'Start focus';
    elements.toggle.disabled = false;
    elements.finish.disabled = true;
    elements.subject.readOnly = false;
    elements.subject.classList.remove('is-locked');
    elements.alert.hidden = true;
    elements.ringWrap?.classList.remove('is-complete');
    renderLengthOptions();
    return;
  }

  elements.statusText.textContent =
    timerState.status === 'paused'
      ? `Paused · ${timerState.subject}`
      : `Focus session · ${timerState.subject}`;
  elements.dot.dataset.state = timerState.status === 'paused' ? 'paused' : 'running';
  elements.toggle.textContent = timerState.status === 'running' ? 'Pause' : 'Resume';
  elements.toggle.disabled = saving;
  elements.finish.disabled = saving;
  elements.subject.readOnly = true;
  elements.subject.classList.add('is-locked');

  const remaining = plannedSeconds - elapsedSeconds;
  if (remaining >= 0) {
    const minutesLeft = remainingMinutes(remaining);
    elements.subline.textContent = `of ${formatDuration(plannedSeconds)} · ${minutesLeft}m left`;
  } else {
    elements.subline.textContent = `of ${formatDuration(plannedSeconds)} · ${formatDuration(-remaining)} over`;
  }

  renderLengthOptions();
  setCompletionNotification();
}

function tick() {
  if (!timerState) return;
  if (timerState.status === 'running' && activeElapsedSeconds() >= MAX_SESSION_SECONDS) {
    timerState.accumulatedMs = MAX_SESSION_SECONDS * 1000;
    timerState.status = 'paused';
    timerState.pausedAt = Date.now();
    timerState.lastResumedAt = null;
    persistState();
    if (elements.alert) {
      elements.alert.hidden = false;
      elements.alert.querySelector('[data-alert-text]').textContent =
        'The 12-hour limit is reached. Finish and save your session.';
    }
  }
  renderTimer();
}

function startTimer() {
  const subject = normalizeSubject(elements.subject.value);
  if (!subject) {
    setFieldError(elements.subject, elements.subjectError, 'Add a subject before you start.');
    elements.subject.focus();
    return;
  }
  if (subject.length > 40) {
    setFieldError(elements.subject, elements.subjectError, 'Keep the subject under 40 characters.');
    elements.subject.focus();
    return;
  }
  if (customSelected) {
    const customMinutes = Math.round(toNumber(elements.customMinutes?.value, 0));
    if (customMinutes < 1 || customMinutes > 720) {
      setFieldError(elements.customMinutes, elements.lengthError, 'Use 1 to 720 minutes.');
      elements.customMinutes?.focus();
      return;
    }
    selectedSeconds = customMinutes * 60;
  }
  if (selectedSeconds < MIN_SESSION_SECONDS || selectedSeconds > MAX_SESSION_SECONDS) {
    setFieldError(elements.customMinutes, elements.lengthError, 'Choose between 1 minute and 12 hours.');
    elements.customMinutes?.focus();
    return;
  }

  const now = Date.now();
  primeAudio();
  timerState = {
    version: 1,
    subject,
    plannedSeconds: selectedSeconds,
    startedAt: now,
    accumulatedMs: 0,
    lastResumedAt: now,
    status: 'running',
    pausedAt: null,
    completedNotified: false
  };
  alertedThisSession = false;
  hideCompletionAlert();
  elements.subject.value = subject;
  setFieldError(elements.subject, elements.subjectError, '');
  persistState();
  renderTimer();
  showToast('Focus session started. You’ve got this.', 'success');
}

function toggleTimer() {
  if (saving) return;
  if (!timerState) {
    startTimer();
    return;
  }

  primeAudio();
  const now = Date.now();
  if (timerState.status === 'running') {
    timerState.accumulatedMs = elapsedMilliseconds(now);
    timerState.status = 'paused';
    timerState.pausedAt = now;
    timerState.lastResumedAt = null;
  } else {
    if (timerState.accumulatedMs >= MAX_SESSION_SECONDS * 1000) {
      showToast('This session has reached its 12-hour limit. Finish and save it.', 'error');
      return;
    }
    timerState.status = 'running';
    timerState.lastResumedAt = now;
    timerState.pausedAt = null;
  }
  persistState();
  renderTimer();
}

function resetAfterSave() {
  timerState = null;
  alertedThisSession = false;
  persistState();
  hideCompletionAlert();
  elements.subject.value = '';
  elements.subject.readOnly = false;
  elements.subject.classList.remove('is-locked');
  renderLengthOptions();
  renderTimer();
}

async function finishAndSave() {
  if (!timerState || saving) return;

  const now = Date.now();
  const durationSeconds = Math.floor(activeElapsedSeconds(now));
  if (durationSeconds < MIN_SESSION_SECONDS) {
    resetAfterSave();
    showToast('Session discarded — sessions need at least one minute.', 'info');
    return;
  }

  const endTime = new Date(timerState.status === 'paused' ? timerState.pausedAt : now);
  const startTime = new Date(timerState.startedAt);

  saving = true;
  renderTimer();
  setButtonBusy(elements.finish, true, 'Saving…');

  try {
    await createSession({
      subject: timerState.subject,
      startTime,
      endTime,
      durationSeconds,
      plannedDurationSeconds: timerState.plannedSeconds
    });
    resetAfterSave();
    showToast('Session saved. Nice work.', 'success');
    loadDashboard();
  } catch (error) {
    showToast(friendlyError(error, 'We could not save this session. Please try again.'), 'error');
  } finally {
    saving = false;
    setButtonBusy(elements.finish, false);
    renderTimer();
  }
}

function rankFromLeaderboard(data) {
  if (!data) return null;
  const ownRow = data.rows.find((row) => row.isYou) ?? data.you;
  return ownRow?.rank ?? null;
}

function renderTodaySessions(sessions) {
  if (!elements.sessions) return;
  elements.sessions.removeAttribute('aria-busy');

  if (!sessions.length) {
    renderEmptyState(elements.sessions, {
      icon: '☀',
      title: 'No sessions yet today',
      message: 'Start the timer and your first session will appear here.'
    });
    return;
  }

  elements.sessions.innerHTML = `<ul class="session-list">${sessions
    .map((session) => {
      const color = subjectColor(session.subject);
      return `<li class="session-list-item">
        <span class="subject-dot" style="--dot:${color}" aria-hidden="true"></span>
        <div class="session-list-main">
          <span class="session-subject">${escapeHtml(session.subject)}</span>
          <span class="session-time">${escapeHtml(formatClockTime(session.start_time))}</span>
        </div>
        <span class="session-duration">${escapeHtml(formatDuration(session.duration_seconds))}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

function showDashboardAlert(show, message = 'Some of your numbers could not load.') {
  if (!elements.dashboardAlert) return;
  elements.dashboardAlert.hidden = !show;
  const text = elements.dashboardAlert.querySelector('[data-dashboard-alert-text]');
  if (text && message) text.textContent = message;
}

async function loadDashboard() {
  const requestId = ++dashboardRequest;
  showDashboardAlert(false);
  elements.sessions?.setAttribute('aria-busy', 'true');
  if (elements.todayTotal) elements.todayTotal.textContent = '—';
  if (elements.streak) elements.streak.textContent = '—';
  if (elements.rank) elements.rank.textContent = '—';
  if (elements.level) {
    elements.level.innerHTML = '<div class="skeleton-stack" aria-hidden="true"><span class="skeleton-line skeleton-line-wide"></span><span class="skeleton-line"></span></div>';
  }

  const [sessionsResult, progressResult, teamResult] = await Promise.allSettled([
    getTodaySessions(),
    getMyProgress(),
    getLeaderboard('today')
  ]);

  if (requestId !== dashboardRequest) return;
  let failed = false;

  if (sessionsResult.status === 'fulfilled') {
    const sessions = sessionsResult.value;
    if (elements.todayTotal) elements.todayTotal.textContent = formatDuration(sumDuration(sessions));
    renderTodaySessions(sessions);
  } else {
    failed = true;
    elements.sessions?.removeAttribute('aria-busy');
    renderErrorState(elements.sessions, {
      title: 'Today’s sessions are out of reach',
      message: 'Check your connection and try again.',
      onRetry: loadDashboard
    });
  }

  if (progressResult.status === 'fulfilled') {
    if (elements.streak) elements.streak.textContent = `${progressResult.value.streak} days`;
    renderLevelCard(elements.level, progressResult.value);
  } else {
    failed = true;
    if (elements.streak) elements.streak.textContent = '—';
    renderErrorState(elements.level, {
      title: 'Level unavailable',
      message: 'We could not load your progress right now.',
      onRetry: loadDashboard
    });
  }

  if (teamResult.status === 'fulfilled') {
    const rank = rankFromLeaderboard(teamResult.value);
    if (elements.rank) elements.rank.textContent = rank ? `#${rank}` : '—';
    if (elements.rank) {
      elements.rank.title = rank ? `Rank ${rank} today` : 'No studied time today';
    }
  } else {
    failed = true;
    if (elements.rank) elements.rank.textContent = '—';
  }

  if (failed) showDashboardAlert(true);
}

function restoreTimer() {
  const stored = readStoredState();
  if (!stored) {
    timerState = null;
    renderLengthOptions();
    renderTimer();
    return;
  }

  timerState = stored;
  selectedSeconds = stored.plannedSeconds;
  customSelected = !SESSION_LENGTHS.some((item) => item.minutes * 60 === stored.plannedSeconds);
  elements.subject.value = stored.subject;
  renderLengthOptions();
  renderTimer();
  showToast('Your focus session was restored.', 'info');
}

function bindEvents() {
  elements.subject.addEventListener('input', () => {
    setFieldError(elements.subject, elements.subjectError, '');
  });

  elements.lengthChips.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-length]');
    if (!chip || timerState) return;
    selectLength(toNumber(chip.dataset.length));
  });

  elements.customLength?.addEventListener('click', () => setCustomLength({ focus: true }));
  elements.customMinutes?.addEventListener('input', () => {
    if (timerState) return;
    customSelected = true;
    const minutes = Math.round(toNumber(elements.customMinutes.value, 0));
    if (minutes >= 1 && minutes <= 720) {
      selectedSeconds = minutes * 60;
      setFieldError(elements.customMinutes, elements.lengthError, '');
    } else {
      setFieldError(elements.customMinutes, elements.lengthError, 'Use 1 to 720 minutes.');
    }
    renderLengthOptions();
    renderTimer();
  });

  elements.toggle.addEventListener('click', toggleTimer);
  elements.finish.addEventListener('click', finishAndSave);
  elements.dashboardRetry?.addEventListener('click', loadDashboard);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderTimer();
  });
}

function startTicker() {
  window.clearInterval(ticker);
  ticker = window.setInterval(tick, TICK_MS);
}

async function init() {
  const session = await requireAuth();
  if (!session) return;

  userId = session.user.id;
  bindEvents();
  restoreTimer();
  renderTimer();
  startTicker();
  loadDashboard();
}

window.addEventListener('pagehide', () => window.clearInterval(ticker));
window.addEventListener('pageshow', (event) => {
  if (!event.persisted || !userId) return;
  renderTimer();
  startTicker();
});

init();
