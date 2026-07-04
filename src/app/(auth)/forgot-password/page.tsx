'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Scale, MailCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
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
          {sent ? (
            <div className='text-center py-4'>
              <div className='w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4'>
                <MailCheck className='w-6 h-6 text-emerald-400' />
              </div>
              <h1 className='text-white text-xl font-bold mb-2'>Check your email</h1>
              <p className='text-slate-400 text-sm mb-6'>
                If an account exists for <span className='text-slate-200'>{email}</span>, we sent a link to reset your password.
              </p>
              <Link href='/login' className='text-indigo-400 hover:text-indigo-300 text-sm'>Back to sign in</Link>
            </div>
          ) : (
            <>
              <h1 className='text-white text-2xl font-bold mb-1'>Reset password</h1>
              <p className='text-slate-400 text-sm mb-6'>Enter your email and we&apos;ll send you a reset link</p>
              <form onSubmit={handleSubmit} className='space-y-4'>
                <div>
                  <label className='block text-sm font-medium text-slate-300 mb-1.5'>Email</label>
                  <input type='email' value={email} onChange={e => setEmail(e.target.value)} required placeholder='you@company.com'
                    className='w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500' />
                </div>
                {error && <div className='bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-2.5'>{error}</div>}
                <button type='submit' disabled={loading}
                  className='w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm'>
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
              <p className='text-slate-400 text-sm mt-6 text-center'>
                Remembered it? <Link href='/login' className='text-indigo-400 hover:text-indigo-300'>Sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
