// src/app/api/ai/triage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';
import { triageCase } from '@/lib/ai';
import { logCaseEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const supabase = await createClient();
    const { case_id } = await request.json();

    if (!case_id) return NextResponse.json({ error: 'case_id is required' }, { status: 400 });

    const { data: caseData, error } = await supabase
      .from('cases')
      .select('*')
      .eq('id', case_id)
      .single();

    if (error || !caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    const triage = await triageCase({
      title: caseData.title,
      description: caseData.description,
      category: caseData.category,
      claim_amount_cents: caseData.claim_amount_cents,
      claimed_relief: caseData.claimed_relief,
    });

    // Update case with triage result and adjust track
    await supabase
      .from('cases')
      .update({
        ai_triage: triage,
        track: triage.recommended_track,
        ai_last_analysis_at: new Date().toISOString(),
      })
      .eq('id', case_id);

    await logCaseEvent(case_id, user.id, 'ai_analysis_run', {
      metadata: { analysis_type: 'triage', complexity: triage.complexity },
    });

    return NextResponse.json({ triage });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[POST /api/ai/triage]', err);
    return NextResponse.json({ error: 'AI triage failed' }, { status: 500 });
  }
}
