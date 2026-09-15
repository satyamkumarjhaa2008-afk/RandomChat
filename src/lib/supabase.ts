// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);
export const supabase = createClient<Database>(
  url ?? 'https://invalid.local',
  key ?? 'invalid',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
