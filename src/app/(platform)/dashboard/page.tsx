'use client';
// src/app/(platform)/dashboard/page.tsx

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import {
  AlertCircle, Clock, CheckCircle2, TrendingUp,
  ArrowRight, Scale, MessageSquare, FileText, Zap
} from 'lucide-react';
import type { Case, AnalyticsMetrics } from '@/lib/types';
import { CaseStateMachine } from '@/lib/state-machine';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  filed: 'bg-blue-100 text-blue-700',
  served: 'bg-sky-100 text-sky-700',
  negotiation: 'bg-amber-100 text-amber-700',
  mediation: 'bg-purple-100 text-purple-700',
  arbitration: 'bg-red-100 text-red-700',
  settled: 'bg-green-100 text-green-700',
  awarded: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-gray-100 text-gray-500',
  closed: 'bg-slate-100 text-slate-500',
  appealed: 'bg-orange-100 text-orange-700',
};

export default function DashboardPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [metrics, setMetrics] = useState<Partial<AnalyticsMetrics>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/cases?page=1&page_size=6').then(r => r.json()),
      fetch('/api/analytics').then(r => r.json()),
    ]).then(([casesData, analyticsData]) => {
      setCases(casesData.data ?? []);
      setMetrics(analyticsData.metrics ?? {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const statCards = [
    {
      label: 'Active Cases',
      value: (metrics.cases_filed ?? 0) - (metrics.cases_resolved ?? 0),
      icon: Scale,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      change: `${metrics.cases_filed ?? 0} filed total`,
      up: null,
    },
    {
      label: 'Avg Resolution',
      value: `${metrics.avg_resolution_days ?? 0}d`,
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      change: 'vs 34d industry avg',
      up: null,
    },
    {
      label: 'Resolution Rate',
      value: `${Math.round((metrics.resolution_rate ?? 0) * 100)}%`,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      change: `${metrics.cases_resolved ?? 0} resolved`,
      up: null,
    },
    {
      label: 'Cost Savings',
      value: `$${((metrics.cost_savings_vs_litigation_cents ?? 0) / 100 / 1000).toFixed(0)}k`,
      icon: TrendingUp,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      change: 'vs litigation costs',
      up: true,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Overview for {format(new Date(), 'MMMM yyyy')}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-500 text-sm font-medium">{card.label}</span>
              <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">{card.value}</div>
            <div className={`text-xs flex items-center gap-1 ${card.up === true ? 'text-emerald-600' : card.up === false ? 'text-red-500' : 'text-slate-400'}`}>
              {card.up === true && '↑'}{card.up === false && '↓'} {card.change}
            </div>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(metrics.cases_by_status ?? {}).slice(0, 6).map(([status, count]) => (
          <Link key={status} href={`/cases?status=${status}`} className="bg-white rounded-xl border p-4 shadow-sm hover:border-indigo-300 transition-colors">
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100'}`}>
                {CaseStateMachine.statusLabel(status as any)}
              </span>
              <span className="text-2xl font-bold text-slate-900">{count as number}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent cases + AI activity split */}
      <div className="grid grid-cols-3 gap-4">
        {/* Recent cases - 2/3 width */}
        <div className="col-span-2 bg-white rounded-xl border shadow-sm">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent Cases</h2>
            <Link href="/cases" className="text-indigo-600 text-sm flex items-center gap-1 hover:gap-2 transition-all">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y">
            {cases.map(c => (
              <Link key={c.id} href={`/cases/${c.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-slate-400">{c.case_number}</span>
                    {c.ai_triage && (
                      <span className="inline-flex items-center gap-1 text-xs text-violet-600">
                        <Zap className="w-2.5 h-2.5" /> AI triaged
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-slate-900 truncate">{c.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{formatDistanceToNow(new Date(c.created_at))} ago</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {c.claim_amount_cents && (
                    <span className="text-sm font-semibold text-slate-700">
                      ${(c.claim_amount_cents / 100).toLocaleString()}
                    </span>
                  )}
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                    {CaseStateMachine.statusLabel(c.status)}
                  </span>
                </div>
              </Link>
            ))}
            {cases.length === 0 && (
              <div className="px-5 py-12 text-center text-slate-400 text-sm">
                No cases yet. <Link href="/cases/new" className="text-indigo-600 hover:underline">File your first dispute</Link>
              </div>
            )}
          </div>
        </div>

        {/* Quick actions - 1/3 width */}
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl p-5 text-white">
            <h3 className="font-semibold mb-1">AI-Powered ODR</h3>
            <p className="text-indigo-100 text-xs mb-4">
              Cases with AI triage resolve 40% faster. Our Claude-powered analysis predicts outcomes and drafts settlements.
            </p>
            <Link href="/cases/new" className="inline-flex items-center gap-2 bg-white text-indigo-600 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-50 transition-colors">
              File dispute <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-4">
            <h3 className="font-semibold text-slate-900 mb-3 text-sm">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: 'View pending offers', icon: Scale, href: '/cases?status=negotiation' },
                { label: 'Unread messages', icon: MessageSquare, href: '/cases' },
                { label: 'Documents awaiting review', icon: FileText, href: '/cases' },
              ].map(action => (
                <Link key={action.label} href={action.href}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-600">
                  <action.icon className="w-4 h-4 text-slate-400" />
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
