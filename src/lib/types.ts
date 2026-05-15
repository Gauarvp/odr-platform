// src/lib/types.ts
// Canonical TypeScript types for the ODR platform.
// These mirror the DB schema exactly — use these everywhere, never raw DB types.

export type UserRole =
  | 'claimant' | 'respondent' | 'mediator' | 'arbitrator'
  | 'case_manager' | 'org_admin' | 'platform_admin';

export type CaseStatus =
  | 'draft' | 'filed' | 'served' | 'negotiation' | 'mediation'
  | 'arbitration' | 'settled' | 'awarded' | 'dismissed' | 'appealed' | 'closed';

export type CaseCategory =
  | 'payment_dispute' | 'chargeback' | 'service_failure' | 'contract_breach'
  | 'product_defect' | 'fraud_claim' | 'employment' | 'consumer_protection'
  | 'intellectual_property' | 'other';

export type DisputeTrack = 'fast_track' | 'standard' | 'complex' | 'emergency';

export type PartyRole = 'claimant' | 'respondent' | 'third_party' | 'observer';

export type MessageType =
  | 'party_message' | 'mediator_message' | 'system_notification'
  | 'offer' | 'counter_offer' | 'evidence_submission' | 'procedural';

export type DocumentType =
  | 'evidence' | 'contract' | 'invoice' | 'communication' | 'expert_report'
  | 'witness_statement' | 'settlement_draft' | 'final_agreement'
  | 'arbitration_award' | 'procedural_order';

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired' | 'withdrawn';

export type EventType =
  | 'case_filed' | 'case_served' | 'party_joined' | 'phase_changed'
  | 'mediator_assigned' | 'message_sent' | 'document_uploaded' | 'offer_made'
  | 'offer_accepted' | 'offer_rejected' | 'settlement_signed' | 'award_issued'
  | 'case_closed' | 'ai_analysis_run' | 'deadline_set' | 'deadline_missed';

// ─── Organisation ──────────────────────────────────────────────

