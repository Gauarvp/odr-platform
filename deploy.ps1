# ODR Platform - Complete Fix Script
# Run from: C:\Users\Admin\Desktop\odr-deploy
# This script creates all missing files and pushes to GitHub

Set-Location "C:\Users\Admin\Desktop\odr-deploy"

# ── 1. postcss.config.js ─────────────────────────────────────────────────────
Set-Content -Path "postcss.config.js" -Value @"
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
"@

# ── 2. tailwind.config.js (replaces .ts) ─────────────────────────────────────
if (Test-Path "tailwind.config.ts") { Remove-Item "tailwind.config.ts" }
Set-Content -Path "tailwind.config.js" -Value @"
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {} },
  plugins: [],
}
"@

# ── 3. middleware.ts ──────────────────────────────────────────────────────────
Set-Content -Path "middleware.ts" -Value @"
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api')) return supabaseResponse;
  if (!user) return NextResponse.redirect(new URL('/login', request.url));
  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
"@

# ── 4. Browser supabase client ────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path "src\lib\supabase" | Out-Null
Set-Content -Path "src\lib\supabase\client.ts" -Value @"
import { createBrowserClient } from '@supabase/ssr';
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
"@

# ── 5. Auth layout ────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path "src\app\(auth)\login" | Out-Null
Set-Content -Path "src\app\(auth)\layout.tsx" -Value @"
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
"@

# ── 6. Login page ─────────────────────────────────────────────────────────────
Set-Content -Path "src\app\(auth)\login\page.tsx" -Value @"
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
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
          <h1 className='text-white text-2xl font-bold mb-1'>Sign in</h1>
          <p className='text-slate-400 text-sm mb-6'>Enter your credentials to access the platform</p>
          <form onSubmit={handleLogin} className='space-y-4'>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-1.5'>Email</label>
              <input type='email' value={email} onChange={e => setEmail(e.target.value)} required placeholder='you@company.com'
                className='w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500' />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-300 mb-1.5'>Password</label>
              <input type='password' value={password} onChange={e => setPassword(e.target.value)} required placeholder='••••••••'
                className='w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500' />
            </div>
            {error && <div className='bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-2.5'>{error}</div>}
            <button type='submit' disabled={loading}
              className='w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm'>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
"@

# ── 7. Platform layout with working logout ────────────────────────────────────
Set-Content -Path "src\app\(platform)\layout.tsx" -Value @"
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Scale, LayoutDashboard, FolderOpen, BarChart3, Users, Settings, Bell, LogOut, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cases', label: 'Cases', icon: FolderOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/mediators', label: 'Mediators', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserEmail(user.email ?? ''); setUserName(user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User'); }
    });
  }, []);

  const handleLogout = async () => {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const initials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <div className='flex h-screen bg-gray-50'>
      <aside className='w-64 bg-slate-900 flex flex-col flex-shrink-0'>
        <div className='h-16 flex items-center gap-3 px-6 border-b border-slate-800'>
          <div className='w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center'><Scale className='w-4 h-4 text-white' /></div>
          <div><div className='text-white font-semibold text-sm'>ODR Platform</div><div className='text-slate-400 text-xs'>v2.0 Enterprise</div></div>
        </div>
        <nav className='flex-1 px-3 py-4 space-y-1'>
          {navItems.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ' + (active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
                <item.icon className='w-4 h-4 flex-shrink-0' />
                {item.label}
                {active && <ChevronRight className='w-3 h-3 ml-auto' />}
              </Link>
            );
          })}
        </nav>
        <div className='p-3 border-t border-slate-800'>
          <div className='flex items-center gap-3 px-3 py-2'>
            <div className='w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold'>{initials}</div>
            <div className='flex-1 min-w-0'><div className='text-white text-sm font-medium truncate'>{userName}</div><div className='text-slate-400 text-xs truncate'>{userEmail}</div></div>
            <button onClick={handleLogout} title='Sign out' className='text-slate-400 hover:text-white transition-colors'><LogOut className='w-4 h-4' /></button>
          </div>
        </div>
      </aside>
      <div className='flex-1 flex flex-col overflow-hidden'>
        <header className='h-16 bg-white border-b flex items-center justify-between px-6 flex-shrink-0'>
          <div className='text-slate-600 text-sm font-medium'>{navItems.find(n => pathname.startsWith(n.href))?.label ?? 'ODR Platform'}</div>
          <div className='flex items-center gap-3'>
            <button className='p-2 text-slate-400 hover:text-slate-600'><Bell className='w-5 h-5' /></button>
            <Link href='/cases/new' className='flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors'>+ File Dispute</Link>
          </div>
        </header>
        <main className='flex-1 overflow-auto p-6'>{children}</main>
      </div>
    </div>
  );
}
"@

