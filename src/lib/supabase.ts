// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

const DEFAULT_SUPABASE_URL = 'https://kgefbqwglvvqnrdapyfd.supabase.co';
// Supabase publishable/anon keys are designed for browser clients; RLS remains the security boundary.
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AQCjSptMiWObYawfmjZG2Q_S4N-pjx2';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);
export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: { 'x-client-info': 'randomchat-web' },
  },
});
