import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { CONFIG } from '../config.js';

export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const authFlags = { recovery: false };

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') authFlags.recovery = true;
});
