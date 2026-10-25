import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import { friendlyError, showSetupNotice } from './ui.js';

const message = document.getElementById('redirect-message');
const main = document.querySelector('main');

async function route() {
  if (!isSupabaseConfigured || !supabase) {
    showSetupNotice(main);
    return;
  }

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    window.location.replace(data.session ? './pages/timer.html' : './pages/sign-in.html');
  } catch (error) {
    if (message) message.textContent = friendlyError(error, 'We could not sign you in.');
    const action = document.getElementById('redirect-action');
    if (action) action.hidden = false;
  }
}

route();
