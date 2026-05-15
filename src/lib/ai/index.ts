// src/lib/ai/index.ts
// AI intelligence layer for the ODR platform.
// Four core capabilities: triage, prediction, document analysis, settlement drafting.

import Anthropic from '@anthropic-ai/sdk';
import type {
  Case, Document, AITriageResult, AIOutcomePrediction,
  CaseCategory, DisputeTrack
} from '../types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-5';

// ─── 1. CASE TRIAGE ────────────────────────────────────────────
// Analyzes a newly filed dispute and recommends track, key issues, risk factors.

export async function triageCase(
  input: Pick<Case, 'title' | 'description' | 'category' | 'claim_amount_cents' | 'claimed_relief'>
): Promise<AITriageResult> {
  const claimValueStr = input.claim_amount_cents
    ? `$${(input.claim_amount_cents / 100).toLocaleString()}`
    : 'unspecified (non-monetary)';

  const prompt = `You are an experienced ODR case administrator performing initial case triage.

Analyze this dispute and return a structured assessment.

CASE DETAILS:
Title: ${input.title}
Category: ${input.category}
Claimed Amount: ${claimValueStr}
Claimed Relief: ${(input.claimed_relief ?? []).join(', ') || 'Not specified'}

Dispute Description:
${input.description}

Return a JSON object with EXACTLY this structure (no markdown, raw JSON only):
{
  "complexity": "low" | "medium" | "high" | "critical",
  "recommended_track": "fast_track" | "standard" | "complex" | "emergency",
  "key_issues": ["issue1", "issue2", "issue3"],
  "estimated_duration_days": <number>,
  "recommended_resolution_type": "negotiation" | "mediation" | "arbitration",
  "reasoning": "<2-3 sentence explanation>",
  "risk_factors": ["risk1", "risk2"],
  "confidence": <0.0 to 1.0>
}

Track guidelines:
- fast_track: <$5k, simple facts, clear liability, target 15 days
- standard: $5k-$100k, typical evidence, 45 days
- complex: >$100k OR multi-party OR requires expert testimony, 90 days
- emergency: injunctive relief, imminent harm, urgent asset protection

Be conservative with complexity — only escalate if genuinely warranted.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text) as AITriageResult;
}

// ─── 2. OUTCOME PREDICTION ─────────────────────────────────────
// Based on case facts + historical patterns, predicts likely outcome.

export async function predictOutcome(
  c: Case,
  documents: Document[],
): Promise<AIOutcomePrediction> {
  const docSummaries = documents
    .filter(d => d.ai_summary)
    .map(d => `- ${d.name} (${d.type}): ${d.ai_summary}`)
    .join('\n');

  const claimValue = c.claim_amount_cents
    ? `$${(c.claim_amount_cents / 100).toLocaleString()}`
    : 'non-monetary';

  const prompt = `You are an experienced dispute resolution analyst with deep knowledge of ODR outcomes.

Analyze this case and predict the likely outcome with probability estimates.

CASE OVERVIEW:
Case Number: ${c.case_number}
Category: ${c.category}
Track: ${c.track}
Claim Amount: ${claimValue}
Status: ${c.status}
Days since filing: ${c.filed_at ? Math.floor((Date.now() - new Date(c.filed_at).getTime()) / 86400000) : 'not filed'}

Description:
${c.description}

Evidence on record:
${docSummaries || 'No documents analyzed yet'}

AI Triage Assessment:
${c.ai_triage ? JSON.stringify(c.ai_triage, null, 2) : 'Not yet triaged'}

Return a JSON object with EXACTLY this structure (raw JSON only):
{
  "likely_outcome": "claimant_prevails" | "respondent_prevails" | "partial_settlement" | "full_settlement" | "dismissal",
  "confidence": <0.0 to 1.0>,
  "probability_breakdown": [
    {"outcome": "full_settlement", "probability": 0.4},
    {"outcome": "partial_settlement", "probability": 0.3},
    {"outcome": "claimant_prevails", "probability": 0.2},
    {"outcome": "respondent_prevails", "probability": 0.05},
    {"outcome": "dismissal", "probability": 0.05}
  ],
  "key_factors_for_claimant": ["factor1", "factor2"],
  "key_factors_for_respondent": ["factor1", "factor2"],
  "recommended_settlement_range": {
    "min_cents": <number or null>,
    "max_cents": <number or null>
  },
  "comparable_cases": [
    {"case_type": "Payment dispute - SaaS", "outcome": "partial_settlement", "resolution_days": 28}
  ],
  "analysis_date": "${new Date().toISOString()}"
}

Be calibrated — avoid extreme confidence. Settlement is typically the most likely outcome in ODR.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text) as AIOutcomePrediction;
}

