-- =============================================================
-- 003: Signup bootstrap + missing RPC
-- =============================================================
-- Fixes two launch blockers:
--  1. New auth users had no user_profiles row (and no org), so
--     nobody could ever log in to a fresh deployment.
--  2. The messages API calls mark_messages_read(), which was
--     never created.

-- Default organisation for self-serve signups.
INSERT INTO organisations (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Organisation', 'demo', 'standard')
ON CONFLICT (slug) DO NOTHING;

-- Auto-create a profile whenever a Supabase Auth user is created.
-- Role may be passed via signup metadata, but privileged roles
-- can never be self-assigned.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role user_role := 'claimant';
BEGIN
  BEGIN
    v_role := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'claimant');
  EXCEPTION WHEN invalid_text_representation THEN
    v_role := 'claimant';
  END;
  IF v_role IN ('case_manager', 'org_admin', 'platform_admin') THEN
    v_role := 'claimant';
  END IF;

  INSERT INTO public.user_profiles (id, org_id, role, full_name, email)
  VALUES (
    NEW.id,
    '00000000-0000-0000-0000-000000000001',
    v_role,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Mark messages as read for a user (called from the messages API).
CREATE OR REPLACE FUNCTION public.mark_messages_read(message_ids UUID[], reader_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  UPDATE messages
  SET read_by = array_append(COALESCE(read_by, '{}'), reader_id)
  WHERE id = ANY(message_ids)
    AND NOT (COALESCE(read_by, '{}') @> ARRAY[reader_id]);
$$;
