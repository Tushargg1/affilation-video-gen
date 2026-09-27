'use client';

import { useEffect, useState, useRef } from 'react';

export default function Home() {
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [logs, setLogs] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [keyword, setKeyword] = useState('kurti');
  const [skipZero, setSkipZero] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [hideProcessed, setHideProcessed] = useState(false);
  
  const logRef = useRef<HTMLDivElement>(null);

  const getApiUrl = (path: string) => {
    // If NEXT_PUBLIC_API_URL is defined (e.g. on Vercel), use it. Otherwise use relative paths (local).
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    return `${baseUrl}${path}`;
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(getApiUrl('/api/products'));
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      // Ignored
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(getApiUrl('/api/logs'));
      const data = await res.json();
      setLogs(data.logs || '');
    } catch {
      // Ignored
    }
  };

  const startAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRunning(true);
    try {
      await fetch(getApiUrl('/api/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, skipZero })
      });
    } catch {
      // Ignored
    }
  };

  const stopAutomation = async () => {
    setIsRunning(false);
    try {
      await fetch(getApiUrl('/api/stop'), { method: 'POST' });
    } catch {
      // Ignored
    }
  };
  
  const toggleVideoStatus = async (id: number, currentStatus: number) => {
    const newStatus = currentStatus ? 0 : 1;
    setProducts(products.map(p => p.id === id ? { ...p, video_created: newStatus } : p));
    try {
      await fetch(getApiUrl('/api/products/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, video_created: newStatus === 1 })
      });
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchLogs();
    const interval = setInterval(() => {
      fetchProducts();
      fetchLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const categories = ['All', ...Array.from(new Set(products.map(p => (p.category as string) || 'Uncategorized').filter(c => c)))];

  const displayedProducts = products
    .filter(p => !hideProcessed || p.video_created !== 1)
    .filter(p => selectedCategory === 'All' || ((p.category as string) || 'Uncategorized') === selectedCategory)
    .filter(p => ((p.title as string) || '').toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'priceAsc') return parseFloat(a.price as string) - parseFloat(b.price as string);
      if (sortBy === 'priceDesc') return parseFloat(b.price as string) - parseFloat(a.price as string);
      if (sortBy === 'commDesc') return parseFloat(b.commission_percent as string) - parseFloat(a.commission_percent as string);
      return 0;
    });

  return (
    <div className="app-container">
      {/* Cloudflare Banner */}
      <div className="cf-banner">
        <div className="cf-banner-text">
          🌐 Mobile Access Tunnel
          <span style={{display: 'block', color: '#64748b', fontSize: '0.8rem', fontWeight: 400, marginTop: '2px'}}>
            Copy the .trycloudflare.com link from your launcher terminal to access this on your phone.
          </span>
        </div>
        <a href="#" className="cf-link" onClick={(e) => { e.preventDefault(); alert('Please check the terminal window where you ran start_dashboard.bat to find your unique Cloudflare URL.'); }}>
          Get Mobile Link
        </a>
      </div>

      <div className="grid-layout">
        {/* Left Column: Automation Controls & Logs */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div>
            <h1>Antigravity Auto-Poster</h1>
            <p className="subtitle">Schedule once, publish everywhere automatically.</p>
          </div>
          
          <h2 style={{marginTop: '1rem'}}>Automation Settings</h2>
          <form className="space-y-6" onSubmit={startAutomation}>
            <div className="form-group">
              <label className="form-label">Search Keyword</label>
              <input 
                type="text" 
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="input-field"
                placeholder="e.g. kurti, smart watch..."
                disabled={isRunning}
                required
              />
            </div>
            
            <div className="form-group">
              <label className="toggle-label">
                <input 
                  type="checkbox" 
                  checked={skipZero}
                  onChange={(e) => setSkipZero(e.target.checked)}
                  disabled={isRunning}
                  style={{width: '18px', height: '18px'}}
                />
                Skip 0% Commission Products
              </label>
            </div>
            
            <div className="form-group" style={{marginTop: '2rem'}}>
              {!isRunning ? (
                <button type="submit" className="btn-primary">
                  ▶ Start Extraction
                </button>
              ) : (
                <button type="button" className="btn-primary btn-stop" onClick={stopAutomation}>
                  ⏹ Stop Automation
                </button>
              )}
            </div>
          </form>

          {/* Terminal */}
          <div className="terminal-card" ref={logRef}>
            {logs.split('\n').map((line, i) => (
              <div key={i} className="terminal-line">{line}</div>
            ))}
            {logs.length === 0 && <div style={{opacity: 0.5}}>Waiting for logs...</div>}
          </div>
        </div>

        {/* Right Column: Database & Products */}
        <div className="card">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
            <h2>Product Database ({displayedProducts.length})</h2>
          </div>

          <div className="form-group">
            <input 
              type="text" 
              placeholder="Search extracted products..." 
              className="input-field"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filters-row">
            <select className="input-field" style={{width: 'auto', padding: '0.5rem 1rem'}} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="newest">Newest First</option>
              <option value="priceAsc">Price: Low to High</option>
              <option value="priceDesc">Price: High to Low</option>
              <option value="commDesc">Commission: High to Low</option>
            </select>
            
            <label className="toggle-label" style={{marginLeft: 'auto'}}>
              <input 
                type="checkbox" 
                checked={hideProcessed} 
                onChange={e => setHideProcessed(e.target.checked)}
                style={{width: '16px', height: '16px'}}
              />
              Hide Created Videos
            </label>
          </div>

          <div className="filters-row">
            {categories.map(cat => (
              <button 
                key={cat} 
                className={`filter-pill ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="product-list custom-scrollbar">
            {displayedProducts.length === 0 ? (
              <div style={{textAlign: 'center', padding: '3rem', color: '#94a3b8'}}>
                No products match your criteria.
              </div>
            ) : (
              displayedProducts.map((p: any) => (
                <div key={p.id} className="product-item">
                  <div className="product-info">
                    <div className="product-title">{p.title}</div>
                    <div className="product-meta">
                      <span className="product-price">₹{p.price}</span>
                      <span>Comm: {p.commission_percent}%</span>
                      <a href={p.product_url} target="_blank" rel="noreferrer" style={{color: '#4f46e5', textDecoration: 'none'}}>View Link ↗</a>
                    </div>
                  </div>
                  <div className="checkbox-wrapper">
                    <input 
                      type="checkbox"
                      checked={p.video_created === 1}
                      onChange={() => toggleVideoStatus(p.id, p.video_created)}
                      style={{width: '20px', height: '20px', cursor: 'pointer', accentColor: '#4f46e5'}}
                    />
                    <span style={{fontSize: '0.875rem', fontWeight: 600, color: p.video_created === 1 ? '#10b981' : '#64748b'}}>
                      {p.video_created === 1 ? 'Done' : 'Pending'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
