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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Products Gallery</h1>
        <p className="text-slate-500">View full generation history, prompts, and generated media for all products.</p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                
                {/* Product Original Image & Info */}
                <div className="md:w-1/4 shrink-0 flex flex-col items-center">
                  <img 
                    src={product.image_url || 'https://via.placeholder.com/300'} 
                    alt={product.title}
                    className="w-full h-auto object-cover rounded-lg shadow-sm mb-4"
                  />
                  <div className="w-full">
                    <h3 className="font-semibold text-slate-800 line-clamp-2" title={product.title}>
                      {product.title}
                    </h3>
                    <div className="text-sm font-medium text-emerald-600 mt-1">₹{product.price}</div>
                    
                    {product.used_model && (
                      <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-100">
                        🤖 {product.used_model}
                      </div>
                    )}
                  </div>
                </div>

                {/* Prompts Section */}
                <div className="md:w-2/4 flex flex-col gap-4">
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 h-full">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Image Prompt</h4>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                      {product.image_prompt || <span className="italic text-slate-400">No image prompt generated yet.</span>}
                    </p>
                  </div>
                  
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 h-full">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Video Prompt</h4>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                      {product.video_prompt || <span className="italic text-slate-400">No video prompt generated yet.</span>}
                    </p>
                  </div>
                  
                  {product.updated_at && (
                    <div className="text-xs text-slate-400 flex items-center mt-auto pt-2">
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      Last updated: {new Date(product.updated_at).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Generated Media Section */}
                <div className="md:w-1/4 shrink-0 flex flex-col items-center justify-center bg-slate-100 rounded-lg border border-slate-200 overflow-hidden relative min-h-[250px]">
                  {product.video_url ? (
                    product.video_url.endsWith('.mp4') ? (
                      <video src={product.video_url} controls className="w-full h-full object-contain bg-black" />
                    ) : (
                      <img src={product.video_url} alt="Generated Media" className="w-full h-full object-contain" />
                    )
                  ) : (
                    <div className="text-center p-4">
                      <div className="text-4xl mb-2">⏳</div>
                      <div className="text-sm font-medium text-slate-500">No media generated yet</div>
                      <div className="text-xs text-slate-400 mt-1">Awaiting automation...</div>
                    </div>
                  )}
                  {product.video_url && (
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm">
                      Generated Media
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        ))}
        
        {products.length === 0 && (
          <div className="text-center p-12 bg-white rounded-xl border border-dashed border-slate-300">
            <h3 className="text-lg font-medium text-slate-900">No products found</h3>
            <p className="text-slate-500 mt-1">Start by adding products in the dashboard.</p>
          </div>
        )}
      </div>
    </div>
  );
}
