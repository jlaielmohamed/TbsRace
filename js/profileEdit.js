import { refreshHeaderIdentity } from './nav.js';
import { requireAuth } from './guard.js';
import { getProfile, clearProfileCache, isMissingAvatarColumn } from './profile.js';
import { supabase } from './supabaseClient.js';
import {
  AVATAR_FEATURE,
  getSignedFileUrl,
  removeStoredFile,
  uploadImage,
  validateImageFile
} from './storage.js';
import { initials } from './utils.js';
import {
  friendlyError,
  renderErrorState,
  setButtonBusy,
  setFieldError,
  setFormMessage,
  showToast
} from './ui.js';

const elements = {
  content: document.getElementById('profile-content'),
  form: document.getElementById('profile-form'),
  error: document.getElementById('profile-error'),
  status: document.getElementById('profile-status'),
  name: document.getElementById('profile-name'),
  nameError: document.getElementById('profile-name-error'),
  email: document.getElementById('profile-email'),
  goal: document.getElementById('profile-goal'),
  goalError: document.getElementById('profile-goal-error'),
  classError: document.getElementById('profile-class-error'),
  message: document.getElementById('profile-message'),
  save: document.getElementById('profile-save'),
  avatarInput: document.getElementById('profile-avatar-input'),
  avatarError: document.getElementById('profile-avatar-error'),
  avatarRemove: document.getElementById('profile-avatar-remove'),
  avatarPhoto: document.getElementById('profile-avatar-photo'),
  avatarInitials: document.getElementById('profile-avatar-initials'),
  previewPhoto: document.getElementById('profile-preview-photo'),
  previewInitials: document.getElementById('profile-preview-initials'),
  previewName: document.getElementById('profile-preview-name'),
  previewClass: document.getElementById('profile-preview-class'),
  previewGoal: document.getElementById('profile-preview-goal')
};

const classInputs = [...document.querySelectorAll('input[name="class_year"]')];
const classFieldset = document.querySelector('.class-fieldset');

let session = null;
let currentProfile = null;
let loading = false;
let saving = false;
let savedAvatarPath = null;
let pendingAvatarFile = null;
let pendingAvatarUrl = null;
let avatarRemoved = false;
let avatarRenderToken = 0;

function setStatus(message) {
  if (elements.status) elements.status.textContent = message;
}

function selectedClass() {
  return classInputs.find((input) => input.checked)?.value ?? '';
}

function goalValue() {
  const value = Number(elements.goal?.value);
  return Number.isInteger(value) ? value : null;
}

function revokePendingAvatarUrl() {
  if (pendingAvatarUrl) URL.revokeObjectURL(pendingAvatarUrl);
  pendingAvatarUrl = null;
}

function clearPendingAvatar() {
  pendingAvatarFile = null;
  revokePendingAvatarUrl();
}

function setAvatarPhotos(url) {
  [elements.avatarPhoto, elements.previewPhoto].forEach((photo) => {
    if (!photo) return;
    if (url) {
      photo.src = url;
      photo.hidden = false;
    } else {
      photo.removeAttribute('src');
      photo.hidden = true;
    }
  });
}

function setAvatarInitials(name) {
  const value = initials(name);
  if (elements.avatarInitials) elements.avatarInitials.textContent = value;
  if (elements.previewInitials) elements.previewInitials.textContent = value;
}

async function renderSavedAvatar(path) {
  const token = (avatarRenderToken += 1);
  if (!path) {
    setAvatarPhotos('');
    return;
  }

  try {
    const url = await getSignedFileUrl(path);
    if (token !== avatarRenderToken) return;
    setAvatarPhotos(url);
  } catch {
    if (token !== avatarRenderToken) return;
    setAvatarPhotos('');
  }
}

function syncAvatarControls() {
  if (!elements.avatarRemove) return;

  if (pendingAvatarFile) {
    elements.avatarRemove.hidden = false;
    elements.avatarRemove.textContent = 'Clear selection';
  } else if (savedAvatarPath) {
    elements.avatarRemove.hidden = false;
    elements.avatarRemove.textContent = avatarRemoved ? 'Keep current photo' : 'Remove photo';
  } else {
    elements.avatarRemove.hidden = true;
    elements.avatarRemove.textContent = 'Remove photo';
  }
}

function handleAvatarChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  setFieldError(elements.avatarInput, elements.avatarError, '');

  try {
    validateImageFile(file);
  } catch (error) {
    setFieldError(
      elements.avatarInput,
      elements.avatarError,
      friendlyError(error, 'Choose a JPG, PNG or WebP image smaller than 5 MB.')
    );
    event.target.value = '';
    return;
  }

  clearPendingAvatar();
  pendingAvatarFile = file;
  pendingAvatarUrl = URL.createObjectURL(file);
  avatarRemoved = false;
  avatarRenderToken += 1;
  setAvatarPhotos(pendingAvatarUrl);
  syncAvatarControls();
  event.target.value = '';
  setStatus('New profile picture selected. Save your profile to upload it.');
}

