'use client';

import { useState, useRef } from 'react';
import { upload } from '@vercel/blob/client';

export default function AiStudio({ products, schedulerConfig }: { products: any[], schedulerConfig: any }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  
  const [modelPhoto, setModelPhoto] = useState<File | null>(null);
  const [modelPhotoUrl, setModelPhotoUrl] = useState<string>('');
  
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string>('');
  const [videoPrompt, setVideoPrompt] = useState<string>('');
  const [generatedVideo, setGeneratedVideo] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{type: string, message: string} | null>(null);

  // Webhook settings
  const [googleFlowWebhook, setGoogleFlowWebhook] = useState<string>(
    typeof window !== 'undefined' ? localStorage.getItem('googleFlowWebhook') || '' : ''
  );

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
      
      // Save to DB
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

  const generateImagePrompt = async () => {
    if (!selectedProduct || !selectedProduct.image_url) {
      return setStatus({ type: 'error', message: 'Please select a product that has an image.' });
    }
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Generating image prompt via Gemini 1.5 Flash...' });
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: schedulerConfig.base_image_prompt || 'Describe this product for AI image generation.',
          imageUrl: selectedProduct.image_url,
          model: 'gemini-1.5-flash-8b'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setImagePrompt(data.text);
      
      // Save to DB
      await fetch('/api/db/products/update-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedProduct.id, image_prompt: data.text })
      });
      
      setStatus({ type: 'success', message: 'Image prompt generated and saved!' });
    } catch (e: any) {
      setStatus({ type: 'error', message: `Generation failed: ${e.message}` });
    }
    setIsLoading(false);
  };

  const triggerGoogleFlowForImage = async () => {
    if (!googleFlowWebhook) return setStatus({ type: 'error', message: 'Please set Google Flow Webhook URL first.' });
    if (!imagePrompt || !modelPhotoUrl || !selectedProduct?.image_url) {
      return setStatus({ type: 'error', message: 'Missing Image Prompt, Model Photo, or Product Photo.' });
    }
    
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Sending request to Google Flow...' });
    
    // Save webhook for convenience
    localStorage.setItem('googleFlowWebhook', googleFlowWebhook);

    try {
      const res = await fetch(googleFlowWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_image',
          image_prompt: imagePrompt,
          model_photo: modelPhotoUrl,
          product_photo: selectedProduct.image_url
        })
      });
      
      const data = await res.json();
      if (data.generated_image_url) {
        setGeneratedImage(data.generated_image_url);
        setStatus({ type: 'success', message: 'Image generated successfully!' });
      } else {
        setStatus({ type: 'success', message: 'Sent to flow! Please paste the generated image URL below when ready.' });
      }
    } catch (e: any) {
      setStatus({ type: 'error', message: `Flow trigger failed: ${e.message}` });
    }
    setIsLoading(false);
  };

  const generateVideoPrompt = async () => {
    if (!generatedImage) return setStatus({ type: 'error', message: 'Please generate or provide the final image first.' });
    
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Generating video prompt via Gemini 1.5 Flash...' });
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: schedulerConfig.base_video_prompt || 'Write a video prompt for this image.',
          imageUrl: generatedImage,
          model: 'gemini-1.5-flash-8b'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setVideoPrompt(data.text);
      
      if (selectedProduct) {
        await fetch('/api/db/products/update-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedProduct.id, video_prompt: data.text })
        });
      }
      
      setStatus({ type: 'success', message: 'Video prompt generated and saved!' });
    } catch (e: any) {
      setStatus({ type: 'error', message: `Generation failed: ${e.message}` });
    }
    setIsLoading(false);
  };
  
  const triggerGoogleFlowForVideo = async () => {
    if (!googleFlowWebhook) return setStatus({ type: 'error', message: 'Please set Google Flow Webhook URL first.' });
    if (!videoPrompt || !generatedImage) {
      return setStatus({ type: 'error', message: 'Missing Video Prompt or Generated Image.' });
    }
    
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Sending video request to Google Flow...' });
    try {
      const res = await fetch(googleFlowWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_video',
          video_prompt: videoPrompt,
          generated_image: generatedImage
        })
      });
      
      const data = await res.json();
      if (data.generated_video_url) {
        setGeneratedVideo(data.generated_video_url);
        setStatus({ type: 'success', message: 'Video generated successfully!' });
      } else {
        setStatus({ type: 'success', message: 'Sent to flow! Video generation in progress.' });
      }
    } catch (e: any) {
      setStatus({ type: 'error', message: `Flow trigger failed: ${e.message}` });
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
        
        {/* Step 1 & 2: Selection */}
        <div className="space-y-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
          <h3 className="text-lg font-bold text-slate-700">1. Select Product & Model</h3>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Category</label>
            <select 
              className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              value={selectedCategory}
              onChange={e => { setSelectedCategory(e.target.value); setSelectedProductId(''); }}
            >
              <option value="">-- Select Category --</option>
              {categories.map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Top Product</label>
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

        {/* Step 3: Image Generation */}
        <div className="space-y-6 bg-indigo-50 p-6 rounded-xl border border-indigo-200">
          <h3 className="text-lg font-bold text-indigo-900">2. Generate Image</h3>
          
          <button 
            onClick={generateImagePrompt}
            disabled={!selectedProduct || isLoading}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            🧠 Generate Image Prompt (Gemini Flash)
          </button>
          
          {imagePrompt && (
            <div>
              <label className="block text-sm font-bold text-indigo-900 mb-2">Generated Image Prompt</label>
              <textarea 
                className="w-full p-3 border border-indigo-300 rounded-lg h-32 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={imagePrompt}
                onChange={e => setImagePrompt(e.target.value)}
              />
            </div>
          )}

          <div className="pt-4 border-t border-indigo-200">
            <label className="block text-sm font-bold text-indigo-900 mb-2">Google Flow Webhook URL</label>
            <input 
              type="text" 
              placeholder="https://hook.make.com/..."
              value={googleFlowWebhook}
              onChange={e => setGoogleFlowWebhook(e.target.value)}
              className="w-full p-2 border border-indigo-300 rounded-lg mb-4 text-sm"
            />
            
            <button 
              onClick={triggerGoogleFlowForImage}
              disabled={!imagePrompt || !modelPhotoUrl || isLoading}
              className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              🚀 Send to Google Flow (Image Gen)
            </button>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-indigo-900 mb-2">Final Generated Image URL</label>
            <input 
              type="text" 
              placeholder="Paste generated image URL here if not auto-filled..."
              value={generatedImage}
              onChange={e => setGeneratedImage(e.target.value)}
              className="w-full p-2 border border-indigo-300 rounded-lg text-sm"
            />
            {generatedImage && <img src={generatedImage} alt="Generated" className="mt-4 w-full h-auto rounded-lg shadow" />}
          </div>
        </div>

        {/* Step 4: Video Generation */}
        <div className="space-y-6 bg-purple-50 p-6 rounded-xl border border-purple-200 md:col-span-2">
          <h3 className="text-lg font-bold text-purple-900">3. Generate Video</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <button 
                onClick={generateVideoPrompt}
                disabled={!generatedImage || isLoading}
                className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 transition-colors mb-4"
              >
                🧠 Generate Video Prompt (Gemini Flash)
              </button>
              
              {videoPrompt && (
                <textarea 
                  className="w-full p-3 border border-purple-300 rounded-lg h-32 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  value={videoPrompt}
                  onChange={e => setVideoPrompt(e.target.value)}
                />
              )}
            </div>
            
            <div>
              <button 
                onClick={triggerGoogleFlowForVideo}
                disabled={!videoPrompt || !generatedImage || isLoading}
                className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors mb-4"
              >
                🎥 Send to Google Flow (Video Gen)
              </button>
              
              <label className="block text-sm font-bold text-purple-900 mb-2">Final Generated Video URL</label>
              <input 
                type="text" 
                placeholder="Paste generated video URL here if not auto-filled..."
                value={generatedVideo}
                onChange={e => setGeneratedVideo(e.target.value)}
                className="w-full p-2 border border-purple-300 rounded-lg text-sm"
              />
              {generatedVideo && (
                <video src={generatedVideo} controls className="mt-4 w-full rounded-lg shadow border border-purple-200" />
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
