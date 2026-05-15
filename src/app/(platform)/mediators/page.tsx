'use client';
import { useState, useEffect } from 'react';
import { Users, Star, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function MediatorsPage() {
  const [mediators, setMediators] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createClient().from('user_profiles').select('*').in('role', ['mediator', 'arbitrator'])
      .then(({ data }) => { setMediators(data ?? []); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mediators & Arbitrators</h1>
        <p className="text-slate-500 text-sm mt-1">Certified neutrals available for case assignment</p>
      </div>
      {mediators.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-16 text-center">
          <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <h3 className="text-slate-700 font-medium mb-1">No mediators registered yet</h3>
          <p className="text-slate-400 text-sm">Add mediator accounts via Supabase Authentication panel</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {mediators.map(m => (
            <div key={m.id} className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">{m.full_name?.charAt(0) ?? 'M'}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">{m.full_name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{m.is_available ? 'Available' : 'Unavailable'}</span>
                  </div>
                  <div className="text-xs text-indigo-600 capitalize mb-2">{m.role}</div>
                  {m.bio && <p className="text-sm text-slate-500 mb-2">{m.bio}</p>}
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {m.total_cases > 0 && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {m.total_cases} cases</span>}
                    {m.resolution_rate && <span className="flex items-center gap-1"><Star className="w-3 h-3" /> {Math.round(m.resolution_rate)}%</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
