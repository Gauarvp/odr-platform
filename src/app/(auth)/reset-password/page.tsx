'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Scale } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The email link lands here with a recovery code; the browser client
  // exchanges it for a session automatically. Wait for that before
  // allowing the password update.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); }
    else { router.push('/dashboard'); router.refresh(); }
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
          <h1 className='text-white text-2xl font-bold mb-1'>Set a new password</h1>
          <p className='text-slate-400 text-sm mb-6'>
            {ready ? 'Choose a new password for your account' : 'Verifying your reset link…'}
          </p>
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-1.5'>New password</label>
              <input type='password' value={password} onChange={e => setPassword(e.target.value)} required disabled={!ready} placeholder='At least 8 characters'
                className='w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50' />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-1.5'>Confirm password</label>
              <input type='password' value={confirm} onChange={e => setConfirm(e.target.value)} required disabled={!ready} placeholder='Repeat new password'
                className='w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50' />
            </div>
            {error && <div className='bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-2.5'>{error}</div>}
            <button type='submit' disabled={loading || !ready}
              className='w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm'>
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
          <p className='text-slate-400 text-sm mt-6 text-center'>
            Link expired? <Link href='/forgot-password' className='text-indigo-400 hover:text-indigo-300'>Request a new one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
