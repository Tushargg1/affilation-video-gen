'use client';

import { useEffect, useState } from 'react';

export default function ProductsGallery() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  const fetchProducts = () => {
    fetch('/api/db/products')
      .then(res => res.json())
      .then(data => {
        if (data.products) {
          setProducts(data.products);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleToggle = async (id: number, field: 'is_posted' | 'is_affiliated', currentValue: boolean) => {
    let social_link_1 = '';
    let social_link_2 = '';
    
    if (field === 'is_posted' && !currentValue) {
      // User is checking the "Posted on Socials" box
      const fbLink = prompt("Enter Facebook Post Link:");
      if (fbLink === null) return; // User cancelled
      const igLink = prompt("Enter Instagram Post Link:");
      if (igLink === null) return; // User cancelled
      
      social_link_1 = fbLink;
      social_link_2 = igLink;
    }

    const payload: any = { id, [field]: !currentValue };
    if (field === 'is_posted' && !currentValue) {
      payload.social_link_1 = social_link_1;
      payload.social_link_2 = social_link_2;
    }
    
    // Optimistic UI update
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, [field]: !currentValue };
        if (field === 'is_posted' && !currentValue) {
          updated.image_url = social_link_1;
          updated.video_url = social_link_2;
        }
        return updated;
      }
      return p;
    }));
    
    try {
      await fetch('/api/db/products/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch(e) {
      console.error(e);
      // Revert on error
      fetchProducts(); // Re-fetch to guarantee sync on error
    }
  };

  const handleDeletePrompt = async (id: number, field: 'image_prompt' | 'video_prompt') => {
    const label = field === 'image_prompt' ? 'Image Prompt' : 'Video Prompt';
    if (!confirm(`Delete the ${label} for this product? The automation will regenerate it next run.`)) return;

    // Optimistic UI update
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: null } : p));

    try {
      await fetch('/api/db/products/update-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, [field]: null })
      });
    } catch(e) {
      console.error(e);
      fetchProducts();
    }
  };

  const tabs = [
    { id: 'ALL', label: 'All Products' },
    { id: 'JUST_EXTRACTED', label: 'Just Extracted' },
    { id: 'IMG_PROMPT', label: 'Img Prompt' },
    { id: 'VID_PROMPT', label: 'Vid Prompt' },
    { id: 'IMG_GEN', label: 'Img Generated' },
    { id: 'VID_GEN', label: 'Vid Generated' },
    { id: 'POSTED', label: 'Posted' },
    { id: 'AFFILIATED', label: 'Affiliated' }
  ];

  const filteredProducts = products.filter(p => {
    if (filter === 'ALL') return true;
    if (filter === 'JUST_EXTRACTED') return !p.image_prompt && !p.video_prompt && !p.video_url;
    if (filter === 'IMG_PROMPT') return !!p.image_prompt;
    if (filter === 'VID_PROMPT') return !!p.video_prompt;
    if (filter === 'IMG_GEN') return p.video_url && !p.video_url.endsWith('.mp4');
    if (filter === 'VID_GEN') return p.video_url && p.video_url.endsWith('.mp4');
    if (filter === 'POSTED') return !!p.is_posted;
    if (filter === 'AFFILIATED') return !!p.is_affiliated;
    return true;
  });


  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl bg-white p-8 border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-3xl">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
        <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 tracking-tight mb-3 relative z-10">
          Products Gallery
        </h1>
        <p className="text-slate-500 font-medium text-lg relative z-10">
          View full generation history, AI prompts, and beautiful generated media.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8 sticky top-0 z-20 bg-slate-50/80 backdrop-blur-md p-3 rounded-2xl border border-slate-200/60 shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 shadow-sm
              ${filter === tab.id 
                ? 'bg-slate-900 text-white shadow-md scale-105' 
                : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-24 bg-white/50 backdrop-blur-sm rounded-3xl border border-dashed border-slate-300">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
          <p className="text-slate-500 font-medium">Loading products gallery...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {filteredProducts.map((product) => (
          <div key={product.id} className="group relative bg-white/80 backdrop-blur-md rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/60 hover:shadow-[0_8px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 hover:border-indigo-100 transition-all duration-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            
            <div className="p-8 relative z-10">
              <div className="flex flex-col xl:flex-row gap-8">
                
                {/* Product Original Image & Info */}
                <div className="xl:w-1/4 shrink-0 flex flex-col items-center">
                  <div className="relative w-full rounded-2xl overflow-hidden shadow-md group-hover:shadow-lg transition-shadow duration-500 bg-white p-2">
                    <img 
                      src={product.image_url || 'https://via.placeholder.com/300'} 
                      alt={product.title}
                      className="w-full aspect-[4/5] object-cover rounded-xl"
                    />
                  </div>
                  <div className="w-full mt-5 text-center">
                    <h3 className="font-bold text-slate-800 line-clamp-2 text-lg leading-tight" title={product.title}>
                      {product.title}
                    </h3>
                    <div className="text-md font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600 mt-2">
                      ₹{product.price}
                    </div>
                    
                    {product.used_model && (
                      <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 text-xs font-bold tracking-wide border border-indigo-100/50 shadow-sm">
                        <span className="text-sm">✨</span> {product.used_model}
                      </div>
                    )}
                  </div>
                </div>

                {/* Prompts Section */}
                <div className="xl:w-2/4 flex flex-col gap-5">
                  <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-100 shadow-inner h-full hover:bg-white/80 transition-colors duration-300">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-900">Image Prompt</h4>
                      </div>
                      {product.image_prompt && (
                        <button
                          onClick={() => handleDeletePrompt(product.id, 'image_prompt')}
                          title="Delete Image Prompt"
                          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                      {product.image_prompt || <span className="italic text-slate-400">No image prompt generated yet.</span>}
                    </p>
                  </div>
                  
                  <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-100 shadow-inner h-full hover:bg-white/80 transition-colors duration-300">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-600 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </div>
                        <h4 className="text-xs font-bold uppercase tracking-widest text-purple-900">Video Prompt</h4>
                      </div>
                      {product.video_prompt && (
                        <button
                          onClick={() => handleDeletePrompt(product.id, 'video_prompt')}
                          title="Delete Video Prompt"
                          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                      {product.video_prompt || <span className="italic text-slate-400">No video prompt generated yet.</span>}
                    </p>
                  </div>
                  
                  {product.updated_at && (
                    <div className="text-xs font-medium text-slate-400 flex items-center mt-auto pt-2">
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      Generated on {new Date(product.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  )}
                </div>

                {/* Generated Media Section */}
                <div className="xl:w-1/4 shrink-0 flex flex-col items-center justify-center bg-slate-900 rounded-2xl overflow-hidden relative min-h-[300px] shadow-lg group-hover:shadow-2xl transition-shadow duration-500">
                  {product.is_posted ? (
                    <div className="flex flex-col gap-4 w-full p-6 text-center">
                      <div className="text-xl font-bold text-white mb-2">🎉 Posted Successfully!</div>
                      {product.image_url && product.image_url.startsWith('http') && (
                        <a href={product.image_url} target="_blank" rel="noreferrer" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" /></svg>
                          View Facebook Post
                        </a>
                      )}
                      {product.video_url && product.video_url.startsWith('http') && (
                        <a href={product.video_url} target="_blank" rel="noreferrer" className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
                          View Instagram Post
                        </a>
                      )}
                    </div>
                  ) : product.video_url ? (
                    product.video_url.endsWith('.mp4') ? (
                      <video src={product.video_url} controls className="w-full h-full object-cover" />
                    ) : (
                      <img src={product.video_url} alt="Generated Media" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="text-center p-6 flex flex-col items-center justify-center h-full w-full bg-gradient-to-b from-slate-800 to-slate-900">
                      <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 shadow-inner border border-slate-700">
                        <span className="text-2xl animate-pulse">⏳</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-300">Awaiting Automation</div>
                      <div className="text-xs text-slate-500 mt-2">Media will appear here automatically.</div>
                    </div>
                  )}
                  {product.video_url && !product.is_posted && (
                    <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md border border-white/10 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                      OUTPUT MEDIA
                    </div>
                  )}
                  
                  {/* Manual Ticks */}
                  <div className="absolute bottom-3 w-[90%] flex flex-col gap-2">
                    <label className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-2 rounded-lg cursor-pointer hover:bg-white/20 transition border border-white/10">
                      <input 
                        type="checkbox" 
                        checked={!!product.is_posted}
                        onChange={() => handleToggle(product.id, 'is_posted', !!product.is_posted)}
                        className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-white/20 border-white/30"
                      />
                      <span className="text-xs font-bold text-white shadow-sm">Posted on Socials</span>
                    </label>
                    <label className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-2 rounded-lg cursor-pointer hover:bg-white/20 transition border border-white/10">
                      <input 
                        type="checkbox" 
                        checked={!!product.is_affiliated}
                        onChange={() => handleToggle(product.id, 'is_affiliated', !!product.is_affiliated)}
                        className="w-4 h-4 rounded text-blue-500 focus:ring-blue-500 bg-white/20 border-white/30"
                      />
                      <span className="text-xs font-bold text-white shadow-sm">Affiliated Successfully</span>
                    </label>
                  </div>

                </div>

              </div>
            </div>
          </div>
        ))}
        
        {filteredProducts.length === 0 && (
          <div className="text-center p-16 bg-white/50 backdrop-blur-sm rounded-3xl border border-dashed border-slate-300">
            <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900">No products match this filter</h3>
            <p className="text-slate-500 mt-2 max-w-md mx-auto">Try selecting a different filter from the navigation above.</p>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
