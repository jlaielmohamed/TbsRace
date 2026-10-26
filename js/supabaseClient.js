import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

const looksLikePlaceholder =
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY ||
  SUPABASE_URL.includes('YOUR-PROJECT') ||
  SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');

export const isSupabaseConfigured = !looksLikePlaceholder;

/**
 * The single Supabase client for the whole app.
 * Every page imports this instance, so sessions and auth stay in sync.
 */
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit'
      }
    })
  : null;

/**
 * Start the "Continue with Google" flow through Supabase OAuth.
 *
 * Supabase sends the browser to Google and then back to `redirectTo`, where
 * `detectSessionInUrl` turns the returned tokens into a normal session. The
 * redirect target must also be allow-listed under Authentication -> URL
 * Configuration -> Redirect URLs in the Supabase dashboard.
 */
export async function signInWithGoogle(redirectTo = `${window.location.origin}/pages/timer.html`) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // Always let the student pick which Google account to use.
      queryParams: { prompt: 'select_account' }
    }
  });
  if (error) throw error;
  return data;
}
