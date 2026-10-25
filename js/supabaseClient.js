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
