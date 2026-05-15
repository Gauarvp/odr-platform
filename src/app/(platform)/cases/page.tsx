'use client';
// src/app/(platform)/cases/page.tsx

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Search, Filter, Plus, Zap, Clock,
  ChevronDown, AlertTriangle, ArrowUpDown
} from 'lucide-react';
import type { Case, CaseStatus, CaseCategory } from '@/lib/types';
import { CaseStateMachine } from '@/lib/state-machine';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  filed: 'bg-blue-100 text-blue-700',
  served: 'bg-sky-100 text-sky-700',
  negotiation: 'bg-amber-100 text-amber-700',
  mediation: 'bg-purple-100 text-purple-700',
  arbitration: 'bg-red-100 text-red-700',
  settled: 'bg-green-100 text-green-700',
  awarded: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-gray-100 text-gray-400',
  closed: 'bg-slate-100 text-slate-400',
  appealed: 'bg-orange-100 text-orange-700',
};

const TRACK_LABELS: Record<string, string> = {
  fast_track: 'Fast Track',
  standard: 'Standard',
  complex: 'Complex',
  emergency: 'Emergency',
};

const CATEGORY_LABELS: Record<string, string> = {
  payment_dispute: 'Payment',
  chargeback: 'Chargeback',
  service_failure: 'Service Failure',
  contract_breach: 'Contract',
  product_defect: 'Product Defect',
  fraud_claim: 'Fraud',
  employment: 'Employment',
  consumer_protection: 'Consumer',
  intellectual_property: 'IP',
  other: 'Other',
};

const STATUS_OPTIONS: CaseStatus[] = [
  'draft', 'filed', 'served', 'negotiation',
  'mediation', 'arbitration', 'settled', 'awarded', 'dismissed', 'closed'
];

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField] = useState('created_at');

  const PAGE_SIZE = 15;

  const loadCases = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (search) params.set('q', search);
    if (statusFilter) params.set('status', statusFilter);
    if (categoryFilter) params.set('category', categoryFilter);

    const res = await fetch(`/api/cases?${params}`);
    if (res.ok) {
      const data = await res.json();
      setCases(data.data ?? []);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [page, search, statusFilter, categoryFilter]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, statusFilter, categoryFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getSLAStatus = (c: Case): 'on_track' | 'warning' | 'overdue' | null => {
    if (!c.resolution_deadline || CaseStateMachine.isTerminal(c.status)) return null;
    const daysLeft = (new Date(c.resolution_deadline).getTime() - Date.now()) / 86400000;
    if (daysLeft < 0) return 'overdue';
    if (daysLeft < 7) return 'warning';
    return 'on_track';
  };

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cases</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total.toLocaleString()} total cases</p>
        </div>
        <Link
          href="/cases/new"
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> File Dispute
        </Link>
      </div>

      {/* Search & filters */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by case number, title, or party..."
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm transition-colors ${showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Filter className="w-4 h-4" /> Filters
            {(statusFilter || categoryFilter) && (
              <span className="w-4 h-4 bg-indigo-600 text-white rounded-full text-xs flex items-center justify-center">
                {[statusFilter, categoryFilter].filter(Boolean).length}
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="flex gap-4 pt-2 border-t">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">Status</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setStatusFilter('')}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${!statusFilter ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-slate-500 hover:border-gray-300'}`}
                >
                  All
                </button>
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-slate-500 hover:border-gray-300'}`}
                  >
                    {CaseStateMachine.statusLabel(s)}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-48">
              <label className="text-xs font-medium text-slate-500 mb-1.5 block">Category</label>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">All categories</option>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Cases table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-slate-50">
              {['Case', 'Category', 'Claim', 'Status', 'Track', 'SLA', 'Filed'].map(col => (
                <th key={col} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <button className="flex items-center gap-1 hover:text-slate-700">
                    {col} {col === 'Filed' && <ArrowUpDown className="w-3 h-3" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="h-4 bg-slate-100 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : cases.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-slate-400">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <div className="text-sm">No cases found</div>
                  {search && <div className="text-xs mt-1">Try a different search term</div>}
                </td>
              </tr>
            ) : (
              cases.map(c => {
                const sla = getSLAStatus(c);
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3.5">
                      <Link href={`/cases/${c.id}`} className="block">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-mono text-slate-400">{c.case_number}</span>
                          {c.ai_triage && (
                            <Zap className="w-3 h-3 text-violet-400" aria-label="AI triaged" />
                          )}
                        </div>
                        <div className="text-sm font-medium text-slate-800 truncate max-w-xs">{c.title}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-slate-500">{CATEGORY_LABELS[c.category] ?? c.category}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {c.claim_amount_cents ? (
                        <span className="text-sm font-semibold text-slate-700">
                          ${(c.claim_amount_cents / 100).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Non-monetary</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {CaseStateMachine.statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-slate-500">{TRACK_LABELS[c.track] ?? c.track}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {sla === 'overdue' && (
                        <div className="flex items-center gap-1 text-red-600">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="text-xs font-medium">Overdue</span>
                        </div>
                      )}
                      {sla === 'warning' && (
                        <div className="flex items-center gap-1 text-amber-600">
                          <Clock className="w-3 h-3" />
                          <span className="text-xs font-medium">Due soon</span>
                        </div>
                      )}
                      {sla === 'on_track' && (
                        <div className="flex items-center gap-1 text-green-600">
                          <span className="text-xs">On track</span>
                        </div>
                      )}
                      {!sla && <span className="text-xs text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-slate-400">
                        {c.filed_at ? formatDistanceToNow(new Date(c.filed_at)) + ' ago' : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border rounded hover:bg-white disabled:opacity-40 transition-colors"
              >
                ←
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2;
                if (p > totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1 text-sm border rounded transition-colors ${p === page ? 'bg-indigo-600 text-white border-indigo-600' : 'hover:bg-white'}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border rounded hover:bg-white disabled:opacity-40 transition-colors"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
