// src/app/api/cases/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';
import { logCaseEvent } from '@/lib/audit';
import { triageCase } from '@/lib/ai';
import type { CaseFilingInput } from '@/lib/types';

// GET /api/cases — list cases for current user
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const page = parseInt(searchParams.get('page') ?? '1');
    const pageSize = Math.min(parseInt(searchParams.get('page_size') ?? '20'), 100);
    const search = searchParams.get('q');

    let query = supabase
      .from('cases')
      .select(`
        *,
        claimant:claimant_id(id, full_name, email, avatar_url),
        respondent:respondent_id(id, full_name, email, avatar_url),
        mediator:assigned_mediator_id(id, full_name, email, avatar_url)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (search) {
      // Strip characters with meaning in PostgREST filter syntax
      const safe = search.replace(/[,()%\\]/g, ' ').trim();
      if (safe) query = query.or(`title.ilike.%${safe}%,case_number.ilike.%${safe}%`);
    }

    // RLS handles access control — users only see their cases
    // But case managers/admins see all org cases
    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data,
      total: count ?? 0,
      page,
      page_size: pageSize,
      has_next: (count ?? 0) > page * pageSize,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[GET /api/cases]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/cases — file a new dispute
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const supabase = await createClient();
    const body = await request.json() as CaseFilingInput;

    // Validate required fields
    if (!body.title || body.title.length < 10) {
      return NextResponse.json({ error: 'Title must be at least 10 characters' }, { status: 400 });
    }
    if (!body.description || body.description.length < 50) {
      return NextResponse.json({ error: 'Description must be at least 50 characters' }, { status: 400 });
    }
    if (!body.category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }
    if (!body.respondent_email) {
      return NextResponse.json({ error: 'Respondent email is required' }, { status: 400 });
    }

    // Check if respondent already has an account
    let respondentId: string | null = null;
    const { data: respondentProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', body.respondent_email)
      .single();

    if (respondentProfile) {
      respondentId = respondentProfile.id;
    }
    // If no account, they'll be invited via email — respondent_id set when they join

    // Create the case
    const { data: newCase, error: caseError } = await supabase
      .from('cases')
      .insert({
        org_id: user.org_id,
        title: body.title,
        description: body.description,
        category: body.category,
        claim_amount_cents: body.claim_amount_cents ?? null,
        claim_currency: body.claim_currency ?? 'USD',
        claimed_relief: body.claimed_relief ?? [],
        claimant_id: user.id,
        respondent_id: respondentId,
        tags: body.tags ?? [],
        external_reference: body.external_reference ?? null,
        source: 'web',
        status: 'draft',
      })
      .select()
      .single();

    if (caseError) throw caseError;

    // Create default message rooms
    await supabase.from('message_rooms').insert([
      {
        case_id: newCase.id,
        name: 'Joint Session',
        room_key: 'joint',
        is_private: false,
        allowed_roles: ['claimant', 'respondent', 'third_party'],
      },
      {
        case_id: newCase.id,
        name: 'Claimant Private',
        room_key: 'claimant_private',
        is_private: true,
        allowed_roles: ['claimant'],
      },
      {
        case_id: newCase.id,
        name: 'Respondent Private',
        room_key: 'respondent_private',
        is_private: true,
        allowed_roles: ['respondent'],
      },
      {
        case_id: newCase.id,
        name: 'Mediator Notes',
        room_key: 'mediator',
        is_private: true,
        allowed_roles: ['mediator', 'arbitrator'],
      },
    ]);

    // Run AI triage asynchronously
    // Fire-and-forget — don't block the response
    triageCase({
      title: newCase.title,
      description: newCase.description,
      category: newCase.category,
      claim_amount_cents: newCase.claim_amount_cents,
      claimed_relief: newCase.claimed_relief,
    }).then(async (triage) => {
      await supabase
        .from('cases')
        .update({
          ai_triage: triage,
          track: triage.recommended_track,
          ai_last_analysis_at: new Date().toISOString(),
        })
        .eq('id', newCase.id);
    }).catch(console.error);

    await logCaseEvent(newCase.id, user.id, 'case_filed', {
      after: { case_number: newCase.case_number, status: 'draft' },
    });

    return NextResponse.json(newCase, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[POST /api/cases]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
