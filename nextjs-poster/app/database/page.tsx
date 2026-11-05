'use client';

import { useState, useRef, useEffect, DragEvent } from 'react';
import { upload } from '@vercel/blob/client';
import AiStudio from '../../components/AiStudio';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [platforms, setPlatforms] = useState({ youtube: true, facebook: true, instagram: true });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [extractionHistory, setExtractionHistory] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // Meesho Automation States
  const [cfUrl, setCfUrl] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [logs, setLogs] = useState<string>('');
  const [logMetrics, setLogMetrics] = useState({ appRestarts: 0, deviceBoots: 0, issues: [] as string[] });
  const [isRunning, setIsRunning] = useState(false);
  const [isBlueStacksRunning, setIsBlueStacksRunning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [keyword, setKeyword] = useState('kurti');
  const [skipZero, setSkipZero] = useState(true);
  
  // Auto Scheduler States
  const [schedulerConfig, setSchedulerConfig] = useState<any>({
    scheduler_enabled: true,
    daily_target: 4,
    schedule_times: ['02:00', '06:00', '09:00', '19:00']
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [hideProcessed, setHideProcessed] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [isPending, setIsPending] = useState(false);
  const [isLaunchingBS, setIsLaunchingBS] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const pendingRef = useRef(false);
  
  // Timers
  const [actionStartTime, setActionStartTime] = useState<number | null>(null);
  const [timerAction, setTimerAction] = useState<'start' | 'stop' | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Live System Health & Status States
  const [dbStatus, setDbStatus] = useState<{
    status: 'checking' | 'online' | 'paused' | 'offline';
    latencyMs?: number;
    totalCount?: number;
    message?: string;
  }>({ status: 'checking', message: 'Checking database connectivity...' });

  const [renderUrl, setRenderUrl] = useState('');
  const [renderStatus, setRenderStatus] = useState<{
    status: 'idle' | 'checking' | 'online' | 'cold_starting' | 'offline';
    latencyMs?: number;
    httpStatus?: number;
    message?: string;
  }>({ status: 'idle' });
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  const checkSystemHealth = async (overrideRenderUrl?: string) => {
    setIsCheckingHealth(true);
    const targetUrl = overrideRenderUrl !== undefined ? overrideRenderUrl : renderUrl;
    try {
      const query = targetUrl ? `?backendUrl=${encodeURIComponent(targetUrl)}` : '';
      const res = await fetch(`/api/health${query}`);
      if (res.ok) {
        const data = await res.json();
        if (data.database) setDbStatus(data.database);
        if (data.backend) setRenderStatus(data.backend);
      } else {
        setDbStatus({
          status: 'offline',
          message: `Health endpoint returned status ${res.status}`
        });
      }
    } catch (e: any) {
      setDbStatus({
        status: 'offline',
        message: e?.message || 'Failed to ping health check'
      });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        if (data.posts) setHistory(data.posts);
      }
    } catch (e) {
      console.error('Failed to fetch history', e);
    }
  };

  const fetchMeeshoData = async (url?: string) => {
    try {
      const res = await fetch('/api/db/products');
      if (res.ok) {
        setIsConnected(true);
        const data = await res.json();
        setProducts(data.products || []);
        setDbStatus(prev => ({
          status: 'online',
          totalCount: data.products?.length ?? prev.totalCount ?? 0,
          latencyMs: prev.latencyMs,
          message: 'Active & Operational'
        }));
      } else {
        setIsConnected(false);
        const errData = await res.json().catch(() => ({}));
        if (errData.isPaused || res.status === 503) {
          setDbStatus({
            status: 'paused',
            message: 'Database is paused by Supabase due to inactivity. Restore it in the Supabase Dashboard.'
          });
        }
      }
      
      const sessionRes = await fetch('/api/db/extraction-history');
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        if (sessionData.sessions) setExtractionHistory(sessionData.sessions);
      }

      if (url) {
        const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        const logRes = await fetch(`${baseUrl}/api/logs`);
        if (logRes.ok) {
          const logData = await logRes.json();
          setLogs(logData.logs || '');
          if (logData.metrics) setLogMetrics(logData.metrics);
        }
        
        // Check running status so it persists on refresh
        const statusRes = await fetch(`${baseUrl}/api/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (!pendingRef.current) {
            setIsRunning(statusData.isRunning);
            if (statusData.isBlueStacksRunning !== undefined) {
              setIsBlueStacksRunning(statusData.isBlueStacksRunning);
            }
            // Auto-clear stop timer if it stopped
            if (timerAction === 'stop' && !statusData.isRunning) {
              setActionStartTime(null);
              setTimerAction(null);
            }
          }
        }
      }
    } catch {
      setIsConnected(false);
    }
  };

  const syncTunnelUrl = async () => {
    try {
      const res = await fetch('/api/tunnel');
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          setCfUrl(data.url);
          fetchMeeshoData(data.url);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchHistory();
    syncTunnelUrl();
    
    // Load persisted settings
    const DEFAULT_RENDER_URL = 'https://data-scrapper-n7ua.onrender.com';
    const savedKeyword = localStorage.getItem('meesho_keyword');
    const savedSkipZero = localStorage.getItem('meesho_skipZero');
    const savedRenderUrl = localStorage.getItem('render_backend_url') || DEFAULT_RENDER_URL;
    if (savedKeyword) setKeyword(savedKeyword);
    if (savedSkipZero !== null) setSkipZero(savedSkipZero === 'true');
    setRenderUrl(savedRenderUrl);

    // Initial health check
    checkSystemHealth(savedRenderUrl);

    // Poll health & Vercel less frequently
    const vercelInterval = setInterval(() => {
      fetchHistory();
      syncTunnelUrl();
      const currentUrl = localStorage.getItem('render_backend_url') || DEFAULT_RENDER_URL;
      checkSystemHealth(currentUrl);
    }, 30000); 

    return () => {
      clearInterval(vercelInterval);
    };
  }, []);

  // Poll Database (and Local Laptop via Cloudflare if available) very frequently (LIVE updates)
  useEffect(() => {
    const localInterval = setInterval(() => {
      fetchMeeshoData(cfUrl);
    }, 2000);
    return () => clearInterval(localInterval);
  }, [cfUrl]);

  useEffect(() => {
    localStorage.setItem('meesho_keyword', keyword);
    localStorage.setItem('meesho_skipZero', skipZero.toString());
  }, [keyword, skipZero]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (actionStartTime) {
      interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - actionStartTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [actionStartTime]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    
    // Auto-clear start timer if extraction began
    if (timerAction === 'start' && logs.includes('Starting extraction')) {
      setActionStartTime(null);
      setTimerAction(null);
    }
  }, [logs, timerAction]);

  const startAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfUrl || isPending) return alert('Enter Cloudflare URL first or wait for action to complete');
    setIsPending(true);
    pendingRef.current = true;
    setIsRunning(true);
    setTimerAction('start');
    setActionStartTime(Date.now());
    setElapsed(0);
    try {
      const baseUrl = cfUrl.endsWith('/') ? cfUrl.slice(0, -1) : cfUrl;
      await fetch(`${baseUrl}/api/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, skipZero })
      });
    } catch {} finally {
      setIsPending(false);
      setTimeout(() => { pendingRef.current = false; }, 3000); // 3 second grace period
    }
  };

  const stopAutomation = async () => {
    if (!cfUrl || isPending) return;
    setIsPending(true);
    pendingRef.current = true;
    setIsRunning(false);
    setTimerAction('stop');
    setActionStartTime(Date.now());
    setElapsed(0);
    try {
      const baseUrl = cfUrl.endsWith('/') ? cfUrl.slice(0, -1) : cfUrl;
      await fetch(`${baseUrl}/api/stop`, { method: 'POST' });
    } catch {} finally {
      setIsPending(false);
      setTimeout(() => { pendingRef.current = false; }, 3000); // 3 second grace period
    }
  };

  const startChromeExtraction = async () => {
    if (!cfUrl || isPending) return alert('Enter Cloudflare URL first or wait for action to complete');
    setIsPending(true);
    try {
      const baseUrl = cfUrl.endsWith('/') ? cfUrl.slice(0, -1) : cfUrl;
      await fetch(`${baseUrl}/api/start-chrome`, { method: 'POST' });
      alert('Chrome extraction started in the background!');
    } catch (e: any) {
      alert('Failed to start Chrome extraction');
    } finally {
      setIsPending(false);
    }
  };
  
  const launchBlueStacks = async () => {
    if (!cfUrl || isLaunchingBS) return;
    setIsLaunchingBS(true);
    try {
      const baseUrl = cfUrl.endsWith('/') ? cfUrl.slice(0, -1) : cfUrl;
      await fetch(`${baseUrl}/api/bluestacks`, { method: 'POST' });
    } catch {}
    setTimeout(() => setIsLaunchingBS(false), 5000);
  };
  
  // Initial config load
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setSchedulerConfig(data))
      .catch(console.error);
  }, []);

  const updateSchedulerConfig = async (newConfig: any) => {
    setSchedulerConfig(newConfig);
    try {
      await fetch(`/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
    } catch (e) {
      console.error('Failed to update config', e);
    }
  };
  
  const toggleVideoStatus = async (id: number, currentStatus: number) => {
    if (!cfUrl) return;
    const newStatus = currentStatus ? 0 : 1;
    setProducts(products.map(p => p.id === id ? { ...p, video_created: newStatus } : p));
    try {
      await fetch(`/api/db/products/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, video_created: newStatus === 1 })
      });
    } catch {}
  };

  const toggleSelect = (id: number) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedProducts.size === displayedProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(displayedProducts.map((p: any) => p.id)));
    }
  };

  const deleteSelected = async () => {
    if (selectedProducts.size === 0 || !cfUrl) return;
    if (!confirm(`Delete ${selectedProducts.size} product(s)?`)) return;
    const ids = Array.from(selectedProducts);
    setProducts(products.filter(p => !selectedProducts.has(p.id)));
    setSelectedProducts(new Set());
    try {
      await fetch(`/api/db/products/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
    } catch {}
  };

  const deleteCategory = async (category: string) => {
    if (!cfUrl) return;
    const catProducts = products.filter(p => (p.category || 'Uncategorized') === category);
    if (catProducts.length === 0) return;
    if (!confirm(`Delete all ${catProducts.length} products in category "${category}"?`)) return;
    
    const ids = catProducts.map(p => p.id);
    setProducts(products.filter(p => (p.category || 'Uncategorized') !== category));
    
    setSelectedProducts(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });

    if (selectedCategory === category) setSelectedCategory('All');

    try {
      await fetch(`/api/db/products/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
    } catch {}
  };

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category || 'Uncategorized').filter(c => c)))];
  const displayedProducts = products
    .filter(p => !hideProcessed || p.video_created !== 1)
    .filter(p => selectedCategory === 'All' || (p.category || 'Uncategorized') === selectedCategory)
    .filter(p => (p.title || '').toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'priceAsc') return parseFloat(a.price) - parseFloat(b.price);
      if (sortBy === 'priceDesc') return parseFloat(b.price) - parseFloat(a.price);
      if (sortBy === 'commDesc') return parseFloat(b.commission_percent) - parseFloat(a.commission_percent);
      return 0;
    });

  const handleFile = (selectedFile: File) => {
    if (selectedFile && selectedFile.type.startsWith('video/')) {
      setFile(selectedFile);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(URL.createObjectURL(selectedFile));
    } else {
      setStatus({ type: 'error', message: 'Please select a valid video file.' });
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handlePlatformChange = (platform: 'youtube' | 'facebook' | 'instagram') => {
    setPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setStatus({ type: 'error', message: 'Please select a video file.' });
    if (!platforms.youtube && !platforms.facebook && !platforms.instagram) return setStatus({ type: 'error', message: 'Select at least one platform.' });
    if (!scheduleTime) return setStatus({ type: 'error', message: 'Please select a schedule time.' });

    setIsLoading(true);
    setStatus({ type: 'info', message: 'Uploading video securely to cloud...' });

    try {
      const blob = await upload(file.name, file, { access: 'public', handleUploadUrl: '/api/upload' });
      setStatus({ type: 'info', message: 'Video uploaded! Setting up the alarm clock...' });

      const scheduleRes = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: blob.url,
          blobName: file.name,
          description: description,
          platforms: Object.keys(platforms).filter((p) => platforms[p as keyof typeof platforms]),
          scheduleTime: scheduleTime,
        }),
      });

      const scheduleData = await scheduleRes.json();
      if (!scheduleRes.ok) throw new Error(scheduleData.error || 'Failed to schedule');

      setStatus({ type: 'success', message: 'Post successfully scheduled! 🎉' });
      
      // Reset form
      setFile(null);
      setVideoPreviewUrl(null);
      setDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchHistory();
      
      // Clear success message after 5 seconds
      setTimeout(() => setStatus({ type: '', message: '' }), 5000);
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'An error occurred' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async (messageId: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled post?')) return;
    
    try {
      const res = await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      if (!res.ok) throw new Error('Failed to cancel');
      fetchHistory();
    } catch (err) {
      alert('Failed to cancel the post.');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 lg:p-12 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="text-center md:text-left md:flex md:items-center md:justify-between mb-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center md:justify-start gap-3">
              <span className="bg-gradient-to-br from-indigo-500 to-purple-600 bg-clip-text text-transparent">Health &</span> Database
            </h1>
            <p className="mt-2 text-lg text-slate-500">Live service health monitoring and automated product catalog.</p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-3">
            <button
              onClick={() => {
                checkSystemHealth();
                fetchMeeshoData(cfUrl);
              }}
              disabled={isCheckingHealth}
              className="px-4 py-2.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-slate-700 font-semibold rounded-2xl text-sm transition-all shadow-sm flex items-center gap-2"
            >
              <svg className={`w-4 h-4 text-indigo-600 ${isCheckingHealth ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isCheckingHealth ? 'Pinging Services...' : 'Recheck All Health'}
            </button>
          </div>
        </div>

        {/* Database Paused Critical Warning Banner */}
        {dbStatus.status === 'paused' && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-6 shadow-lg shadow-amber-500/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in duration-300">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-2xl shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="font-bold text-amber-900 text-lg flex items-center gap-2">
                  Supabase Database Is Currently Paused
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">PAUSED</span>
                </h3>
                <p className="text-amber-800 text-sm mt-1 leading-relaxed">
                  Supabase automatically puts free projects into sleep mode after 7 days of inactivity. All your product data is safely preserved. Click the button below to resume your database.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 w-full md:w-auto">
              <a
                href="https://supabase.com/dashboard/project/lgzqxzfepgfatdseiwxh"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 md:flex-initial text-center px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-amber-600/20 flex items-center justify-center gap-2"
              >
                Resume on Supabase
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
              <button
                onClick={() => {
                  checkSystemHealth();
                  fetchMeeshoData(cfUrl);
                }}
                className="px-4 py-2.5 bg-white border border-amber-300 hover:bg-amber-100/50 text-amber-900 font-semibold rounded-2xl text-sm transition-all"
              >
                Re-test
              </button>
            </div>
          </div>
        )}

        {/* 3-Card Live System Health Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Supabase Database */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col justify-between hover:border-indigo-200 transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    dbStatus.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                    dbStatus.status === 'paused' ? 'bg-amber-500 animate-pulse' :
                    dbStatus.status === 'checking' ? 'bg-blue-500 animate-ping' :
                    'bg-red-500 animate-pulse'
                  }`} />
                  Database (PostgreSQL)
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  dbStatus.status === 'online' ? 'bg-emerald-100 text-emerald-800' :
                  dbStatus.status === 'paused' ? 'bg-amber-100 text-amber-800' :
                  dbStatus.status === 'checking' ? 'bg-blue-100 text-blue-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {dbStatus.status === 'online' ? 'ACTIVE' :
                   dbStatus.status === 'paused' ? 'PAUSED' :
                   dbStatus.status === 'checking' ? 'CHECKING...' : 'OFFLINE'}
                </span>
              </div>
              <a
                href="https://supabase.com/dashboard/project/lgzqxzfepgfatdseiwxh"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-1.5 mb-1 text-xl font-extrabold text-slate-900 hover:text-indigo-600 transition-colors"
                title="Click to redirect to Supabase Dashboard"
              >
                <span>Supabase Cloud</span>
                <span className="text-sm text-slate-400 group-hover:translate-x-0.5 transition-transform">↗</span>
              </a>
              <p className="text-xs text-slate-500 break-words mb-3 font-mono">
                lgzqxzfepgfatdseiwxh
              </p>
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                {dbStatus.message || (dbStatus.status === 'online' ? 'Connected and operational' : 'Database unavailable')}
                {dbStatus.latencyMs !== undefined && dbStatus.latencyMs > 0 && (
                  <span className="block mt-1 font-semibold text-slate-400">
                    Ping Latency: {dbStatus.latencyMs}ms
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <a
                href="https://supabase.com/dashboard/project/lgzqxzfepgfatdseiwxh"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
              >
                Open Project in Supabase ↗
              </a>
              <button
                onClick={() => {
                  checkSystemHealth();
                  fetchMeeshoData(cfUrl);
                }}
                className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
              >
                Test Ping →
              </button>
            </div>
          </div>

          {/* Card 2: Render / Cloud Backend */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col justify-between hover:border-indigo-200 transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    renderStatus.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                    renderStatus.status === 'cold_starting' ? 'bg-amber-500 animate-pulse' :
                    renderStatus.status === 'checking' ? 'bg-blue-500 animate-ping' :
                    renderStatus.status === 'idle' ? 'bg-slate-300' :
                    'bg-red-500 animate-pulse'
                  }`} />
                  Render Backend
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  renderStatus.status === 'online' ? 'bg-emerald-100 text-emerald-800' :
                  renderStatus.status === 'cold_starting' ? 'bg-amber-100 text-amber-800' :
                  renderStatus.status === 'checking' ? 'bg-blue-100 text-blue-800' :
                  renderStatus.status === 'idle' ? 'bg-slate-100 text-slate-600' :
                  'bg-red-100 text-red-800'
                }`}>
                  {renderStatus.status === 'online' ? 'ONLINE' :
                   renderStatus.status === 'cold_starting' ? 'COLD START' :
                   renderStatus.status === 'checking' ? 'PINGING...' :
                   renderStatus.status === 'idle' ? 'IDLE' : 'OFFLINE'}
                </span>
              </div>
              <a
                href="https://dashboard.render.com"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-1.5 mb-1 text-xl font-extrabold text-slate-900 hover:text-indigo-600 transition-colors"
                title="Click to redirect to Render Dashboard"
              >
                <span>Render Backend</span>
                <span className="text-sm text-slate-400 group-hover:translate-x-0.5 transition-transform">↗</span>
              </a>
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  placeholder="https://data-scrapper-n7ua.onrender.com"
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 bg-slate-50/50 font-mono"
                  value={renderUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRenderUrl(val);
                    localStorage.setItem('render_backend_url', val);
                  }}
                />
                <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  {renderStatus.message || (renderUrl ? 'Ready to ping' : 'Enter Render backend URL above')}
                  {renderStatus.latencyMs !== undefined && renderStatus.latencyMs > 0 && (
                    <span className="block mt-1 font-semibold text-slate-400">
                      Response: {renderStatus.latencyMs}ms
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <a
                href="https://dashboard.render.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
              >
                Open Project in Render ↗
              </a>
              <button
                onClick={() => checkSystemHealth(renderUrl)}
                disabled={!renderUrl || renderStatus.status === 'checking'}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40 transition-colors"
              >
                Ping Backend →
              </button>
            </div>
          </div>

          {/* Card 3: Local Extractor Daemon (Laptop) */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 animate-pulse'
                  }`} />
                  Local Extractor
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}>
                  {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 mb-1">
                Laptop Bridge
              </h3>
              <p className="text-xs text-slate-500 break-words mb-3">
                {isConnected ? 'Cloudflare tunnel active & synced' : 'Run start_dashboard.bat to connect'}
              </p>
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100 font-mono truncate">
                {cfUrl || 'No tunnel active'}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                BlueStacks: {isBlueStacksRunning ? 'Running' : 'Stopped'}
              </span>
              <span className="text-xs font-bold text-slate-400">
                Port 3333
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
          <div className="lg:col-span-12 bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Product Database ({products.length} Total)</h2>
              <button 
                onClick={() => fetchMeeshoData(cfUrl)} 
                className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-semibold rounded-xl text-sm transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Refresh Data
              </button>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <input 
                type="text" 
                placeholder="Search products..." 
                className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <select className="px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="newest">Newest First</option>
                <option value="priceAsc">Price: Low to High</option>
                <option value="priceDesc">Price: High to Low</option>
                <option value="commDesc">Commission: High to Low</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {categories.map(cat => (
                <div key={cat} className="flex items-center shadow-sm rounded-full">
                  <button 
                    className={`px-4 py-1.5 ${cat !== 'All' ? 'rounded-l-full' : 'rounded-full'} text-sm font-semibold transition-colors border ${selectedCategory === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                  {cat !== 'All' && (
                    <button
                      onClick={() => deleteCategory(cat)}
                      className={`px-2.5 py-1.5 rounded-r-full text-sm font-bold border-y border-r transition-colors ${selectedCategory === cat ? 'bg-indigo-700 text-red-300 border-indigo-700 hover:text-red-400' : 'bg-slate-100 text-red-400 border-slate-200 hover:bg-red-50 hover:text-red-500'}`}
                      title={`Delete category: ${cat}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <label className="flex items-center gap-2 ml-auto cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={hideProcessed} 
                  onChange={e => setHideProcessed(e.target.checked)}
                  className="w-4 h-4 text-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-600">Hide Completed</span>
              </label>
            </div>

            {/* Select All / Delete toolbar */}
            {displayedProducts.length > 0 && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  checked={selectedProducts.size === displayedProducts.length && displayedProducts.length > 0}
                  onChange={selectAll}
                  className="w-4 h-4 text-indigo-600 cursor-pointer"
                />
                <span className="text-sm text-slate-600 flex-1">
                  {selectedProducts.size > 0 ? `${selectedProducts.size} selected` : 'Select All'}
                </span>
                {selectedProducts.size > 0 && (
                  <button
                    onClick={deleteSelected}
                    className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-1"
                  >
                    🗑 Delete ({selectedProducts.size})
                  </button>
                )}
              </div>
            )}

            <div 
              className="flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[800px]"
              onScroll={(e) => {
                const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 200;
                if (bottom && visibleCount < displayedProducts.length) {
                  setVisibleCount(v => v + 50);
                }
              }}
            >
              {displayedProducts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16 text-center px-4">
                  {dbStatus.status === 'paused' ? (
                    <div className="max-w-md space-y-3">
                      <div className="text-4xl">😴</div>
                      <h4 className="font-bold text-slate-800 text-lg">Database Is Sleeping (Paused)</h4>
                      <p className="text-sm text-slate-500">
                        Supabase paused the database after 7 days of inactivity. Once you click resume in Supabase, all your products will appear here.
                      </p>
                      <a
                        href="https://supabase.com/dashboard/project/lgzqxzfepgfatdseiwxh"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-indigo-600/20"
                      >
                        Open Supabase & Unpause ↗
                      </a>
                    </div>
                  ) : (
                    <p className="font-medium text-slate-400">No products found. Enter CF URL or run extraction.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {displayedProducts.slice(0, visibleCount).map((p: any) => (
                    <div key={p.id} className={`flex justify-between items-center p-4 rounded-xl border transition-all ${selectedProducts.has(p.id) ? 'bg-indigo-50 border-indigo-300' : 'border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-300'}`}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="w-4 h-4 text-indigo-600 cursor-pointer mr-3 flex-shrink-0"
                      />
                      
                      {/* Product Thumbnail */}
                      {p.image_url && p.image_url !== 'FAILED' ? (
                        <img 
                          src={p.image_url} 
                          alt={p.title}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-200 flex-shrink-0 mr-4"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-2xl text-slate-300 flex-shrink-0 mr-4">
                          🖼️
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate" title={p.title}>{p.title}</div>
                        <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1 items-center">
                          <span className="font-bold text-emerald-600">₹{p.price}</span>
                          <span>Comm: {p.commission_percent}%</span>
                          {p.review_star && <span className="font-medium text-amber-500">⭐ {p.review_star}</span>}
                          {p.total_bought && <span className="text-slate-400">{p.total_bought}</span>}
                          {p.created_at && <span className="text-slate-400">🕒 {new Date(p.created_at).toLocaleString()}</span>}
                          <a href={p.product_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">View Link ↗</a>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${p.video_created === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                          {p.video_created === 1 ? 'Done' : 'Pending'}
                        </span>
                        <input 
                          type="checkbox"
                          checked={p.video_created === 1}
                          onChange={() => toggleVideoStatus(p.id, p.video_created)}
                          className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          title="Toggle Video Status"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* System Health Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col">
            
            {/* System Health Monitor */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  System Health
                </h2>
                <button 
                  onClick={() => fetchMeeshoData(cfUrl)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Refresh System Health"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${dbStatus.status === 'online' ? 'bg-emerald-50 border-emerald-100' : dbStatus.status === 'paused' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-100'}`}>
                  <span className="text-sm font-semibold text-slate-700">Supabase DB</span>
                  <div className={`w-3 h-3 rounded-full ${dbStatus.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : dbStatus.status === 'paused' ? 'bg-amber-500 animate-pulse' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                </div>
                <div className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${renderStatus.status === 'online' ? 'bg-emerald-50 border-emerald-100' : renderStatus.status === 'cold_starting' ? 'bg-amber-50 border-amber-200' : renderStatus.status === 'idle' ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-100'}`}>
                  <span className="text-sm font-semibold text-slate-700">Render API</span>
                  <div className={`w-3 h-3 rounded-full ${renderStatus.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : renderStatus.status === 'cold_starting' ? 'bg-amber-500 animate-pulse' : renderStatus.status === 'idle' ? 'bg-slate-300' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                </div>
                <div className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${isConnected ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <span className="text-sm font-semibold text-slate-700">Laptop Link</span>
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                </div>
                <div className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${cfUrl ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <span className="text-sm font-semibold text-slate-700">Cloudflare</span>
                  <div className={`w-3 h-3 rounded-full ${cfUrl ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                </div>
                <div className={`p-3 rounded-xl border flex flex-col justify-center transition-colors ${isBlueStacksRunning ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Pixel 8 Emul.</span>
                    <div className={`w-3 h-3 rounded-full ${isBlueStacksRunning ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                  </div>
                  {!isBlueStacksRunning && isConnected && (
                    <button onClick={launchBlueStacks} disabled={isLaunchingBS} className="mt-2 w-full py-1 text-xs font-bold bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50 rounded-lg transition-colors shadow-sm">
                      {isLaunchingBS ? 'Launching...' : '🚀 Launch Pixel 8'}
                    </button>
                  )}
                </div>
                <div className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${isRunning ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-sm font-semibold text-slate-700">Scraper Bot</span>
                  <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`} />
                </div>
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-6">Automation Controls</h2>
            <form onSubmit={startAutomation} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Search Keyword</label>
                <input 
                  type="text" 
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
                  placeholder="e.g. kurti, smart watch..."
                  disabled={isRunning}
                  required
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={skipZero}
                  onChange={(e) => setSkipZero(e.target.checked)}
                  disabled={isRunning}
                  className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm font-semibold text-slate-700">Skip 0% Commission Products</span>
              </label>
              {!isRunning ? (
                <div className="space-y-3">
                  <button type="submit" disabled={isPending} className={`w-full py-4 px-4 bg-gradient-to-r ${isPending ? 'from-emerald-400 to-emerald-400 cursor-not-allowed' : 'from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700'} text-white rounded-xl font-bold shadow-lg shadow-emerald-200 transition-all`}>
                    {isPending ? '⏳ Processing...' : '▶ Start Extraction'}
                  </button>
                  <button type="button" onClick={startChromeExtraction} disabled={isPending} className={`w-full py-3 px-4 bg-gradient-to-r ${isPending ? 'from-indigo-400 to-indigo-400 cursor-not-allowed' : 'from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700'} text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all`}>
                    {isPending ? '⏳ Processing...' : '🌐 Start Chrome Extraction'}
                  </button>
                </div>
              ) : (
                <button type="button" disabled={isPending} onClick={stopAutomation} className={`w-full py-4 px-4 bg-gradient-to-r ${isPending ? 'from-red-400 to-red-400 cursor-not-allowed' : 'from-red-500 to-red-600 hover:from-red-600 hover:to-red-700'} text-white rounded-xl font-bold shadow-lg shadow-red-200 transition-all`}>
                  {isPending ? '⏳ Processing...' : '⏹ Stop Automation'}
                </button>
              )}
            </form>
            
            {actionStartTime && timerAction && (
              <div className="mt-6 flex items-center justify-between bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="animate-spin text-indigo-600 text-lg">⏳</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-indigo-900">
                      {timerAction === 'start' ? 'Initializing Pixel 8 Emulator & App...' : 'Stopping Emulator & Cleaning Up...'}
                    </h3>
                    <p className="text-xs text-indigo-600 font-medium">
                      Expected wait: {timerAction === 'start' ? '~45 seconds' : '~5 seconds'}
                    </p>
                  </div>
                </div>
                <div className="text-2xl font-black text-indigo-600 font-mono">
                  {elapsed}s
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col">
            <div className={`${actionStartTime ? 'mt-4' : ''}`}>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold text-slate-700">Automation Live Logs</h3>
                {(logMetrics.deviceBoots > 0 || logMetrics.appRestarts > 0) && (
                  <div className="flex gap-2 text-xs font-medium">
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Device Boots: {logMetrics.deviceBoots}</span>
                    <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded">App Restarts: {logMetrics.appRestarts}</span>
                    {logMetrics.issues.length > 0 && (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded">Issues: {logMetrics.issues.join(', ')}</span>
                    )}
                  </div>
                )}
              </div>
              <div className={`bg-slate-900 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs text-green-400 custom-scrollbar`} ref={logRef}>
                {logs.split('\\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {logs.length === 0 && <div className="opacity-50">Connect Cloudflare URL to view logs...</div>}
              </div>
            </div>
            
            <div className="mt-8">
              <h3 className="text-sm font-bold text-slate-700 mb-2">Past Extraction Runs</h3>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Keyword</th>
                      <th className="px-4 py-3 text-right">Extracted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractionHistory.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-center text-slate-400">No past runs found</td>
                      </tr>
                    ) : (
                      extractionHistory.map(session => (
                        <tr key={session.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-800">#{session.id}</td>
                          <td className="px-4 py-3">{new Date(session.start_time).toLocaleString()}</td>
                          <td className="px-4 py-3 font-mono text-indigo-600">{session.keyword}</td>
                          <td className="px-4 py-3 text-right font-bold text-green-600">{session.total_extracted}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
