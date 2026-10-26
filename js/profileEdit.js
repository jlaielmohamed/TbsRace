import { refreshHeaderIdentity } from './nav.js';
import { requireAuth } from './guard.js';
import { getProfile, clearProfileCache } from './profile.js';
import { supabase } from './supabaseClient.js';
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
  previewAvatar: document.getElementById('profile-preview-avatar'),
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

function updatePreview() {
  const name = elements.name?.value.trim() || 'Student';
  const classYear = selectedClass();
  const goal = goalValue();

  if (elements.previewAvatar) elements.previewAvatar.textContent = initials(name);
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

  const fullName = elements.name.value.trim();
  const classYear = selectedClass();
  const dailyGoal = goalValue();

  saving = true;
  setButtonBusy(elements.save, true, 'Saving…');

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        class_year: classYear,
        daily_goal_minutes: dailyGoal
      })
      .eq('id', session.user.id)
      .select('full_name, class_year, daily_goal_minutes')
      .single();

    if (error) throw error;

    const savedProfile = {
      ...(currentProfile ?? {}),
      ...(data ?? {}),
      full_name: String(data?.full_name ?? fullName).trim(),
      class_year: data?.class_year ?? classYear,
      daily_goal_minutes: Number(data?.daily_goal_minutes ?? dailyGoal)
    };

    currentProfile = savedProfile;
    clearProfileCache();
    refreshHeaderIdentity(savedProfile);
    updatePreview();
    setFormMessage(elements.message, 'Your profile has been saved.', 'success');
    showToast('Profile saved.', 'success');
    setStatus('Your profile has been saved.');
  } catch (error) {
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
