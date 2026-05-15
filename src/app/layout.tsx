// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'ODR Platform — Enterprise Online Dispute Resolution',
  description: 'AI-powered online dispute resolution for enterprises. Resolve disputes faster with intelligent triage, mediation, and settlement tools.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-50 antialiased">{children}</body>
    </html>
  );
}
