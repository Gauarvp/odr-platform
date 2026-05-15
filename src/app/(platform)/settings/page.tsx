'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, Lock, Building } from 'lucide-react';

export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) { setUser(user); setFullName(user.user_metadata?.full_name ?? ''); }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await createClient().auth.updateUser({ data: { full_name: fullName } });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    await createClient().auth.resetPasswordForEmail(user.email);
    alert('Password reset email sent to ' + user.email);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Settings</h1><p className="text-slate-500 text-sm mt-1">Manage your account</p></div>
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-5 py-4 border-b flex items-center gap-2"><User className="w-4 h-4 text-slate-400" /><h2 className="font-semibold text-slate-900 text-sm">Profile</h2></div>
        <div className="p-5 space-y-4">
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input value={user?.email ?? ''} disabled className="w-full border bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed" /></div>
          <div><label className="block text-sm font-medium text-slate-700 mb-1">Full name</label><input value={fullName} onChange={e => setFullName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" /></div>
          <button onClick={handleSave} disabled={saving} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saved ? 'Saved!' : saving ? 'Saving...' : 'Save changes'}</button>
        </div>
      </div>
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-5 py-4 border-b flex items-center gap-2"><Lock className="w-4 h-4 text-slate-400" /><h2 className="font-semibold text-slate-900 text-sm">Security</h2></div>
        <div className="p-5"><div className="flex items-center justify-between"><div><div className="text-sm font-medium text-slate-700">Password</div><div className="text-xs text-slate-400">Send a reset link to your email</div></div><button onClick={handlePasswordReset} className="text-sm text-indigo-600 font-medium hover:underline">Reset password</button></div></div>
      </div>
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-5 py-4 border-b flex items-center gap-2"><Building className="w-4 h-4 text-slate-400" /><h2 className="font-semibold text-slate-900 text-sm">Platform</h2></div>
        <div className="p-5 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Version</span><span className="font-mono">v2.0.0</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Plan</span><span>Enterprise</span></div>
          <div className="flex justify-between"><span className="text-slate-500">User ID</span><span className="text-slate-400 font-mono text-xs">{user?.id?.slice(0,8)}...</span></div>
        </div>
      </div>
    </div>
  );
}
