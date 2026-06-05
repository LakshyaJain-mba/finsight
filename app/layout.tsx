import type { Metadata } from 'next';
import Link from 'next/link';
import { LineChart, Upload, MessageSquare, ClipboardCheck } from 'lucide-react';
import './globals.css';

export const metadata: Metadata = {
  title: 'FinSight — Financial Intelligence',
  description:
    'Track management guidance, score credibility, and chat with earnings transcripts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <LineChart className="h-6 w-6 text-indigo-500" />
              <span className="text-lg font-bold tracking-tight text-gray-100">FinSight</span>
            </Link>
            <nav className="flex items-center gap-2">
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <Upload className="h-4 w-4" /> Upload
              </Link>
              <Link
                href="/review"
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <ClipboardCheck className="h-4 w-4" /> Review
              </Link>
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
              >
                <MessageSquare className="h-4 w-4" /> Chat
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
