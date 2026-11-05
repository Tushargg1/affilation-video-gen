"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Home() {
  const DEFAULT_RENDER_URL = 'https://data-scrapper-n7ua.onrender.com';
  const SUPABASE_PROJECT_URL = 'https://supabase.com/dashboard/project/lgzqxzfepgfatdseiwxh';
  const RENDER_DASHBOARD_URL = 'https://dashboard.render.com';

  const [dbHealth, setDbHealth] = useState<{
    status: 'checking' | 'online' | 'paused' | 'offline';
    latencyMs?: number;
    totalCount?: number;
    message?: string;
  }>({ status: 'checking', message: 'Connecting to database...' });

  const [renderUrl, setRenderUrl] = useState(DEFAULT_RENDER_URL);
  const [renderStatus, setRenderStatus] = useState<{
    status: 'idle' | 'checking' | 'online' | 'cold_starting' | 'suspended' | 'offline';
    latencyMs?: number;
    message?: string;
  }>({ status: 'idle' });

  const [isPinging, setIsPinging] = useState(false);

  const checkHealth = async (overrideUrl?: string) => {
    setIsPinging(true);
    const targetUrl = overrideUrl !== undefined ? overrideUrl : renderUrl;
    try {
      const q = targetUrl ? `?backendUrl=${encodeURIComponent(targetUrl)}` : '';
      const res = await fetch(`/api/health${q}`);
      if (res.ok) {
        const data = await res.json();
        if (data.database) setDbHealth(data.database);
        if (data.backend) setRenderStatus(data.backend);
      } else {
        setDbHealth({ status: 'offline', message: `HTTP ${res.status}` });
      }
    } catch (e: any) {
      setDbHealth({ status: 'offline', message: e?.message || 'Connection failed' });
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    const savedUrl = localStorage.getItem('render_backend_url') || DEFAULT_RENDER_URL;
    setRenderUrl(savedUrl);
    checkHealth(savedUrl);

    const interval = setInterval(() => {
      const currentUrl = localStorage.getItem('render_backend_url') || DEFAULT_RENDER_URL;
      checkHealth(currentUrl);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-6 lg:p-12 font-sans text-slate-900 flex flex-col justify-center">
      <div className="max-w-7xl mx-auto w-full space-y-8">
        
        {/* Header */}
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center gap-4 mb-4">
            <span className="bg-gradient-to-br from-indigo-500 to-purple-600 bg-clip-text text-transparent">Antigravity</span>
            Dashboard
          </h1>
          <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto font-medium">
            Automated affiliate marketing pipeline & live infrastructure monitoring.
          </p>
        </div>

        {/* Live System Health Bar */}
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 max-w-5xl mx-auto w-full space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Infrastructure Status</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
                Auto-Updating
              </span>
            </div>
            <button
              onClick={() => checkHealth()}
              disabled={isPinging}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isPinging ? 'Checking...' : 'Refresh Health'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Supabase Status Card */}
            <div className="p-4 rounded-2xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/70 transition-all flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <a
                  href={SUPABASE_PROJECT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 flex-1"
                  title="Click to open Supabase Project Dashboard"
                >
                  <span
                    className={`w-3 h-3 rounded-full shrink-0 ${
                      dbHealth.status === 'online'
                        ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                        : dbHealth.status === 'paused'
                        ? 'bg-amber-500 animate-pulse'
                        : dbHealth.status === 'checking'
                        ? 'bg-blue-500 animate-ping'
                        : 'bg-red-500 animate-pulse'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors flex items-center gap-1">
                        Supabase DB
                        <span className="text-xs text-slate-400 group-hover:translate-x-0.5 transition-transform">↗</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          dbHealth.status === 'online'
                            ? 'bg-emerald-100 text-emerald-800'
                            : dbHealth.status === 'paused'
                            ? 'bg-amber-100 text-amber-800'
                            : dbHealth.status === 'checking'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {dbHealth.status === 'online'
                          ? 'ACTIVE'
                          : dbHealth.status === 'paused'
                          ? 'PAUSED'
                          : dbHealth.status === 'checking'
                          ? 'CHECKING...'
                          : 'OFFLINE'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {dbHealth.status === 'online'
                        ? `${dbHealth.totalCount ?? 0} saved products loaded`
                        : dbHealth.message || 'Database unavailable'}
                    </p>
                  </div>
                </a>

                {dbHealth.status === 'online' ? (
                  <div className="text-right pl-2">
                    <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                      {dbHealth.latencyMs}ms
                    </span>
                  </div>
                ) : (
                  <a
                    href={SUPABASE_PROJECT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors shadow-sm"
                  >
                    Unpause ↗
                  </a>
                )}
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-mono text-[10px]">lgzqxzfepgfatdseiwxh</span>
                <a
                  href={SUPABASE_PROJECT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                >
                  Open Supabase Dashboard ↗
                </a>
              </div>
            </div>

            {/* Render Backend Status Card */}
            <div className="p-4 rounded-2xl bg-slate-50/80 hover:bg-slate-50 border border-slate-200/70 transition-all flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <a
                  href={RENDER_DASHBOARD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2"
                  title="Click to open Render Dashboard"
                >
                  <span
                    className={`w-3 h-3 rounded-full shrink-0 ${
                      renderStatus.status === 'online'
                        ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'
                        : renderStatus.status === 'cold_starting'
                        ? 'bg-amber-500 animate-pulse'
                        : renderStatus.status === 'suspended'
                        ? 'bg-amber-500 animate-pulse'
                        : renderStatus.status === 'checking'
                        ? 'bg-blue-500 animate-ping'
                        : renderStatus.status === 'idle'
                        ? 'bg-slate-300'
                        : 'bg-red-500 animate-pulse'
                    }`}
                  />
                  <span className="font-bold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors flex items-center gap-1">
                    Render Backend
                    <span className="text-xs text-slate-400 group-hover:translate-x-0.5 transition-transform">↗</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      renderStatus.status === 'online'
                        ? 'bg-emerald-100 text-emerald-800'
                        : renderStatus.status === 'cold_starting'
                        ? 'bg-amber-100 text-amber-800'
                        : renderStatus.status === 'suspended'
                        ? 'bg-amber-100 text-amber-800'
                        : renderStatus.status === 'checking'
                        ? 'bg-blue-100 text-blue-800'
                        : renderStatus.status === 'idle'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {renderStatus.status === 'online'
                      ? 'ONLINE'
                      : renderStatus.status === 'cold_starting'
                      ? 'COLD START'
                      : renderStatus.status === 'suspended'
                      ? 'SUSPENDED'
                      : renderStatus.status === 'checking'
                      ? 'PINGING'
                      : renderStatus.status === 'idle'
                      ? 'IDLE'
                      : 'OFFLINE'}
                  </span>
                </a>

                {renderStatus.latencyMs !== undefined && renderStatus.latencyMs > 0 && (
                  <span className="text-[11px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {renderStatus.latencyMs}ms
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://data-scrapper-n7ua.onrender.com"
                  className="flex-1 text-xs px-3 py-1.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 bg-white font-mono"
                  value={renderUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRenderUrl(val);
                    localStorage.setItem('render_backend_url', val);
                  }}
                />
                <button
                  onClick={() => checkHealth(renderUrl)}
                  disabled={!renderUrl || renderStatus.status === 'checking'}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all shrink-0"
                >
                  Ping
                </button>
              </div>

              <div className="pt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 truncate max-w-[200px]" title={renderStatus.message}>
                  {renderStatus.message || 'data-scrapper-n7ua.onrender.com'}
                </span>
                <a
                  href={RENDER_DASHBOARD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 shrink-0"
                >
                  Open Render Dashboard ↗
                </a>
              </div>
            </div>

          </div>
        </div>

        {/* Core Modules */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
          
          <Link href="/influencer" className="group relative bg-gradient-to-br from-slate-900 to-indigo-950 p-6 rounded-3xl shadow-xl shadow-purple-950/20 border border-purple-500/30 hover:border-pink-400 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-pink-500/20 overflow-hidden flex flex-col items-center text-center text-white">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500"></div>
            <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 border border-purple-500/30">
              <span className="text-3xl">🤖</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-pink-500/20 text-pink-300 border border-pink-500/30 mb-2">
              New Pipeline
            </span>
            <h2 className="text-xl font-bold mb-2">AI Influencer (50s)</h2>
            <p className="text-slate-300 font-medium leading-relaxed text-xs">Autonomous 1-reel daily (5 x 10s clips merged into 50s) and auto-posted at set time.</p>
          </Link>

          <Link href="/poster" className="group relative bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-indigo-300 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-200 overflow-hidden flex flex-col items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500"></div>
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <span className="text-3xl">📅</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Auto-Poster Schedule</h2>
            <p className="text-slate-500 font-medium leading-relaxed text-xs">Schedule your generated videos to automatically post to YouTube, Instagram, and Facebook.</p>
          </Link>

          <Link href="/studio" className="group relative bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-purple-300 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-purple-200 overflow-hidden flex flex-col items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-400 to-pink-500"></div>
            <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <span className="text-3xl">✨</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">AI Content Studio</h2>
            <p className="text-slate-500 font-medium leading-relaxed text-xs">Autonomously generate cinematic AI prompts and videos for products via Google Flow.</p>
          </Link>

          <Link href="/database" className="group relative bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 hover:border-emerald-300 transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-emerald-200 overflow-hidden flex flex-col items-center text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-inner">
              <span className="text-3xl">🗄️</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Health & Database</h2>
            <p className="text-slate-500 font-medium leading-relaxed text-xs">Monitor local connection, run automated scraping bots, and manage the database.</p>
          </Link>

        </div>
      </div>
    </main>
  );
}
