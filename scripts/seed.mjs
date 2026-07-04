// Demo seed for local development.
// Usage: node scripts/seed.mjs  (reads .env.local)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Minimal .env.local parser (no dotenv dependency)
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
} catch { /* rely on process env */ }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const ORG_ID = '00000000-0000-0000-0000-000000000001';
const PASSWORD = 'demo1234';

const USERS = [
  { email: 'admin@demo.odr', name: 'Ava Admin', role: 'org_admin' },
  { email: 'manager@demo.odr', name: 'Marcus Manager', role: 'case_manager' },
  { email: 'mediator@demo.odr', name: 'Mia Mediator', role: 'mediator' },
  { email: 'arbitrator@demo.odr', name: 'Arthur Arbiter', role: 'arbitrator' },
  { email: 'alice@demo.odr', name: 'Alice Claimant', role: 'claimant' },
  { email: 'bob@demo.odr', name: 'Bob Respondent', role: 'respondent' },
];

async function ensureUser({ email, name, role }) {
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  let id = created?.user?.id;
  if (error) {
    // Already exists — look it up
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    id = list?.users?.find(u => u.email === email)?.id;
    if (!id) throw new Error(`Cannot create or find user ${email}: ${error.message}`);
  }
  // Trigger created a claimant profile; set the real role directly
  const { error: upErr } = await db.from('user_profiles').upsert(
    { id, org_id: ORG_ID, role, full_name: name, email },
    { onConflict: 'id' },
  );
  if (upErr) throw upErr;
  return id;
}

function roomsFor(caseId) {
  return [
    { case_id: caseId, name: 'Joint Session', room_key: 'joint', is_private: false, allowed_roles: ['claimant', 'respondent'] },
    { case_id: caseId, name: 'Claimant Private', room_key: 'claimant_private', is_private: true, allowed_roles: ['claimant'] },
    { case_id: caseId, name: 'Respondent Private', room_key: 'respondent_private', is_private: true, allowed_roles: ['respondent'] },
    { case_id: caseId, name: 'Mediator Notes', room_key: 'mediator', is_private: true, allowed_roles: ['mediator', 'arbitrator'] },
  ];
}

async function main() {
  console.log('Seeding demo users…');
  const ids = {};
  for (const u of USERS) {
    ids[u.email] = await ensureUser(u);
    console.log(`  ✓ ${u.email} (${u.role})`);
  }

  const { count } = await db.from('cases').select('id', { count: 'exact', head: true });
  if (count > 0) {
    console.log(`Cases already exist (${count}) — skipping sample cases.`);
    console.log(`Done. All demo passwords: ${PASSWORD}`);
    return;
  }

  console.log('Seeding sample cases…');
  const samples = [
    {
      title: 'Order #4821 — Paid but goods never delivered',
      description: 'I purchased a refurbished laptop from the respondent\'s online store on May 2nd for $840. Payment cleared the same day. The tracking number provided has shown "label created" for six weeks with no movement. The seller has stopped responding to my emails. I am seeking a full refund plus shipping costs.',
      category: 'payment_dispute',
      status: 'negotiation',
      claim_amount_cents: 84000,
      filed_at: new Date(Date.now() - 12 * 864e5).toISOString(),
      served_at: new Date(Date.now() - 9 * 864e5).toISOString(),
      negotiation_started_at: new Date(Date.now() - 7 * 864e5).toISOString(),
      resolution_deadline: new Date(Date.now() + 14 * 864e5).toISOString(),
    },
    {
      title: 'Consulting contract terminated without notice period',
      description: 'Our agency signed a 6-month consulting agreement with the respondent that required 30 days written notice for termination. On June 1st they terminated effective immediately, leaving two invoices unpaid totalling $12,500. We seek payment of outstanding invoices and the contractual notice-period fee.',
      category: 'contract_breach',
      status: 'mediation',
      claim_amount_cents: 1250000,
      filed_at: new Date(Date.now() - 30 * 864e5).toISOString(),
      served_at: new Date(Date.now() - 26 * 864e5).toISOString(),
      negotiation_started_at: new Date(Date.now() - 24 * 864e5).toISOString(),
      mediation_started_at: new Date(Date.now() - 10 * 864e5).toISOString(),
      resolution_deadline: new Date(Date.now() + 35 * 864e5).toISOString(),
      assigned: true,
    },
  ];

  for (const s of samples) {
    const { assigned, ...fields } = s;
    const { data: c, error } = await db.from('cases').insert({
      ...fields,
      org_id: ORG_ID,
      claim_currency: 'USD',
      claimed_relief: ['monetary'],
      claimant_id: ids['alice@demo.odr'],
      respondent_id: ids['bob@demo.odr'],
      assigned_mediator_id: assigned ? ids['mediator@demo.odr'] : null,
      case_manager_id: ids['manager@demo.odr'],
      source: 'web',
      track: 'standard',
    }).select().single();
    if (error) throw error;

    const { error: roomErr } = await db.from('message_rooms').insert(roomsFor(c.id));
    if (roomErr) throw roomErr;

    const { data: joint } = await db.from('message_rooms').select('id').eq('case_id', c.id).eq('room_key', 'joint').single();
    await db.from('messages').insert([
      { room_id: joint.id, case_id: c.id, sender_id: ids['alice@demo.odr'], type: 'party_message', content: 'Hello — I have filed this dispute and would like to resolve it quickly. Happy to discuss.', read_by: [ids['alice@demo.odr']] },
      { room_id: joint.id, case_id: c.id, sender_id: ids['bob@demo.odr'], type: 'party_message', content: 'I have received the claim and am reviewing the details. I will respond with our position shortly.', read_by: [ids['bob@demo.odr']] },
    ]);
    console.log(`  ✓ ${c.case_number}: ${c.title.slice(0, 50)}…`);
  }

  console.log(`Done. Sign in as any demo user — password: ${PASSWORD}`);
}

main().catch(e => { console.error(e); process.exit(1); });
