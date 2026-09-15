// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

// These are safe browser-side values. RLS is the security boundary; never put a
// Supabase service-role key in Vite/client code.
const DEFAULT_SUPABASE_URL = 'https://kgefbqwglvvqnrdapyfd.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AQCjSptMiWObYawfmjZG2Q_S4N-pjx2';

const env = import.meta.env as Record<string, unknown>;
const url = typeof env.VITE_SUPABASE_URL === 'string' && env.VITE_SUPABASE_URL.trim()
  ? env.VITE_SUPABASE_URL.trim()
  : DEFAULT_SUPABASE_URL;
const key = typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string' && env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
  ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
  : DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'randomchat-auth',
  },
  global: {
    headers: { 'x-client-info': 'randomchat-web' },
  },
});