# ── 8. Mediators page ─────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path "src\app\(platform)\mediators" | Out-Null
Set-Content -Path "src\app\(platform)\mediators\page.tsx" -Value @"
'use client';
import { useState, useEffect } from 'react';
import { Users, Star, Clock, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function MediatorsPage() {
  const [mediators, setMediators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    createClient().from('user_profiles').select('*').in('role', ['mediator', 'arbitrator'])
      .then(({ data }) => { setMediators(data ?? []); setLoading(false); });
  }, []);

  if (loading) return <div className='flex items-center justify-center h-64'><div className='w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin' /></div>;

  return (
    <div className='max-w-5xl space-y-6'>
      <div><h1 className='text-2xl font-bold text-slate-900'>Mediators & Arbitrators</h1><p className='text-slate-500 text-sm mt-1'>Certified neutrals available for case assignment</p></div>
      {mediators.length === 0 ? (
        <div className='bg-white rounded-xl border shadow-sm p-16 text-center'>
          <Users className='w-12 h-12 mx-auto text-slate-300 mb-3' />
          <h3 className='text-slate-700 font-medium mb-1'>No mediators registered yet</h3>
          <p className='text-slate-400 text-sm'>Add mediator accounts via Supabase Authentication</p>
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-4'>
          {mediators.map((m: any) => (
            <div key={m.id} className='bg-white rounded-xl border shadow-sm p-5'>
              <div className='flex items-start gap-4'>
                <div className='w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg'>{m.full_name?.charAt(0) ?? 'M'}</div>
                <div className='flex-1'>
                  <div className='flex items-center justify-between'>
                    <h3 className='font-semibold text-slate-900'>{m.full_name}</h3>
                    <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + (m.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>{m.is_available ? 'Available' : 'Unavailable'}</span>
                  </div>
                  <div className='text-xs text-indigo-600 capitalize mb-2'>{m.role}</div>
                  {m.bio && <p className='text-sm text-slate-500 mb-3'>{m.bio}</p>}
                  <div className='flex items-center gap-4 text-xs text-slate-400'>
                    {m.total_cases > 0 && <span className='flex items-center gap-1'><CheckCircle className='w-3 h-3' /> {m.total_cases} cases</span>}
                    {m.resolution_rate && <span className='flex items-center gap-1'><Star className='w-3 h-3' /> {Math.round(m.resolution_rate)}%</span>}
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
"@

# ── 9. Settings page ──────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path "src\app\(platform)\settings" | Out-Null
Set-Content -Path "src\app\(platform)\settings\page.tsx" -Value @"
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, Lock, Building } from 'lucide-react';

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
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
    <div className='max-w-2xl space-y-6'>
      <div><h1 className='text-2xl font-bold text-slate-900'>Settings</h1><p className='text-slate-500 text-sm mt-1'>Manage your account</p></div>
      <div className='bg-white rounded-xl border shadow-sm'>
        <div className='px-5 py-4 border-b flex items-center gap-2'><User className='w-4 h-4 text-slate-400' /><h2 className='font-semibold text-slate-900 text-sm'>Profile</h2></div>
        <div className='p-5 space-y-4'>
          <div><label className='block text-sm font-medium text-slate-700 mb-1'>Email</label><input value={user?.email ?? ''} disabled className='w-full border bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed' /></div>
          <div><label className='block text-sm font-medium text-slate-700 mb-1'>Full name</label><input value={fullName} onChange={e => setFullName(e.target.value)} className='w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300' /></div>
          <button onClick={handleSave} disabled={saving} className='bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors'>{saved ? '✓ Saved' : saving ? 'Saving...' : 'Save changes'}</button>
        </div>
      </div>
      <div className='bg-white rounded-xl border shadow-sm'>
        <div className='px-5 py-4 border-b flex items-center gap-2'><Lock className='w-4 h-4 text-slate-400' /><h2 className='font-semibold text-slate-900 text-sm'>Security</h2></div>
        <div className='p-5'><div className='flex items-center justify-between'><div><div className='text-sm font-medium text-slate-700'>Password</div><div className='text-xs text-slate-400'>Send a reset link to your email</div></div><button onClick={handlePasswordReset} className='text-sm text-indigo-600 font-medium hover:underline'>Reset password</button></div></div>
      </div>
      <div className='bg-white rounded-xl border shadow-sm'>
        <div className='px-5 py-4 border-b flex items-center gap-2'><Building className='w-4 h-4 text-slate-400' /><h2 className='font-semibold text-slate-900 text-sm'>Platform</h2></div>
        <div className='p-5 space-y-2 text-sm'>
          <div className='flex justify-between'><span className='text-slate-500'>Version</span><span className='font-mono'>v2.0.0</span></div>
          <div className='flex justify-between'><span className='text-slate-500'>Plan</span><span>Enterprise</span></div>
          <div className='flex justify-between'><span className='text-slate-500'>User ID</span><span className='text-slate-400 font-mono text-xs'>{user?.id?.slice(0, 8)}...</span></div>
        </div>
      </div>
    </div>
  );
}
"@

# ── 10. globals.css ───────────────────────────────────────────────────────────
Set-Content -Path "src\app\globals.css" -Value @"
@tailwind base;
@tailwind components;
@tailwind utilities;
"@

# ── Push to GitHub ────────────────────────────────────────────────────────────
Write-Host "All files created. Pushing to GitHub..." -ForegroundColor Green

git add .
git commit -m "feat: auth, login, logout, mediators, settings, tailwind fix"
git pull origin main --rebase
git push origin main

Write-Host "Done! Check Vercel for the new deployment." -ForegroundColor Green
