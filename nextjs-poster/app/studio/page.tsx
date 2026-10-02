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
        
        <div className="text-center md:text-left md:flex md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 flex items-center justify-center md:justify-start gap-3">
              <span className="bg-gradient-to-br from-indigo-500 to-purple-600 bg-clip-text text-transparent">AI Content</span> Studio
            </h1>
            <p className="mt-2 text-lg text-slate-500">Autonomously generate cinematic AI prompts and videos.</p>
          </div>
        </div>

        <AiStudio products={products} schedulerConfig={schedulerConfig} />

        <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="flex items-center justify-between mb-6">
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
      </div>
    </main>
  );
}
