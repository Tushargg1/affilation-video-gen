'use client';

import { useState, useRef, useEffect } from 'react';
import { upload } from '@vercel/blob/client';

export default function AiStudio({ products, schedulerConfig }: { products: any[], schedulerConfig: any }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  
  // Load from localStorage on mount
  useEffect(() => {
    const savedCat = localStorage.getItem('ai_studio_category');
    const savedProdId = localStorage.getItem('ai_studio_product_id');
    if (savedCat) setSelectedCategory(savedCat);
    if (savedProdId) {
      const id = parseInt(savedProdId);
      setSelectedProductId(id);
      
      // Auto-load product data if it exists in DB
      const p = products.find(prod => prod.id === id);
      const globalPhoto = localStorage.getItem('global_model_photo');
      if (p) {
        setImagePrompt(p.image_prompt || '');
        setVideoPrompt(p.video_prompt || '');
        setModelPhotoUrl(p.model_photo_url || globalPhoto || '');
      } else if (globalPhoto) {
        setModelPhotoUrl(globalPhoto);
      }
    } else {
      const globalPhoto = localStorage.getItem('global_model_photo');
      if (globalPhoto) setModelPhotoUrl(globalPhoto);
    }
  }, [products]);

  // Save to localStorage when changed
  useEffect(() => {
    localStorage.setItem('ai_studio_category', selectedCategory);
    localStorage.setItem('ai_studio_product_id', selectedProductId.toString());
  }, [selectedCategory, selectedProductId]);
  
  const [modelPhoto, setModelPhoto] = useState<File | null>(null);
  const [modelPhotoUrl, setModelPhotoUrl] = useState<string>('');
  
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [videoPrompt, setVideoPrompt] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{type: string, message: string} | null>(null);
  
  const [isAutomating, setIsAutomating] = useState(false);
  const [automationLog, setAutomationLog] = useState<string[]>([]);

  const categories = Array.from(new Set(products.map(p => p.category || 'Uncategorized').filter(Boolean)));
  const categoryProducts = products.filter(p => (p.category || 'Uncategorized') === selectedCategory);
  const selectedProduct = products.find(p => p.id === selectedProductId);

  // Update existing product if it already has prompts in DB
  const handleProductSelect = (id: number) => {
    setSelectedProductId(id);
    const p = products.find(prod => prod.id === id);
    const globalPhoto = localStorage.getItem('global_model_photo');
    if (p) {
      setImagePrompt(p.image_prompt || '');
      setVideoPrompt(p.video_prompt || '');
      setModelPhotoUrl(p.model_photo_url || globalPhoto || '');
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
      localStorage.setItem('global_model_photo', newBlob.url);
      
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

  const [isSending, setIsSending] = useState(false);

  const sendToAutomation = async () => {
    if (!imagePrompt || !videoPrompt) {
      alert("Please generate prompts first.");
      return;
    }
    
    setIsSending(true);
    try {
      let imageBase64 = null;
      if (modelPhotoUrl) {
        // Convert the blob URL to base64
        const res = await fetch(modelPhotoUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        await new Promise((resolve) => {
          reader.onloadend = () => {
            imageBase64 = reader.result;
            resolve(true);
          };
          reader.readAsDataURL(blob);
        });
      }

      const response = await fetch('http://localhost:3001/api/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePrompt,
          videoPrompt,
          imageBase64
        })
      });

      if (response.ok) {
        alert('✅ Sent to Automation!\nThe extension will pick it up automatically within 5 seconds.');
      } else {
        alert('❌ Failed. Make sure the local server (node server.js) is running on port 3001.');
      }
    } catch (e) {
      alert('❌ Error: Could not connect to local server on port 3001.');
    }
    setIsSending(false);
  };

  const generatePrompts = async () => {
    if (!selectedProduct || !selectedProduct.image_url) {
      return setStatus({ type: 'error', message: 'Please select a product that has an image.' });
    }
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Generating Image & Video prompts via Gemini 3.8 Flash...' });
    
    try {
      // Generate BOTH Image and Video Prompts in a single request to save API limits
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `You are an expert AI prompt engineer. Analyze BOTH the attached product image and the attached model photo (if provided) and write TWO highly detailed prompts.

1. IMAGE PROMPT: ${schedulerConfig.base_image_prompt || `Write a highly detailed, professional text-to-image prompt to generate a stunning, cinematic, and photorealistic showcase of this product. Place the product in an aesthetic, premium environment that matches its vibe (e.g., a sleek studio, a cozy lifestyle setting). Include keywords like: 8k resolution, cinematic lighting, ultra-detailed, photorealistic, professional photography.`}

2. VIDEO PROMPT: ${schedulerConfig.base_video_prompt || `Write a highly detailed text-to-video prompt to create a stunning, high-converting product showcase video. The video must be exactly 10 seconds long. Focus on smooth, premium camera movements (e.g., slow cinematic pan, dynamic orbital shot, or elegant zoom). Describe the lighting as professional and cinematic. Highlight the product's textures and aesthetic appeal. Include keywords like: exactly 10 seconds, smooth 60fps motion, cinematic product showcase, highly detailed.`}

Return the output EXACTLY in this JSON format, with no markdown formatting, no backticks, and no introductory text:
{
  "imagePrompt": "your image prompt here",
  "videoPrompt": "your video prompt here"
}`,
          imageUrl: selectedProduct.image_url,
          modelImageUrl: modelPhotoUrl,
          model: 'gemini-3.8-flash'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      try {
        const parsed = JSON.parse(data.text);
        setImagePrompt(parsed.imagePrompt || data.text);
        setVideoPrompt(parsed.videoPrompt || data.text);
      } catch (parseError) {
        // Fallback if model fails to output valid JSON
        setImagePrompt(data.text);
        setVideoPrompt(data.text);
      }
      
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

  const runDailyAutomation = async () => {
    setIsAutomating(true);
    setAutomationLog([]);
    const log = (msg: string) => setAutomationLog(prev => [...prev, msg]);

    try {
      // 1. Find up to 4 products that don't have video_url
      const pendingProducts = products.filter(p => !p.video_url).slice(0, 4);
      if (pendingProducts.length === 0) {
        log("No pending products to process today!");
        setIsAutomating(false);
        return;
      }

      log(`Found ${pendingProducts.length} products to automate!`);

      for (const prod of pendingProducts) {
        log(`\n--- Starting Product: ${prod.title} ---`);
        
        let imgPrompt = prod.image_prompt;
        let vidPrompt = prod.video_prompt;
        
        if (!imgPrompt || !vidPrompt) {
          log('Generating prompts via Gemini (Single Request)...');
          // Generate BOTH Image and Video Prompts in a single request
          const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `You are an expert AI prompt engineer. Analyze BOTH the attached product image and the attached model photo (if provided) and write TWO highly detailed prompts.

1. IMAGE PROMPT: ${schedulerConfig.base_image_prompt || `Write a highly detailed, professional text-to-image prompt to generate a stunning, cinematic, and photorealistic showcase of this product. Place the product in an aesthetic, premium environment that matches its vibe (e.g., a sleek studio, a cozy lifestyle setting). Include keywords like: 8k resolution, cinematic lighting, ultra-detailed, photorealistic, professional photography.`}

2. VIDEO PROMPT: ${schedulerConfig.base_video_prompt || `Write a highly detailed text-to-video prompt to create a stunning, high-converting product showcase video. The video must be exactly 10 seconds long. Focus on smooth, premium camera movements (e.g., slow cinematic pan, dynamic orbital shot, or elegant zoom). Describe the lighting as professional and cinematic. Highlight the product's textures and aesthetic appeal. Include keywords like: exactly 10 seconds, smooth 60fps motion, cinematic product showcase, highly detailed.`}

Return the output EXACTLY in this JSON format, with no markdown formatting, no backticks, and no introductory text:
{
  "imagePrompt": "your image prompt here",
  "videoPrompt": "your video prompt here"
}`,
              imageUrl: prod.image_url,
              modelImageUrl: prod.model_photo_url || localStorage.getItem('global_model_photo'),
              model: 'gemini-3.8-flash'
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          
          try {
            const parsed = JSON.parse(data.text);
            imgPrompt = parsed.imagePrompt || data.text;
            vidPrompt = parsed.videoPrompt || data.text;
          } catch (parseError) {
            imgPrompt = data.text;
            vidPrompt = data.text;
          }

          // Save to DB
          await fetch('/api/db/products/update-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: prod.id, image_prompt: imgPrompt, video_prompt: vidPrompt })
          });
        }

        // Convert Product Photo URL to Base64 (for the extension)
        log('Converting product image to Base64...');
        let productImgBase64 = null;
        if (prod.image_url) {
          try {
            const res = await fetch(prod.image_url);
            const blob = await res.blob();
            productImgBase64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blob);
            });
          } catch(e) {
            log('Warning: Failed to fetch image_url directly (CORS?). Proceeding anyway.');
          }
        }

        // CLEAR any old result from the bridge first
        try { await fetch('http://localhost:3001/api/result'); } catch(e) {}

        // Send IMAGE job to extension
        log('Sending Image Job to extension...');
        try {
          await fetch('http://localhost:3001/api/job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePrompt: imgPrompt, videoPrompt: '', imageBase64: productImgBase64 })
          });
        } catch(e) {
          log('❌ Bridge server offline! Make sure node server.js is running on port 3001.');
          break;
        }

        // Poll for Image Job result
        log('Waiting for Image Generation... (Takes a few minutes)');
        let finalImageBase64 = null;
        while (true) {
          await new Promise(r => setTimeout(r, 5000));
          try {
            const res = await fetch('http://localhost:3001/api/result');
            if (res.ok) {
              const data = await res.json();
              if (data.hasResult) {
                log('✅ Image generation complete!');
                finalImageBase64 = data.result.mediaBase64;
                break;
              }
            }
          } catch(e) {
            // Ignore polling errors
          }
        }

        if (!finalImageBase64) {
          log('❌ Failed to get image from extension! Skipping product.');
          continue;
        }

        // CLEAR any old result
        try { await fetch('http://localhost:3001/api/result'); } catch(e) {}

        // Send VIDEO job to extension
        log('Sending Video Job to extension...');
        await fetch('http://localhost:3001/api/job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagePrompt: '', videoPrompt: vidPrompt, imageBase64: finalImageBase64 })
        });

        // Poll for Video Job result
        log('Waiting for Video Generation... (Takes a few minutes)');
        let finalVideoBase64 = null;
        while (true) {
          await new Promise(r => setTimeout(r, 5000));
          try {
            const res = await fetch('http://localhost:3001/api/result');
            if (res.ok) {
              const data = await res.json();
              if (data.hasResult) {
                log('✅ Video generation complete!');
                finalVideoBase64 = data.result.mediaBase64;
                break;
              }
            }
          } catch(e) {}
        }

        if (!finalVideoBase64) {
          log('❌ Failed to get video from extension! Skipping product.');
          continue;
        }

        // Upload Video to Vercel Blob and save to DB
        log('Uploading Video to cloud storage...');
        try {
          const vRes = await fetch(finalVideoBase64);
          const vBlob = await vRes.blob();
          
          // Determine extension from MIME type
          const ext = vBlob.type.includes('image') ? 'jpg' : 'mp4';
          const vFile = new File([vBlob], `product-${prod.id}-media.${ext}`, { type: vBlob.type });
          
          const newVideoBlob = await upload(vFile.name, vFile, {
            access: 'public',
            handleUploadUrl: '/api/upload'
          });

          log('Saving Video URL to Database...');
          await fetch('/api/db/products/update-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: prod.id, video_url: newVideoBlob.url })
          });
          
          log(`🎉 Finished Product: ${prod.title}!`);
        } catch(e: any) {
          log(`❌ Failed to upload final media: ${e.message}`);
        }
      }
      
      log('\n✅ Daily Automation Complete! All products processed.');
    } catch (e: any) {
      log(`❌ Automation Error: ${e.message}`);
    }
    setIsAutomating(false);
  };

  return (
    <div className="bg-white rounded-xl shadow p-6 mb-8 border border-indigo-100">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <span>✨</span> AI Content Studio
        </h2>
        <button 
          onClick={runDailyAutomation}
          disabled={isAutomating}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg disabled:opacity-50 transition-all flex items-center gap-2"
        >
          {isAutomating ? '🔄 Running Automation...' : '🤖 Start Daily Automation'}
        </button>
      </div>
      
      {automationLog.length > 0 && (
        <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm h-64 overflow-y-auto mb-8 shadow-inner border border-slate-700">
          {automationLog.map((log, i) => (
            <div key={i} className="whitespace-pre-wrap">{log}</div>
          ))}
          {isAutomating && <div className="animate-pulse mt-2">_</div>}
        </div>
      )}
      
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
              
              <div className="mt-8 p-4 bg-white rounded-lg border-2 border-green-500 shadow-lg">
                <h4 className="text-lg font-bold text-green-700 mb-2 flex items-center gap-2">
                  <span>⚡</span> Fully Automatic Google Flow
                </h4>
                <p className="text-sm text-slate-600 mb-4">
                  Send these prompts and the uploaded image directly to your Chrome Extension! The extension will automatically run in the background.
                </p>
                <button 
                  onClick={sendToAutomation}
                  disabled={isSending}
                  className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg shadow-[0_0_15px_rgba(34,197,94,0.4)] hover:bg-green-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isSending ? 'Sending...' : '🚀 Send to Video Gen Automation'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
