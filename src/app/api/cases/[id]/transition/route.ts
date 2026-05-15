// src/app/api/cases/[id]/transition/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';
import { CaseStateMachine } from '@/lib/state-machine';
import { logCaseEvent } from '@/lib/audit';
import { sendNotification } from '@/lib/notifications';
import type { Case, CaseTransition } from '@/lib/types';

interface TransitionBody {
  transition: CaseTransition;
  settlement_amount_cents?: number;
  settlement_terms?: string;
  dismissal_reason?: string;
  mediator_id?: string;
  arbitrator_id?: string;
  notes?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json() as TransitionBody;

    if (!body.transition) return NextResponse.json({ error: 'transition is required' }, { status: 400 });

    const { data: caseData, error: fetchError } = await supabase.from('cases').select('*').eq('id', id).single();
    if (fetchError || !caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    const currentCase = caseData as Case;
    const beforeStatus = currentCase.status;

    const enrichedCase: Case = {
      ...currentCase,
      settlement_terms: body.settlement_terms ?? currentCase.settlement_terms,
      settlement_amount_cents: body.settlement_amount_cents ?? currentCase.settlement_amount_cents,
      assigned_mediator_id: body.mediator_id ?? currentCase.assigned_mediator_id,
      assigned_arbitrator_id: body.arbitrator_id ?? currentCase.assigned_arbitrator_id,
    };

    const result = CaseStateMachine.execute(enrichedCase, body.transition, user.role);
    if (!result.success) return NextResponse.json({ error: result.error, transition: body.transition }, { status: 422 });

    const updatePayload: Partial<Case> = {
      ...result.fields,
      settlement_terms: body.settlement_terms ?? currentCase.settlement_terms,
      settlement_amount_cents: body.settlement_amount_cents ?? currentCase.settlement_amount_cents,
      assigned_mediator_id: body.mediator_id ?? currentCase.assigned_mediator_id,
      assigned_arbitrator_id: body.arbitrator_id ?? currentCase.assigned_arbitrator_id,
    };

    const { data: updatedCase, error: updateError } = await supabase
      .from('cases')
      .update(updatePayload)
      .eq('id', id)
      .select(`*, claimant:claimant_id(id, full_name, email), respondent:respondent_id(id, full_name, email), mediator:assigned_mediator_id(id, full_name, email)`)
      .single();

    if (updateError) throw updateError;

    const transitionDef = CaseStateMachine.getTransitionDef(body.transition);
    await logCaseEvent(id, user.id, 'phase_changed', {
      before: { status: beforeStatus },
      after: { status: result.fields?.status },
      metadata: { transition: body.transition, label: transitionDef?.label, notes: body.notes },
    });

    const { data: jointRoom } = await supabase.from('message_rooms').select('id').eq('case_id', id).eq('room_key', 'joint').single();
    if (jointRoom) {
      await supabase.from('messages').insert({
        room_id: jointRoom.id, case_id: id, sender_id: user.id, type: 'system_notification',
        content: `Case status updated: ${CaseStateMachine.statusLabel(beforeStatus)} → ${CaseStateMachine.statusLabel(result.fields?.status as any)}${body.notes ? `. Note: ${body.notes}` : ''}`,
        is_system: true,
      });
    }

    const uc = updatedCase as any;
    const recipients = [];
    if (uc?.claimant && uc.claimant_id !== user.id) recipients.push({ email: uc.claimant.email, name: uc.claimant.full_name, userId: uc.claimant_id });
    if (uc?.respondent && uc.respondent_id !== user.id) recipients.push({ email: uc.respondent.email, name: uc.respondent.full_name, userId: uc.respondent_id });

    for (const r of recipients) {
      await sendNotification({ userId: r.userId, caseId: id, channel: 'in_app', title: `Update on case ${uc.case_number}`, body: `Case status changed to ${CaseStateMachine.statusLabel(result.fields?.status as any)}`, actionUrl: `/cases/${id}` }).catch(console.error);
    }

    return NextResponse.json({ case: updatedCase, transition: body.transition, from_status: beforeStatus, to_status: result.fields?.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[POST /api/cases/[id]/transition]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
