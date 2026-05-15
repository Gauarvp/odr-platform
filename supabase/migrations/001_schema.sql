-- =============================================================
-- ODR Platform Database Schema
-- Multi-tenant Online Dispute Resolution Platform
-- =============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- Full-text search on case descriptions

-- =============================================================
-- ENUMS
-- =============================================================

CREATE TYPE user_role AS ENUM (
  'claimant',
  'respondent', 
  'mediator',
  'arbitrator',
  'case_manager',
  'org_admin',
  'platform_admin'
);

CREATE TYPE case_status AS ENUM (
  'draft',           -- Filing in progress
  'filed',           -- Submitted, awaiting service
  'served',          -- Respondent notified
  'negotiation',     -- Direct party negotiation
  'mediation',       -- Neutral mediator engaged
  'arbitration',     -- Binding arbitration
  'settled',         -- Resolved by agreement
  'awarded',         -- Arbitrator issued award
  'dismissed',       -- Dismissed (no merit, withdrawn)
  'appealed',        -- Award under appeal
  'closed'           -- Final closure
);

CREATE TYPE case_category AS ENUM (
  'payment_dispute',
  'chargeback',
  'service_failure',
  'contract_breach',
  'product_defect',
  'fraud_claim',
  'employment',
  'consumer_protection',
  'intellectual_property',
  'other'
);

CREATE TYPE dispute_track AS ENUM (
  'fast_track',      -- < $5k, simple facts, target 15 days
  'standard',        -- $5k-$100k, standard evidence, 45 days
  'complex',         -- > $100k or multi-party, 90 days
  'emergency'        -- Injunctive relief needed
);

CREATE TYPE party_role AS ENUM (
  'claimant',
  'respondent',
  'third_party',
  'observer'
);

CREATE TYPE message_type AS ENUM (
  'party_message',
  'mediator_message',
  'system_notification',
  'offer',
  'counter_offer',
  'evidence_submission',
  'procedural'
);

CREATE TYPE document_type AS ENUM (
  'evidence',
  'contract',
  'invoice',
  'communication',
  'expert_report',
  'witness_statement',
  'settlement_draft',
  'final_agreement',
  'arbitration_award',
  'procedural_order'
);

CREATE TYPE offer_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'countered',
  'expired',
  'withdrawn'
);

CREATE TYPE event_type AS ENUM (
  'case_filed',
  'case_served',
  'party_joined',
  'phase_changed',
  'mediator_assigned',
  'message_sent',
  'document_uploaded',
  'offer_made',
  'offer_accepted',
  'offer_rejected',
  'settlement_signed',
  'award_issued',
  'case_closed',
  'ai_analysis_run',
  'deadline_set',
  'deadline_missed'
);

CREATE TYPE notification_channel AS ENUM ('email', 'in_app', 'sms', 'webhook');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed', 'read');

-- =============================================================
-- ORGANISATIONS (Multi-tenant)
-- =============================================================

CREATE TABLE organisations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  logo_url        TEXT,
  domain          TEXT,                        -- custom domain support
  config          JSONB NOT NULL DEFAULT '{}'::JSONB, -- branding, rules, limits
  -- config keys: primary_color, max_claim_value, filing_fee_cents, tracks_enabled,
  --              auto_assign_mediator, require_e_signature, sla_days
  plan            TEXT NOT NULL DEFAULT 'standard', -- standard, enterprise, court
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- USERS & PROFILES
-- =============================================================

-- Core auth users (managed by Supabase Auth)
-- Extended profile data lives here
CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID REFERENCES organisations(id),
  role            user_role NOT NULL DEFAULT 'claimant',
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  avatar_url      TEXT,
  -- Mediator/arbitrator specific
  credentials     JSONB,    -- certifications, bar memberships, etc.
  specializations TEXT[],   -- categories this neutral handles
  bio             TEXT,
  hourly_rate_cents INT,
  -- Availability for assignment
  is_available    BOOLEAN DEFAULT TRUE,
  max_active_cases INT DEFAULT 20,
  -- Stats (denormalized for performance)
  total_cases     INT NOT NULL DEFAULT 0,
  resolution_rate NUMERIC(5,2),
  avg_resolution_days NUMERIC(6,2),
  -- Preferences
  preferences     JSONB NOT NULL DEFAULT '{}'::JSONB,
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- CASES (Core entity)
-- =============================================================

