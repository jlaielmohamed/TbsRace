import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import { showSetupNotice } from './ui.js';

let authSubscriptionStarted = false;

function redirectToSignIn() {
  const page = `${window.location.pathname.split('/').pop() || 'timer.html'}${window.location.search}${window.location.hash}`;
  window.location.replace(`./sign-in.html?next=${encodeURIComponent(page)}`);
}

function showSessionProblem() {
  const main = document.querySelector('main');
  if (!main) return;
  main.innerHTML = `
    <section class="setup-notice card">
      <span class="setup-notice-icon" aria-hidden="true">!</span>
      <div>
        <h1>We couldn’t check your session</h1>
        <p>Check your connection, then refresh this page. If the problem continues, sign in again.</p>
        <a class="btn btn-gold btn-small" href="./sign-in.html">Go to sign in</a>
      </div>
    </section>`;
}

function watchForSignOut() {
  if (authSubscriptionStarted || !supabase) return;
  authSubscriptionStarted = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      const onAuthPage = Boolean(document.body.dataset.authPage);
      if (!onAuthPage) redirectToSignIn();
    }
  });
}

/**
 * Private-page guard. RLS is the real security boundary; this only keeps the
 * user experience clean and sends signed-out visitors to sign in.
 */
export async function requireAuth() {
  if (!isSupabaseConfigured) {
    showSetupNotice();
    return null;
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      redirectToSignIn();
      return null;
    }
    watchForSignOut();
    return data.session;
  } catch {
    showSessionProblem();
    return null;
  }
}

/** Used by sign-in and sign-up. The reset-password page deliberately skips this. */
export async function redirectIfSignedIn() {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return false;
    if (data.session) {
      window.location.replace('./timer.html');
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
