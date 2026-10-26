import './nav.js';
import { LEADERBOARD_REFRESH_MS, PERIODS } from './config.js';
import { requireAuth } from './guard.js';
import { getLeaderboard } from './leaderboardData.js';
import { getSignedFileUrl } from './storage.js';
import {
  escapeHtml,
  formatCount,
  formatDuration,
  initials
} from './utils.js';
import {
  friendlyError,
  renderEmptyState,
  renderErrorState,
  showToast
} from './ui.js';

const elements = {
  tabs: Array.from(document.querySelectorAll('[data-period]')),
  panel: document.getElementById('leaderboard-panel'),
  list: document.getElementById('leaderboard-list'),
  youWrap: document.getElementById('leaderboard-you'),
  youList: document.getElementById('leaderboard-you-list'),
  note: document.getElementById('leaderboard-note'),
  status: document.getElementById('leaderboard-status')
};

let period = PERIODS.includes(new URLSearchParams(window.location.search).get('period'))
  ? new URLSearchParams(window.location.search).get('period')
  : 'today';
let requestId = 0;
let hasData = false;
let refreshTimer = null;

function avatarMarkup(row) {
  const fallback = escapeHtml(initials(row.name));
  const photo = row.avatarPath
    ? `<img class="leaderboard-avatar-photo" alt="" data-avatar-path="${escapeHtml(row.avatarPath)}" hidden>`
    : '';
  return `<span class="leaderboard-avatar" aria-hidden="true">
    <span class="leaderboard-avatar-initials">${fallback}</span>
    ${photo}
  </span>`;
}

function rowInnerMarkup(row) {
  const rankClass = row.rank <= 3 ? ` rank-${row.rank}` : '';
  return `<span class="leaderboard-rank${rankClass}" aria-label="Rank ${row.rank}">${row.rank}</span>
    <span class="leaderboard-name">
      ${avatarMarkup(row)}
      <span class="leaderboard-name-text">${escapeHtml(row.name)}</span>
      ${row.isYou ? '<span class="you-badge">You</span>' : ''}
    </span>
    <span class="level-chip">Lv ${row.level}</span>
    <span class="leaderboard-time">${escapeHtml(formatDuration(row.seconds))}</span>`;
}

function rowMarkup(row) {
  const className = `leaderboard-row${row.isYou ? ' is-you' : ''}`;
  if (!row.profileId) {
    return `<li class="${className}"><span class="leaderboard-row-inner">${rowInnerMarkup(row)}</span></li>`;
  }

  const href = `./student.html?id=${encodeURIComponent(row.profileId)}`;
  return `<li class="${className}">
    <a class="leaderboard-row-inner leaderboard-row-link" href="${escapeHtml(href)}"
      aria-label="View ${escapeHtml(row.name)}'s profile">${rowInnerMarkup(row)}</a>
  </li>`;
}

function skeletonMarkup(rows = 7) {
  return Array.from({ length: rows }, () => `
    <li class="leaderboard-row leaderboard-row-skeleton" aria-hidden="true">
      <span class="leaderboard-row-inner">
        <span class="skeleton-dot"></span>
        <span class="skeleton-line skeleton-line-name"></span>
        <span class="skeleton-line skeleton-line-chip"></span>
        <span class="skeleton-line skeleton-line-time"></span>
      </span>
    </li>`).join('');
}

/** Resolve private avatar paths to signed URLs without blocking the ranking. */
function hydrateAvatars(scope) {
  if (!scope) return;
  scope.querySelectorAll('img[data-avatar-path]').forEach((photo) => {
    const path = photo.dataset.avatarPath;
    if (!path || photo.dataset.avatarState === 'loading' || photo.dataset.avatarState === 'ready') {
      return;
    }
    photo.dataset.avatarState = 'loading';

    getSignedFileUrl(path)
      .then((url) => {
        if (!url || !photo.isConnected) return;
        photo.addEventListener('load', () => {
          if (!photo.isConnected) return;
          photo.hidden = false;
          photo.dataset.avatarState = 'ready';
          photo.closest('.leaderboard-avatar')?.classList.add('has-photo');
        }, { once: true });
        photo.addEventListener('error', () => {
          photo.hidden = true;
          photo.removeAttribute('src');
          photo.dataset.avatarState = 'failed';
        }, { once: true });
        photo.src = url;
      })
      .catch(() => {
        photo.hidden = true;
        photo.removeAttribute('src');
        photo.dataset.avatarState = 'failed';
      });
  });
}

