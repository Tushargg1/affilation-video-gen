'use client';

import { useState, useRef } from 'react';
import { upload } from '@vercel/blob/client';

export default function AiStudio({ products, schedulerConfig }: { products: any[], schedulerConfig: any }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  
  const [modelPhoto, setModelPhoto] = useState<File | null>(null);
  const [modelPhotoUrl, setModelPhotoUrl] = useState<string>('');
  
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [videoPrompt, setVideoPrompt] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{type: string, message: string} | null>(null);

  const categories = Array.from(new Set(products.map(p => p.category || 'Uncategorized').filter(Boolean)));
  const categoryProducts = products.filter(p => (p.category || 'Uncategorized') === selectedCategory);
  const selectedProduct = products.find(p => p.id === selectedProductId);

  // Update existing product if it already has prompts in DB
  const handleProductSelect = (id: number) => {
    setSelectedProductId(id);
    const p = products.find(prod => prod.id === id);
    if (p) {
      setImagePrompt(p.image_prompt || '');
      setVideoPrompt(p.video_prompt || '');
      setModelPhotoUrl(p.model_photo_url || '');
    }
  };

  const handleUploadPhoto = async () => {
    if (!modelPhoto) return;
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Uploading model photo...' });
    try {
      const newBlob = await upload(modelPhoto.name, modelPhoto, {
        access: 'public',
        handleUploadUrl: '/api/upload'
      });
      setModelPhotoUrl(newBlob.url);
      
      if (selectedProductId) {
        await fetch('/api/db/products/update-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedProductId, model_photo_url: newBlob.url })
        });
      }
      setStatus({ type: 'success', message: 'Model photo uploaded successfully!' });
    } catch (e: any) {
      setStatus({ type: 'error', message: `Upload failed: ${e.message}` });
    }
    setIsLoading(false);
  };

  const generatePrompts = async () => {
    if (!selectedProduct || !selectedProduct.image_url) {
      return setStatus({ type: 'error', message: 'Please select a product that has an image.' });
    }
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Generating Image & Video prompts via Gemini 1.5 Flash...' });
    
    try {
      // Generate Image Prompt
      const imgRes = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: schedulerConfig.base_image_prompt || 'Describe this product for AI image generation.',
          imageUrl: selectedProduct.image_url,
          model: 'gemini-1.5-flash-8b'
        })
      });
      const imgData = await imgRes.json();
      if (!imgRes.ok) throw new Error(imgData.error);
      setImagePrompt(imgData.text);

      // Generate Video Prompt
      const vidRes = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: schedulerConfig.base_video_prompt || 'Write a video prompt for this product.',
          imageUrl: selectedProduct.image_url,
          model: 'gemini-1.5-flash-8b'
        })
      });
      const vidData = await vidRes.json();
      if (!vidRes.ok) throw new Error(vidData.error);
      setVideoPrompt(vidData.text);
      
      // Save both to DB
      await fetch('/api/db/products/update-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: selectedProduct.id, 
          image_prompt: imgData.text,
          video_prompt: vidData.text
        })
      });
      
      setStatus({ type: 'success', message: 'Both prompts generated and saved successfully!' });
    } catch (e: any) {
      setStatus({ type: 'error', message: `Generation failed: ${e.message}` });
    }
    setIsLoading(false);
  };

  return (
    <div className="bg-white rounded-xl shadow p-6 mb-8 border border-indigo-100">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <span>✨</span> AI Content Studio
      </h2>
      
      {status && (
        <div className={`p-4 rounded-lg mb-6 ${status.type === 'error' ? 'bg-red-50 text-red-700' : status.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Step 1: Selection */}
        <div className="space-y-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
          <h3 className="text-lg font-bold text-slate-700">1. Select Product</h3>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Category</label>
            <select 
              className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              value={selectedCategory}
              onChange={e => {
                const cat = e.target.value;
                setSelectedCategory(cat);
                const firstProduct = products.find(p => (p.category || 'Uncategorized') === cat);
                if (firstProduct) {
                  handleProductSelect(firstProduct.id);
                } else {
                  setSelectedProductId('');
                }
              }}
            >
              <option value="">-- Select Category --</option>
              {categories.map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Product</label>
            <select 
              className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              value={selectedProductId}
              onChange={e => handleProductSelect(Number(e.target.value))}
              disabled={!selectedCategory}
            >
              <option value="">-- Select Product --</option>
              {categoryProducts.map(p => (
                <option key={p.id} value={p.id}>{p.title} (₹{p.price})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Upload Model Photo</label>
            <div className="flex gap-2">
              <input 
                type="file" 
                accept="image/*"
                onChange={e => setModelPhoto(e.target.files?.[0] || null)}
                className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-white"
              />
              <button 
                onClick={handleUploadPhoto}
                disabled={!modelPhoto || isLoading}
                className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-700 disabled:opacity-50"
              >
                Upload
              </button>
            </div>
            {modelPhotoUrl && <img src={modelPhotoUrl} alt="Model" className="mt-4 w-32 h-32 object-cover rounded-lg border-2 border-indigo-200" />}
          </div>
        </div>

        {/* Step 2: Generation */}
        <div className="space-y-6 bg-indigo-50 p-6 rounded-xl border border-indigo-200">
          <h3 className="text-lg font-bold text-indigo-900">2. Generate Prompts for Extension</h3>
          
          <button 
            onClick={generatePrompts}
            disabled={!selectedProduct || isLoading}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            🧠 Generate Image & Video Prompts
          </button>
          
          {imagePrompt && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-bold text-indigo-900">Generated Image Prompt</label>
                <button onClick={() => navigator.clipboard.writeText(imagePrompt)} className="text-xs bg-indigo-200 text-indigo-800 px-2 py-1 rounded hover:bg-indigo-300">Copy</button>
              </div>
              <textarea 
                className="w-full p-3 border border-indigo-300 rounded-lg h-32 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={imagePrompt}
                onChange={e => setImagePrompt(e.target.value)}
              />
            </div>
          )}

          {videoPrompt && (
            <div className="pt-2">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-bold text-purple-900">Generated Video Prompt</label>
                <button onClick={() => navigator.clipboard.writeText(videoPrompt)} className="text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded hover:bg-purple-300">Copy</button>
              </div>
              <textarea 
                className="w-full p-3 border border-purple-300 rounded-lg h-32 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                value={videoPrompt}
                onChange={e => setVideoPrompt(e.target.value)}
              />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
