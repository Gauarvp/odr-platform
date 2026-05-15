// src/app/api/ai/draft-settlement/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';
import { draftSettlementAgreement } from '@/lib/ai';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const supabase = await createClient();
    const body = await request.json();
    const { case_id, agreed_amount_cents, agreed_terms, payment_schedule, additional_conditions } = body;

    if (!case_id) return NextResponse.json({ error: 'case_id required' }, { status: 400 });
    if (!agreed_terms) return NextResponse.json({ error: 'agreed_terms required' }, { status: 400 });

    const { data: caseData } = await supabase
      .from('cases')
      .select(`*, claimant:claimant_id(full_name), respondent:respondent_id(full_name), mediator:assigned_mediator_id(full_name)`)
      .eq('id', case_id)
      .single();

    if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    const draft = await draftSettlementAgreement({
      case: caseData,
      claimant_name: caseData.claimant?.full_name ?? 'Claimant',
      respondent_name: caseData.respondent?.full_name ?? 'Respondent',
      agreed_amount_cents,
      agreed_terms,
      payment_schedule,
      additional_conditions,
      mediator_name: caseData.mediator?.full_name,
    });

    return NextResponse.json({ draft, case_number: caseData.case_number });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[POST /api/ai/draft-settlement]', err);
    return NextResponse.json({ error: 'Settlement drafting failed' }, { status: 500 });
  }
}
