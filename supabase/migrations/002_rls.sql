-- =============================================================
-- Row Level Security Policies
-- Fixed: helper functions in public schema (auth schema is read-only in Supabase SQL Editor)
-- =============================================================

-- Enable RLS on all tables
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- HELPER FUNCTIONS (public schema — required by Supabase)
-- =============================================================

CREATE OR REPLACE FUNCTION public.odr_current_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.odr_current_role()
RETURNS user_role AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.odr_is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'platform_admin' FROM user_profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.odr_is_case_party(p_case_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM cases c
    WHERE c.id = p_case_id AND (
      c.claimant_id = auth.uid() OR
      c.respondent_id = auth.uid() OR
      c.assigned_mediator_id = auth.uid() OR
      c.assigned_arbitrator_id = auth.uid() OR
      c.case_manager_id = auth.uid()
    )
  ) OR EXISTS (
    SELECT 1 FROM case_parties cp
    WHERE cp.case_id = p_case_id AND cp.user_id = auth.uid()
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- =============================================================
-- ORGANISATIONS
-- =============================================================

DROP POLICY IF EXISTS "orgs_select" ON organisations;
CREATE POLICY "orgs_select" ON organisations FOR SELECT USING (
  public.odr_is_platform_admin() OR id = public.odr_current_org_id()
);

DROP POLICY IF EXISTS "orgs_update" ON organisations;
CREATE POLICY "orgs_update" ON organisations FOR UPDATE USING (
  public.odr_is_platform_admin() OR (
    id = public.odr_current_org_id() AND
    public.odr_current_role() = 'org_admin'
  )
);

-- =============================================================
-- USER PROFILES
-- =============================================================

DROP POLICY IF EXISTS "profiles_select" ON user_profiles;
CREATE POLICY "profiles_select" ON user_profiles FOR SELECT USING (
  public.odr_is_platform_admin() OR
  id = auth.uid() OR
  org_id = public.odr_current_org_id() OR
  role IN ('mediator', 'arbitrator')
);

DROP POLICY IF EXISTS "profiles_update_own" ON user_profiles;
CREATE POLICY "profiles_update_own" ON user_profiles FOR UPDATE USING (
  id = auth.uid() OR
  public.odr_is_platform_admin() OR
  (org_id = public.odr_current_org_id() AND public.odr_current_role() = 'org_admin')
);

DROP POLICY IF EXISTS "profiles_insert" ON user_profiles;
CREATE POLICY "profiles_insert" ON user_profiles FOR INSERT WITH CHECK (
  id = auth.uid() OR public.odr_is_platform_admin()
);

-- =============================================================
-- CASES
-- =============================================================

DROP POLICY IF EXISTS "cases_select" ON cases;
CREATE POLICY "cases_select" ON cases FOR SELECT USING (
  public.odr_is_platform_admin() OR
  public.odr_is_case_party(id) OR
  (org_id = public.odr_current_org_id() AND public.odr_current_role() IN ('case_manager', 'org_admin'))
);

DROP POLICY IF EXISTS "cases_insert" ON cases;
CREATE POLICY "cases_insert" ON cases FOR INSERT WITH CHECK (
  org_id = public.odr_current_org_id() AND
  claimant_id = auth.uid()
);

DROP POLICY IF EXISTS "cases_update" ON cases;
CREATE POLICY "cases_update" ON cases FOR UPDATE USING (
  public.odr_is_platform_admin() OR
  public.odr_is_case_party(id) OR
  (org_id = public.odr_current_org_id() AND public.odr_current_role() IN ('case_manager', 'org_admin'))
);

-- =============================================================
-- CASE PARTIES
-- =============================================================

DROP POLICY IF EXISTS "case_parties_select" ON case_parties;
CREATE POLICY "case_parties_select" ON case_parties FOR SELECT USING (
  public.odr_is_case_party(case_id) OR public.odr_is_platform_admin()
);

DROP POLICY IF EXISTS "case_parties_insert" ON case_parties;
CREATE POLICY "case_parties_insert" ON case_parties FOR INSERT WITH CHECK (
  public.odr_is_case_party(case_id) OR public.odr_is_platform_admin()
);

-- =============================================================
-- MESSAGE ROOMS
-- =============================================================

DROP POLICY IF EXISTS "rooms_select" ON message_rooms;
CREATE POLICY "rooms_select" ON message_rooms FOR SELECT USING (
  public.odr_is_case_party(case_id) OR public.odr_is_platform_admin()
);

DROP POLICY IF EXISTS "rooms_insert" ON message_rooms;
CREATE POLICY "rooms_insert" ON message_rooms FOR INSERT WITH CHECK (
  public.odr_is_case_party(case_id) OR public.odr_is_platform_admin()
);

-- =============================================================
-- MESSAGES
-- =============================================================

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  public.odr_is_platform_admin() OR public.odr_is_case_party(case_id)
);

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND public.odr_is_case_party(case_id)
);

