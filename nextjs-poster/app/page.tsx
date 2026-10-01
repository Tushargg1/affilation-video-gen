'use client';

import { useState, useRef, useEffect, DragEvent } from 'react';
import { upload } from '@vercel/blob/client';
import AiStudio from '../components/AiStudio';

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
  const [schedulerConfig, setSchedulerConfig] = useState({
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
  const pendingRef = useRef(false);
  
  // Timers
  const [actionStartTime, setActionStartTime] = useState<number | null>(null);
  const [timerAction, setTimerAction] = useState<'start' | 'stop' | null>(null);
  const [elapsed, setElapsed] = useState(0);

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
      } else {
        setIsConnected(false);
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
    const savedKeyword = localStorage.getItem('meesho_keyword');
    const savedSkipZero = localStorage.getItem('meesho_skipZero');
    if (savedKeyword) setKeyword(savedKeyword);
    if (savedSkipZero !== null) setSkipZero(savedSkipZero === 'true');

    // Poll Vercel for tunnel URL and History less frequently
    const vercelInterval = setInterval(() => {
      fetchHistory();
      syncTunnelUrl();
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
        
        {/* Header */}
        <div className="text-center md:text-left md:flex md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center md:justify-start gap-3">
              <span className="bg-gradient-to-br from-indigo-500 to-purple-600 bg-clip-text text-transparent">Antigravity</span> Auto-Poster
            </h1>
            <p className="mt-2 text-lg text-slate-500">Schedule once, publish everywhere automatically.</p>
          </div>
        </div>

        {/* Cloudflare Connection Banner */}
        <div className={`border p-6 rounded-3xl flex flex-col md:flex-row gap-4 items-center justify-between transition-colors ${isConnected ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'}`}>
          <div>
            <h3 className={`font-bold text-lg flex items-center gap-2 ${isConnected ? 'text-emerald-900' : 'text-red-900'}`}>
              Local Extractor Status
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold text-white ${isConnected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}>
                {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </h3>
            <p className={`text-sm mt-1 ${isConnected ? 'text-emerald-700' : 'text-red-700'}`}>
              {isConnected 
                ? 'Your Vercel app is securely linked to your laptop!' 
                : 'Waiting for laptop connection... Run start_dashboard.bat'}
            </p>
          </div>
          <div className="flex w-full md:w-auto gap-2 opacity-50 cursor-not-allowed">
            <input 
              type="text" 
              placeholder="Waiting for sync..." 
              className="px-4 py-2 rounded-xl border border-slate-200 focus:outline-none w-full md:w-80 bg-slate-50 text-slate-500"
              value={cfUrl}
              readOnly
            />
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Form Column */}
          <div className="lg:col-span-5 bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="mb-10 pb-10 border-b border-slate-100">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Auto-Poster Schedule
                </h2>
                <button 
                  type="button"
                  onClick={() => updateSchedulerConfig({ ...schedulerConfig, scheduler_enabled: !schedulerConfig.scheduler_enabled })}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${schedulerConfig.scheduler_enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${schedulerConfig.scheduler_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              
              <div className={`space-y-5 transition-opacity ${!schedulerConfig.scheduler_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Daily Videos Target</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="1" max="10" 
                      value={schedulerConfig.daily_target}
                      onChange={(e) => {
                        const target = parseInt(e.target.value);
                        let newTimes = [...schedulerConfig.schedule_times];
                        while(newTimes.length < target) newTimes.push('12:00');
                        newTimes = newTimes.slice(0, target);
                        updateSchedulerConfig({ ...schedulerConfig, daily_target: target, schedule_times: newTimes });
                      }}
                      className="w-full h-2 bg-indigo-100 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="font-bold text-lg text-indigo-600 w-8">{schedulerConfig.daily_target}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Posting Times (Local Time)</label>
                  <div className="grid grid-cols-2 gap-3">
                    {schedulerConfig.schedule_times.map((time, index) => (
                      <div key={index} className="flex items-center">
                        <span className="text-xs font-bold text-slate-400 w-6">#{index + 1}</span>
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => {
                            const newTimes = [...schedulerConfig.schedule_times];
                            newTimes[index] = e.target.value;
                            updateSchedulerConfig({ ...schedulerConfig, schedule_times: newTimes });
                          }}
                          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500/50 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-3 flex items-start gap-1">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Settings are saved to the cloud. The scheduler on your laptop will pick up the latest settings automatically.
                  </p>
                </div>
              </div>
            </div>

            <AiStudio products={products} schedulerConfig={schedulerConfig} />

            <div className="flex items-center justify-between mb-6 mt-10">
              <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                Prompt Generation Templates
              </h2>
              <button 
                type="button"
                onClick={() => updateSchedulerConfig({ ...schedulerConfig, prompt_generation_enabled: schedulerConfig.prompt_generation_enabled === false ? true : false })}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${schedulerConfig.prompt_generation_enabled !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${schedulerConfig.prompt_generation_enabled !== false ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            
            <div className={`space-y-6 transition-opacity ${schedulerConfig.prompt_generation_enabled === false ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Base Image Prompt (Sent to Gemini 3.8 Flash)</label>
                <textarea 
                  value={schedulerConfig.base_image_prompt || ''}
                  onChange={(e) => updateSchedulerConfig({ ...schedulerConfig, base_image_prompt: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm transition-shadow resize-none"
                  placeholder="E.g., Generate an aesthetic image for..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Base Video Prompt (Sent to Gemini 3.8 Flash)</label>
                <textarea 
                  value={schedulerConfig.base_video_prompt || ''}
                  onChange={(e) => updateSchedulerConfig({ ...schedulerConfig, base_video_prompt: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-sm transition-shadow resize-none"
                  placeholder="E.g., Generate a 5s video panning across..."
                />
              </div>
            </div>

            <h2 className="text-xl font-bold mb-6 mt-10 text-slate-700 flex items-center gap-2">
              Platform Caption Templates
            </h2>
            <p className="text-xs text-slate-500 mb-4 flex items-start gap-1">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              You can use {"{title}"} and {"{url}"} as placeholders. They will be automatically replaced with the product's actual title and link.
            </p>

            <div className={`space-y-6 transition-opacity ${schedulerConfig.prompt_generation_enabled === false ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <label className="block text-sm font-semibold text-red-600 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  YouTube Shorts Caption
                </label>
                <textarea 
                  value={schedulerConfig.youtube_caption || ''}
                  onChange={(e) => updateSchedulerConfig({ ...schedulerConfig, youtube_caption: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 text-sm transition-shadow resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-blue-600 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook Reels Caption
                </label>
                <textarea 
                  value={schedulerConfig.facebook_caption || ''}
                  onChange={(e) => updateSchedulerConfig({ ...schedulerConfig, facebook_caption: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm transition-shadow resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-pink-600 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                  Instagram Reels Caption
                </label>
                <textarea 
                  value={schedulerConfig.instagram_caption || ''}
                  onChange={(e) => updateSchedulerConfig({ ...schedulerConfig, instagram_caption: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 text-sm transition-shadow resize-none"
                />
              </div>
            </div>
          </div>

          {/* History Column */}
          <div className="lg:col-span-7 bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-slate-900">Social Media History</h3>
                <button onClick={fetchHistory} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
             </div>
             
             <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
               {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 py-12">
                    <svg className="w-16 h-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    <p className="font-medium">No posts scheduled yet.</p>
                  </div>
               ) : (
                  <div className="space-y-4">
                     {history.map((post) => {
                        const isPending = post.status === 'PENDING';
                        const isCancelled = post.status === 'CANCELLED';
                        const isIgProcessing = post.status === 'IG_PROCESSING';
                        
                        return (
                          <div key={post.id} className="group flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                            <div className="flex flex-col mb-3 sm:mb-0">
                              <span className="font-bold text-slate-800 text-lg truncate max-w-[200px] sm:max-w-xs" title={post.blobName}>{post.blobName}</span>
                              <span className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                {new Date(post.scheduleTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                              <div className="flex gap-2 mt-2">
                                {post.platforms?.map((p: string) => {
                                  const link = post.links?.[p.toLowerCase()];
                                  return link ? (
                                    <a key={p} href={link} target="_blank" rel="noreferrer" className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-2 py-0.5 rounded-md shadow-sm transition-colors flex items-center gap-1">
                                      {p} <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                    </a>
                                  ) : (
                                    <span key={p} className="text-xs font-semibold uppercase tracking-wider text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-sm">
                                      {p}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                              <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm ${
                                post.status === 'POSTED' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                isPending ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                isIgProcessing ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                'bg-slate-200 text-slate-500 border border-slate-300'
                              }`}>
                                {isIgProcessing ? 'Processing IG' : post.status}
                              </span>
                              
                              {isPending && (
                                <button 
                                  onClick={() => handleCancel(post.id)}
                                  className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors border border-red-100 shadow-sm"
                                  title="Cancel Post"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              )}
                            </div>
                          </div>
                        )
                     })}
                  </div>
               )}
             </div>
          </div>
        </div>

        {/* Meesho Database Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
          <div className="lg:col-span-5 bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col">
            
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
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${isConnected ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <span className="text-sm font-semibold text-slate-700">API Link</span>
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                </div>
                <div className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${cfUrl ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <span className="text-sm font-semibold text-slate-700">Cloudflare</span>
                  <div className={`w-3 h-3 rounded-full ${cfUrl ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                </div>
                <div className={`p-3 rounded-xl border flex flex-col justify-center transition-colors ${isBlueStacksRunning ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Pixel 8 Emulator</span>
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

            <div className={`mt-8 ${actionStartTime ? 'mt-4' : ''}`}>
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
                {logs.split('\n').map((line, i) => (
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

          <div className="lg:col-span-7 bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col">
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

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[500px]">
              {displayedProducts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                  <p className="font-medium">No products found. Enter CF URL or run extraction.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedProducts.map((p: any) => (
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
                      <div className="flex items-center gap-2 ml-2">
                        <input 
                          type="checkbox"
                          checked={p.video_created === 1}
                          onChange={() => toggleVideoStatus(p.id, p.video_created)}
                          className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className={`text-sm font-bold ${p.video_created === 1 ? 'text-emerald-500' : 'text-slate-400'}`}>
                          {p.video_created === 1 ? 'Done' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
