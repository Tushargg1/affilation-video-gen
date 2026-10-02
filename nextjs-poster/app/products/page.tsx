'use client';

import { useEffect, useState } from 'react';

export default function ProductsGallery() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  if (loading) {
    return <div className="text-center p-12 text-slate-500">Loading products gallery...</div>;
  }

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

      <div className="grid grid-cols-1 gap-8">
        {products.map((product) => (
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
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-900">Image Prompt</h4>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                      {product.image_prompt || <span className="italic text-slate-400">No image prompt generated yet.</span>}
                    </p>
                  </div>
                  
                  <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-100 shadow-inner h-full hover:bg-white/80 transition-colors duration-300">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-600 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-purple-900">Video Prompt</h4>
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
                  {product.video_url ? (
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
                  {product.video_url && (
                    <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md border border-white/10 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                      OUTPUT MEDIA
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        ))}
        
        {products.length === 0 && (
          <div className="text-center p-16 bg-white/50 backdrop-blur-sm rounded-3xl border border-dashed border-slate-300">
            <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900">No products found</h3>
            <p className="text-slate-500 mt-2 max-w-md mx-auto">Start by connecting your database and running the prompt generation in the dashboard.</p>
          </div>
        )}
      </div>
    </div>
  );
}