-- =============================================================
-- DOCUMENTS
-- =============================================================

DROP POLICY IF EXISTS "documents_select" ON documents;
CREATE POLICY "documents_select" ON documents FOR SELECT USING (
  public.odr_is_platform_admin() OR
  (
    public.odr_is_case_party(case_id) AND
    (
      NOT is_confidential OR
      public.odr_current_role() IN ('mediator', 'arbitrator', 'case_manager', 'org_admin')
    )
  )
);

DROP POLICY IF EXISTS "documents_insert" ON documents;
CREATE POLICY "documents_insert" ON documents FOR INSERT WITH CHECK (
  uploaded_by = auth.uid() AND public.odr_is_case_party(case_id)
);

-- =============================================================
-- OFFERS
-- =============================================================

DROP POLICY IF EXISTS "offers_select" ON offers;
CREATE POLICY "offers_select" ON offers FOR SELECT USING (
  public.odr_is_platform_admin() OR
  made_by = auth.uid() OR
  made_to = auth.uid() OR
  (
    public.odr_is_case_party(case_id) AND
    public.odr_current_role() IN ('mediator', 'arbitrator', 'case_manager', 'org_admin')
  )
);

DROP POLICY IF EXISTS "offers_insert" ON offers;
CREATE POLICY "offers_insert" ON offers FOR INSERT WITH CHECK (
  made_by = auth.uid() AND public.odr_is_case_party(case_id)
);

DROP POLICY IF EXISTS "offers_update" ON offers;
CREATE POLICY "offers_update" ON offers FOR UPDATE USING (
  made_by = auth.uid() OR made_to = auth.uid()
);

-- =============================================================
-- AGREEMENTS
-- =============================================================

DROP POLICY IF EXISTS "agreements_select" ON agreements;
CREATE POLICY "agreements_select" ON agreements FOR SELECT USING (
  public.odr_is_case_party(case_id) OR public.odr_is_platform_admin()
);

-- =============================================================
-- AUDIT EVENTS
-- =============================================================

DROP POLICY IF EXISTS "audit_select" ON audit_events;
CREATE POLICY "audit_select" ON audit_events FOR SELECT USING (
  public.odr_is_platform_admin() OR
  (
    public.odr_is_case_party(case_id) AND
    public.odr_current_role() IN ('case_manager', 'org_admin', 'mediator', 'arbitrator')
  )
);

-- =============================================================
-- NOTIFICATIONS
-- =============================================================

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (
  user_id = auth.uid() OR public.odr_is_platform_admin()
);

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT WITH CHECK (TRUE);

-- =============================================================
-- API KEYS & WEBHOOKS
-- =============================================================

DROP POLICY IF EXISTS "api_keys_select" ON api_keys;
CREATE POLICY "api_keys_select" ON api_keys FOR SELECT USING (
  org_id = public.odr_current_org_id() AND
  public.odr_current_role() IN ('org_admin', 'platform_admin')
);

DROP POLICY IF EXISTS "webhooks_select" ON webhooks;
CREATE POLICY "webhooks_select" ON webhooks FOR SELECT USING (
  org_id = public.odr_current_org_id() AND
  public.odr_current_role() IN ('org_admin', 'platform_admin')
);

DROP POLICY IF EXISTS "webhooks_insert" ON webhooks;
CREATE POLICY "webhooks_insert" ON webhooks FOR INSERT WITH CHECK (
  org_id = public.odr_current_org_id() AND
  public.odr_current_role() IN ('org_admin', 'platform_admin')
);

DROP POLICY IF EXISTS "case_deadlines_select" ON case_deadlines;
CREATE POLICY "case_deadlines_select" ON case_deadlines FOR SELECT USING (
  public.odr_is_case_party(case_id) OR public.odr_is_platform_admin()
);
