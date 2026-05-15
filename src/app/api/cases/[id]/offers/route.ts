// src/app/api/cases/[id]/offers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/server';
import { logCaseEvent } from '@/lib/audit';
import { CaseStateMachine } from '@/lib/state-machine';
import type { Case } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;
    const supabase = await createClient();

    const { data: offers, error } = await supabase
      .from('offers')
      .select(`*, made_by_profile:made_by(id, full_name, avatar_url, role), made_to_profile:made_to(id, full_name, avatar_url, role)`)
      .eq('case_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ offers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();
    const { made_to, amount_cents, currency = 'USD', terms, expires_in_hours = 72, parent_offer_id } = body;

    if (!made_to) return NextResponse.json({ error: 'made_to is required' }, { status: 400 });
    if (!terms) return NextResponse.json({ error: 'terms is required' }, { status: 400 });

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expires_in_hours);

    const { data: offer, error } = await supabase
      .from('offers')
      .insert({ case_id: id, made_by: user.id, made_to, amount_cents: amount_cents ?? null, currency, terms, expires_at: expiresAt.toISOString(), parent_offer_id: parent_offer_id ?? null, ai_generated: false })
      .select(`*, made_by_profile:made_by(id, full_name, avatar_url, role)`)
      .single();

    if (error) throw error;

    const { data: jointRoom } = await supabase.from('message_rooms').select('id').eq('case_id', id).eq('room_key', 'joint').single();
    if (jointRoom) {
      const amountStr = amount_cents ? ` for $${(amount_cents / 100).toLocaleString()} ${currency}` : '';
      await supabase.from('messages').insert({ room_id: jointRoom.id, case_id: id, sender_id: user.id, type: parent_offer_id ? 'counter_offer' : 'offer', content: `${user.full_name} has made a settlement offer${amountStr}.`, metadata: { offer_id: offer.id }, is_system: true });
    }

    await logCaseEvent(id, user.id, 'offer_made', { metadata: { offer_id: offer.id, amount_cents } });
    return NextResponse.json(offer, { status: 201 });
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
    const user = await requireAuth();
    const { id } = await params;
    const supabase = await createClient();
    const body = await request.json();
    const { offer_id, action, response_note } = body;

    if (!offer_id) return NextResponse.json({ error: 'offer_id is required' }, { status: 400 });
    if (!['accepted', 'rejected', 'withdrawn'].includes(action)) return NextResponse.json({ error: 'action must be accepted, rejected, or withdrawn' }, { status: 400 });

    const { data: offer } = await supabase.from('offers').select('*').eq('id', offer_id).eq('case_id', id).single();
    if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    if (offer.status !== 'pending') return NextResponse.json({ error: `Offer is already ${offer.status}` }, { status: 422 });

    if (action === 'withdrawn' && offer.made_by !== user.id) return NextResponse.json({ error: 'Only the offer maker can withdraw' }, { status: 403 });
    if (action !== 'withdrawn' && offer.made_to !== user.id) return NextResponse.json({ error: 'Only the recipient can accept or reject' }, { status: 403 });

    const { data: updated } = await supabase.from('offers').update({ status: action, responded_at: new Date().toISOString(), response_note: response_note ?? null }).eq('id', offer_id).select().single();

    if (action === 'accepted') {
      const { data: caseData } = await supabase.from('cases').select('*').eq('id', id).single();
      const smResult = CaseStateMachine.execute({ ...caseData as Case, settlement_terms: offer.terms, settlement_amount_cents: offer.amount_cents }, 'settle', user.role);
      if (smResult.success) await supabase.from('cases').update({ ...smResult.fields, settlement_amount_cents: offer.amount_cents, settlement_terms: offer.terms }).eq('id', id);
      await logCaseEvent(id, user.id, 'offer_accepted', { metadata: { offer_id } });
    } else {
      await logCaseEvent(id, user.id, 'offer_rejected', { metadata: { offer_id, action } });
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
