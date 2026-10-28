import {
  MAX_SESSION_SECONDS,
  MIN_SESSION_SECONDS,
  TIMER_STORAGE_PREFIX
} from './config.js';
import { requireAuth } from './guard.js';
import { createSession } from './sessions.js';
import {
  formatTimerClock,
  formatDuration,
  remainingMinutes
} from './utils.js';
import {
  friendlyError,
  setButtonBusy,
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
  alert: document.getElementById('timer-alert')
};

const TICK_MS = 250;
let userId = null;
let timerState = null;
let ticker = null;
let saving = false;

function storageKey() {
  return userId ? `${TIMER_STORAGE_PREFIX}${userId}` : '';
}

function readStoredState() {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistState() {
  if (!userId) return;
  try {
    if (timerState) localStorage.setItem(storageKey(), JSON.stringify(timerState));
    else localStorage.removeItem(storageKey());
  } catch {}
}

function activeElapsedSeconds(now = Date.now()) {
  if (!timerState) return 0;
  if (timerState.status === 'running') {
    return (timerState.accumulatedMs + Math.max(0, now - timerState.lastResumedAt)) / 1000;
  }
  return timerState.accumulatedMs / 1000;
}

function renderTimer() {
  if (!elements.display) return;
  const now = Date.now();
  const elapsedSeconds = activeElapsedSeconds(now);
  const plannedSeconds = timerState?.plannedSeconds ?? 0;
  const progress = plannedSeconds > 0 ? Math.min(1, elapsedSeconds / plannedSeconds) : 0;

  elements.display.textContent = formatTimerClock(elapsedSeconds);
  if (elements.ringProgress) {
    const radius = elements.ringProgress.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    elements.ringProgress.style.strokeDasharray = String(circumference);
    elements.ringProgress.style.strokeDashoffset = String(circumference * (1 - progress));
  }

  if (!timerState) return;

  elements.statusText.textContent = timerState.status === 'paused' ? `Paused · ${timerState.subject}` : `Focusing · ${timerState.subject}`;
  elements.dot.dataset.state = timerState.status;
  elements.toggle.textContent = timerState.status === 'running' ? 'Pause' : 'Resume';
  elements.toggle.disabled = saving;
  elements.finish.disabled = saving;
  const remaining = plannedSeconds - elapsedSeconds;
  if (remaining >= 0) {
    elements.subline.textContent = `of ${formatDuration(plannedSeconds)} · ${remainingMinutes(remaining)}m left`;
  } else {
    elements.subline.textContent = `of ${formatDuration(plannedSeconds)} · ${formatDuration(-remaining)} over`;
  }

  if (elapsedSeconds >= plannedSeconds) {
    elements.alert.hidden = false;
  } else {
    elements.alert.hidden = true;
  }
}

function tick() {
  if (!timerState) return;
  if (timerState.status === 'running' && activeElapsedSeconds() >= MAX_SESSION_SECONDS) {
    timerState.accumulatedMs = MAX_SESSION_SECONDS * 1000;
    timerState.status = 'paused';
    timerState.pausedAt = Date.now();
    timerState.lastResumedAt = null;
    persistState();
  }
  renderTimer();
}

function toggleTimer() {
  if (saving || !timerState) return;
  const now = Date.now();
  if (timerState.status === 'running') {
    timerState.accumulatedMs = (timerState.accumulatedMs + Math.max(0, now - timerState.lastResumedAt));
    timerState.status = 'paused';
    timerState.pausedAt = now;
    timerState.lastResumedAt = null;
  } else {
    timerState.status = 'running';
    timerState.lastResumedAt = now;
    timerState.pausedAt = null;
  }
  persistState();
  renderTimer();
}

async function finishAndSave() {
  if (!timerState || saving) return;
  const now = Date.now();
  const durationSeconds = Math.floor(activeElapsedSeconds(now));
  if (durationSeconds < MIN_SESSION_SECONDS) {
    localStorage.removeItem(storageKey());
    timerState = null;
    window.location.href = './timer.html';
    showToast('Session too short to save.', 'info');
    return;
  }

  saving = true;
  renderTimer();
  setButtonBusy(elements.finish, true, 'Saving…');

  try {
    await createSession({
      subject: timerState.subject,
      startTime: new Date(timerState.startedAt),
      endTime: new Date(timerState.status === 'paused' ? timerState.pausedAt : now),
      durationSeconds,
      plannedDurationSeconds: timerState.plannedSeconds
    });
    localStorage.removeItem(storageKey());
    window.location.href = './timer.html';
  } catch (error) {
    showToast(friendlyError(error, 'Could not save session.'), 'error');
  } finally {
    saving = false;
    setButtonBusy(elements.finish, false);
    renderTimer();
  }
}

async function init() {
  const session = await requireAuth();
  if (!session) return;
  userId = session.user.id;
  timerState = readStoredState();
  if (!timerState) {
    window.location.href = './timer.html';
    return;
  }
  elements.toggle.addEventListener('click', toggleTimer);
  elements.finish.addEventListener('click', finishAndSave);
  renderTimer();
  ticker = window.setInterval(tick, TICK_MS);
}

window.addEventListener('pagehide', () => window.clearInterval(ticker));
init();
