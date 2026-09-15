-- supabase/migrations/20260916143000_fix_auth_profile_trigger_permissions.sql
-- Ensure Supabase Auth can execute the profile trigger used during signup.
-- The trigger function remains SECURITY DEFINER and is not exposed to clients.

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
