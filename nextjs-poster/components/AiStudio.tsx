'use client';

import { useState, useRef, useEffect } from 'react';
import { upload } from '@vercel/blob/client';


export default function AiStudio({ products, schedulerConfig }: { products: any[], schedulerConfig: any }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [selectionStrategy, setSelectionStrategy] = useState<string>('highest_reviews');
  
  // Load from localStorage on mount
  useEffect(() => {
    const savedCat = localStorage.getItem('ai_studio_category');
    const savedProdId = localStorage.getItem('ai_studio_product_id');
    const savedStrategy = localStorage.getItem('ai_studio_sort_strategy');
    
    if (savedStrategy) setSelectionStrategy(savedStrategy);
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
  
  const [introVideo, setIntroVideo] = useState<File | null>(null);
  const [introVideoUrl, setIntroVideoUrl] = useState<string>('');
  const [outroVideo, setOutroVideo] = useState<File | null>(null);
  const [outroVideoUrl, setOutroVideoUrl] = useState<string>('');
  const [testBaseVideo, setTestBaseVideo] = useState<File | null>(null);
  const [testMergedUrl, setTestMergedUrl] = useState<string>('');
  
  useEffect(() => {
    const savedIntro = localStorage.getItem('global_intro_video');
    if (savedIntro) setIntroVideoUrl(savedIntro);
    const savedOutro = localStorage.getItem('global_outro_video');
    if (savedOutro) setOutroVideoUrl(savedOutro);
  }, []);
  
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [videoPrompt, setVideoPrompt] = useState<string>('');
  const [usedModel, setUsedModel] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{type: string, message: string} | null>(null);
  
  const [isAutomating, setIsAutomating] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [automationLog, setAutomationLog] = useState<string[]>([]);
  
  // Sync UI state with GlobalAutoPilot
  useEffect(() => {
    const interval = setInterval(() => {
      const running = localStorage.getItem('digen_is_running') === 'true';
      const stopRequested = localStorage.getItem('digen_stop_requested') === 'true';
      
      setIsAutomating(running);
      setIsStopping(running && stopRequested);
      
      const logs = localStorage.getItem('digen_logs');
      if (logs) {
        try {
          setAutomationLog(JSON.parse(logs));
        } catch(e) {}
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Auto-pilot background scheduler
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const autoPilotRef = useRef(false);

  // Load autopilot state from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('digen_autopilot');
    if (saved === 'true') {
      setIsAutoPilot(true);
      autoPilotRef.current = true;
    }
  }, []);

  const toggleAutoPilot = () => {
    const newState = !isAutoPilot;
    setIsAutoPilot(newState);
    autoPilotRef.current = newState;
    localStorage.setItem('digen_autopilot', newState.toString());
  };

  // Heartbeat is now handled globally by GlobalAutoPilot in layout.tsx

  const categories = Array.from(new Set(products.map(p => p.category || 'Uncategorized').filter(Boolean)));
  const categoryProducts = products.filter(p => (p.category || 'Uncategorized') === selectedCategory);
  const selectedProduct = products.find(p => p.id === selectedProductId);

  const parseReviews = (rev: string) => {
    const str = (rev || '0').toString().toLowerCase();
    const num = parseInt(str.replace(/[^0-9]/g, '')) || 0;
    return str.includes('k') ? num * 1000 : num;
  };
  const parseRating = (rate: string) => parseFloat((rate || '0')) || 0;
  const parsePrice = (price: any) => parseFloat((price || '0').toString().replace(/[^0-9.]/g, '')) || 0;

  const getSortedPendingProducts = (cat: string, strat: string) => {
    // Only select products whose prompts are not fully created yet
    const pending = products.filter(p => (p.category || 'Uncategorized') === cat && (!p.image_prompt || !p.video_prompt));
    
    return pending.sort((a, b) => {
      if (strat === 'highest_reviews') return parseReviews(b.total_bought) - parseReviews(a.total_bought);
      if (strat === 'highest_rating') return parseRating(b.review_star) - parseRating(a.review_star);
      if (strat === 'lowest_price') return parsePrice(a.price) - parsePrice(b.price);
      if (strat === 'highest_price') return parsePrice(b.price) - parsePrice(a.price);
      return b.id - a.id; 
    });
  };

  // Update existing product if it already has prompts in DB
  const handleProductSelect = (id: number) => {
    setSelectedProductId(id);
    const p = products.find(prod => prod.id === id);
    const globalPhoto = localStorage.getItem('global_model_photo');
    if (p) {
      setImagePrompt(p.image_prompt || '');
      setVideoPrompt(p.video_prompt || '');
      setUsedModel(p.used_model || '');
      setModelPhotoUrl(p.model_photo_url || globalPhoto || '');
    }
  };

  const handleUploadPhoto = async () => {
    if (!modelPhoto) return;
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Uploading model photo...' });
    try {
      // Use a fixed name to ensure it overwrites the previous one on Vercel Blob
      const ext = modelPhoto.name.split('.').pop() || 'png';
      const fixedName = `global-model-photo.${ext}`;
      
      const newBlob = await upload(fixedName, modelPhoto, {
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

  const handleUploadIntro = async () => {
    if (!introVideo) return;
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Uploading intro video...' });
    try {
      const ext = introVideo.name.split('.').pop() || 'mp4';
      const fixedName = `global-intro-video.${ext}`;
      
      const newBlob = await upload(fixedName, introVideo, {
        access: 'public',
        handleUploadUrl: '/api/upload'
      });
      setIntroVideoUrl(newBlob.url);
      localStorage.setItem('global_intro_video', newBlob.url);
      
      setStatus({ type: 'success', message: 'Intro video uploaded successfully!' });
    } catch (e: any) {
      setStatus({ type: 'error', message: `Upload failed: ${e.message}` });
    }
    setIsLoading(false);
  };

  const handleUploadOutro = async () => {
    if (!outroVideo) return;
    setIsLoading(true);
    setStatus({ type: 'info', message: 'Uploading outro video...' });
    try {
      const ext = outroVideo.name.split('.').pop() || 'mp4';
      const fixedName = `global-outro-video.${ext}`;
      
      const newBlob = await upload(fixedName, outroVideo, {
        access: 'public',
        handleUploadUrl: '/api/upload'
      });
      setOutroVideoUrl(newBlob.url);
      localStorage.setItem('global_outro_video', newBlob.url);
      
      setStatus({ type: 'success', message: 'Outro video uploaded successfully!' });
    } catch (e: any) {
      setStatus({ type: 'error', message: `Upload failed: ${e.message}` });
    }
    setIsLoading(false);
  };

  const handleManualMerge = async () => {
    if (!selectedProduct || (!selectedProduct.social_link_2 && !selectedProduct.downloaded_video_path)) {
      alert("This product does not have a generated video yet.");
      return;
    }
    
    if (!outroVideoUrl && !introVideoUrl) {
      alert("Please upload an intro or outro video first.");
      return;
    }

    setIsLoading(true);
    setStatus({ type: 'info', message: 'Merging video via local server (may take a minute)...' });

    try {
      const sourceVideoUrl = selectedProduct.social_link_2 || selectedProduct.downloaded_video_path;
      
      const mergeRes = await fetch('http://localhost:3001/api/merge-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ introVideoUrl, baseVideoUrl: sourceVideoUrl, outroVideoUrl })
      });
      const mergeData = await mergeRes.json();
      if (!mergeRes.ok || !mergeData.success) throw new Error(mergeData.error || 'Merge failed on local server');

      setStatus({ type: 'info', message: 'Uploading merged video from local server to Vercel...' });
      
      const uploadRes = await fetch('http://localhost:3001/api/upload-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath: mergeData.filepath })
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.url) throw new Error(uploadData.error || 'Upload failed');
      
      await fetch('/api/db/products/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedProduct.id, social_link_2: uploadData.url, downloaded_video_path: uploadData.url })
      });
      
      setStatus({ type: 'success', message: 'Video successfully merged and updated!' });
      
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: `Merge failed: ${err.message}` });
    }
    
    setIsLoading(false);
  };

  const handleTestMerge = async () => {
    if (!testBaseVideo) {
      alert("Please upload a test base video first.");
      return;
    }
    if (!outroVideoUrl && !introVideoUrl) {
      alert("Please upload an intro or outro video first.");
      return;
    }

    setIsLoading(true);
    setStatus({ type: 'info', message: 'Uploading test video to Vercel for merge...' });

    try {
      const testName = `test-base-${Date.now()}.${testBaseVideo.name.split('.').pop() || 'mp4'}`;
      const testBlob = await upload(testName, testBaseVideo, {
        access: 'public',
        handleUploadUrl: '/api/upload'
      });
      
      setStatus({ type: 'info', message: 'Merging test video via local server (may take a minute)...' });
      const mergeRes = await fetch('http://localhost:3001/api/merge-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ introVideoUrl, baseVideoUrl: testBlob.url, outroVideoUrl })
      });
      const mergeData = await mergeRes.json();
      if (!mergeRes.ok || !mergeData.success) throw new Error(mergeData.error || 'Merge failed on local server');

      setStatus({ type: 'info', message: 'Uploading merged test video from local server to Vercel...' });
      
      const uploadRes = await fetch('http://localhost:3001/api/upload-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath: mergeData.filepath })
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.url) throw new Error(uploadData.error || 'Upload failed');
      
      setStatus({ type: 'info', message: 'Saving temporary video to database...' });
      await fetch('/api/db/products/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: '[TEMP] Merged Video - ' + Date.now(), 
          social_link_2: uploadData.url, 
          downloaded_video_path: uploadData.url 
        })
      });
      
      setTestMergedUrl(uploadData.url);
      setStatus({ type: 'success', message: 'Test video merged, uploaded, and saved to DB successfully!' });
    } catch (e: any) {
      setStatus({ type: 'error', message: `Test Merge failed: ${e.message}` });
      console.error(e);
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
      let mediaPayload: string[] = [];
      
      // 1. Get Product Image (Required)
      if (selectedProduct?.image_url) {
        try {
          const res = await fetch(selectedProduct.image_url);
          const blob = await res.blob();
          const reader = new FileReader();
          const productB64 = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          if (productB64) mediaPayload.push(productB64 as string);
        } catch(e) {
          console.warn("Could not fetch product image for extension.", e);
        }
      }

      // 2. Get Model Photo (Optional)
      if (modelPhotoUrl) {
        try {
          const res = await fetch(modelPhotoUrl);
          const blob = await res.blob();
          const reader = new FileReader();
          const modelB64 = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          if (modelB64) mediaPayload.push(modelB64 as string);
        } catch(e) {
          console.warn("Could not fetch model photo for extension.", e);
        }
      }

      const response = await fetch('http://localhost:3001/api/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePrompt,
          videoPrompt,
          imageBase64: mediaPayload // Now an array of multiple images!
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

  const processNextMedia = async () => {
    setIsSending(true);
    localStorage.setItem('digen_logs', '[]'); // Clear old terminal logs to avoid confusion

    const fetchBase64 = async (url: string) => {
      try {
        const res = await fetch('/api/proxy-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        return data.base64 || null;
      } catch(e) { return null; }
    };

    // Priority 1: Needs Video (has video prompt, image is already generated, but no video generated yet)
    // We prioritize finishing products that are already halfway done before starting new ones.
    const needsVideo = products.find((p: any) => p.video_prompt && p.downloaded_image_path && !p.downloaded_video_path);
    
    if (needsVideo) {
      setSelectedProductId(needsVideo.id);
      setStatus({ type: 'info', message: `Found product for Video generation: ${needsVideo.title}` });
      
      const imgB64 = await fetchBase64(needsVideo.downloaded_image_path);
      
      if (imgB64) {
        try {
          // Clear any old stuck jobs first
          await fetch('http://localhost:3001/api/job', { method: 'DELETE' });
          await fetch('http://localhost:3001/api/result', { method: 'DELETE' }).catch(() => {});
          
          await fetch('http://localhost:3001/api/job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              target: 'video',
              imagePrompt: null,
              videoPrompt: needsVideo.video_prompt,
              imageBase64: [imgB64]
            })
          });
          alert(`✅ Sent VIDEO generation task for "${needsVideo.title}" to Extension! Polling for result in background...`);
          
          // Poll for Video Result
          pollAndSaveResult(needsVideo.id, 'video');
        } catch (e) {
          alert('❌ Failed to connect to local server on port 3001.');
        }
      } else {
        alert('❌ Failed to fetch generated image to use as video reference.');
      }
      setIsSending(false);
      return;
    }

    // Priority 2: Needs Image (has image prompt, but no image generated yet)
    const needsImage = products.find((p: any) => p.image_prompt && !p.downloaded_image_path);
    if (needsImage) {
      setSelectedProductId(needsImage.id);
      setStatus({ type: 'info', message: `Found product for Image generation: ${needsImage.title}` });
      
      let mediaPayload: string[] = [];
      if (needsImage.image_url) {
        const productImgB64 = await fetchBase64(needsImage.image_url);
        if (productImgB64) mediaPayload.push(productImgB64);
      }
      
      const globalPhoto = localStorage.getItem('global_model_photo');
      const mPhoto = needsImage.model_photo_url || globalPhoto;
      if (mPhoto) {
        const modelImgB64 = await fetchBase64(mPhoto);
        if (modelImgB64) mediaPayload.push(modelImgB64);
      }

      try {
        // Clear any old stuck jobs first
        await fetch('http://localhost:3001/api/job', { method: 'DELETE' });
        await fetch('http://localhost:3001/api/result', { method: 'DELETE' }).catch(() => {});
        
        await fetch('http://localhost:3001/api/job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: 'image',
            imagePrompt: needsImage.image_prompt,
            videoPrompt: null,
            imageBase64: mediaPayload
          })
        });
        alert(`✅ Sent IMAGE generation task for "${needsImage.title}" to Extension! Polling for result in background...`);
        
        // Poll for Image Result
        pollAndSaveResult(needsImage.id, 'image');
      } catch (e) {
        alert('❌ Failed to connect to local server on port 3001.');
      }
      setIsSending(false);
      return;
    }

    alert('✅ No pending image or video generation tasks found!');
    setIsSending(false);
  };

  const pollAndSaveResult = async (productId: string, type: 'image' | 'video') => {
    setStatus({ type: 'info', message: `Waiting for ${type} generation to complete...` });
    const jobStartTime = Date.now();
    
    for (let i = 0; i < 120; i++) { // Poll for up to 10 minutes
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch('http://localhost:3001/api/result', { cache: 'no-store' });
        const data = await res.json();
        if (data.hasResult && data.result && data.result.success) {
          
          let base64ToUpload: string | null = null;
          
          if (type === 'video') {
            // ALWAYS ignore mediaBase64 for video - it's a PNG thumbnail.
            // background.js now waits for .mp4 to fully download before reporting success.
                if (data.result.isNativeDownload || true) { // Always use native download for video
                   setStatus({ type: 'info', message: `Video done! Locating .mp4 in Downloads...` });
                   for (let j = 0; j < 36; j++) {
                      await new Promise(r => setTimeout(r, 5000));
                      setStatus({ type: 'info', message: `Polling for .mp4... attempt ${j+1}/36` });
                      try {
                         const vidRes = await fetch(`http://localhost:3001/api/latest-media?type=video&job_start_time=${jobStartTime}`, { cache: 'no-store' });
                         const vidData = await vidRes.json();
                         if (vidData.success && (vidData.base64 || vidData.filepath)) {
                             base64ToUpload = vidData.filepath || vidData.base64;
                             setStatus({ type: 'info', message: `Found: ${vidData.filename}` });
                             break;
                         } else {
                             setStatus({ type: 'info', message: `Not ready: ${vidData.error || 'waiting...'}` });
                         }
                      } catch(e) {}
                   }
                }
              } else {
                // For IMAGE: always wait for native download to avoid 4MB Vercel upload limit
                if (data.result.isNativeDownload || true) {
                   setStatus({ type: 'info', message: `Image done! Waiting for local download...` });
                   for (let j = 0; j < 36; j++) {
                      await new Promise(r => setTimeout(r, 5000));
                      try {
                         const imgRes = await fetch(`http://localhost:3001/api/latest-media?type=image&job_start_time=${jobStartTime}`, { cache: 'no-store' });
                         const imgData = await imgRes.json();
                         if (imgData.success && (imgData.base64 || imgData.filepath)) { 
                             base64ToUpload = imgData.filepath || imgData.base64; 
                             setStatus({ type: 'info', message: `Found: ${imgData.filename}` });
                             break; 
                         }
                      } catch(e) {}
                   }
                }
                
                // Fallback to canvas base64 only if native download completely failed
                if (!base64ToUpload && data.result.mediaBase64) {
                    base64ToUpload = data.result.mediaBase64;
                }
              }
              
              if (!base64ToUpload) {
                  setStatus({ type: 'error', message: `Failed to locate downloaded ${type} file.` });
                  break;
              }
              
              setStatus({ type: 'info', message: `Uploading ${type} to Vercel...` });
              let uploadUrl = null;
              
              if (base64ToUpload.includes('\\') || base64ToUpload.includes('/')) {
                // Upload local file directly
                setStatus({ type: 'info', message: `Uploading directly from local server (bypasses limits)...` });
                const localRes = await fetch('http://localhost:3001/api/upload-local', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ filepath: base64ToUpload })
                });
                const localData = await localRes.json();
                if (localData.url) uploadUrl = localData.url;
              } else {
                // Upload base64 via Next.js
                const uploadRes = await fetch('/api/upload', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ base64: base64ToUpload, isVideo: type === 'video' })
                });
                const uploadData = await uploadRes.json();
                if (uploadData.url) uploadUrl = uploadData.url;
              }
              
              if (uploadUrl) {
                setStatus({ type: 'info', message: `Upload complete! Saving to database...` });
                const payload = type === 'image' 
                  ? { id: productId, social_link_1: uploadUrl }
                  : { id: productId, social_link_2: uploadUrl, video_created: true };
                await fetch('/api/db/products/update', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
                setStatus({ type: 'success', message: `✅ ${type.toUpperCase()} saved to Product Card!` });
                setTimeout(() => window.location.reload(), 2000);
              } else {
                setStatus({ type: 'error', message: 'Failed to upload to Vercel.' });
              }
              break;
        } else if (data.hasResult && data.result && !data.result.success) {
          setStatus({ type: 'error', message: `Generation failed: ${data.result.error}` });
          break;
        }
      } catch(e) {}
    }
  };

  const callGeminiWithFallback = async (promptText: string, imageUrl: string, modelImageUrl: string | null, onStatus: (msg: string, type: 'info'|'warning') => void) => {
    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];
    
    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      if (i === 0) {
        onStatus(`Generating via ${currentModel.replace('gemini-', '')}...`, 'info');
      }

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          imageUrl,
          modelImageUrl,
          model: currentModel
        })
      });
      const resData = await res.json();
      
      if (res.ok) return resData;
      
      if (i === modelsToTry.length - 1) {
        throw new Error(resData.error || 'All fallback models failed.');
      }
      
      const nextModel = modelsToTry[i + 1].replace('gemini-', '');
      onStatus(`Model ${currentModel.replace('gemini-', '')} skipped due to error: "${resData.error}". Trying ${nextModel} next...`, 'warning');
      
      await new Promise(r => setTimeout(r, 2000));
    }
  };

  const generatePrompts = async () => {
    if (!selectedProduct || !selectedProduct.image_url) {
      return setStatus({ type: 'error', message: 'Please select a product that has an image.' });
    }
    setIsLoading(true);
    try {
      const imgPromptText = schedulerConfig.base_image_prompt || `Write a highly detailed, professional text-to-image prompt to generate a stunning, cinematic, and photorealistic showcase of this product. Place the product in an aesthetic, premium environment that matches its vibe (e.g., a sleek studio, a cozy lifestyle setting). Include keywords like: 8k resolution, cinematic lighting, ultra-detailed, photorealistic, professional photography. Return ONLY the final prompt text.`;
      
      const vidPromptText = schedulerConfig.base_video_prompt || `Write a highly detailed text-to-video prompt to create a stunning, high-converting product showcase video. The video must be exactly 10 seconds long. Focus on smooth, premium camera movements (e.g., slow cinematic pan, dynamic orbital shot, or elegant zoom). Describe the lighting as professional and cinematic. Highlight the product's textures and aesthetic appeal. Include keywords like: exactly 10 seconds, smooth 60fps motion, cinematic product showcase, highly detailed. Return ONLY the final prompt text.`;

      // 1. Generate Image Prompt
      const imgData = await callGeminiWithFallback(
        imgPromptText, 
        selectedProduct.image_url, 
        modelPhotoUrl, 
        (msg, type) => setStatus({ type, message: `[Image Prompt] ${msg}` })
      );
      setImagePrompt(imgData.text);
      setUsedModel(imgData.usedModel || 'gemini-3.8-flash');

      // 2. Short delay before Video Prompt to avoid hitting RPM limit
      setStatus({ type: 'info', message: 'Waiting 2 seconds before generating Video Prompt to respect API limits...' });
      await new Promise(r => setTimeout(r, 2000));

      // 3. Generate Video Prompt
      const vidData = await callGeminiWithFallback(
        vidPromptText, 
        selectedProduct.image_url, 
        null, // No model photo for video prompt generation
        (msg, type) => setStatus({ type, message: `[Video Prompt] ${msg}` })
      );
      setVideoPrompt(vidData.text);

      // Save both to DB
      await fetch('/api/db/products/update-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: selectedProduct.id, 
          image_prompt: imgData.text,
          video_prompt: vidData.text,
          used_model: imgData.usedModel || 'gemini-3.8-flash'
        })
      });
      
      setStatus({ type: 'success', message: 'Both prompts generated sequentially and saved successfully!' });
    } catch (e: any) {
      setStatus({ type: 'error', message: `Generation failed: ${e.message}` });
    }
    setIsLoading(false);
  };

  const runDailyAutomation = async () => {
    // Tell the GlobalAutoPilot to wake up and run immediately
    localStorage.setItem('digen_logs', '[]'); // Clear old logs!
    localStorage.setItem('digen_stop_requested', 'false');
    localStorage.setItem('digen_force_run', 'true');
    // Force clear the lock so it doesn't get stuck waiting 5 minutes if it was stopped recently!
    localStorage.setItem('digen_lock_timestamp', '0'); 
    setIsAutomating(true);
    setIsStopping(false);
  };

  const stopAutomation = () => {
    localStorage.setItem('digen_stop_requested', 'true');
    setIsStopping(true);
  };

  // Statistics Calculations
  const todayString = new Date().toDateString();
  const stats = {
    todayImagePrompts: products.filter(p => p.image_prompt && p.updated_at && new Date(p.updated_at).toDateString() === todayString).length,
    todayVideoPrompts: products.filter(p => p.video_prompt && p.updated_at && new Date(p.updated_at).toDateString() === todayString).length,
    todayImages: products.filter(p => p.downloaded_image_path && p.updated_at && new Date(p.updated_at).toDateString() === todayString).length,
    todayVideos: products.filter(p => p.downloaded_video_path && p.updated_at && new Date(p.updated_at).toDateString() === todayString).length,
    totalImagePrompts: products.filter(p => p.image_prompt).length,
    totalVideoPrompts: products.filter(p => p.video_prompt).length,
    totalImages: products.filter(p => p.downloaded_image_path).length,
    totalVideos: products.filter(p => p.downloaded_video_path).length,
  };

  return (
    <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 mb-10 border border-white/60 overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-80"></div>
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-gradient-to-br from-indigo-400/10 to-purple-400/10 rounded-full blur-3xl pointer-events-none group-hover:scale-110 transition-transform duration-700"></div>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 relative z-10">
        <div>
          <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-900 to-purple-900 flex items-center gap-3 tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center shadow-inner border border-indigo-50">
              <span className="text-xl">✨</span>
            </div>
            AI Content Studio
          </h2>
          <p className="text-slate-500 mt-2 font-medium mb-3">Generate cinematic prompts and automate video creation</p>
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
            <span>Start Extension Bridge: <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[10px] shadow-sm ml-1">video gen\start-local-ui.bat</code></span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-3 bg-white/50 backdrop-blur-sm px-4 py-2.5 rounded-full border border-slate-200/60 shadow-sm">
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Auto-Pilot</span>
              <span className="text-[10px] text-slate-500 font-medium">Runs in background</span>
            </div>
            <button 
              type="button"
              onClick={toggleAutoPilot}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${isAutoPilot ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isAutoPilot ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <button 
            onClick={runDailyAutomation}
            disabled={isAutomating || isStopping}
            className="relative inline-flex h-12 overflow-hidden rounded-full p-[2px] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-50 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95"
          >
            <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
            <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-slate-950 px-6 py-1 text-sm font-bold text-white backdrop-blur-3xl gap-2">
              {isStopping ? (
                <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Stopping...</>
              ) : isAutomating ? (
                <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Running...</>
              ) : (
                <>🤖 Start Daily Automation</>
              )}
            </span>
          </button>

          {isAutomating && !isStopping && (
            <button
              onClick={stopAutomation}
              className="relative inline-flex h-12 items-center justify-center rounded-full bg-red-500 hover:bg-red-600 px-6 text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-red-200 gap-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Analytics Dashboard */}
      <div className="relative z-10 grid grid-cols-2 md:grid-cols-5 gap-4 mb-8 bg-white/40 p-4 rounded-2xl border border-white/60 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col p-3 rounded-xl bg-white/60 border border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Image Prompts</span>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black text-indigo-600">{stats.todayImagePrompts}</span>
            <span className="text-xs font-semibold text-slate-500 mb-1">today</span>
          </div>
          <span className="text-[10px] font-semibold text-slate-400 mt-1">{stats.totalImagePrompts} total historical</span>
        </div>
        <div className="flex flex-col p-3 rounded-xl bg-white/60 border border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Video Prompts</span>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black text-purple-600">{stats.todayVideoPrompts}</span>
            <span className="text-xs font-semibold text-slate-500 mb-1">today</span>
          </div>
          <span className="text-[10px] font-semibold text-slate-400 mt-1">{stats.totalVideoPrompts} total historical</span>
        </div>
        <div className="flex flex-col p-3 rounded-xl bg-white/60 border border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Finished Images</span>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black text-blue-600">{stats.todayImages}</span>
            <span className="text-xs font-semibold text-slate-500 mb-1">today</span>
          </div>
          <span className="text-[10px] font-semibold text-slate-400 mt-1">{stats.totalImages} total historical</span>
        </div>
        <div className="flex flex-col p-3 rounded-xl bg-white/60 border border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Finished Videos</span>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black text-emerald-600">{stats.todayVideos}</span>
            <span className="text-xs font-semibold text-slate-500 mb-1">today</span>
          </div>
          <span className="text-[10px] font-semibold text-slate-400 mt-1">{stats.totalVideos} total historical</span>
        </div>
        <div className="flex flex-col p-3 rounded-xl bg-slate-900 border border-slate-800">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Daily Target</span>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black text-white">{stats.todayVideos} / {schedulerConfig.daily_target || 4}</span>
          </div>
          <span className="text-[10px] font-semibold text-emerald-400 mt-1">Goal completion</span>
        </div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
        
        {/* Step 1: Selection */}
        <div className="space-y-6 bg-white/70 backdrop-blur-md p-8 rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_40px_rgb(0,0,0,0.08)] transition-all duration-300">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-black text-slate-600">1</span>
            Select Product
          </h3>
          
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wider">Category</label>
            <select 
              className="w-full p-3.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white/50 backdrop-blur-sm transition-all text-slate-700 font-medium"
              value={selectedCategory}
              onChange={e => {
                const cat = e.target.value;
                setSelectedCategory(cat);
                const sorted = getSortedPendingProducts(cat, selectionStrategy);
                if (sorted.length > 0) {
                  handleProductSelect(sorted[0].id);
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
            <label className="block text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wider">Prioritize By</label>
            <select 
              className="w-full p-3.5 border border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none bg-white/50 backdrop-blur-sm transition-all text-slate-700 font-medium"
              value={selectionStrategy}
              onChange={e => {
                const strat = e.target.value;
                setSelectionStrategy(strat);
                localStorage.setItem('ai_studio_sort_strategy', strat);
                
                const sorted = getSortedPendingProducts(selectedCategory, strat);
                if (sorted.length > 0) {
                  handleProductSelect(sorted[0].id);
                } else {
                  setSelectedProductId('');
                }
              }}
              disabled={!selectedCategory}
            >
              <option value="highest_reviews">Highest Reviews First</option>
              <option value="highest_rating">Highest Rating First</option>
              <option value="lowest_price">Lowest Price First</option>
              <option value="highest_price">Highest Price First</option>
              <option value="newest">Newest Extracted First</option>
            </select>
            
            {selectedProduct ? (
              <div className="mt-4 text-sm p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-900 shadow-sm flex flex-col transition-all">
                <span className="font-extrabold text-[10px] tracking-widest text-indigo-400 uppercase mb-1">Queue Top</span>
                <span className="font-semibold truncate">{selectedProduct.title}</span>
                <span className="opacity-70 mt-1 font-medium text-xs">₹{selectedProduct.price} • ⭐ {selectedProduct.review_star || 'N/A'} • {selectedProduct.total_bought || '0 reviews'}</span>
              </div>
            ) : selectedCategory ? (
               <div className="mt-4 text-sm p-3.5 bg-slate-100/80 border border-slate-200 rounded-xl text-slate-500 font-medium flex items-center gap-2">
                 <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                 All prompts created for this category!
               </div>
            ) : null}
          </div>

          <div className="pt-2">
            <label className="block text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wider">Upload Model Photo</label>
            <div className="flex gap-3">
              <input 
                type="file" 
                accept="image/*"
                onChange={e => setModelPhoto(e.target.files?.[0] || null)}
                className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white/50 backdrop-blur-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-all cursor-pointer text-slate-600"
              />
              <button 
                onClick={handleUploadPhoto}
                disabled={!modelPhoto || isLoading}
                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 hover:shadow-lg transition-all active:scale-95"
              >
                Upload
              </button>
            </div>
            {modelPhotoUrl && (
              <div className="mt-6 relative inline-block group">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
                <img src={modelPhotoUrl} alt="Model" className="relative w-32 h-32 object-cover rounded-xl border border-white shadow-sm" />
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-200">
            <label className="block text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wider">Upload Intro Video (Prepended to all generated videos)</label>
            <div className="flex gap-3">
              <input 
                type="file" 
                accept="video/*"
                onChange={e => setIntroVideo(e.target.files?.[0] || null)}
                className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white/50 backdrop-blur-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100 transition-all cursor-pointer text-slate-600"
              />
              <button 
                onClick={handleUploadIntro}
                disabled={!introVideo || isLoading}
                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 hover:shadow-lg transition-all active:scale-95 whitespace-nowrap"
              >
                Upload
              </button>
            </div>
            {introVideoUrl && (
              <div className="mt-4 p-3 bg-pink-50 border border-pink-100 rounded-xl text-pink-900 text-sm font-medium flex flex-col gap-3">
                <span>✅ Intro Video Uploaded! It will be automatically merged via FFmpeg at the start of all future videos.</span>
                
                <div className="mt-2 w-24 h-40 rounded-lg overflow-hidden border-2 border-pink-200 shadow-sm relative bg-black/5">
                  <video 
                    src={introVideoUrl} 
                    className="w-full h-full object-cover" 
                    controls 
                    muted 
                    loop 
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-200">
            <label className="block text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wider">Upload Outro Video (Appended to all generated videos)</label>
            <div className="flex gap-3">
              <input 
                type="file" 
                accept="video/*"
                onChange={e => setOutroVideo(e.target.files?.[0] || null)}
                className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white/50 backdrop-blur-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100 transition-all cursor-pointer text-slate-600"
              />
              <button 
                onClick={handleUploadOutro}
                disabled={!outroVideo || isLoading}
                className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 hover:shadow-lg transition-all active:scale-95 whitespace-nowrap"
              >
                Upload
              </button>
            </div>
            {outroVideoUrl && (
              <div className="mt-4 p-3 bg-pink-50 border border-pink-100 rounded-xl text-pink-900 text-sm font-medium flex flex-col gap-3">
                <span>✅ Outro Video Uploaded! It will be automatically merged via FFmpeg at the end of all future videos.</span>
                
                <div className="mt-2 w-24 h-40 rounded-lg overflow-hidden border-2 border-pink-200 shadow-sm relative bg-black/5">
                  <video 
                    src={outroVideoUrl} 
                    className="w-full h-full object-cover" 
                    controls 
                    muted 
                    loop 
                  />
                </div>

                {selectedProduct && (selectedProduct.social_link_2 || selectedProduct.downloaded_video_path) && (
                  <button
                    onClick={handleManualMerge}
                    disabled={isLoading}
                    className="w-full bg-pink-600 text-white hover:bg-pink-700 px-4 py-2 rounded-lg font-bold transition-all disabled:opacity-50 text-xs shadow-sm flex justify-center items-center gap-2"
                  >
                    {isLoading ? 'Processing...' : 'Merge Templates to Selected Product Video'}
                  </button>
                )}
              </div>
            )}
            
            {/* Test Merge Section */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <label className="block text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wider">Test Merge (Optional)</label>
              <p className="text-xs text-slate-500 mb-3">Upload a random video here to test the FFmpeg merger. It will merge with your Intro/Outro Videos and upload to Vercel as a temporary file so you can verify it works.</p>
              
              <div className="flex gap-3">
                <input 
                  type="file" 
                  accept="video/*"
                  onChange={e => setTestBaseVideo(e.target.files?.[0] || null)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white/50 backdrop-blur-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-all cursor-pointer text-slate-600"
                />
                <button 
                  onClick={handleTestMerge}
                  disabled={!testBaseVideo || (!outroVideoUrl && !introVideoUrl) || isLoading}
                  className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 hover:shadow-lg transition-all active:scale-95 whitespace-nowrap"
                >
                  {isLoading ? 'Merging...' : 'Merge & Upload'}
                </button>
              </div>
              
              {testMergedUrl && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-900 text-sm font-medium flex flex-col gap-3">
                  <span>✅ Test Merged Video Uploaded!</span>
                  <a href={testMergedUrl} target="_blank" className="text-blue-600 underline text-xs break-all">{testMergedUrl}</a>
                  
                  <div className="mt-2 w-32 h-56 rounded-lg overflow-hidden border-2 border-blue-200 shadow-sm relative bg-black/5">
                    <video 
                      src={testMergedUrl} 
                      className="w-full h-full object-cover" 
                      controls 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>


        </div>

        {/* Step 2: Generation */}
        <div className="space-y-6 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 backdrop-blur-md p-8 rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_40px_rgb(0,0,0,0.08)] transition-all duration-300">
          <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-black text-indigo-600">2</span>
            Generate Prompts
          </h3>
          
          <button 
            onClick={generatePrompts}
            disabled={!selectedProduct || isLoading}
            className="w-full relative group overflow-hidden bg-indigo-600 text-white py-4 rounded-xl font-bold disabled:opacity-50 transition-all active:scale-95 shadow-[0_4px_20px_rgba(79,70,229,0.3)] hover:shadow-[0_8px_30px_rgba(79,70,229,0.4)]"
          >
            <span className="absolute right-0 w-8 h-32 -mt-12 transition-all duration-1000 transform translate-x-12 bg-white opacity-10 rotate-12 group-hover:-translate-x-96 ease"></span>
            <span className="relative flex items-center justify-center gap-2 text-lg">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Generate Image & Video Prompts
            </span>
          </button>

          <button 
            onClick={processNextMedia}
            disabled={isSending}
            className="w-full mt-4 relative overflow-hidden border-2 border-indigo-600 text-indigo-700 py-3 rounded-xl font-bold hover:bg-indigo-50 disabled:opacity-50 transition-all active:scale-95 shadow-sm"
          >
            <span className="relative flex items-center justify-center gap-2">
              <span className="text-xl">🤖</span>
              Process Next Media Task (Image or Video)
            </span>
          </button>
          
          {imagePrompt && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-2 mt-6">
                <div className="flex items-center gap-3">
                  <label className="block text-sm font-bold text-indigo-900 uppercase tracking-wider">Image Prompt</label>
                  {usedModel && <span className="text-xs font-bold bg-white text-indigo-700 px-3 py-1 rounded-full border border-indigo-100 shadow-sm">✨ {usedModel}</span>}
                </div>
                <button onClick={() => navigator.clipboard.writeText(imagePrompt)} className="text-xs bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors font-semibold">Copy</button>
              </div>
              <textarea 
                className="w-full p-4 border border-indigo-200/60 rounded-2xl h-32 text-sm focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none bg-white/80 shadow-inner text-slate-700 leading-relaxed resize-none transition-all"
                value={imagePrompt}
                onChange={e => setImagePrompt(e.target.value)}
              />
            </div>
          )}

          {videoPrompt && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 pt-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                  <label className="block text-sm font-bold text-purple-900 uppercase tracking-wider">Video Prompt</label>
                  {usedModel && <span className="text-xs font-bold bg-white text-purple-700 px-3 py-1 rounded-full border border-purple-100 shadow-sm">✨ {usedModel}</span>}
                </div>
                <button onClick={() => navigator.clipboard.writeText(videoPrompt)} className="text-xs bg-purple-100 text-purple-800 px-3 py-1.5 rounded-lg hover:bg-purple-200 transition-colors font-semibold">Copy</button>
              </div>
              <textarea 
                className="w-full p-4 border border-purple-200/60 rounded-2xl h-32 text-sm focus:ring-4 focus:ring-purple-500/20 focus:border-purple-400 outline-none bg-white/80 shadow-inner text-slate-700 leading-relaxed resize-none transition-all"
                value={videoPrompt}
                onChange={e => setVideoPrompt(e.target.value)}
              />
              
              <div className="mt-8 p-6 bg-white/90 backdrop-blur-md rounded-2xl border border-emerald-100 shadow-[0_8px_30px_rgba(16,185,129,0.1)] relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                <h4 className="text-lg font-extrabold text-emerald-800 mb-2 flex items-center gap-2">
                  <span className="text-2xl animate-pulse">⚡</span> Auto Google Flow
                </h4>
                <p className="text-sm text-slate-600 mb-6 leading-relaxed font-medium">
                  Send these prompts and images instantly to the Chrome Extension.
                </p>
                <button 
                  onClick={sendToAutomation}
                  disabled={isSending}
                  className="w-full relative group/btn overflow-hidden bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-4 rounded-xl font-bold text-lg shadow-[0_8px_20px_rgba(16,185,129,0.3)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.4)] disabled:opacity-50 transition-all active:scale-95"
                >
                  <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite]"></span>
                  <span className="relative flex items-center justify-center gap-2">
                    {isSending ? (
                       <><svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Sending...</>
                    ) : (
                      <>🚀 Send to Video Gen Automation</>
                    )}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
