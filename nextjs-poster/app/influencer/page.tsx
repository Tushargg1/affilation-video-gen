'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Scene {
  scene_index: number;
  time_range: string;
  scene_title: string;
  video_prompt: string;
}

interface ReelPlan {
  reel_title: string;
  topic: string;
  captions: {
    instagram: string;
    youtube_shorts: string;
    facebook: string;
  };
  scenes: Scene[];
}

interface ReelRecord {
  id: number;
  title: string;
  topic: string;
  caption: string;
  status: string;
  target_date: string;
  scheduled_time: string;
  clip_paths: string[];
  video_url: string;
  platforms: string[];
  is_posted: boolean;
  post_links: any;
  created_at: string;
}

export default function InfluencerDashboard() {
  const [reels, setReels] = useState<ReelRecord[]>([]);
  const [todaysReel, setTodaysReel] = useState<ReelRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customTopic, setCustomTopic] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [previewPlan, setPreviewPlan] = useState<ReelPlan | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  const fetchReels = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/influencer');
      if (res.ok) {
        const data = await res.json();
        setReels(data.reels || []);
        setTodaysReel(data.todaysReel || null);
      }
    } catch (e) {
      console.error('Failed to fetch reels:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const checkLocalServer = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/influencer/status');
      if (res.ok) {
        const data = await res.json();
        setServerOnline(true);
        if (data.isRunning) {
          setIsGenerating(true);
          setStatusMessage(data.status?.message || 'Generating 50s reel...');
        } else if (isGenerating) {
          setIsGenerating(false);
          fetchReels();
        }
      } else {
        setServerOnline(false);
      }
    } catch (e) {
      setServerOnline(false);
    }
  };

  useEffect(() => {
    fetchReels();
    checkLocalServer();
    const interval = setInterval(() => {
      checkLocalServer();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTriggerGeneration = async () => {
    setIsGenerating(true);
    setStatusMessage('Triggering 50s Reel Generation Pipeline...');
    try {
      const res = await fetch('http://localhost:3001/api/influencer/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customTopic: customTopic.trim() || null })
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage('🚀 Generation started! The extension will generate 5 x 10s clips, merge them into 50s, and auto-schedule.');
      } else {
        setStatusMessage(`⚠️ ${data.message || 'Error triggering generation'}`);
        setIsGenerating(false);
      }
    } catch (err: any) {
      setStatusMessage('❌ Could not connect to local server on port 3001. Please run "start-influencer-automation.bat" on your laptop.');
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Navigation / Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">✨</span>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">
                AI Influencer Studio
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-pink-500/10 text-pink-400 border border-pink-500/20">
                1 Reel Daily • 50 Sec
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Autonomous 5-clip (10s each) generation, 50s seamless video stitching, and scheduled multi-platform auto-posting.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            >
              ← Back to Main Dashboard
            </Link>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border ${
              serverOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              <span className={`w-2 h-2 rounded-full ${serverOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {serverOnline ? 'Automation Bridge Online' : 'Bridge Offline (Port 3001)'}
            </div>
          </div>
        </div>

        {/* Influencer Persona Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 to-slate-900/60 p-6 rounded-3xl border border-slate-800/80 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-pink-400">Virtual Creator Profile</span>
                <h2 className="text-2xl font-bold text-white mt-1">Aria Vance</h2>
                <p className="text-sm text-slate-400">Niche: Luxury Streetwear, Aesthetic Lifestyle & City Life</p>
              </div>
              <span className="px-3 py-1 bg-purple-500/20 text-purple-300 text-xs font-semibold rounded-lg border border-purple-500/30">
                Daily Post: 19:00 (7 PM)
              </span>
            </div>

            <div className="mt-4 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/60">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Visual Identity Prompt
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                "A stunning 23-year-old AI fashion & lifestyle influencer, radiant natural skin, captivating hazel-green eyes, sleek brunette hair with caramel highlights, chic contemporary streetwear, minimalist jewelry, elegant confident aura, 8k photorealistic, 35mm film aesthetic."
              </p>
            </div>

            {/* Quick Trigger Controls */}
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
              <input
                type="text"
                placeholder="Optional topic/theme (e.g. Neon twilight rooftop walk)..."
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                className="w-full sm:flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-pink-500/50"
              />
              <button
                onClick={handleTriggerGeneration}
                disabled={isGenerating || !serverOnline}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:opacity-90 disabled:opacity-50 text-white shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 transition-all"
              >
                {isGenerating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                    </svg>
                    Generating 50s Reel...
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    Generate Today's 50s Reel
                  </>
                )}
              </button>
            </div>

            {statusMessage && (
              <div className="mt-4 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                {statusMessage}
              </div>
            )}
          </div>

          {/* Today's Status Card */}
          <div className="bg-slate-900/90 p-6 rounded-3xl border border-slate-800/80 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Today's Reel Status</span>
              <div className="mt-3">
                {todaysReel ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-sm font-bold text-emerald-400 uppercase tracking-wide">
                        {todaysReel.status || 'SCHEDULED'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white line-clamp-2">
                      {todaysReel.title}
                    </p>
                    <div className="text-xs text-slate-400 space-y-1">
                      <div>⏰ Scheduled for: <span className="text-slate-200">{new Date(todaysReel.scheduled_time).toLocaleTimeString()}</span></div>
                      <div>⏱️ Total Duration: <span className="text-slate-200">50 Seconds (5 x 10s)</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-500">
                    <span className="text-3xl block mb-2">⏳</span>
                    <p className="text-xs">No reel scheduled yet today.</p>
                    <p className="text-[11px] text-slate-600 mt-1">Autonomous scheduler will generate 1 reel for 19:00, or trigger manually.</p>
                  </div>
                )}
              </div>
            </div>

            {todaysReel?.video_url && (
              <a
                href={todaysReel.video_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block w-full text-center py-2 px-3 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-colors"
              >
                Watch 50s Video Preview ↗
              </a>
            )}
          </div>
        </div>

        {/* 5-Clip Sequential Architecture Explanation */}
        <div className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800/60">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🎞️</span>
            <h3 className="text-base font-bold text-slate-200">
              5-Clip Sequential Reel Architecture (50 Seconds Total)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { num: 1, time: '0-10s', title: 'The Hook', desc: 'Arresting visual entrance & scroll-stopping eye contact' },
              { num: 2, time: '10-20s', title: 'Progression', desc: 'Dynamic camera tracking shot moving through city aesthetic' },
              { num: 3, time: '20-30s', title: 'Showcase', desc: 'Medium close-up detail highlight of outfit & styling' },
              { num: 4, time: '30-40s', title: 'Atmosphere', desc: 'Cinematic 360 orbital dolly shot with sunset/neon glows' },
              { num: 5, time: '40-50s', title: 'Outro & CTA', desc: 'Direct camera smile, iconic hero pose & sign-off' },
            ].map((step) => (
              <div key={step.num} className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="w-6 h-6 rounded-lg bg-pink-500/20 text-pink-400 text-xs font-extrabold flex items-center justify-center border border-pink-500/30">
                    {step.num}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">{step.time}</span>
                </div>
                <h4 className="text-xs font-bold text-slate-200">{step.title}</h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Past Reels History */}
        <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📅</span> Past 50-Second Influencer Reels
            </h3>
            <button
              onClick={fetchReels}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>

          {reels.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No reels generated yet. Once generated, they will appear here with video previews and posting links.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reels.map((reel) => (
                <div
                  key={reel.id}
                  className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800/70 hover:border-slate-700 transition-all space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-400">{reel.target_date}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        reel.status === 'posted' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-purple-500/20 text-purple-300'
                      }`}>
                        {reel.status}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-100 line-clamp-1">{reel.title}</h4>
                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{reel.caption}</p>
                  </div>

                  {reel.video_url && (
                    <div className="pt-2 border-t border-slate-900 space-y-2">
                      <video
                        src={reel.video_url}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full h-48 object-cover rounded-xl bg-black"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Duration: 50s</span>
                        <a
                          href={reel.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-pink-400 hover:underline"
                        >
                          Open Raw MP4 ↗
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
