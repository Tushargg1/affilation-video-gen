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

    // Poll Vercel for tunnel URL and History more frequently for live updates
    const vercelInterval = setInterval(() => {
      fetchHistory();
      syncTunnelUrl();
    }, 3000); 

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
    const catProducts = products.filter((p: any) => getDisplayCategory(p) === category);
    if (catProducts.length === 0) return;
    if (!confirm(`Delete all ${catProducts.length} products in category "${category}"?`)) return;
    
    const ids = catProducts.map((p: any) => p.id);
    setProducts(products.filter((p: any) => getDisplayCategory(p) !== category));
    
    setSelectedProducts(prev => {
      const next = new Set(prev);
      ids.forEach((id: any) => next.delete(id));
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

  // Helper: safely parse category - if it's JSON (social links), return 'Uncategorized'
  const getDisplayCategory = (p: any): string => {
    const cat = p.category;
    if (!cat) return 'Uncategorized';
    // If category is a JSON string (social links stored there), treat as Uncategorized
    if (cat.startsWith('{')) return 'Uncategorized';
    return cat;
  };

  const categories = ['All', ...Array.from(new Set(products.map((p: any) => getDisplayCategory(p)).filter((c: any) => c)))];
  const displayedProducts = products
    .filter((p: any) => !hideProcessed || p.video_created !== 1)
    .filter((p: any) => selectedCategory === 'All' || getDisplayCategory(p) === selectedCategory)
    .filter((p: any) => (p.title || '').toLowerCase().includes(searchQuery.toLowerCase()))
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

  const [isPostingNow, setIsPostingNow] = useState(false);

  const handlePostNow = async () => {
    setIsPostingNow(true);
    try {
      const res = await fetch('/api/post-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post now');
      alert(`Success: ${data.message}`);
      fetchHistory();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsPostingNow(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 lg:p-12 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="text-center md:text-left md:flex md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center md:justify-start gap-3">
              <span className="bg-gradient-to-br from-indigo-500 to-purple-600 bg-clip-text text-transparent">Auto-Poster</span> Schedule
            </h1>
            <p className="mt-2 text-lg text-slate-500">Schedule once, publish everywhere automatically.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
          {/* Form Column */}
          <div className="lg:col-span-5 bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Auto-Poster Settings
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
                  {schedulerConfig.schedule_times?.map((time: any, index: number) => (
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

            <div className="h-px bg-slate-200 w-full my-8"></div>

            <h2 className="text-xl font-bold mb-6 text-slate-700 flex items-center gap-2">
              Platform Caption Templates
            </h2>
            <p className="text-xs text-slate-500 mb-6 flex items-start gap-1">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              You can use {"{title}"}, {"{category}"} and {"{url}"} as placeholders. They will be automatically replaced with the product's actual title, category, and link.
            </p>

            <div className="space-y-6 transition-opacity">
              <div>
                <label className="block text-sm font-semibold text-red-600 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  YouTube Video Title
                </label>
                <textarea 
                  value={schedulerConfig.youtube_title_template || ''}
                  onChange={(e) => updateSchedulerConfig({ ...schedulerConfig, youtube_title_template: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 text-sm transition-shadow resize-none"
                />
              </div>

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
                <label className="block text-sm font-semibold text-blue-600 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  Facebook Image Caption
                </label>
                <textarea 
                  value={schedulerConfig.facebook_image_caption || ''}
                  onChange={(e) => updateSchedulerConfig({ ...schedulerConfig, facebook_image_caption: e.target.value })}
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

              <div>
                <label className="block text-sm font-semibold text-pink-600 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                  Instagram Photo Caption
                </label>
                <textarea 
                  value={schedulerConfig.instagram_image_caption || ''}
                  onChange={(e) => updateSchedulerConfig({ ...schedulerConfig, instagram_image_caption: e.target.value })}
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
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handlePostNow} 
                    disabled={isPostingNow}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {isPostingNow ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    )}
                    Post Now
                  </button>
                  <button onClick={fetchHistory} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                </div>
             </div>
             
             <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-[400px]">
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
                              {post.status === 'ERROR' && post.error && (
                                <div className="mt-3 text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100 flex items-start gap-1.5 max-w-sm">
                                  <svg className="w-4 h-4 flex-shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                  <span className="font-medium break-all">{post.error}</span>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                              <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm ${
                                post.status === 'POSTED' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                post.status === 'PARTIAL_SUCCESS' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                post.status === 'ERROR' ? 'bg-red-100 text-red-700 border border-red-200' :
                                isPending ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                isIgProcessing ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                'bg-slate-200 text-slate-500 border border-slate-300'
                              }`}>
                                {isIgProcessing ? 'Processing IG' : post.status === 'PARTIAL_SUCCESS' ? 'Partial Post' : post.status}
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
      </div>
    </main>
  );
}
