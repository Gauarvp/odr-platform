-- =============================================================
-- 004: Schema grants
-- =============================================================
-- Tables created by migrations get no privileges for the Supabase
-- API roles (default privileges only cover dashboard-created
-- objects). Without these grants every API request fails 42501.
-- RLS policies still gate anon/authenticated; service_role bypasses
-- RLS by design, and the audit_events no-update/no-delete rules
-- hold regardless of grants.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