// ─── 3. DOCUMENT ANALYSIS ──────────────────────────────────────
// Extracts claims, facts, and key issues from uploaded evidence.

export interface DocumentAnalysis {
  summary: string;
  key_claims: string[];
  factual_assertions: string[];
  supporting_party: 'claimant' | 'respondent' | 'neutral' | 'unclear';
  credibility_notes: string;
  recommended_follow_up: string[];
}

export async function analyzeDocument(
  document: Document,
  documentText: string,  // Extracted text from PDF/DOCX
  caseContext: Pick<Case, 'title' | 'description' | 'category'>,
): Promise<DocumentAnalysis> {
  const prompt = `You are an ODR case analyst reviewing submitted evidence.

CASE CONTEXT:
Title: ${caseContext.title}
Category: ${caseContext.category}
Description: ${caseContext.description}

DOCUMENT:
Name: ${document.name}
Type: ${document.type}

CONTENT:
${documentText.slice(0, 8000)}

Analyze this document and return a JSON object (raw JSON only):
{
  "summary": "<2-3 sentence neutral summary>",
  "key_claims": ["claim1", "claim2"],
  "factual_assertions": ["fact1", "fact2"],
  "supporting_party": "claimant" | "respondent" | "neutral" | "unclear",
  "credibility_notes": "<observations about document authenticity/reliability>",
  "recommended_follow_up": ["Request X", "Verify Y"]
}

Be neutral. Do not advocate for either party. Flag inconsistencies or missing information.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text) as DocumentAnalysis;
}

// ─── 4. MEDIATOR ASSIST ────────────────────────────────────────
// Summarizes party positions and identifies common ground for the mediator.

export interface MediatorAssistOutput {
  claimant_position_summary: string;
  respondent_position_summary: string;
  areas_of_agreement: string[];
  core_disagreements: string[];
  suggested_bridging_proposals: string[];
  conversation_starters: string[];
  red_flags: string[];
}

export async function assistMediator(
  c: Case,
  messages: { sender_role: string; content: string; created_at: string }[],
  documents: Document[],
): Promise<MediatorAssistOutput> {
  const conversation = messages
    .slice(-40)  // Last 40 messages for context
    .map(m => `[${m.sender_role.toUpperCase()} - ${new Date(m.created_at).toLocaleDateString()}]: ${m.content}`)
    .join('\n');

  const docContext = documents
    .filter(d => d.ai_summary)
    .map(d => `${d.type}: ${d.ai_summary}`)
    .join('\n');

  const prompt = `You are assisting a professional mediator prepare for a session.

CASE: ${c.case_number} — ${c.title}
Category: ${c.category}
Track: ${c.track}
Claim: ${c.claim_amount_cents ? '$' + (c.claim_amount_cents / 100).toLocaleString() : 'non-monetary'}

RECENT COMMUNICATIONS:
${conversation || 'No communications yet'}

EVIDENCE SUMMARY:
${docContext || 'No documents analyzed'}

Analyze the current state of this dispute from a mediator's perspective.
Return a JSON object (raw JSON only):
{
  "claimant_position_summary": "<2-3 sentences>",
  "respondent_position_summary": "<2-3 sentences>",
  "areas_of_agreement": ["area1", "area2"],
  "core_disagreements": ["disagreement1", "disagreement2"],
  "suggested_bridging_proposals": ["proposal1", "proposal2"],
  "conversation_starters": ["opener1", "opener2"],
  "red_flags": ["flag1"]
}

Focus on practical interventions. Avoid legal conclusions.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text) as MediatorAssistOutput;
}

