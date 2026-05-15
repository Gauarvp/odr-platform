// src/lib/notifications/index.ts
import { createServiceClient } from '../supabase/server';

interface NotificationInput {
  userId: string;
  caseId?: string;
  channel?: 'in_app' | 'email';
  title: string;
  body: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export async function sendNotification(input: NotificationInput): Promise<void> {
  const supabase = await createServiceClient();
  await supabase.from('notifications').insert({
    user_id: input.userId,
    case_id: input.caseId ?? null,
    channel: input.channel ?? 'in_app',
    status: 'pending',
    title: input.title,
    body: input.body,
    action_url: input.actionUrl ?? null,
    metadata: input.metadata ?? null,
  });
}
