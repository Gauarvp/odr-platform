'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Scale } from 'lucide-react';

const ROLES = [
  { value: 'claimant', label: 'Claimant', hint: 'I want to file disputes' },
  { value: 'respondent', label: 'Respondent', hint: 'I need to respond to a dispute' },
  { value: 'mediator', label: 'Mediator', hint: 'I facilitate resolutions' },
  { value: 'arbitrator', label: 'Arbitrator', hint: 'I issue binding decisions' },
];

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('claimant');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    // If email confirmation is disabled (local/demo), a session exists — go straight in.
    if (data.session) { router.push('/dashboard'); router.refresh(); }
    else { setError(null); setLoading(false); alert('Check your email to confirm your account, then sign in.'); router.push('/login'); }
  };

  return (
    <div className='min-h-screen bg-slate-950 flex items-center justify-center p-4'>
      <div className='w-full max-w-md'>
        <div className='flex items-center justify-center gap-3 mb-8'>
          <div className='w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center'>
            <Scale className='w-5 h-5 text-white' />
          </div>
          <div>
            <div className='text-white font-bold text-lg'>ODR Platform</div>
            <div className='text-slate-400 text-xs'>Enterprise Dispute Resolution</div>
          </div>
        </div>
        <div className='bg-slate-900 border border-slate-800 rounded-2xl p-8'>
          <h1 className='text-white text-2xl font-bold mb-1'>Create account</h1>
          <p className='text-slate-400 text-sm mb-6'>Join the platform to file or resolve disputes</p>
          <form onSubmit={handleSignup} className='space-y-4'>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-1.5'>Full name</label>
              <input type='text' value={fullName} onChange={e => setFullName(e.target.value)} required placeholder='Jane Doe'
                className='w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500' />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-1.5'>Email</label>
              <input type='email' value={email} onChange={e => setEmail(e.target.value)} required placeholder='you@company.com'
                className='w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500' />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-1.5'>Password</label>
              <input type='password' value={password} onChange={e => setPassword(e.target.value)} required placeholder='At least 8 characters'
                className='w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500' />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-1.5'>I am a…</label>
              <div className='grid grid-cols-2 gap-2'>
                {ROLES.map(r => (
                  <button type='button' key={r.value} onClick={() => setRole(r.value)}
                    className={'text-left rounded-lg border px-3 py-2 transition-colors ' + (role === r.value ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 bg-slate-800 hover:border-slate-600')}>
                    <div className='text-white text-sm font-medium'>{r.label}</div>
                    <div className='text-slate-400 text-xs'>{r.hint}</div>
                  </button>
                ))}
              </div>
            </div>
            {error && <div className='bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-2.5'>{error}</div>}
            <button type='submit' disabled={loading}
              className='w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm'>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
          <p className='text-slate-400 text-sm mt-6 text-center'>
            Already have an account? <Link href='/login' className='text-indigo-400 hover:text-indigo-300'>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
