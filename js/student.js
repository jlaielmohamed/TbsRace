import './nav.js';
import { requireAuth } from './guard.js';
import { getStudentProfile } from './studentProfile.js';
import { getSignedFileUrl } from './storage.js';
import { formatDuration, initials } from './utils.js';
import { friendlyError, renderErrorState } from './ui.js';

const elements = {
  loading: document.getElementById('student-loading'),
  error: document.getElementById('student-error'),
  content: document.getElementById('student-content'),
  avatar: document.querySelector('.student-avatar'),
  avatarPhoto: document.getElementById('student-avatar-photo'),
  avatarInitials: document.getElementById('student-avatar-initials'),
  name: document.getElementById('student-name'),
  classYear: document.getElementById('student-class'),
  levelChip: document.getElementById('student-level-chip'),
  levelName: document.getElementById('student-level-name'),
  today: document.getElementById('student-today'),
  total: document.getElementById('student-total'),
  edit: document.getElementById('student-edit'),
  status: document.getElementById('student-status')
};

const profileId = String(new URLSearchParams(window.location.search).get('id') ?? '').trim();
let loadToken = 0;
let loading = false;

function setStatus(message) {
  if (elements.status) elements.status.textContent = message;
}

function setAvatar(profile) {
  if (!elements.avatar || !elements.avatarPhoto) return;

  const path = profile.avatarPath || '';
  elements.avatar.dataset.avatarPath = path;
  elements.avatar.classList.remove('has-photo');
  elements.avatarPhoto.hidden = true;
  elements.avatarPhoto.removeAttribute('src');

  if (!path) return;

  getSignedFileUrl(path)
    .then((url) => {
      if (!url || elements.avatar?.dataset.avatarPath !== path) return;
      elements.avatarPhoto.addEventListener('load', () => {
        if (elements.avatar?.dataset.avatarPath !== path) return;
        elements.avatarPhoto.hidden = false;
        elements.avatar.classList.add('has-photo');
      }, { once: true });
      elements.avatarPhoto.addEventListener('error', () => {
        elements.avatarPhoto.hidden = true;
        elements.avatarPhoto.removeAttribute('src');
      }, { once: true });
      elements.avatarPhoto.src = url;
    })
    .catch(() => {
      if (elements.avatar?.dataset.avatarPath !== path) return;
      elements.avatarPhoto.hidden = true;
      elements.avatarPhoto.removeAttribute('src');
    });
}

function render(profile) {
  if (!elements.content) return;

  if (elements.name) elements.name.textContent = profile.name;
  if (elements.classYear) elements.classYear.textContent = profile.classYear;
  if (elements.levelChip) elements.levelChip.textContent = `Lv ${profile.level}`;
  if (elements.levelName) elements.levelName.textContent = profile.levelName;
  if (elements.today) elements.today.textContent = formatDuration(profile.todaySeconds);
  if (elements.total) elements.total.textContent = formatDuration(profile.totalSeconds);
  if (elements.avatarInitials) elements.avatarInitials.textContent = initials(profile.name);
  if (elements.edit) elements.edit.hidden = !profile.isYou;

  document.title = `${profile.name} · TbsRace`;
  setAvatar(profile);

  if (elements.loading) elements.loading.hidden = true;
  if (elements.error) {
    elements.error.hidden = true;
    elements.error.replaceChildren();
  }
  elements.content.hidden = false;
  setStatus(`${profile.name}'s profile loaded.`);
}

function errorCopy(error) {
  if (error?.code === 'student_missing') {
    return {
      title: 'No student selected',
      message: 'Open a student from the leaderboard to see their public profile.'
    };
  }
  if (error?.code === 'student_not_found') {
    return {
      title: 'Student not found',
      message: 'This profile may have been removed or the link is incomplete.'
    };
  }
  return {
    title: 'We could not load this profile',
    message: friendlyError(error, 'Check your connection and try again.')
  };
}

function showError(error) {
  if (elements.loading) elements.loading.hidden = true;
  if (elements.content) elements.content.hidden = true;
  if (!elements.error) return;

  const copy = errorCopy(error);
  elements.error.hidden = false;
  renderErrorState(elements.error, {
    title: copy.title,
    message: copy.message,
    onRetry: profileId ? () => load() : null
  });
  setStatus(copy.message);
}

async function load() {
  if (loading) return;
  loading = true;
  const token = ++loadToken;

  if (elements.error) {
    elements.error.hidden = true;
    elements.error.replaceChildren();
  }
  if (elements.content) elements.content.hidden = true;
  if (elements.loading) elements.loading.hidden = false;
  setStatus('Loading student profile.');

  try {
    if (!profileId) {
      const missing = new Error('Student profile is missing.');
      missing.code = 'student_missing';
      throw missing;
    }

    const profile = await getStudentProfile(profileId);
    if (token !== loadToken) return;
    render(profile);
  } catch (error) {
    if (token !== loadToken) return;
    showError(error);
  } finally {
    loading = false;
  }
}

async function init() {
  const session = await requireAuth();
  if (!session) return;
  await load();
}

init();
