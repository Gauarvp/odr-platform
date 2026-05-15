'use client';
// src/app/(platform)/cases/new/page.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle, ChevronRight, Scale } from 'lucide-react';
import type { CaseCategory, CaseFilingInput } from '@/lib/types';

const CATEGORIES: { value: CaseCategory; label: string; desc: string }[] = [
  { value: 'payment_dispute', label: 'Payment Dispute', desc: 'Incorrect charges, failed refunds, billing errors' },
  { value: 'chargeback', label: 'Chargeback', desc: 'Disputed card transactions, fraud claims' },
  { value: 'service_failure', label: 'Service Failure', desc: 'Non-delivery, service not as described' },
  { value: 'contract_breach', label: 'Contract Breach', desc: 'Violation of agreed contract terms' },
  { value: 'product_defect', label: 'Product Defect', desc: 'Faulty or misrepresented goods' },
  { value: 'fraud_claim', label: 'Fraud Claim', desc: 'Alleged deceptive or fraudulent conduct' },
  { value: 'employment', label: 'Employment', desc: 'Workplace disputes, unpaid wages' },
  { value: 'consumer_protection', label: 'Consumer Protection', desc: 'Consumer rights violations' },
  { value: 'intellectual_property', label: 'Intellectual Property', desc: 'Copyright, trademark, patent disputes' },
  { value: 'other', label: 'Other', desc: 'Dispute not covered above' },
];

const RELIEF_OPTIONS = [
  { value: 'monetary', label: 'Monetary compensation' },
  { value: 'refund', label: 'Refund' },
  { value: 'specific_performance', label: 'Specific performance (force action)' },
  { value: 'injunction', label: 'Injunctive relief (stop action)' },
  { value: 'apology', label: 'Formal apology' },
];

const STEPS = ['Category', 'Details', 'Respondent', 'Review'];

export default function NewCasePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<CaseFilingInput>>({
    claimed_relief: [],
    claim_currency: 'USD',
  });

  const set = (key: keyof CaseFilingInput, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }));

  const toggleRelief = (val: string) => {
    const current = form.claimed_relief ?? [];
    set('claimed_relief', current.includes(val) ? current.filter(r => r !== val) : [...current, val]);
  };

  const canProceed = (): boolean => {
    if (step === 0) return !!form.category;
    if (step === 1) return !!(form.title && form.title.length >= 10 && form.description && form.description.length >= 50 && (form.claimed_relief ?? []).length > 0);
    if (step === 2) return !!(form.respondent_email && form.respondent_name && form.respondent_email.includes('@'));
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to file case');
      router.push(`/cases/${data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">File a Dispute</h1>
        <p className="text-slate-500 text-sm">Complete the form to initiate an ODR case.</p>
        <div className="flex items-center gap-2 mt-6">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 text-sm font-medium transition-colors ${i <= step ? 'text-indigo-600' : 'text-slate-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i < step ? 'bg-indigo-600 text-white' : i === step ? 'bg-indigo-100 text-indigo-600 ring-2 ring-indigo-300' : 'bg-gray-100 text-gray-400'
                }`}>
                  {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className="hidden sm:block">{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px w-8 ${i < step ? 'bg-indigo-300' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-6">
        {/* Step 0: Category */}
        {step === 0 && (
          <div>
            <h2 className="font-semibold text-slate-900 mb-4">What is the dispute about?</h2>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => set('category', cat.value)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    form.category === cat.value
                      ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-sm font-medium text-slate-800">{cat.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{cat.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Details */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-900">Describe the dispute</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Case title <span className="text-red-500">*</span>
              </label>
              <input
                value={form.title ?? ''}
                onChange={e => set('title', e.target.value)}
                placeholder="Brief, descriptive title of the dispute"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className={`text-xs mt-0.5 ${(form.title?.length ?? 0) < 10 ? 'text-red-400' : 'text-green-500'}`}>
                {form.title?.length ?? 0} chars (min 10)
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Full description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.description ?? ''}
                onChange={e => set('description', e.target.value)}
                rows={5}
                placeholder="Describe the dispute in detail: what happened, when, what you expected vs received, any relevant context."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
              <div className={`text-xs mt-0.5 ${(form.description?.length ?? 0) < 50 ? 'text-red-400' : 'text-green-500'}`}>
                {form.description?.length ?? 0} chars (min 50)
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Claim amount</label>
                <div className="flex">
                  <select
                    value={form.claim_currency ?? 'USD'}
                    onChange={e => set('claim_currency', e.target.value)}
                    className="border rounded-l-lg px-2 py-2 text-sm focus:outline-none bg-gray-50"
                  >
                    <option>USD</option><option>EUR</option><option>GBP</option><option>INR</option>
                  </select>
                  <input
                    type="number"
                    value={form.claim_amount_cents ? form.claim_amount_cents / 100 : ''}
                    onChange={e => set('claim_amount_cents', parseFloat(e.target.value) * 100 || undefined)}
                    placeholder="0.00"
                    className="flex-1 border border-l-0 rounded-r-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">External reference</label>
                <input
                  value={form.external_reference ?? ''}
                  onChange={e => set('external_reference', e.target.value)}
                  placeholder="Order ID, invoice number, etc."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Relief sought <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {RELIEF_OPTIONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => toggleRelief(r.value)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      form.claimed_relief?.includes(r.value)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-gray-300 text-slate-600 hover:border-indigo-300'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Respondent */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-900">Who are you filing against?</h2>
            <p className="text-sm text-slate-500">
              The respondent will receive a notification to join the platform and respond to your claim.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Respondent name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.respondent_name ?? ''}
                onChange={e => set('respondent_name', e.target.value)}
                placeholder="Full name or company name"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Respondent email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.respondent_email ?? ''}
                onChange={e => set('respondent_email', e.target.value)}
                placeholder="respondent@company.com"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                The respondent will receive an invitation email. They must join within 14 days to respond.
                If they don't respond, the case may proceed to mediation by default.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-900">Review and file</h2>
            <div className="bg-slate-50 rounded-lg divide-y">
              {[
                { label: 'Category', value: CATEGORIES.find(c => c.value === form.category)?.label },
                { label: 'Title', value: form.title },
                { label: 'Claim amount', value: form.claim_amount_cents ? `${form.claim_currency} ${(form.claim_amount_cents / 100).toLocaleString()}` : 'Non-monetary' },
                { label: 'Respondent', value: `${form.respondent_name} (${form.respondent_email})` },
                { label: 'Relief sought', value: (form.claimed_relief ?? []).join(', ') },
              ].map(row => (
                <div key={row.label} className="flex gap-3 px-4 py-2.5">
                  <span className="text-xs text-slate-500 w-28 flex-shrink-0 pt-0.5">{row.label}</span>
                  <span className="text-sm text-slate-800">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
              <Scale className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                By filing, you agree that the information provided is accurate and complete. 
                Our AI will immediately analyze your case and recommend a resolution track.
              </p>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex justify-between mt-6 pt-4 border-t">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="px-4 py-2 text-sm text-slate-600 border rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {submitting ? 'Filing...' : 'File Dispute'}
              <Scale className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
