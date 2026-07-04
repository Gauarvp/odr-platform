// src/app/api/webhooks/external/route.ts
// Inbound API for e-commerce and fintech platforms to programmatically file disputes.
// Authenticated via API key in the Authorization header.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createHmac, timingSafeEqual } from 'crypto';

async function authenticateApiKey(request: NextRequest): Promise<{ orgId: string; scopes: string[] } | null> {
  const auth = request.headers.get('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(odr_(?:live|test)_\S+)$/);
  if (!match) return null;

  const key = match[1];
  const prefix = key.slice(0, 12);  // 'odr_live_XXXX' — first 12 chars

  const supabase = await createServiceClient();
  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key_prefix', prefix)
    .eq('is_active', true)
    .single();

  if (!apiKey) return null;
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) return null;

  // Verify key against stored hash (bcrypt in production; simplified here)
  const expectedHash = createHmac('sha256', process.env.API_KEY_SECRET!).update(key).digest('hex');
  const storedHash = Buffer.from(apiKey.key_hash);
  const computedHash = Buffer.from(expectedHash);

  if (storedHash.length !== computedHash.length) return null;
  if (!timingSafeEqual(storedHash, computedHash)) return null;

  // Update last used
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id);

  return { orgId: apiKey.org_id, scopes: apiKey.scopes };
}

// POST /api/webhooks/external — file a dispute from an external platform
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiKey(request);
    if (!auth) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    if (!auth.scopes.includes('cases:write')) {
      return NextResponse.json({ error: 'API key does not have cases:write scope' }, { status: 403 });
    }

    const supabase = await createServiceClient();
    const body = await request.json();

    // Required fields from external system
    const {
      claimant_email,
      claimant_name,
      respondent_email,
      respondent_name,
      title,
      description,
      category = 'payment_dispute',
      claim_amount_cents,
      claim_currency = 'USD',
      claimed_relief = ['monetary'],
      external_reference,  // e.g., order ID from the external platform
      source = 'api',
    } = body;

    // Validate
    if (!claimant_email || !respondent_email || !title || !description) {
      return NextResponse.json({
        error: 'Required fields: claimant_email, respondent_email, title, description',
      }, { status: 400 });
    }

    // Find or create claimant profile
    let claimantId: string;
    const { data: existingClaimant } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', claimant_email)
      .single();

    if (existingClaimant) {
      claimantId = existingClaimant.id;
    } else {
      // Create a minimal profile (user will complete it on first login)
      const { data: { user }, error: signupError } = await supabase.auth.admin.createUser({
        email: claimant_email,
        email_confirm: true,
        user_metadata: { full_name: claimant_name },
      });
      if (signupError || !user) {
        return NextResponse.json({ error: 'Failed to create claimant account' }, { status: 500 });
      }
      // The on_auth_user_created trigger creates a default profile;
      // upsert to attach the caller's org and name.
      await supabase.from('user_profiles').upsert({
        id: user.id,
        org_id: auth.orgId,
        role: 'claimant',
        full_name: claimant_name ?? claimant_email,
        email: claimant_email,
      }, { onConflict: 'id' });
      claimantId = user.id;
    }

    // Find respondent
    let respondentId: string | null = null;
    const { data: existingRespondent } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', respondent_email)
      .single();
    if (existingRespondent) respondentId = existingRespondent.id;

    // Create the case
    const { data: newCase, error: caseError } = await supabase
      .from('cases')
      .insert({
        org_id: auth.orgId,
        title,
        description,
        category,
        claim_amount_cents: claim_amount_cents ?? null,
        claim_currency,
        claimed_relief,
        claimant_id: claimantId,
        respondent_id: respondentId,
        external_reference: external_reference ?? null,
        source,
        status: 'filed',  // API-filed cases skip draft
        filed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (caseError) throw caseError;

    // Create default message rooms
    await supabase.from('message_rooms').insert([
      { case_id: newCase.id, name: 'Joint Session', room_key: 'joint', is_private: false, allowed_roles: ['claimant', 'respondent'] },
      { case_id: newCase.id, name: 'Claimant Private', room_key: 'claimant_private', is_private: true, allowed_roles: ['claimant'] },
      { case_id: newCase.id, name: 'Respondent Private', room_key: 'respondent_private', is_private: true, allowed_roles: ['respondent'] },
    ]);

    // Fire outbound webhooks to the org's registered webhooks
    await fireOutboundWebhooks(auth.orgId, 'case.filed', {
      case_id: newCase.id,
      case_number: newCase.case_number,
      external_reference,
    });

    return NextResponse.json({
      case_id: newCase.id,
      case_number: newCase.case_number,
      status: newCase.status,
      portal_url: `${process.env.NEXT_PUBLIC_APP_URL}/cases/${newCase.id}`,
    }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/webhooks/external]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function fireOutboundWebhooks(orgId: string, event: string, payload: Record<string, unknown>) {
  const supabase = await createServiceClient();
  const { data: webhooks } = await supabase
    .from('webhooks')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .contains('events', [event]);

  for (const wh of webhooks ?? []) {
    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const sig = createHmac('sha256', wh.secret).update(body).digest('hex');

    fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ODR-Signature': `sha256=${sig}`,
        'X-ODR-Event': event,
      },
      body,
    }).catch(() => {
      supabase.from('webhooks')
        .update({ failure_count: wh.failure_count + 1 })
        .eq('id', wh.id)
        .then(() => {});
    });
  }
}
