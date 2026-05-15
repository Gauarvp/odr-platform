'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Scale } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); }
    else { router.push('/dashboard'); router.refresh(); }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-lg">ODR Platform</div>
            <div className="text-slate-400 text-xs">Enterprise Dispute Resolution</div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <h1 className="text-white text-2xl font-bold mb-1">Sign in</h1>
          <p className="text-slate-400 text-sm mb-6">Enter your credentials to access the platform</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {error && <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-2.5">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
