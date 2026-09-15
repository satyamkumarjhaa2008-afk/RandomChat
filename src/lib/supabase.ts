// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
if (!url || !key) console.warn('RandomChat: Supabase environment variables are missing.');
export const supabase = createClient<Database>(url ?? '', key ?? '', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
