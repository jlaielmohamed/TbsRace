import { escapeHtml } from './utils.js';

let toastTimer = null;

export function showToast(message, tone = 'info') {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }

  region.replaceChildren();
  const toast = document.createElement('div');
  toast.className = `toast toast-${tone}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  region.append(toast);

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
}

export function setFormMessage(element, message = '', tone = 'error') {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
  element.hidden = !message;
}

export function setFieldError(input, errorElement, message = '') {
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }
}

export function setButtonBusy(button, busy, busyLabel = 'Please wait…') {
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.textContent.trim();
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  button.textContent = busy ? busyLabel : button.dataset.label;
}

export function setButtonDisabled(button, disabled) {
  if (button) button.disabled = disabled;
}

/** Map Supabase and network failures to calm, user-facing text. */
export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.userMessage) return String(error.userMessage);
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();

  if (code === 'storage_invalid_type') {
    return 'Choose a JPG, PNG or WebP image.';
  }
  if (code === 'storage_too_large') {
    return 'That image is larger than 5 MB. Choose a smaller photo.';
  }
  if (code === 'storage_unavailable') {
    return 'Photo storage is not available right now. Please try again later.';
  }
  if (code === 'storage_foreign_path') {
    return 'That photo does not belong to this account.';
  }
  if (code === 'storage_signed_url') {
    return 'We could not open that photo. Please refresh and try again.';
  }
  if (message.includes('bucket not found')) {
    return 'Photo storage is not set up yet. Ask an admin to check the app-files bucket.';
  }
  if (
    message.includes('payload too large') ||
    message.includes('maximum allowed size') ||
    message.includes('exceeded the maximum')
  ) {
    return 'That image is larger than 5 MB. Choose a smaller photo.';
  }
  if (message.includes('mime type') || message.includes('invalid content type')) {
    return 'Choose a JPG, PNG or WebP image.';
  }
  if (code === 'profile_missing' || code === 'p0002') {
    return 'Your student profile is missing. Run the database setup in README.md, then sign in again.';
  }
  if (message.includes('email domain') || message.includes('email addresses may create')) {
    return 'That email address is not allowed here. Try signing up with another address.';
  }
  if (message.includes('email not confirmed') || message.includes('not confirmed')) {
    return 'Please confirm your email first. Check your inbox for the confirmation link.';
  }
  if (message.includes('invalid login credentials')) {
    return 'That email or password is not correct.';
  }
  if (message.includes('user already registered') || message.includes('already registered')) {
    return 'An account already exists for this email. Try signing in instead.';
  }
  if (message.includes('password should be') || message.includes('weak password')) {
    return 'Use a password with at least 8 characters.';
  }
  if (code === 'over_email_send_rate_limit' || code.includes('rate_limit') || message.includes('rate limit')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (message.includes('signup is disabled') || message.includes('signups not allowed')) {
    return 'New accounts are paused right now. Please try again later.';
  }
  if (
    message.includes('invalid or expired') ||
    message.includes('link is invalid') ||
    (message.includes('token') && message.includes('expired'))
  ) {
    return 'That link has expired. Request a new one and try again.';
  }
  if (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    code === 'network_error'
  ) {
    return 'We could not reach the server. Check your connection and try again.';
  }
  if (message.includes('jwt') || code === 'pgrst301' || message.includes('session')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (message.includes('row-level security')) {
    return 'You can only change your own data. Sign in again and try once more.';
  }
  if (message.includes('database error')) {
    return 'We could not save that right now. Please try again.';
  }
  return fallback;
}

export function showSetupNotice(container = document.querySelector('main')) {
  if (!container) return;
  const notice = document.createElement('section');
  notice.className = 'setup-notice card';
  notice.innerHTML = `
    <span class="setup-notice-icon" aria-hidden="true">T</span>
    <div>
      <h1>Connect Supabase to get started</h1>
      <p>Open <code>js/config.js</code> and replace the Supabase URL and anon key placeholders. Then run <code>supabase/schema.sql</code> in your Supabase project.</p>
      <p class="muted">The setup guide is in <code>README.md</code>.</p>
    </div>`;
  container.replaceChildren(notice);
}

export function renderErrorState(container, {
  title = 'This part took a wrong turn',
  message = 'Please try again in a moment.',
  onRetry = null
} = {}) {
  if (!container) return;
  container.replaceChildren();
  const wrapper = document.createElement('div');
  wrapper.className = 'error-state';
  wrapper.innerHTML = `
    <span class="error-state-icon" aria-hidden="true">!</span>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(message)}</p>`;
  if (onRetry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline btn-small';
    button.textContent = 'Try again';
    button.addEventListener('click', onRetry);
    wrapper.append(button);
  }
  container.append(wrapper);
}

export function renderEmptyState(container, {
  icon = '○',
  title = 'Nothing here yet',
  message = 'Your next session will show up here.'
} = {}) {
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <span class="empty-state-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
    </div>`;
}

export function markSkeleton(element, lines = 2) {
  if (!element) return;
  const row = '<span class="skeleton-line"></span>';
  element.innerHTML = `<div class="skeleton-stack" aria-hidden="true">${row.repeat(lines)}</div>`;
  element.setAttribute('aria-busy', 'true');
}

export function clearBusy(element) {
  if (element) element.removeAttribute('aria-busy');
}