CREATE TABLE cases (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_number     TEXT NOT NULL UNIQUE,  -- Human-readable: ODR-2024-00001
  org_id          UUID NOT NULL REFERENCES organisations(id),
  
  -- Core fields
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        case_category NOT NULL,
  track           dispute_track NOT NULL DEFAULT 'standard',
  status          case_status NOT NULL DEFAULT 'draft',
  
  -- Claim details
  claim_amount_cents    BIGINT,          -- NULL if non-monetary
  claim_currency        CHAR(3) DEFAULT 'USD',
  claimed_relief        TEXT[],          -- ['monetary', 'injunction', 'specific_performance']
  
  -- Parties
  claimant_id           UUID NOT NULL REFERENCES user_profiles(id),
  respondent_id         UUID REFERENCES user_profiles(id),   -- NULL until served
  assigned_mediator_id  UUID REFERENCES user_profiles(id),
  assigned_arbitrator_id UUID REFERENCES user_profiles(id),
  case_manager_id       UUID REFERENCES user_profiles(id),
  
  -- AI outputs (cached)
  ai_triage             JSONB,   -- {complexity, recommended_track, key_issues, estimated_duration}
  ai_outcome_prediction JSONB,   -- {likely_outcome, confidence, factors, comparable_cases}
  ai_last_analysis_at   TIMESTAMPTZ,
  
  -- SLA tracking
  filed_at              TIMESTAMPTZ,
  served_at             TIMESTAMPTZ,
  negotiation_started_at TIMESTAMPTZ,
  mediation_started_at  TIMESTAMPTZ,
  arbitration_started_at TIMESTAMPTZ,
  resolution_deadline   TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  
  -- Settlement
  settlement_amount_cents BIGINT,
  settlement_terms        TEXT,
  
  -- Metadata
  tags                  TEXT[],
  external_reference    TEXT,  -- e.g. platform order ID for e-commerce integrations
  source                TEXT,  -- 'web', 'api', 'email'
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sequence for readable case numbers
CREATE SEQUENCE case_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
    NEW.case_number := 'ODR-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('case_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_case_number
  BEFORE INSERT ON cases
  FOR EACH ROW EXECUTE FUNCTION generate_case_number();

-- =============================================================
-- CASE PARTIES (additional parties beyond claimant/respondent)
-- =============================================================

CREATE TABLE case_parties (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES user_profiles(id),
  role            party_role NOT NULL,
  invited_at      TIMESTAMPTZ,
  joined_at       TIMESTAMPTZ,
  invite_token    TEXT,                        -- secure token for email invite
  can_view_private_channel BOOLEAN DEFAULT FALSE, -- mediator access to private rooms
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, user_id)
);

-- =============================================================
-- CASE TIMELINE / DEADLINES
-- =============================================================

CREATE TABLE case_deadlines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,               -- 'Response due', 'Evidence submission', etc.
  due_at          TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  is_hard_deadline BOOLEAN DEFAULT FALSE,       -- Triggers auto-escalation if missed
  notified_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- MESSAGING (Secure, per-room)
-- Rooms: 'all_parties', 'claimant_private', 'respondent_private', 'mediator_notes'
-- =============================================================

CREATE TABLE message_rooms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,               -- 'Joint Session', 'Claimant Private', etc.
  room_key        TEXT NOT NULL,               -- 'joint', 'claimant_private', 'respondent_private', 'mediator'
  is_private      BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_roles   party_role[],               -- which roles can see this room
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, room_key)
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id         UUID NOT NULL REFERENCES message_rooms(id) ON DELETE CASCADE,
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES user_profiles(id),
  type            message_type NOT NULL DEFAULT 'party_message',
  content         TEXT NOT NULL,
  metadata        JSONB,                       -- For offers: {amount, currency, terms, expiry}
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at       TIMESTAMPTZ,
  read_by         UUID[],                      -- user IDs who read this
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- DOCUMENTS (Evidence vault)
-- =============================================================

CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES user_profiles(id),
  type            document_type NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  storage_path    TEXT NOT NULL,              -- Supabase Storage path
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  checksum        TEXT NOT NULL,              -- SHA-256 for integrity
  version         INT NOT NULL DEFAULT 1,
  parent_id       UUID REFERENCES documents(id), -- For versioning
  is_confidential BOOLEAN NOT NULL DEFAULT FALSE, -- Mediator-only access
  -- AI analysis results
  ai_summary      TEXT,
  ai_key_claims   TEXT[],
  ai_analyzed_at  TIMESTAMPTZ,
  -- Visibility
  visible_to_roles party_role[] NOT NULL DEFAULT ARRAY['claimant','respondent']::party_role[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- SETTLEMENT OFFERS
-- =============================================================

CREATE TABLE offers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  made_by         UUID NOT NULL REFERENCES user_profiles(id),
  made_to         UUID NOT NULL REFERENCES user_profiles(id),
  status          offer_status NOT NULL DEFAULT 'pending',
  amount_cents    BIGINT,
  currency        CHAR(3) DEFAULT 'USD',
  terms           TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  responded_at    TIMESTAMPTZ,
  response_note   TEXT,
  parent_offer_id UUID REFERENCES offers(id), -- For counter-offers
  -- AI generated indicator
  ai_generated    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- FINAL AGREEMENTS & AWARDS
-- =============================================================

CREATE TABLE agreements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('settlement', 'award', 'consent_order')),
  content         TEXT NOT NULL,             -- Full agreement text
  document_id     UUID REFERENCES documents(id), -- Signed PDF
  -- E-signature tracking
  signatures      JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- [{user_id, name, signed_at, ip_address, signature_hash}]
  is_binding      BOOLEAN NOT NULL DEFAULT TRUE,
  effective_date  TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- AUDIT LOG (Immutable event stream)
-- =============================================================

CREATE TABLE audit_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id         UUID REFERENCES cases(id),
  org_id          UUID REFERENCES organisations(id),
  actor_id        UUID REFERENCES user_profiles(id),
  event_type      event_type NOT NULL,
  entity_type     TEXT,                      -- 'case', 'message', 'document', 'offer'
  entity_id       UUID,
  before_state    JSONB,
  after_state     JSONB,
  metadata        JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log is append-only — no updates or deletes allowed
CREATE RULE no_update_audit AS ON UPDATE TO audit_events DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_events DO INSTEAD NOTHING;

-- =============================================================
-- NOTIFICATIONS
-- =============================================================

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES user_profiles(id),
  case_id         UUID REFERENCES cases(id),
  channel         notification_channel NOT NULL DEFAULT 'in_app',
  status          notification_status NOT NULL DEFAULT 'pending',
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  action_url      TEXT,
  metadata        JSONB,
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- MEDIATOR AVAILABILITY
-- =============================================================

CREATE TABLE mediator_blocks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mediator_id     UUID NOT NULL REFERENCES user_profiles(id),
  blocked_from    TIMESTAMPTZ NOT NULL,
  blocked_until   TIMESTAMPTZ NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- ANALYTICS SNAPSHOTS (Pre-computed for dashboards)
-- =============================================================

CREATE TABLE analytics_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organisations(id),
  snapshot_date   DATE NOT NULL,
  metrics         JSONB NOT NULL,
  -- Keys: cases_filed, cases_resolved, cases_by_status, cases_by_category,
  --       avg_resolution_days, median_resolution_days, total_claim_value,
  --       total_settlement_value, resolution_rate, mediator_utilization
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, snapshot_date)
);

-- =============================================================
-- EXTERNAL API INTEGRATIONS
-- =============================================================

CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organisations(id),
  name            TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,      -- bcrypt hash of actual key
  key_prefix      TEXT NOT NULL,             -- First 8 chars for display: 'odr_live_AbCd....'
  scopes          TEXT[] NOT NULL,           -- ['cases:read', 'cases:write', 'webhooks']
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhooks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organisations(id),
  url             TEXT NOT NULL,
  events          TEXT[] NOT NULL,           -- ['case.filed', 'case.settled', 'offer.accepted']
  secret          TEXT NOT NULL,             -- HMAC signing secret
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  failure_count   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- INDEXES (Performance)
-- =============================================================

CREATE INDEX idx_cases_org_status ON cases(org_id, status);
CREATE INDEX idx_cases_claimant ON cases(claimant_id);
CREATE INDEX idx_cases_respondent ON cases(respondent_id);
CREATE INDEX idx_cases_mediator ON cases(assigned_mediator_id);
CREATE INDEX idx_cases_created ON cases(created_at DESC);
CREATE INDEX idx_cases_number ON cases(case_number);
CREATE INDEX idx_cases_category ON cases(category);
CREATE INDEX idx_cases_description_search ON cases USING gin(to_tsvector('english', description));

CREATE INDEX idx_messages_room ON messages(room_id, created_at);
CREATE INDEX idx_messages_case ON messages(case_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);

CREATE INDEX idx_documents_case ON documents(case_id);
CREATE INDEX idx_audit_case ON audit_events(case_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_events(actor_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, status, created_at DESC);

-- =============================================================
-- UPDATED_AT TRIGGERS
-- =============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cases_updated_at BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orgs_updated_at BEFORE UPDATE ON organisations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
