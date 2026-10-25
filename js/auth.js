import './nav.js';
import {
  ALLOWED_EMAIL_DOMAIN
} from './config.js';
import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import { redirectIfSignedIn } from './guard.js';
import {
  isAllowedEmail,
  normalizeEmail,
  safeInternalNext
} from './utils.js';
import {
  friendlyError,
  setButtonBusy,
  setFieldError,
  setFormMessage,
  showSetupNotice
} from './ui.js';

const authPage = document.body.dataset.authPage;
const params = new URLSearchParams(window.location.search);

function absolutePage(file) {
  return new URL(file, window.location.href).href;
}

function configurePasswordToggles(scope = document) {
  scope.querySelectorAll('.password-toggle').forEach((button) => {
    const input = document.getElementById(button.dataset.target);
    if (!input) return;
    button.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.setAttribute('aria-pressed', String(!showing));
      button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      const label = button.querySelector('[data-toggle-label]');
      if (label) label.textContent = showing ? 'Show' : 'Hide';
      input.focus({ preventScroll: true });
    });
  });
}

function clearMessageOnInput(form, messageElement) {
  if (!form) return;
  form.addEventListener('input', () => setFormMessage(messageElement, ''));
}

function validateEmailField(input, errorElement) {
  const email = normalizeEmail(input.value);
  if (!email) {
    setFieldError(input, errorElement, 'Enter your email address.');
    return false;
  }
  if (!isAllowedEmail(email)) {
    setFieldError(
      input,
      errorElement,
      ALLOWED_EMAIL_DOMAIN
        ? `Use an email address ending in ${ALLOWED_EMAIL_DOMAIN}.`
        : 'Enter a valid email address, for example you@gmail.com.'
    );
    return false;
  }
  setFieldError(input, errorElement, '');
  return true;
}

function validatePasswordField(input, errorElement, { required = true } = {}) {
  const value = input.value;
  if (!value) {
    setFieldError(input, errorElement, required ? 'Enter your password.' : 'Choose a new password.');
    return false;
  }
  if (value.length < 8) {
    setFieldError(input, errorElement, 'Use at least 8 characters.');
    return false;
  }
  setFieldError(input, errorElement, '');
  return true;
}

function showSuccessPanel(panel, form, focusTarget) {
  form?.setAttribute('hidden', '');
  if (panel) {
    panel.hidden = false;
    focusTarget?.focus();
  }
}

async function initSignIn() {
  const form = document.getElementById('sign-in-form');
  if (!form) return;

  if (!isSupabaseConfigured) {
    showSetupNotice();
    return;
  }
  if (await redirectIfSignedIn()) return;

  const email = document.getElementById('sign-in-email');
  const emailError = document.getElementById('sign-in-email-error');
  const password = document.getElementById('sign-in-password');
  const passwordError = document.getElementById('sign-in-password-error');
  const message = document.getElementById('form-message');
  const submit = form.querySelector('[type="submit"]');
  let submitting = false;

  if (params.get('reset') === '1') {
    setFormMessage(message, 'Password updated. Sign in with your new password.', 'success');
  } else {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const linkError = params.get('error_description') || hashParams.get('error_description');
    if (linkError) {
      setFormMessage(
        message,
        friendlyError({ message: linkError }, 'That sign-in link is no longer valid.'),
        'error'
      );
    }
  }

  clearMessageOnInput(form, message);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    setFormMessage(message, '');

    const emailValid = validateEmailField(email, emailError);
    const passwordValid = validatePasswordField(password, passwordError);
    if (!emailValid || !passwordValid) {
      (emailValid ? password : email).focus();
      return;
    }

    submitting = true;
    setButtonBusy(submit, true, 'Signing in…');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email.value),
        password: password.value
      });
      if (error) throw error;
      window.location.replace(`./${safeInternalNext(params.get('next'))}`);
    } catch (error) {
      setFormMessage(message, friendlyError(error, 'We could not sign you in. Please try again.'));
      submitting = false;
      setButtonBusy(submit, false);
    }
  });

  email.addEventListener('blur', () => validateEmailField(email, emailError));
  password.addEventListener('blur', () => validatePasswordField(password, passwordError));
}

async function initSignUp() {
  const form = document.getElementById('sign-up-form');
  if (!form) return;

  if (!isSupabaseConfigured) {
    showSetupNotice();
    return;
  }
  if (await redirectIfSignedIn()) return;

  const name = document.getElementById('sign-up-name');
  const nameError = document.getElementById('sign-up-name-error');
  const email = document.getElementById('sign-up-email');
  const emailError = document.getElementById('sign-up-email-error');
  const password = document.getElementById('sign-up-password');
  const passwordError = document.getElementById('sign-up-password-error');
  const classError = document.getElementById('class-error');
  const message = document.getElementById('form-message');
  const submit = form.querySelector('[type="submit"]');
  let submitting = false;

  clearMessageOnInput(form, message);

  function validateName() {
    const value = name.value.trim();
    if (!value) {
      setFieldError(name, nameError, 'Enter your full name.');
      return false;
    }
    if (value.length > 80) {
      setFieldError(name, nameError, 'Keep your name under 80 characters.');
      return false;
    }
    setFieldError(name, nameError, '');
    return true;
  }

  function selectedClass() {
    const selected = form.querySelector('input[name="class_year"]:checked');
    if (!selected) {
      if (classError) {
        classError.textContent = 'Choose your class year.';
        classError.hidden = false;
      }
      return null;
    }
    if (classError) {
      classError.textContent = '';
      classError.hidden = true;
    }
    return selected.value;
  }

  name.addEventListener('blur', validateName);
  email.addEventListener('blur', () => validateEmailField(email, emailError));
  password.addEventListener('blur', () => validatePasswordField(password, passwordError));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    setFormMessage(message, '');

    const nameValid = validateName();
    const emailValid = validateEmailField(email, emailError);
    const passwordValid = validatePasswordField(password, passwordError);
    const classYear = selectedClass();

    if (!nameValid || !emailValid || !passwordValid || !classYear) {
      (!nameValid ? name : !emailValid ? email : !passwordValid ? password : form.querySelector('input[name="class_year"]')).focus();
      return;
    }

    submitting = true;
    setButtonBusy(submit, true, 'Creating account…');

    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizeEmail(email.value),
        password: password.value,
        options: {
          data: {
            full_name: name.value.trim(),
            class_year: classYear
          }
        }
      });
      if (error) throw error;

      // Email confirmation is disabled, so a successful sign-up returns a
      // session and the student can start immediately.
      if (data.session) {
        window.location.replace(absolutePage('timer.html'));
        return;
      }

      // The address already belongs to an account (Supabase does not reveal
      // this directly), or confirmation is still enabled in the dashboard.
      setFormMessage(
        message,
        'We could not sign you in automatically. Try signing in below, or ask your administrator to disable email confirmation in Supabase.',
        'error'
      );
      submitting = false;
      setButtonBusy(submit, false);
    } catch (error) {
      setFormMessage(message, friendlyError(error, 'We could not create your account. Please try again.'));
      submitting = false;
      setButtonBusy(submit, false);
    }
  });
}

