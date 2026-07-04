# ODR Platform — Enterprise Online Dispute Resolution

An enterprise-grade Online Dispute Resolution (ODR) platform with AI-powered case intelligence, formal state machine lifecycle management, multi-party secure messaging, document management, and a full analytics dashboard.

Built to handle the complexity of real-world dispute resolution: from consumer payment disputes to complex commercial arbitration.

---

## What This Is

ODR (Online Dispute Resolution) is how modern enterprises, courts, and fintech platforms handle disputes without litigation. Think:
- eBay/PayPal's Resolution Center (60M+ disputes/year)
- EU ODR Platform for cross-border e-commerce
- Court systems using digital case management
- B2B SaaS platforms handling merchant disputes

This platform provides the full infrastructure to run an ODR operation:

**Multi-phase resolution**: Cases move through a formal state machine: Draft → Filed → Served → Negotiation → Mediation → Arbitration → Settled/Awarded/Dismissed/Closed

**AI intelligence layer**: Claude-powered case triage, outcome prediction, document analysis, mediator assist, and settlement agreement drafting

**Enterprise multi-tenancy**: Multiple organisations share one deployment, each with their own data (Supabase RLS), branding config, and workflow rules

**API integration layer**: E-commerce and fintech platforms file disputes programmatically via API key auth + HMAC-signed webhooks

---

## Architecture

```
odr-platform/
├── supabase/
│   └── migrations/
│       ├── 001_schema.sql          # 15+ tables, enums, triggers, sequences
│       └── 002_rls.sql             # Row Level Security for every table
├── src/
│   ├── lib/
│   │   ├── types.ts                # Canonical TypeScript interfaces
│   │   ├── state-machine.ts        # Formal case state machine engine
│   │   ├── ai/index.ts             # 6 AI capabilities (Claude API)
│   │   ├── supabase/server.ts      # Auth-aware DB clients
│   │   ├── audit/index.ts          # Immutable event log
│   │   └── notifications/index.ts  # In-app notifications
│   └── app/
│       ├── api/
│       │   ├── cases/              # Case CRUD + state transitions
│       │   ├── ai/                 # Triage, predict, draft, analyze
│       │   ├── analytics/          # Resolution metrics API
│       │   └── webhooks/external/  # Inbound API for integrations
│       └── (platform)/
│           ├── dashboard/          # Role-aware dashboard
│           ├── cases/              # List + detail + filing wizard
│           └── analytics/          # Charts dashboard (Recharts)
```

---

## Database Design

### Core tables
| Table | Purpose |
|---|---|
| `organisations` | Multi-tenant orgs (courts, enterprises, fintechs) |
| `user_profiles` | Extended auth profiles with roles, credentials |
| `cases` | Core case entity with AI outputs, SLA tracking |
| `case_parties` | Additional parties beyond claimant/respondent |
| `case_deadlines` | SLA milestones with auto-escalation flags |
| `message_rooms` | Per-case secure communication channels |
| `messages` | Thread messages with read receipts |
| `documents` | Evidence vault with AI analysis, versioning |
| `offers` | Settlement offer chains with counter-offer links |
| `agreements` | Final settlements + awards with e-signatures |
| `audit_events` | **Append-only** event log (immutable via DB rules) |
| `api_keys` | External integration auth |
| `webhooks` | Outbound event delivery |

### Row Level Security
Every table has RLS policies. Key rules:
- Users only see cases they're party to
- Case managers/admins see all org cases
- Mediators can see all parties but private rooms are scoped
- Audit log is read-only at DB level (no UPDATE/DELETE rules)
- API keys scoped to org — cross-tenant access impossible at DB level

---

## State Machine

Cases follow a formal state graph. Transitions are validated before execution:

```
[DRAFT] 
  → submit → [FILED]
  → serve → [SERVED]
  → begin_negotiation → [NEGOTIATION]
  → escalate_mediation → [MEDIATION]
  → escalate_arbitration → [ARBITRATION]
  → settle → [SETTLED]
  → award → [AWARDED]
  → dismiss → [DISMISSED]
  → appeal → [APPEALED]
  → close → [CLOSED]
```

Each transition has:
- **from[]**: valid source states
- **to**: destination state
- **allowed_roles[]**: who can trigger it
- **preconditions[]**: assertions checked before execution
- **fields()**: case fields updated on transition

---

## AI Capabilities

All powered by `claude-sonnet-4-5`. Six capabilities:

### 1. Case Triage
Analyzes dispute description → recommends track (fast/standard/complex/emergency), complexity, key issues, estimated duration.

### 2. Outcome Prediction
Predicts likely resolution with probability breakdown across 5 outcomes. Recommends settlement range. Cites comparable cases.

### 3. Document Analysis
Extracts key claims, factual assertions, credibility notes from uploaded evidence PDFs/docs. Identifies which party each document supports.

### 4. Mediator Assist
Summarizes each party's position. Identifies areas of agreement vs core disagreements. Suggests bridging proposals and conversation starters.

### 5. Settlement Drafter
Generates a full professional settlement agreement from negotiated terms. Includes recitals, mutual release, no-admission clause, payment schedule, governing law placeholder, signature blocks.

### 6. AI Offer Generator
Suggests a fair settlement figure with rationale, negotiation floor/ceiling, and framing language for each party.

---

## SLA System

| Track | Negotiation | Mediation | Arbitration |
|---|---|---|---|
| Emergency | 2 days | 5 days | 14 days |
| Fast Track | 7 days | 15 days | 30 days |
| Standard | 21 days | 45 days | 90 days |
| Complex | 30 days | 90 days | 180 days |

