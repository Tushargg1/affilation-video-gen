'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function LiveHealthNavbarPill() {
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'paused' | 'offline'>('checking');
  const [dbCount, setDbCount] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const fetchQuickHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        if (data.database) {
          setDbStatus(data.database.status);
          setDbCount(data.database.totalCount ?? null);
          setLatency(data.database.latencyMs ?? null);
        }
      } else {
        setDbStatus('offline');
      }
    } catch {
      setDbStatus('offline');
    }
  };

  useEffect(() => {
    fetchQuickHealth();
    const interval = setInterval(fetchQuickHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Link
      href="/database"
      className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200/80 bg-white/60 hover:bg-white text-xs font-semibold text-slate-700 transition-all shadow-sm hover:border-indigo-300"
      title="Click to view full Health & Database monitoring"
    >
      <span
        className={`w-2 h-2 rounded-full ${
          dbStatus === 'online'
            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
            : dbStatus === 'paused'
            ? 'bg-amber-500 animate-pulse'
            : dbStatus === 'checking'
            ? 'bg-blue-500 animate-ping'
            : 'bg-red-500 animate-pulse'
        }`}
      />
      <span>
        {dbStatus === 'online'
          ? `DB: Active ${dbCount !== null ? `(${dbCount})` : ''}`
          : dbStatus === 'paused'
          ? 'DB: Paused'
          : dbStatus === 'checking'
          ? 'DB: Checking...'
          : 'DB: Offline'}
      </span>
      {latency !== null && dbStatus === 'online' && (
        <span className="text-[10px] text-slate-400 font-mono">
          {latency}ms
        </span>
      )}
    </Link>
  );
}