export interface OrgConfig {
  primary_color?: string;
  logo_url?: string;
  max_claim_value_cents?: number;
  filing_fee_cents?: number;
  tracks_enabled?: DisputeTrack[];
  auto_assign_mediator?: boolean;
  require_e_signature?: boolean;
  sla_days?: Partial<Record<DisputeTrack, number>>;
  custom_categories?: string[];
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  domain?: string;
  config: OrgConfig;
  plan: 'standard' | 'enterprise' | 'court';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── User Profile ──────────────────────────────────────────────

export interface MediatorCredential {
  type: string;        // 'bar_membership', 'mediation_cert', 'arbitration_cert'
  issuer: string;
  number?: string;
  issued_at?: string;
  expires_at?: string;
}

export interface UserPreferences {
  email_notifications?: boolean;
  sms_notifications?: boolean;
  digest_frequency?: 'immediate' | 'daily' | 'weekly';
  language?: string;
}

export interface UserProfile {
  id: string;
  org_id?: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  credentials?: MediatorCredential[];
  specializations?: CaseCategory[];
  bio?: string;
  hourly_rate_cents?: number;
  is_available: boolean;
  max_active_cases: number;
  total_cases: number;
  resolution_rate?: number;
  avg_resolution_days?: number;
  preferences: UserPreferences;
  timezone: string;
  created_at: string;
  updated_at: string;
}

// ─── Case ──────────────────────────────────────────────────────

export interface AITriageResult {
  complexity: 'low' | 'medium' | 'high' | 'critical';
  recommended_track: DisputeTrack;
  key_issues: string[];
  estimated_duration_days: number;
  recommended_resolution_type: 'negotiation' | 'mediation' | 'arbitration';
  reasoning: string;
  risk_factors: string[];
  confidence: number;  // 0-1
}

export interface AIOutcomePrediction {
  likely_outcome: 'claimant_prevails' | 'respondent_prevails' | 'partial_settlement' | 'full_settlement' | 'dismissal';
  confidence: number;
  probability_breakdown: {
    outcome: string;
    probability: number;
  }[];
  key_factors_for_claimant: string[];
  key_factors_for_respondent: string[];
  recommended_settlement_range?: {
    min_cents: number;
    max_cents: number;
  };
  comparable_cases?: {
    case_type: string;
    outcome: string;
    resolution_days: number;
  }[];
  analysis_date: string;
}

export interface Case {
  id: string;
  case_number: string;
  org_id: string;
  title: string;
  description: string;
  category: CaseCategory;
  track: DisputeTrack;
  status: CaseStatus;
  claim_amount_cents?: number;
  claim_currency: string;
  claimed_relief?: string[];
  claimant_id: string;
  respondent_id?: string;
  assigned_mediator_id?: string;
  assigned_arbitrator_id?: string;
  case_manager_id?: string;
  ai_triage?: AITriageResult;
  ai_outcome_prediction?: AIOutcomePrediction;
  ai_last_analysis_at?: string;
  filed_at?: string;
  served_at?: string;
  negotiation_started_at?: string;
  mediation_started_at?: string;
  arbitration_started_at?: string;
  resolution_deadline?: string;
  closed_at?: string;
  settlement_amount_cents?: number;
  settlement_terms?: string;
  tags?: string[];
  external_reference?: string;
  source: string;
  created_at: string;
  updated_at: string;
  // Joined
  claimant?: UserProfile;
  respondent?: UserProfile;
  mediator?: UserProfile;
}

// ─── State Machine ─────────────────────────────────────────────

export type CaseTransition =
  | 'submit'           // draft → filed
  | 'serve'            // filed → served
  | 'begin_negotiation' // served → negotiation
  | 'escalate_mediation' // negotiation → mediation
  | 'escalate_arbitration' // mediation → arbitration
  | 'settle'           // negotiation/mediation → settled
  | 'award'            // arbitration → awarded
  | 'dismiss'          // any → dismissed
  | 'appeal'           // awarded → appealed
  | 'close'            // settled/awarded/dismissed → closed

export interface TransitionResult {
  success: boolean;
  case?: Case;
  error?: string;
  requiredFields?: string[];
}

// ─── Messages & Rooms ──────────────────────────────────────────

export interface MessageRoom {
  id: string;
  case_id: string;
  name: string;
  room_key: 'joint' | 'claimant_private' | 'respondent_private' | 'mediator';
  is_private: boolean;
  allowed_roles: PartyRole[];
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  case_id: string;
  sender_id: string;
  type: MessageType;
  content: string;
  metadata?: Record<string, unknown>;
  is_system: boolean;
  edited_at?: string;
  read_by: string[];
  created_at: string;
  // Joined
  sender?: UserProfile;
}

// ─── Documents ─────────────────────────────────────────────────

export interface Document {
  id: string;
  case_id: string;
  uploaded_by: string;
  type: DocumentType;
  name: string;
  description?: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  checksum: string;
  version: number;
  parent_id?: string;
  is_confidential: boolean;
  ai_summary?: string;
  ai_key_claims?: string[];
  ai_analyzed_at?: string;
  visible_to_roles: PartyRole[];
  created_at: string;
  // Joined
  uploader?: UserProfile;
}

// ─── Offers ────────────────────────────────────────────────────

export interface Offer {
  id: string;
  case_id: string;
  made_by: string;
  made_to: string;
  status: OfferStatus;
  amount_cents?: number;
  currency: string;
  terms: string;
  expires_at: string;
  responded_at?: string;
  response_note?: string;
  parent_offer_id?: string;
  ai_generated: boolean;
  created_at: string;
  // Joined
  made_by_profile?: UserProfile;
}

// ─── Agreements ────────────────────────────────────────────────

export interface Signature {
  user_id: string;
  name: string;
  signed_at: string;
  ip_address: string;
  signature_hash: string;
}

export interface Agreement {
  id: string;
  case_id: string;
  type: 'settlement' | 'award' | 'consent_order';
  content: string;
  document_id?: string;
  signatures: Signature[];
  is_binding: boolean;
  effective_date?: string;
  created_by: string;
  created_at: string;
}

// ─── Audit ─────────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  case_id?: string;
  org_id?: string;
  actor_id?: string;
  event_type: EventType;
  entity_type?: string;
  entity_id?: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  // Joined
  actor?: UserProfile;
}

// ─── Analytics ─────────────────────────────────────────────────

export interface AnalyticsMetrics {
  cases_filed: number;
  cases_resolved: number;
  cases_by_status: Partial<Record<CaseStatus, number>>;
  cases_by_category: Partial<Record<CaseCategory, number>>;
  cases_by_track: Partial<Record<DisputeTrack, number>>;
  avg_resolution_days: number;
  median_resolution_days: number;
  p90_resolution_days: number;
  total_claim_value_cents: number;
  total_settlement_value_cents: number;
  resolution_rate: number;       // 0-1
  mediation_success_rate: number;
  arbitration_rate: number;
  mediator_utilization: Record<string, number>;  // mediator_id → active cases
  cost_savings_vs_litigation_cents: number;
}

// ─── API Response types ────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  has_next: boolean;
}

export interface APIError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

// ─── Filing wizard ─────────────────────────────────────────────

export interface CaseFilingInput {
  title: string;
  description: string;
  category: CaseCategory;
  claim_amount_cents?: number;
  claim_currency?: string;
  claimed_relief: string[];
  respondent_email: string;
  respondent_name: string;
  tags?: string[];
  external_reference?: string;
  evidence_files?: File[];
}