// ─── 5. SETTLEMENT DRAFTER ─────────────────────────────────────
// Generates a draft settlement agreement from negotiated terms.

export interface SettlementDraftInput {
  case: Case;
  claimant_name: string;
  respondent_name: string;
  agreed_amount_cents?: number;
  agreed_terms: string;     // Natural language summary of what was agreed
  payment_schedule?: string;
  additional_conditions?: string[];
  mediator_name?: string;
}

export async function draftSettlementAgreement(input: SettlementDraftInput): Promise<string> {
  const amount = input.agreed_amount_cents
    ? `$${(input.agreed_amount_cents / 100).toLocaleString()} ${input.case.claim_currency}`
    : 'non-monetary relief as specified herein';

  const prompt = `You are a legal drafting assistant. Generate a professional settlement agreement.

PARTIES:
Claimant: ${input.claimant_name}
Respondent: ${input.respondent_name}
${input.mediator_name ? `Mediator: ${input.mediator_name}` : ''}

CASE REFERENCE: ${input.case.case_number}
DISPUTE CATEGORY: ${input.case.category}
ORIGINAL CLAIM: ${input.case.claim_amount_cents ? '$' + (input.case.claim_amount_cents / 100).toLocaleString() : 'non-monetary'}

AGREED TERMS:
Settlement Amount: ${amount}
${input.payment_schedule ? `Payment Schedule: ${input.payment_schedule}` : ''}
Terms: ${input.agreed_terms}
${input.additional_conditions?.length ? `Additional Conditions:\n${input.additional_conditions.map(c => `- ${c}`).join('\n')}` : ''}

Draft a complete, professional settlement agreement. Include:
1. Recitals (parties, dispute background)
2. Settlement amount and payment terms
3. Release of claims (mutual or unilateral as appropriate)
4. Confidentiality clause
5. No-admission-of-liability clause
6. Representations and warranties
7. Governing law (leave as [JURISDICTION] placeholder)
8. Entire agreement clause
9. Signature blocks for all parties

Use professional legal language. Leave [DATE], [JURISDICTION] as placeholders.
Do not add commentary — return only the agreement text.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// ─── 6. AI OFFER GENERATOR ────────────────────────────────────
// Suggests a fair settlement offer range based on case facts.

export interface AIOfferSuggestion {
  suggested_amount_cents: number;
  rationale: string;
  negotiation_range: { floor_cents: number; ceiling_cents: number };
  framing_for_claimant: string;
  framing_for_respondent: string;
}

export async function suggestOffer(c: Case, documents: Document[]): Promise<AIOfferSuggestion | null> {
  if (!c.claim_amount_cents) return null;  // Non-monetary cases need human judgment

  const docContext = documents
    .filter(d => d.ai_summary)
    .map(d => `- ${d.type}: ${d.ai_summary}`)
    .join('\n');

  const prompt = `You are an experienced settlement advisor.

CASE: ${c.case_number}
Original Claim: $${(c.claim_amount_cents / 100).toLocaleString()} ${c.claim_currency}
Category: ${c.category}
AI Triage: ${JSON.stringify(c.ai_triage)}
Evidence: ${docContext || 'None analyzed'}

Suggest a fair settlement offer that both parties might accept.
Return raw JSON only:
{
  "suggested_amount_cents": <number>,
  "rationale": "<2-3 sentence explanation of this figure>",
  "negotiation_range": {
    "floor_cents": <minimum acceptable>,
    "ceiling_cents": <maximum claimant might accept>
  },
  "framing_for_claimant": "<how to present this offer to claimant>",
  "framing_for_respondent": "<how to present this offer to respondent>"
}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text) as AIOfferSuggestion;
}