SLAs are computed at transition time and stored on the case. Overdue/warning states shown in the cases list.

---

## External API Integration

E-commerce and fintech platforms can file disputes programmatically:

```bash
curl -X POST https://your-domain.com/api/webhooks/external \
  -H "Authorization: Bearer odr_live_AbCdEfGh..." \
  -H "Content-Type: application/json" \
  -d '{
    "claimant_email": "buyer@example.com",
    "claimant_name": "Alice Smith",
    "respondent_email": "seller@merchant.com",
    "respondent_name": "Merchant Co",
    "title": "Order #12345 — Item not received",
    "description": "I placed an order on 2024-01-15. The item has not arrived after 30 days. Tracking shows it has not been shipped...",
    "category": "service_failure",
    "claim_amount_cents": 18900,
    "claim_currency": "USD",
    "external_reference": "ORDER-12345"
  }'
```

Response:
```json
{
  "case_id": "uuid",
  "case_number": "ODR-2024-00142",
  "status": "filed",
  "portal_url": "https://your-domain.com/cases/uuid"
}
```

---

## Local Development (recommended first)

Requires Docker Desktop.

```bash
npm install
npx supabase start          # boots local Postgres/Auth/Storage, applies migrations
# Copy the printed API URL + anon key + service_role key into .env.local
npm run seed                # demo org, 6 demo users (password: demo1234), 2 sample cases
npm run dev                 # http://localhost:3000
```

Demo accounts after seeding: `admin@demo.odr`, `manager@demo.odr`, `mediator@demo.odr`,
`arbitrator@demo.odr`, `alice@demo.odr` (claimant), `bob@demo.odr` (respondent).

Self-serve signup is available at `/signup` — new users get a profile automatically
(via the `on_auth_user_created` trigger) in the demo organisation.

---

## Deploy Guide

### 1. Supabase setup
```bash
# Create project at supabase.com
# Run migrations:
supabase db push

# Enable Realtime for messages table in Supabase dashboard
```

### 2. Environment variables
```bash
cp .env.example .env.local
# Fill in Supabase URL, anon key, service role key, Anthropic API key
```

### 3. Vercel deploy (recommended)
```bash
npm install -g vercel
vercel  # Follow prompts
vercel env add ANTHROPIC_API_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
# Add all other env vars
vercel --prod
```

### 4. Railway deploy (alternative)
- Push to GitHub
- New project → Deploy from GitHub repo
- Add env vars in Railway dashboard
- Railway auto-detects Next.js

---

## Key API Routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/cases` | List cases (paginated, filtered) |
| POST | `/api/cases` | File new dispute |
| GET | `/api/cases/:id` | Case detail |
| PATCH | `/api/cases/:id` | Update case fields |
| POST | `/api/cases/:id/transition` | Execute state transition |
| GET | `/api/cases/:id/messages` | List messages (cursor paginated) |
| POST | `/api/cases/:id/messages` | Send message |
| GET | `/api/cases/:id/documents` | List documents |
| POST | `/api/cases/:id/documents` | Register uploaded document |
| GET | `/api/cases/:id/offers` | List settlement offers |
| POST | `/api/cases/:id/offers` | Make offer |
| PATCH | `/api/cases/:id/offers` | Accept / reject / withdraw |
| POST | `/api/ai/triage` | Run AI case triage |
| POST | `/api/ai/predict` | Run outcome prediction |
| POST | `/api/ai/draft-settlement` | Generate settlement draft |
| GET | `/api/analytics` | Resolution metrics |
| POST | `/api/webhooks/external` | Inbound case filing (API key) |

---

## User Roles

| Role | Capabilities |
|---|---|
| `claimant` | File cases, send messages, upload evidence, make/respond to offers |
| `respondent` | Join cases, respond to claims, counter-offers |
| `mediator` | Access all case channels, mediator notes, facilitate settlement |
| `arbitrator` | Issue binding awards, access all case data |
| `case_manager` | Manage case workflow, assign neutrals, serve cases |
| `org_admin` | Full org access, manage users, API keys, webhooks |
| `platform_admin` | Cross-org access, platform configuration |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| ORM | Supabase JS client (typed) |
| AI | Anthropic Claude API (claude-sonnet-4-5) |
| Realtime | Supabase Realtime (WebSocket) |
| File storage | Supabase Storage |
| Charts | Recharts |
| Styling | Tailwind CSS + Radix UI |
| Email | Resend |
| State management | Zustand (client) |
| Validation | Zod |

---

## What Makes This Enterprise-Grade

1. **Formal state machine** — not ad-hoc status fields. Every transition validated, every side-effect explicit.

2. **Immutable audit log** — DB rules prevent UPDATE/DELETE on audit_events. Full compliance trail.

3. **Row Level Security** — multi-tenant data isolation enforced at the database level, not application level.

4. **API integration layer** — external platforms file disputes programmatically. HMAC-signed webhooks for outbound events.

5. **AI at every step** — triage on intake, outcome prediction mid-case, mediator assist during sessions, settlement drafting at closure.

6. **SLA tracking** — deadlines computed per track, surfaced in UI with warning/overdue states.

7. **Private communication channels** — four rooms per case (joint, claimant-private, respondent-private, mediator notes). RLS enforces room access at DB level.

8. **Document versioning** — parent_id chain for document versions, AI analysis on each upload, confidentiality flags.
