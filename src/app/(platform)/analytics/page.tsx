'use client';
// src/app/(platform)/analytics/page.tsx

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, Clock, CheckCircle2, DollarSign,
  Scale, BarChart3, PieChart as PieIcon, Calendar
} from 'lucide-react';
import type { AnalyticsMetrics } from '@/lib/types';

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

const DATE_RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
];

const STATUS_COLORS: Record<string, string> = {
  negotiation: '#f59e0b',
  mediation: '#8b5cf6',
  arbitration: '#ef4444',
  settled: '#10b981',
  filed: '#6366f1',
  served: '#06b6d4',
  dismissed: '#94a3b8',
};

function StatCard({
  label, value, change, icon: Icon, color, subtext
}: {
  label: string; value: string | number; change?: string;
  icon: React.ElementType; color: string; subtext?: string;
}) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      {subtext && <div className="text-xs text-slate-400 mt-0.5">{subtext}</div>}
      {change && (
        <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> {change}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<Partial<AnalyticsMetrics>>({});
  const [timeSeries, setTimeSeries] = useState<{ week: string; filed: number; resolved: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);

  useEffect(() => {
    const start = new Date(Date.now() - range * 86400000).toISOString();
    fetch(`/api/analytics?start=${start}`)
      .then(r => r.json())
      .then(data => {
        setMetrics(data.metrics ?? {});
        setTimeSeries(data.time_series ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [range]);

  const statusData = Object.entries(metrics.cases_by_status ?? {}).map(([status, count]) => ({
    name: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value: count as number,
    status,
  }));

  const categoryData = Object.entries(metrics.cases_by_category ?? {})
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 8)
    .map(([cat, count]) => ({
      name: cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count: count as number,
    }));

  const trackData = Object.entries(metrics.cases_by_track ?? {}).map(([track, count]) => ({
    name: track.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    cases: count as number,
  }));

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
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 text-sm mt-0.5">Dispute resolution performance metrics</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {DATE_RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setRange(r.days)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${range === r.days ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Cases Filed"
          value={(metrics.cases_filed ?? 0).toLocaleString()}
          icon={Scale}
          color="bg-indigo-50 text-indigo-600"
          change="+12% vs prior period"
        />
        <StatCard
          label="Resolution Rate"
          value={`${Math.round((metrics.resolution_rate ?? 0) * 100)}%`}
          icon={CheckCircle2}
          color="bg-emerald-50 text-emerald-600"
          subtext={`${(metrics.cases_resolved ?? 0)} cases resolved`}
          change="+2.3% vs prior period"
        />
        <StatCard
          label="Avg Resolution"
          value={`${metrics.avg_resolution_days ?? 0}d`}
          icon={Clock}
          color="bg-amber-50 text-amber-600"
          subtext={`P90: ${metrics.p90_resolution_days ?? 0}d`}
        />
        <StatCard
          label="Savings vs Litigation"
          value={`$${((metrics.cost_savings_vs_litigation_cents ?? 0) / 100 / 1000).toFixed(0)}k`}
          icon={DollarSign}
          color="bg-violet-50 text-violet-600"
          subtext="Est. legal cost avoided"
          change="$15k avg per case"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-sm text-slate-500">Mediation success rate</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {Math.round((metrics.mediation_success_rate ?? 0) * 100)}%
          </div>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(metrics.mediation_success_rate ?? 0) * 100}%` }} />
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm text-slate-500">Arbitration escalation rate</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {Math.round((metrics.arbitration_rate ?? 0) * 100)}%
          </div>
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-red-400 rounded-full" style={{ width: `${(metrics.arbitration_rate ?? 0) * 100}%` }} />
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-sm text-slate-500">Median resolution</span>
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {metrics.median_resolution_days ?? 0}d
          </div>
          <div className="text-xs text-slate-400 mt-1">Vs {metrics.avg_resolution_days ?? 0}d average</div>
        </div>
      </div>

      {/* Charts row 1: Time series + Status pie */}
      <div className="grid grid-cols-3 gap-4">
        {/* Filed vs resolved over time */}
        <div className="col-span-2 bg-white rounded-xl border shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" /> Case Volume
            </h3>
            <div className="flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-indigo-400 inline-block" /> Filed</span>
              <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-emerald-400 inline-block" /> Resolved</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeSeries} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="filedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              <Area type="monotone" dataKey="filed" stroke="#6366f1" strokeWidth={2} fill="url(#filedGrad)" />
              <Area type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} fill="url(#resolvedGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status distribution pie */}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <PieIcon className="w-4 h-4 text-indigo-400" /> Active by Status
          </h3>
          {statusData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={70}
                    dataKey="value"
                    stroke="none"
                  >
                    {statusData.map((entry, i) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.status] ?? CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {statusData.slice(0, 5).map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[d.status] ?? CHART_COLORS[i] }} />
                      <span className="text-slate-600">{d.name}</span>
                    </div>
                    <span className="font-medium text-slate-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center text-slate-400 text-sm py-8">No data yet</div>
          )}
        </div>
      </div>

      {/* Charts row 2: Category bar + Track bar */}
      <div className="grid grid-cols-2 gap-4">
        {/* By category */}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Cases by Category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} width={100} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Resolution speed by track */}
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Cases by Resolution Track</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trackData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="cases" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* SLA compliance table */}
          <div className="mt-4 border-t pt-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">SLA Targets (days)</div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { track: 'Fast Track', target: 15 },
                { track: 'Standard', target: 45 },
                { track: 'Complex', target: 90 },
                { track: 'Emergency', target: 5 },
              ].map(t => (
                <div key={t.track} className="text-center bg-slate-50 rounded-lg p-2">
                  <div className="text-xs text-slate-400">{t.track}</div>
                  <div className="text-lg font-bold text-slate-700">{t.target}d</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Financial summary */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-500" /> Financial Summary
        </h3>
        <div className="grid grid-cols-4 gap-6">
          {[
            {
              label: 'Total claim value',
              value: `$${((metrics.total_claim_value_cents ?? 0) / 100).toLocaleString()}`,
              sub: 'Across all disputes',
            },
            {
              label: 'Total settled value',
              value: `$${((metrics.total_settlement_value_cents ?? 0) / 100).toLocaleString()}`,
              sub: 'Net settlements reached',
            },
            {
              label: 'Settlement ratio',
              value: metrics.total_claim_value_cents
                ? `${Math.round((metrics.total_settlement_value_cents ?? 0) / metrics.total_claim_value_cents * 100)}%`
                : '—',
              sub: 'Settled / claimed',
            },
            {
              label: 'Litigation savings',
              value: `$${((metrics.cost_savings_vs_litigation_cents ?? 0) / 100 / 1000).toFixed(0)}k`,
              sub: 'vs avg $15k/case in courts',
            },
          ].map(item => (
            <div key={item.label}>
              <div className="text-xs text-slate-500 mb-0.5">{item.label}</div>
              <div className="text-xl font-bold text-slate-900">{item.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{item.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