function updateTabs() {
  elements.tabs.forEach((tab) => {
    const selected = tab.dataset.period === period;
    tab.classList.toggle('is-selected', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
}

function updateUrl() {
  const url = new URL(window.location.href);
  if (period === 'today') url.searchParams.delete('period');
  else url.searchParams.set('period', period);
  window.history.replaceState({}, '', url);
}

function noteText(totalStudents) {
  if (period === 'month') {
    return `Resets on the 1st · ${formatCount(totalStudents)} students racing`;
  }
  if (period === 'all') {
    return `All-time rankings · ${formatCount(totalStudents)} students racing`;
  }
  return `Resets daily at midnight · ${formatCount(totalStudents)} students racing`;
}

function showYouOutside(row) {
  if (!elements.youWrap || !elements.youList) return;
  if (!row) {
    elements.youWrap.hidden = true;
    return;
  }
  elements.youWrap.hidden = false;
  elements.youList.innerHTML = rowMarkup(row);
  hydrateAvatars(elements.youList);
}

function setStatus(message) {
  if (elements.status) elements.status.textContent = message;
}

function render(data) {
  hasData = true;
  elements.panel?.removeAttribute('aria-busy');
  elements.list.innerHTML = data.rows.length
    ? data.rows.map(rowMarkup).join('')
    : '';

  if (!data.rows.length) {
    elements.list.innerHTML = '<li class="leaderboard-empty-row"></li>';
    renderEmptyState(elements.list.firstElementChild, {
      icon: '◇',
      title: 'No one has studied yet',
      message:
        period === 'today'
          ? 'Be the first to put time on the board today.'
          : 'The board is waiting for its first session in this period.'
    });
  }

  hydrateAvatars(elements.list);

  const ownRow = data.rows.find((row) => row.isYou) ?? data.you;
  showYouOutside(ownRow && !data.rows.some((row) => row.isYou) ? ownRow : null);

  if (!ownRow) {
    setStatus(
      period === 'today'
        ? 'You have not studied today yet. Start a session to join the board.'
        : 'You have no sessions in this period yet.'
    );
  } else {
    setStatus(`Your rank is ${ownRow.rank}.`);
  }

  if (elements.note) elements.note.textContent = noteText(data.totalStudents);
}

async function load({ silent = false } = {}) {
  const currentRequest = ++requestId;
  if (!silent) {
    elements.panel?.setAttribute('aria-busy', 'true');
    elements.list.innerHTML = skeletonMarkup();
    showYouOutside(null);
    if (elements.note) elements.note.textContent = 'Loading the race…';
    setStatus('Loading leaderboard.');
  }

  try {
    const data = await getLeaderboard(period);
    if (currentRequest !== requestId) return;
    render(data);
  } catch (error) {
    if (currentRequest !== requestId) return;
    elements.panel?.removeAttribute('aria-busy');
    if (hasData && silent) {
      showToast(friendlyError(error, 'The leaderboard could not refresh.'), 'error');
      return;
    }
    elements.list.innerHTML = '<li class="leaderboard-state-row"></li>';
    renderErrorState(elements.list.firstElementChild, {
      title: 'The leaderboard is taking a break',
      message: friendlyError(error, 'Check your connection and try again.'),
      onRetry: () => load()
    });
    showYouOutside(null);
    if (elements.note) elements.note.textContent = 'Could not load rankings.';
    setStatus('The leaderboard could not load.');
  }
}

function selectPeriod(nextPeriod, { focus = false } = {}) {
  if (!PERIODS.includes(nextPeriod) || nextPeriod === period) return;
  period = nextPeriod;
  updateTabs();
  updateUrl();
  elements.panel?.setAttribute('aria-labelledby', `tab-period-${period}`);
  if (focus) elements.tabs.find((tab) => tab.dataset.period === period)?.focus();
  load();
}

function setUpTabs() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', () => selectPeriod(tab.dataset.period));
    tab.addEventListener('keydown', (event) => {
      const currentIndex = elements.tabs.indexOf(tab);
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % elements.tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + elements.tabs.length) % elements.tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = elements.tabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      selectPeriod(elements.tabs[nextIndex].dataset.period, { focus: true });
    });
  });
}

async function init() {
  const session = await requireAuth();
  if (!session) return;

  updateTabs();
  elements.panel?.setAttribute('role', 'tabpanel');
  elements.panel?.setAttribute('aria-labelledby', `tab-period-${period}`);
  setUpTabs();
  await load();

  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') load({ silent: true });
  }, LEADERBOARD_REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') load({ silent: true });
  });
  window.addEventListener('pagehide', () => window.clearInterval(refreshTimer));
}

init();
