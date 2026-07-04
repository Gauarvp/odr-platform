// End-to-end smoke test against the running dev server + local Supabase.
// Usage: node scripts/e2e.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
}

// Build the cookie header @supabase/ssr expects (sb-<ref>-auth-token,
// base64-encoded session, chunked at ~3180 chars).
function sessionCookies(session) {
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
  const name = `sb-${ref}-auth-token`;
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const MAX = 3180;
  if (value.length <= MAX) return `${name}=${value}`;
  const chunks = [];
  for (let i = 0; i * MAX < value.length; i++) {
    chunks.push(`${name}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  }
  return chunks.join('; ');
}

async function loginCookie(email) {
  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: 'demo1234' });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return sessionCookies(data.session);
}

async function api(cookie, path, init = {}) {
  const res = await fetch(`${APP}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

console.log('1. Unauthenticated access');
{
  const res = await fetch(`${APP}/api/cases`);
  check('GET /api/cases without auth → 401', res.status === 401, `got ${res.status}`);
  const page = await fetch(`${APP}/dashboard`, { redirect: 'manual' });
  check('GET /dashboard without auth → redirect to /login', page.status >= 300 && page.status < 400 && (page.headers.get('location') ?? '').includes('/login'), `got ${page.status}`);
}

console.log('2. Login as demo users');
const alice = await loginCookie('alice@demo.odr');
const bob = await loginCookie('bob@demo.odr');
const manager = await loginCookie('manager@demo.odr');
const mediator = await loginCookie('mediator@demo.odr');
check('alice/bob/manager/mediator sign in', true);

console.log('3. Case list');
const list = await api(alice, '/api/cases');
check('alice sees seeded cases', list.status === 200 && (list.body?.data?.length ?? 0) >= 2, `status ${list.status}, count ${list.body?.data?.length}`);
const negotiationCase = list.body.data.find(c => c.status === 'negotiation');
const mediationCase = list.body.data.find(c => c.status === 'mediation');
check('negotiation + mediation cases present', !!negotiationCase && !!mediationCase);

console.log('4. Case detail');
const detail = await api(alice, `/api/cases/${negotiationCase.id}`);
check('case detail loads with joined parties', detail.status === 200 && detail.body?.claimant?.email === 'alice@demo.odr', `status ${detail.status}`);

console.log('5. Messaging');
const msgs = await api(alice, `/api/cases/${negotiationCase.id}/messages?room=joint`);
check('alice reads joint room', msgs.status === 200 && (msgs.body?.messages?.length ?? 0) >= 2, `status ${msgs.status}, count ${msgs.body?.messages?.length}`);
const sent = await api(alice, `/api/cases/${negotiationCase.id}/messages`, {
  method: 'POST',
  body: JSON.stringify({ content: 'E2E test message from Alice.' }),
});
check('alice posts to joint room', sent.status === 201, `status ${sent.status}`);

console.log('6. Private room access control');
const alicePriv = await api(alice, `/api/cases/${negotiationCase.id}/messages?room=claimant_private`);
check('alice reads her own private room', alicePriv.status === 200, `status ${alicePriv.status}`);
const bobSnoop = await api(bob, `/api/cases/${negotiationCase.id}/messages?room=claimant_private`);
check('bob BLOCKED from claimant private room (403)', bobSnoop.status === 403, `status ${bobSnoop.status}`);
const bobMediatorRoom = await api(bob, `/api/cases/${mediationCase.id}/messages?room=mediator`);
check('bob BLOCKED from mediator notes (403)', bobMediatorRoom.status === 403, `status ${bobMediatorRoom.status}`);
const medNotes = await api(mediator, `/api/cases/${mediationCase.id}/messages?room=mediator`);
check('assigned mediator reads mediator notes', medNotes.status === 200, `status ${medNotes.status}`);

console.log('7. Offers');
const bobProfileId = detail.body.respondent.id;
const offer = await api(alice, `/api/cases/${negotiationCase.id}/offers`, {
  method: 'POST',
  body: JSON.stringify({ made_to: bobProfileId, amount_cents: 60000, terms: 'Refund of $600 within 14 days, dispute withdrawn on receipt.' }),
});
check('alice makes settlement offer', offer.status === 201, `status ${offer.status} ${JSON.stringify(offer.body)}`);

console.log('8. State machine');
const badTransition = await api(bob, `/api/cases/${negotiationCase.id}/transition`, {
  method: 'POST',
  body: JSON.stringify({ transition: 'award' }),
});
check('invalid transition rejected (award from negotiation)', badTransition.status === 422 || badTransition.status === 403, `status ${badTransition.status}`);
const accept = await api(bob, `/api/cases/${negotiationCase.id}/offers`, {
  method: 'PATCH',
  body: JSON.stringify({ offer_id: offer.body.id, action: 'accepted' }),
});
check('bob accepts offer', accept.status === 200, `status ${accept.status} ${JSON.stringify(accept.body)}`);
const after = await api(alice, `/api/cases/${negotiationCase.id}`);
check('case auto-settled after acceptance', after.body?.status === 'settled', `status now '${after.body?.status}'`);

console.log('9. Analytics');
const analytics = await api(manager, '/api/analytics');
check('analytics endpoint returns metrics', analytics.status === 200 && analytics.body?.metrics != null, `status ${analytics.status}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
