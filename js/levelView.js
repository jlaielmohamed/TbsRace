import { clamp, escapeHtml, formatDuration, toNumber } from './utils.js';

function normalized(progress) {
  return {
    level: toNumber(progress?.level, 1),
    levelName: String(progress?.level_name ?? 'Rookie'),
    totalSeconds: toNumber(progress?.total_seconds),
    nextLevelName: progress?.next_level_name ? String(progress.next_level_name) : null,
    hoursToNext: Math.max(0, Math.ceil(toNumber(progress?.hours_to_next))),
    percent: clamp(toNumber(progress?.progress_percent), 0, 100),
    bonusHours: toNumber(progress?.bonus_hours)
  };
}

function formatBonusHours(hours) {
  return String(Number(Math.max(0, hours).toFixed(2)));
}

function bonusCopy(hours, emptyCopy) {
  if (hours <= 0) return emptyCopy;
  return `${formatBonusHours(hours)}h bonus progress included`;
}

export function levelCardMarkup(progress) {
  const data = normalized(progress);
  const meta = data.nextLevelName
    ? `${formatDuration(data.totalSeconds)} studied · ${data.hoursToNext}h to ${escapeHtml(data.nextLevelName)}`
    : `${formatDuration(data.totalSeconds)} studied · Top level reached`;

  return `
    <div class="level-card-top">
      <div class="level-medallion" style="--pct:${data.percent}" aria-hidden="true">
        <span>${data.level}</span>
      </div>
      <div class="level-card-copy">
        <p class="eyebrow">Your level</p>
        <div class="level-title-row">
          <h3>${escapeHtml(data.levelName)}</h3>
          <span class="level-chip">Lv ${data.level}</span>
        </div>
        <p class="level-meta">${meta}</p>
      </div>
    </div>
    <div class="progress level-progress" role="progressbar" aria-label="Progress to the next level"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="${data.percent}"
      aria-valuetext="${data.percent}% to ${escapeHtml(data.nextLevelName ?? 'the top level')}">
      <span style="width:${data.percent}%"></span>
    </div>
    <p class="level-bonus">${bonusCopy(data.bonusHours, 'Study time and streaks grow your level')}</p>`;
}

export function renderLevelCard(container, progress) {
  if (!container) return;
  container.innerHTML = levelCardMarkup(progress);
}

export function renderLevelHero(container, progress) {
  if (!container) return;
  const data = normalized(progress);
  const nextCopy = data.nextLevelName
    ? `${formatDuration(data.totalSeconds)} studied · ${data.hoursToNext}h to ${escapeHtml(data.nextLevelName)}`
    : `${formatDuration(data.totalSeconds)} studied · you have reached the top`;

  container.innerHTML = `
    <div class="level-hero-main">
      <div class="level-orbit" style="--pct:${data.percent}" aria-hidden="true">
        <div class="level-orbit-inner">
          <span class="level-orbit-number">${data.level}</span>
          <span class="level-orbit-label">Level</span>
        </div>
      </div>
      <div class="level-hero-copy">
        <p class="eyebrow">Current level</p>
        <h2>${escapeHtml(data.levelName)}</h2>
        <p class="level-hero-meta">${nextCopy}</p>
        <div class="progress level-hero-progress" role="progressbar" aria-label="Progress to the next level"
          aria-valuemin="0" aria-valuemax="100" aria-valuenow="${data.percent}"
          aria-valuetext="${data.percent}% to ${escapeHtml(data.nextLevelName ?? 'the top level')}">
          <span style="width:${data.percent}%"></span>
        </div>
        <p class="level-bonus">${bonusCopy(data.bonusHours, 'Every saved session moves you forward')}</p>
      </div>
    </div>`;
}