async function initForgotPassword() {
  const form = document.getElementById('forgot-form');
  if (!form) return;

  if (!isSupabaseConfigured) {
    showSetupNotice();
    return;
  }

  const email = document.getElementById('forgot-email');
  const emailError = document.getElementById('forgot-email-error');
  const message = document.getElementById('form-message');
  const submit = form.querySelector('[type="submit"]');
  const successPanel = document.getElementById('forgot-success');
  const successEmail = document.getElementById('forgot-success-email');
  let submitting = false;

  clearMessageOnInput(form, message);
  email.addEventListener('blur', () => validateEmailField(email, emailError));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    setFormMessage(message, '');
    if (!validateEmailField(email, emailError)) {
      email.focus();
      return;
    }

    submitting = true;
    setButtonBusy(submit, true, 'Sending link…');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email.value), {
        redirectTo: absolutePage('reset-password.html')
      });
      if (error) throw error;
      if (successEmail) successEmail.textContent = normalizeEmail(email.value);
      showSuccessPanel(successPanel, form, successPanel?.querySelector('h2'));
    } catch (error) {
      setFormMessage(message, friendlyError(error, 'We could not send the reset link. Please try again.'));
      submitting = false;
      setButtonBusy(submit, false);
    }
  });
}

async function initResetPassword() {
  const form = document.getElementById('reset-form');
  const invalidPanel = document.getElementById('reset-invalid');
  if (!form) return;

  if (!isSupabaseConfigured) {
    showSetupNotice();
    return;
  }

  const password = document.getElementById('reset-password');
  const passwordError = document.getElementById('reset-password-error');
  const confirm = document.getElementById('reset-confirm');
  const confirmError = document.getElementById('reset-confirm-error');
  const message = document.getElementById('form-message');
  const submit = form.querySelector('[type="submit"]');
  const successPanel = document.getElementById('reset-success');
  let submitting = false;

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const linkError = hashParams.get('error_description') || params.get('error_description');
  if (linkError) {
    setFormMessage(message, 'That reset link is no longer valid. Request a new one.', 'error');
    form.querySelectorAll('input, button').forEach((element) => {
      element.disabled = true;
    });
    return;
  }

  let hasSession = false;
  try {
    const { data } = await supabase.auth.getSession();
    hasSession = Boolean(data.session);
  } catch {
    hasSession = false;
  }

  if (!hasSession) {
    form.hidden = true;
    invalidPanel?.removeAttribute('hidden');
    invalidPanel?.querySelector('a')?.focus();
    return;
  }

  clearMessageOnInput(form, message);
  password.addEventListener('blur', () => validatePasswordField(password, passwordError));
  confirm.addEventListener('blur', () => {
    if (confirm.value !== password.value) {
      setFieldError(confirm, confirmError, 'The passwords do not match.');
    } else {
      setFieldError(confirm, confirmError, '');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    setFormMessage(message, '');

    const passwordValid = validatePasswordField(password, passwordError);
    const confirmValid = confirm.value === password.value && confirm.value.length > 0;
    if (!confirmValid) setFieldError(confirm, confirmError, 'The passwords do not match.');
    else setFieldError(confirm, confirmError, '');

    if (!passwordValid || !confirmValid) {
      (passwordValid ? confirm : password).focus();
      return;
    }

    submitting = true;
    setButtonBusy(submit, true, 'Updating password…');
    try {
      const { error } = await supabase.auth.updateUser({ password: password.value });
      if (error) throw error;
      showSuccessPanel(successPanel, form, successPanel?.querySelector('h2'));
      window.setTimeout(async () => {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        window.location.replace('./sign-in.html?reset=1');
      }, 1600);
    } catch (error) {
      setFormMessage(message, friendlyError(error, 'We could not update your password. Please try again.'));
      submitting = false;
      setButtonBusy(submit, false);
    }
  });
}

async function initAuthPage() {
  configurePasswordToggles();

  switch (authPage) {
    case 'signin':
      await initSignIn();
      break;
    case 'signup':
      await initSignUp();
      break;
    case 'forgot':
      await initForgotPassword();
      break;
    case 'reset':
      await initResetPassword();
      break;
    default:
      break;
  }
}

initAuthPage();