function handleAvatarRemove() {
  if (saving || (!pendingAvatarFile && !savedAvatarPath)) return;

  setFieldError(elements.avatarInput, elements.avatarError, '');
  if (elements.avatarInput) elements.avatarInput.value = '';

  if (pendingAvatarFile) {
    clearPendingAvatar();
    avatarRemoved = false;
    syncAvatarControls();
    if (savedAvatarPath) renderSavedAvatar(savedAvatarPath);
    else {
      avatarRenderToken += 1;
      setAvatarPhotos('');
    }
    setStatus('Photo selection cleared.');
    return;
  }

  if (avatarRemoved) {
    avatarRemoved = false;
    syncAvatarControls();
    renderSavedAvatar(savedAvatarPath);
    setStatus('Current profile picture kept.');
    return;
  }

  avatarRemoved = true;
  avatarRenderToken += 1;
  syncAvatarControls();
  setAvatarPhotos('');
  setStatus('Profile picture will be removed when you save.');
}

function updatePreview() {
  const name = elements.name?.value.trim() || 'Student';
  const classYear = selectedClass();
  const goal = goalValue();

  setAvatarInitials(name);
  if (elements.previewName) elements.previewName.textContent = name;
  if (elements.previewClass) elements.previewClass.textContent = classYear || 'No class selected';
  if (elements.previewGoal) {
    elements.previewGoal.textContent = goal ? `${goal} min daily goal` : 'Daily goal not set';
  }
}

function fillForm(profile, user) {
  if (elements.name) elements.name.value = profile.full_name;
  if (elements.email) elements.email.value = user?.email ?? '';
  if (elements.goal) elements.goal.value = String(profile.daily_goal_minutes);
  classInputs.forEach((input) => {
    input.checked = input.value === profile.class_year;
  });

  savedAvatarPath = profile.avatar_path || null;
  avatarRemoved = false;
  clearPendingAvatar();
  setFieldError(elements.avatarInput, elements.avatarError, '');
  if (elements.avatarInput) elements.avatarInput.value = '';
  syncAvatarControls();
  renderSavedAvatar(savedAvatarPath);
  updatePreview();
}

function showLoadError(error) {
  if (elements.content) elements.content.hidden = true;
  if (!elements.error) return;

  elements.error.hidden = false;
  renderErrorState(elements.error, {
    title: 'We could not load your profile',
    message: friendlyError(error, 'Check your connection and try again.'),
    onRetry: () => {
      elements.error.hidden = true;
      elements.error.replaceChildren();
      loadProfile();
    }
  });
  setStatus('We could not load your profile.');
}

async function loadProfile() {
  if (loading || !elements.form) return;
  loading = true;
  setStatus('Loading your profile.');

  try {
    const profile = await getProfile({ force: true });
    currentProfile = profile;
    fillForm(profile, session?.user);
    if (elements.content) elements.content.hidden = false;
    if (elements.error) elements.error.hidden = true;
    setStatus('Profile loaded.');
  } catch (error) {
    showLoadError(error);
  } finally {
    loading = false;
  }
}

function validateName() {
  const value = elements.name?.value.trim() ?? '';
  if (!value) {
    setFieldError(elements.name, elements.nameError, 'Enter your display name.');
    return false;
  }
  if (value.length > 80) {
    setFieldError(elements.name, elements.nameError, 'Keep your name under 80 characters.');
    return false;
  }
  setFieldError(elements.name, elements.nameError, '');
  return true;
}

function validateClass() {
  if (!selectedClass()) {
    classFieldset?.setAttribute('aria-invalid', 'true');
    setFieldError(null, elements.classError, 'Choose your class year.');
    return false;
  }
  classFieldset?.removeAttribute('aria-invalid');
  setFieldError(null, elements.classError, '');
  return true;
}

function validateGoal() {
  const goal = goalValue();
  if (goal === null || goal < 30 || goal > 720) {
    setFieldError(elements.goal, elements.goalError, 'Enter a daily goal between 30 and 720 minutes.');
    return false;
  }
  setFieldError(elements.goal, elements.goalError, '');
  return true;
}

