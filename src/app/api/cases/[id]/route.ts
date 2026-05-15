// src/app/api/cases/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('cases')
      .select(`
        *,
        claimant:claimant_id(id, full_name, email, avatar_url, role),
        respondent:respondent_id(id, full_name, email, avatar_url, role),
        mediator:assigned_mediator_id(id, full_name, email, avatar_url, bio, specializations),
        arbitrator:assigned_arbitrator_id(id, full_name, email, avatar_url)
      `)
      .eq('id', id)
      .single();

    if (error) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();

    const allowedFields = ['title', 'description', 'tags', 'settlement_terms', 'settlement_amount_cents'];
    const update: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) update[field] = body[field];
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('cases')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
