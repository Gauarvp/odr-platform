// src/lib/audit/index.ts
import { createServiceClient } from '../supabase/server';
import type { EventType } from '../types';

interface AuditEntry {
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
}

export async function logEvent(entry: AuditEntry): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from('audit_events')
    .insert({
      ...entry,
      created_at: new Date().toISOString(),
    });
  if (error) {
    // Audit failures should never crash the main operation — log and continue
    console.error('[AUDIT] Failed to log event:', error);
  }
}

export async function logCaseEvent(
  caseId: string,
  actorId: string,
  eventType: EventType,
  data?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    entityType?: string;
    entityId?: string;
  },
): Promise<void> {
  await logEvent({
    case_id: caseId,
    actor_id: actorId,
    event_type: eventType,
    entity_type: data?.entityType,
    entity_id: data?.entityId,
    before_state: data?.before,
    after_state: data?.after,
    metadata: data?.metadata,
  });
}