function focusFirstInvalid({ nameOk, classOk, goalOk }) {
  if (!nameOk) elements.name?.focus();
  else if (!classOk) classInputs[0]?.focus();
  else if (!goalOk) elements.goal?.focus();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (saving || !session) return;

  setFormMessage(elements.message, '');
  const nameOk = validateName();
  const classOk = validateClass();
  const goalOk = validateGoal();

  if (!nameOk || !classOk || !goalOk) {
    focusFirstInvalid({ nameOk, classOk, goalOk });
    return;
  }

  const uploadFile = pendingAvatarFile;
  if (uploadFile) {
    try {
      validateImageFile(uploadFile);
    } catch (error) {
      setFieldError(
        elements.avatarInput,
        elements.avatarError,
        friendlyError(error, 'Choose a JPG, PNG or WebP image smaller than 5 MB.')
      );
      elements.avatarRemove?.focus();
      return;
    }
  }

  const fullName = elements.name.value.trim();
  const classYear = selectedClass();
  const dailyGoal = goalValue();
  const previousAvatarPath = savedAvatarPath;

  saving = true;
  setButtonBusy(elements.save, true, 'Saving…');

  let uploadedPath = null;
  let cleanupFailed = false;

  try {
    if (uploadFile) {
      const uploaded = await uploadImage({
        userId: session.user.id,
        file: uploadFile,
        featureName: AVATAR_FEATURE,
        itemId: session.user.id
      });
      uploadedPath = uploaded.path;
    }

    const update = {
      full_name: fullName,
      class_year: classYear,
      daily_goal_minutes: dailyGoal
    };
    const avatarChanged = Boolean(uploadedPath) || (avatarRemoved && Boolean(previousAvatarPath));
    if (uploadedPath) update.avatar_path = uploadedPath;
    else if (avatarRemoved && previousAvatarPath) update.avatar_path = null;

    // Before the column exists, ordinary profile saves still work. Only the
    // selected columns change, so a database without avatar_path keeps working
    // until the schema migration is run.
    const columns = avatarChanged
      ? 'full_name, class_year, daily_goal_minutes, avatar_path'
      : 'full_name, class_year, daily_goal_minutes';

    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', session.user.id)
      .select(columns)
      .single();

    if (error) {
      if (avatarChanged && isMissingAvatarColumn(error)) {
        const friendly = new Error(error.message);
        friendly.code = error.code;
        friendly.userMessage =
          'Profile pictures are not enabled yet. Ask an admin to run the latest database schema.';
        throw friendly;
      }
      throw error;
    }

    const nextAvatarPath = uploadedPath
      ? uploadedPath
      : avatarRemoved
        ? null
        : (data?.avatar_path ?? previousAvatarPath ?? null);

    const savedProfile = {
      ...(currentProfile ?? {}),
      ...(data ?? {}),
      full_name: String(data?.full_name ?? fullName).trim(),
      class_year: data?.class_year ?? classYear,
      daily_goal_minutes: Number(data?.daily_goal_minutes ?? dailyGoal),
      avatar_path: nextAvatarPath
    };

    currentProfile = savedProfile;
    clearProfileCache();

    savedAvatarPath = nextAvatarPath;
    avatarRemoved = false;

    if (uploadedPath) {
      clearPendingAvatar();
      await renderSavedAvatar(savedAvatarPath);
    } else if (!nextAvatarPath) {
      avatarRenderToken += 1;
      setAvatarPhotos('');
    }

    if (previousAvatarPath && previousAvatarPath !== savedAvatarPath) {
      try {
        await removeStoredFile(previousAvatarPath, { userId: session.user.id });
      } catch {
        cleanupFailed = true;
      }
    }

    syncAvatarControls();
    if (elements.avatarInput) elements.avatarInput.value = '';
    refreshHeaderIdentity(savedProfile);
    updatePreview();
    setFormMessage(elements.message, 'Your profile has been saved.', 'success');
    showToast(
      cleanupFailed
        ? 'Profile saved. The old photo could not be deleted from storage.'
        : 'Profile saved.',
      cleanupFailed ? 'error' : 'success'
    );
    setStatus('Your profile has been saved.');
  } catch (error) {
    if (uploadedPath) {
      try {
        await removeStoredFile(uploadedPath, { userId: session.user.id });
      } catch {
        // No database row points at the new object, so it is safe to leave an
        // orphan rather than hide the save error behind a cleanup error.
      }
    }
    setFormMessage(
      elements.message,
      friendlyError(error, 'We could not save your profile. Please try again.')
    );
    setStatus('We could not save your profile.');
  } finally {
    saving = false;
    setButtonBusy(elements.save, false);
  }
}

function bindEvents() {
  elements.form?.addEventListener('submit', handleSubmit);

  elements.avatarInput?.addEventListener('change', handleAvatarChange);
  elements.avatarRemove?.addEventListener('click', handleAvatarRemove);

  elements.name?.addEventListener('input', () => {
    setFieldError(elements.name, elements.nameError, '');
    updatePreview();
  });

  elements.goal?.addEventListener('input', () => {
    setFieldError(elements.goal, elements.goalError, '');
    updatePreview();
  });

  classInputs.forEach((input) => {
    input.addEventListener('change', () => {
      classFieldset?.removeAttribute('aria-invalid');
      setFieldError(null, elements.classError, '');
      updatePreview();
    });
  });

  elements.form?.addEventListener('input', () => {
    setFormMessage(elements.message, '');
  });
}

async function init() {
  session = await requireAuth();
  if (!session) return;

  bindEvents();
  await loadProfile();
}

init();
