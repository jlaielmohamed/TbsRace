import './nav.js';
import {
  GOAL_DAY_BONUS_HOURS,
  LEVELS,
  MAX_LEVEL_BONUS_HOURS,
  STREAK_DAY_BONUS_HOURS
} from './config.js';
import { requireAuth } from './guard.js';
import { getMyProgress } from './progress.js';
import { renderLevelHero } from './levelView.js';
import { escapeHtml, formatDuration, toNumber } from './utils.js';
import { friendlyError, setButtonBusy } from './ui.js';

const LEVEL_ACCENTS = ['#d8b44a', '#3ed19b', '#6b9df8', '#ff7d67', '#b59cff', '#e7c45d'];

const LEVEL_NOTES = {
  Rookie: 'The starting line. Every minute counts now.',
  Focused: 'A rhythm is forming. Keep showing up.',
  Grinder: 'Consistency is compounding. This is the grind.',
  Scholar: 'Deep work is becoming your default.',
  Master: 'Rare air. Few students make it this far.',
  Legend: 'Top of the race. Protect the lead.'
};

const elements = {
  content: document.getElementById('levels-content'),
  hero: document.getElementById('levels-hero'),
  grid: document.getElementById('levels-grid'),
  alert: document.getElementById('levels-alert'),
  error: document.getElementById('levels-error'),
  retry: document.getElementById('levels-retry'),
  bonus: document.getElementById('levels-bonus'),
  streak: document.getElementById('levels-streak'),
  goalDays: document.getElementById('levels-goal-days'),
  cap: document.getElementById('levels-cap'),
  status: document.getElementById('levels-status')
};

let loading = false;

function effectiveHours(progress) {
  return Math.max(0, toNumber(progress?.effective_hours));
}

function nodeState(threshold, progress) {
  const effective = effectiveHours(progress);
  if (progress?.level === LEVELS.find((level) => level.hours === threshold)?.level) return 'current';
  if (effective >= threshold) return 'complete';
  return 'locked';
}

function nodeMarkup(level, progress) {
  const state = nodeState(level.hours, progress);
  const accent = LEVEL_ACCENTS[level.level - 1] ?? LEVEL_ACCENTS[0];
  const effective = effectiveHours(progress);
  const statusCopy =
    state === 'current'
      ? `You are here · ${effective.toFixed(1)}h effective`
      : state === 'complete'
        ? 'Unlocked'
        : `Locked · ${level.hours}h needed`;

  let progressBar = '';
  if (state === 'current') {
    progressBar = `
      <div class="progress level-node-progress" role="progressbar" aria-label="Progress within ${escapeHtml(level.name)}"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(toNumber(progress?.progress_percent))}">
        <span style="width:${Math.max(0, Math.min(100, toNumber(progress?.progress_percent)))}%"></span>
      </div>`;
  }

  return `
    <article class="level-node is-${state}" style="--accent:${accent}">
      <div class="level-node-head">
        <span class="level-node-medal" aria-hidden="true">${level.level}</span>
        <div class="level-node-copy">
          <h3>${escapeHtml(level.name)}</h3>
          <p>${level.hours === 0 ? 'From your first session' : `From ${level.hours}h studied`}</p>
        </div>
      </div>
      <p class="level-node-status">${escapeHtml(statusCopy)}</p>
      ${progressBar}
      <p class="level-node-note">${escapeHtml(LEVEL_NOTES[level.name] ?? '')}</p>
    </article>`;
}

function render(progress) {
  renderLevelHero(elements.hero, progress);
  if (elements.grid) {
    elements.grid.innerHTML = LEVELS.map((level) => nodeMarkup(level, progress)).join('');
  }

  const bonusHours = Math.max(0, toNumber(progress?.bonus_hours));
  const streak = Math.max(0, toNumber(progress?.streak));
  const goalDays = Math.max(0, toNumber(progress?.goal_days));
  if (elements.bonus) elements.bonus.textContent = `${bonusHours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}h`;
  if (elements.streak) elements.streak.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;
  if (elements.goalDays) elements.goalDays.textContent = String(goalDays);
  if (elements.cap) elements.cap.textContent = `${MAX_LEVEL_BONUS_HOURS}h`;

  if (elements.status) {
    elements.status.textContent = `Level ${progress?.level ?? 1}, ${progress?.level_name ?? 'Rookie'}, ${formatDuration(progress?.total_seconds)} studied.`;
  }
}

function setLoading(isLoading) {
  loading = isLoading;
  elements.content?.classList.toggle('is-loading', isLoading);
  elements.content?.setAttribute('aria-busy', String(isLoading));
  if (elements.retry) setButtonBusy(elements.retry, isLoading, 'Loading…');
}

function showError(error) {
  if (elements.content) elements.content.hidden = true;
  if (elements.error) elements.error.hidden = false;
  const message = elements.error?.querySelector('[data-error-message]');
  if (message) {
    message.textContent = friendlyError(
      error,
      'Your level could not load. Check your connection and try again.'
    );
  }
  if (elements.status) elements.status.textContent = 'Your level could not load.';
}

async function load() {
  if (loading) return;
  setLoading(true);
  if (elements.error) elements.error.hidden = true;
  if (elements.content) elements.content.hidden = false;

  try {
    const progress = await getMyProgress();
    render(progress);
  } catch (error) {
    showError(error);
  } finally {
    setLoading(false);
    if (elements.content) elements.content.classList.remove('is-loading');
  }
}

async function init() {
  const session = await requireAuth();
  if (!session) return;

  elements.retry?.addEventListener('click', load);
  if (elements.cap) elements.cap.textContent = `${MAX_LEVEL_BONUS_HOURS}h`;
  if (elements.alert) {
    elements.alert.hidden = false;
    const message = elements.alert.querySelector('[data-bonus-message]');
    if (message) {
      message.textContent = `Daily goal: +${GOAL_DAY_BONUS_HOURS}h · each streak day: +${STREAK_DAY_BONUS_HOURS}h · capped at ${MAX_LEVEL_BONUS_HOURS}h.`;
    }
  }
  await load();
}

init();
