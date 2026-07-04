'use client';
// src/app/(platform)/cases/[id]/page.tsx

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Scale, Clock, Send, Upload, Zap, ChevronDown,
  FileText, AlertTriangle, CheckCircle, TrendingUp,
  MessageSquare, ArrowRight, BarChart2, RefreshCw
} from 'lucide-react';
import type { Case, Message, Document, Offer, AITriageResult, AIOutcomePrediction } from '@/lib/types';
import { CaseStateMachine } from '@/lib/state-machine';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  filed: 'bg-blue-100 text-blue-700',
  negotiation: 'bg-amber-100 text-amber-700',
  mediation: 'bg-purple-100 text-purple-700',
  arbitration: 'bg-red-100 text-red-700',
  settled: 'bg-green-100 text-green-700',
  awarded: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-gray-100 text-gray-500',
  closed: 'bg-slate-100 text-slate-500',
  served: 'bg-sky-100 text-sky-700',
  appealed: 'bg-orange-100 text-orange-700',
};

const COMPLEXITY_COLORS: Record<string, string> = {
  low: 'text-green-600 bg-green-50',
  medium: 'text-amber-600 bg-amber-50',
  high: 'text-red-600 bg-red-50',
  critical: 'text-red-800 bg-red-100',
};

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [activeTab, setActiveTab] = useState<'messages' | 'documents' | 'offers' | 'timeline'>('messages');
  const [activeRoom, setActiveRoom] = useState<'joint' | 'claimant_private' | 'respondent_private'>('joint');
  const [messageInput, setMessageInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [showTransitions, setShowTransitions] = useState(false);
  const [settlementDraft, setSettlementDraft] = useState<string | null>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCase();
    loadMessages();
    loadDocuments();
    loadOffers();
  }, [id]);

  useEffect(() => {
    loadMessages();
    const poll = setInterval(loadMessages, 5000);
    return () => clearInterval(poll);
  }, [activeRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadCase = async () => {
    const res = await fetch(`/api/cases/${id}`);
    if (res.ok) setCaseData(await res.json());
  };

  const loadMessages = async () => {
    const res = await fetch(`/api/cases/${id}/messages?room=${activeRoom}&limit=50`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    } else if (res.status === 403) {
      setMessages([]);
    }
  };

  const loadDocuments = async () => {
    const res = await fetch(`/api/cases/${id}/documents`);
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents ?? []);
    }
  };

  const loadOffers = async () => {
    const res = await fetch(`/api/cases/${id}/offers`);
    if (res.ok) {
      const data = await res.json();
      setOffers(data.offers ?? []);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    await fetch(`/api/cases/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: messageInput, room_key: activeRoom }),
    });
    setMessageInput('');
    loadMessages();
  };

  const runAiTriage = async () => {
    setAiLoading(true);
    await fetch('/api/ai/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case_id: id }),
    });
    await loadCase();
    setAiLoading(false);
  };

  const runOutcomePrediction = async () => {
    setAiLoading(true);
    await fetch('/api/ai/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case_id: id }),
    });
    await loadCase();
    setAiLoading(false);
  };

  const generateSettlementDraft = async () => {
    setAiLoading(true);
    const res = await fetch('/api/ai/draft-settlement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_id: id,
        agreed_terms: caseData?.settlement_terms ?? 'Terms to be negotiated',
        agreed_amount_cents: caseData?.settlement_amount_cents,
      }),
    });
    if (res.ok) {
      const { draft } = await res.json();
      setSettlementDraft(draft);
      setShowDraftModal(true);
    }
    setAiLoading(false);
  };

  const executeTransition = async (transition: string, extraFields?: Record<string, unknown>) => {
    setTransitioning(true);
    setShowTransitions(false);
    const res = await fetch(`/api/cases/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transition, ...extraFields }),
    });
    if (res.ok) await loadCase();
    setTransitioning(false);
  };

  if (!caseData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const triage = caseData.ai_triage as AITriageResult | undefined;
  const prediction = caseData.ai_outcome_prediction as AIOutcomePrediction | undefined;

  return (
    <div className="max-w-7xl space-y-4">
      {/* Case header */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs text-slate-400">{caseData.case_number}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[caseData.status]}`}>
                {CaseStateMachine.statusLabel(caseData.status)}
              </span>
              <span className="text-xs text-slate-400 capitalize">{caseData.track?.replace('_', ' ')}</span>
              {triage && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${COMPLEXITY_COLORS[triage.complexity]}`}>
                  <Zap className="w-2.5 h-2.5" /> {triage.complexity} complexity
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900">{caseData.title}</h1>
            <p className="text-slate-500 text-sm mt-1 line-clamp-2">{caseData.description}</p>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
              {caseData.claim_amount_cents && (
                <span className="font-semibold text-slate-700 text-sm">
                  ${(caseData.claim_amount_cents / 100).toLocaleString()} {caseData.claim_currency}
                </span>
              )}
              <span>Filed {caseData.filed_at ? formatDistanceToNow(new Date(caseData.filed_at)) + ' ago' : 'not yet'}</span>
              {caseData.resolution_deadline && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Deadline {format(new Date(caseData.resolution_deadline), 'MMM d')}
                </span>
              )}
            </div>
          </div>

          {/* Transition button */}
          {!CaseStateMachine.isTerminal(caseData.status) && (
            <div className="relative">
              <button
                onClick={() => setShowTransitions(!showTransitions)}
                disabled={transitioning}
                className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {transitioning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Actions
                <ChevronDown className="w-3 h-3" />
              </button>
              {showTransitions && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg border shadow-lg z-10 py-1">
                  {/* Dummy transitions for display — real version maps from CaseStateMachine */}
                  {[
                    { label: 'Submit Case', value: 'submit', show: caseData.status === 'draft' },
                    { label: 'Mark as Served', value: 'serve', show: caseData.status === 'filed' },
                    { label: 'Begin Negotiation', value: 'begin_negotiation', show: caseData.status === 'served' },
                    { label: 'Escalate to Mediation', value: 'escalate_mediation', show: caseData.status === 'negotiation' },
                    { label: 'Record Settlement', value: 'settle', show: ['negotiation','mediation'].includes(caseData.status) },
                    { label: 'Dismiss Case', value: 'dismiss', show: !['settled','awarded','dismissed','closed'].includes(caseData.status) },
                  ].filter(t => t.show).map(t => (
                    <button
                      key={t.value}
                      onClick={() => executeTransition(t.value)}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-3 gap-4">
        {/* Left: Messaging + tabs */}
        <div className="col-span-2 bg-white rounded-xl border shadow-sm flex flex-col" style={{ height: '600px' }}>
          {/* Tabs */}
          <div className="flex border-b px-4">
            {(['messages', 'documents', 'offers', 'timeline'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                  activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Messages tab */}
          {activeTab === 'messages' && (
            <>
              {/* Room selector */}
              <div className="flex gap-2 px-4 pt-3">
                {(['joint', 'claimant_private', 'respondent_private'] as const).map(room => (
                  <button
                    key={room}
                    onClick={() => setActiveRoom(room)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                      activeRoom === room ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {room === 'joint' ? 'Joint Session' : room === 'claimant_private' ? 'Claimant Private' : 'Respondent Private'}
                  </button>
                ))}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map(m => (
                  <div key={m.id} className={`flex gap-3 ${m.is_system ? 'justify-center' : ''}`}>
                    {m.is_system ? (
                      <div className="text-xs text-slate-400 bg-slate-50 border rounded-full px-3 py-1">
                        {m.content}
                      </div>
                    ) : (
                      <>
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold flex-shrink-0">
                          {(m.sender?.full_name ?? 'U').charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-slate-700">{m.sender?.full_name}</span>
                            <span className="text-xs text-slate-400">{formatDistanceToNow(new Date(m.created_at))} ago</span>
                          </div>
                          <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700">{m.content}</div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="text-center text-slate-400 text-sm py-12">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No messages in this channel yet.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={sendMessage} className="p-3 border-t flex gap-2">
                <input
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  placeholder={`Message in ${activeRoom === 'joint' ? 'joint session' : activeRoom.replace('_', ' ')}...`}
                  className="flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button type="submit" disabled={!messageInput.trim()}
                  className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}

          {/* Documents tab */}
          {activeTab === 'documents' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-slate-500">{documents.length} documents</span>
                <button className="flex items-center gap-2 text-sm text-indigo-600 font-medium hover:underline">
                  <Upload className="w-3.5 h-3.5" /> Upload evidence
                </button>
              </div>
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50">
                    <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{doc.name}</div>
                      <div className="text-xs text-slate-400">{doc.type} · {(doc.size_bytes / 1024).toFixed(0)} KB</div>
                      {doc.ai_summary && (
                        <div className="text-xs text-violet-600 mt-0.5 flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5" /> {doc.ai_summary.slice(0, 80)}...
                        </div>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${doc.is_confidential ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                      {doc.is_confidential ? 'Confidential' : 'Shared'}
                    </span>
                  </div>
                ))}
                {documents.length === 0 && (
                  <div className="text-center text-slate-400 text-sm py-12">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No documents uploaded yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Offers tab */}
          {activeTab === 'offers' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {offers.map(offer => (
                <div key={offer.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {offer.made_by_profile?.full_name} → {offer.made_to}
                    </span>
                    <div className="flex items-center gap-2">
                      {offer.ai_generated && (
                        <span className="text-xs text-violet-600 flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5" /> AI generated
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        offer.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        offer.status === 'accepted' ? 'bg-green-100 text-green-700' :
                        offer.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {offer.status}
                      </span>
                    </div>
                  </div>
                  {offer.amount_cents && (
                    <div className="text-xl font-bold text-slate-900 mb-1">
                      ${(offer.amount_cents / 100).toLocaleString()} {offer.currency}
                    </div>
                  )}
                  <p className="text-sm text-slate-600">{offer.terms}</p>
                  <div className="text-xs text-slate-400 mt-2">
                    Expires {formatDistanceToNow(new Date(offer.expires_at))} from now
                  </div>
                  {offer.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <button className="flex-1 bg-green-600 text-white text-sm py-1.5 rounded-lg hover:bg-green-700 transition-colors">
                        Accept
                      </button>
                      <button className="flex-1 border text-slate-600 text-sm py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                        Counter
                      </button>
                      <button className="flex-1 border border-red-200 text-red-600 text-sm py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {offers.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-12">No settlement offers yet.</div>
              )}
            </div>
          )}
        </div>

        {/* Right: AI panel */}
        <div className="space-y-4">
          {/* AI Triage */}
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-violet-500" /> AI Triage
              </h3>
              <button onClick={runAiTriage} disabled={aiLoading}
                className="text-xs text-indigo-600 hover:underline disabled:opacity-40">
                {aiLoading ? 'Running...' : triage ? 'Re-analyze' : 'Run triage'}
              </button>
            </div>
            {triage ? (
              <div className="space-y-3">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${COMPLEXITY_COLORS[triage.complexity]}`}>
                  <AlertTriangle className="w-3 h-3" /> {triage.complexity} complexity
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Recommended track</div>
                  <div className="text-sm font-medium text-slate-800 capitalize">{triage.recommended_track?.replace('_', ' ')}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Est. duration</div>
                  <div className="text-sm font-medium text-slate-800">{triage.estimated_duration_days} days</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1.5">Key issues</div>
                  <ul className="space-y-1">
                    {(triage.key_issues ?? []).slice(0, 3).map((issue, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="text-indigo-400 mt-0.5">•</span> {issue}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-xs text-slate-400">
                  Confidence: {Math.round((triage.confidence ?? 0) * 100)}%
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-4">
                Run AI triage to get case intelligence
              </div>
            )}
          </div>

          {/* Outcome Prediction */}
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-violet-500" /> Outcome Prediction
              </h3>
              <button onClick={runOutcomePrediction} disabled={aiLoading}
                className="text-xs text-indigo-600 hover:underline disabled:opacity-40">
                {aiLoading ? 'Running...' : 'Predict'}
              </button>
            </div>
            {prediction ? (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-800 capitalize">
                  {prediction.likely_outcome?.replace(/_/g, ' ')}
                </div>
                <div className="space-y-1.5">
                  {(prediction.probability_breakdown ?? []).slice(0, 4).map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${p.probability * 100}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 w-8 text-right">{Math.round(p.probability * 100)}%</span>
                      <span className="text-xs text-slate-600 w-24 truncate capitalize">{p.outcome?.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
                {prediction.recommended_settlement_range && (
                  <div className="text-xs">
                    <div className="text-slate-500 mb-0.5">Settlement range</div>
                    <div className="font-medium text-slate-800">
                      ${(prediction.recommended_settlement_range.min_cents / 100).toLocaleString()}
                      {' – '}
                      ${(prediction.recommended_settlement_range.max_cents / 100).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-400 text-center py-4">
                Run outcome prediction to see likely resolution path
              </div>
            )}
          </div>

          {/* Settlement drafter */}
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-xl p-4">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 mb-2">
              <CheckCircle className="w-4 h-4 text-violet-500" /> Settlement Drafter
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              AI generates a professional settlement agreement from negotiated terms.
            </p>
            <button
              onClick={generateSettlementDraft}
              disabled={aiLoading}
              className="w-full bg-violet-600 text-white text-xs font-medium py-2 rounded-lg hover:bg-violet-700 disabled:opacity-40 transition-colors"
            >
              {aiLoading ? 'Generating...' : 'Draft Agreement'}
            </button>
          </div>
        </div>
      </div>

      {/* Settlement Draft Modal */}
      {showDraftModal && settlementDraft && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">AI-Generated Settlement Agreement</h2>
              <button onClick={() => setShowDraftModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap">{settlementDraft}</pre>
            </div>
            <div className="p-4 border-t flex gap-3">
              <button className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                Save as Document
              </button>
              <button onClick={() => setShowDraftModal(false)} className="flex-1 border text-slate-600 text-sm py-2 rounded-lg hover:bg-slate-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
