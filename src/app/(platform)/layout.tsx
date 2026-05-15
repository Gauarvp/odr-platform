'use client';
// src/app/(platform)/layout.tsx

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Scale, LayoutDashboard, FolderOpen, BarChart3,
  Users, Settings, Bell, LogOut, ChevronRight
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cases', label: 'Cases', icon: FolderOpen },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/mediators', label: 'Mediators', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Scale className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">ODR Platform</div>
            <div className="text-slate-400 text-xs">v2.0 Enterprise</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
                {active && <ChevronRight className="w-3 h-3 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
              U
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">Current User</div>
              <div className="text-slate-400 text-xs truncate">Case Manager</div>
            </div>
            <LogOut className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b flex items-center justify-between px-6 flex-shrink-0">
          <div className="text-slate-600 text-sm">
            {navItems.find(n => pathname.startsWith(n.href))?.label ?? 'ODR Platform'}
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <Link
              href="/cases/new"
              className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + File Dispute
            </Link>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
