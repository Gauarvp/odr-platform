// src/app/api/ai/predict/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';
import { predictOutcome } from '@/lib/ai';
import { logCaseEvent } from '@/lib/audit';
import type { Case, Document } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const supabase = await createClient();
    const { case_id } = await request.json();

    if (!case_id) return NextResponse.json({ error: 'case_id required' }, { status: 400 });

    const [{ data: caseData }, { data: docs }] = await Promise.all([
      supabase.from('cases').select('*').eq('id', case_id).single(),
      supabase.from('documents').select('*').eq('case_id', case_id),
    ]);

    if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    const prediction = await predictOutcome(caseData as Case, (docs ?? []) as Document[]);

    await supabase
      .from('cases')
      .update({
        ai_outcome_prediction: prediction,
        ai_last_analysis_at: new Date().toISOString(),
      })
      .eq('id', case_id);

    await logCaseEvent(case_id, user.id, 'ai_analysis_run', {
      metadata: { analysis_type: 'outcome_prediction', likely_outcome: prediction.likely_outcome },
    });

    return NextResponse.json({ prediction });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[POST /api/ai/predict]', err);
    return NextResponse.json({ error: 'AI prediction failed' }, { status: 500 });
  }
}
