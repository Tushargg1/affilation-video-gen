'use client';

import { useEffect, useRef } from 'react';

export default function GlobalAutoPilot() {
  const isAutomatingRef = useRef(false);

  useEffect(() => {
    // Check local storage immediately
    const saved = localStorage.getItem('digen_autopilot');
    if (saved !== 'true') return;

    let interval: NodeJS.Timeout;

    const checkHeartbeat = async () => {
      // Re-check local storage every tick in case they turned it off in another tab/page
      if (localStorage.getItem('digen_autopilot') !== 'true') return;
      if (isAutomatingRef.current) return;

      isAutomatingRef.current = true;
      try {
        await runHeadlessAutomation();
      } catch (e) {
        console.error(e);
      } finally {
        isAutomatingRef.current = false;
      }
    };

    // Small delay to let the app hydrate
    const timeout = setTimeout(() => {
      checkHeartbeat();
    }, 5000);

    // Heartbeat every 5 minutes
    interval = setInterval(checkHeartbeat, 5 * 60 * 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const runHeadlessAutomation = async () => {
    // 1. Fetch latest config and products
    const configRes = await fetch('/api/config');
    const config = configRes.ok ? await configRes.json() : { daily_target: 4 };
    
    const prodRes = await fetch('/api/db/products');
    const prodData = prodRes.ok ? await prodRes.json() : { products: [] };
    const products = prodData.products || [];

    // Calculate how many products were already generated today
    const todayString = new Date().toDateString();
    const todayGeneratedCount = products.filter((p: any) => 
      p.video_url && p.updated_at && new Date(p.updated_at).toDateString() === todayString
    ).length;

    const dailyLimit = config.daily_target || 4;
    const remainingQuota = dailyLimit - todayGeneratedCount;

    if (remainingQuota <= 0) return; // Daily limit reached

    // Find pending products
    const savedCat = localStorage.getItem('ai_studio_category') || 'Uncategorized';
    let pendingProducts = products.filter((p: any) => (p.category || 'Uncategorized') === savedCat && (!p.image_prompt || !p.video_prompt));
    
    pendingProducts = pendingProducts.slice(0, remainingQuota);
    if (pendingProducts.length === 0) return;

    for (const prod of pendingProducts) {
      let imgPrompt = prod.image_prompt;
      let vidPrompt = prod.video_prompt;
      
      if (!imgPrompt || !vidPrompt) {
        const imgPromptText = config.base_image_prompt || `Write a highly detailed, professional text-to-image prompt to generate a stunning, cinematic, and photorealistic showcase of this product. Place the product in an aesthetic, premium environment that matches its vibe (e.g., a sleek studio, a cozy lifestyle setting). Include keywords like: 8k resolution, cinematic lighting, ultra-detailed, photorealistic, professional photography. Return ONLY the final prompt text.`;
        
        const vidPromptText = config.base_video_prompt || `Write a highly detailed text-to-video prompt to create a stunning, high-converting product showcase video. The video must be exactly 10 seconds long. Focus on smooth, premium camera movements (e.g., slow cinematic pan, dynamic orbital shot, or elegant zoom). Describe the lighting as professional and cinematic. Highlight the product's textures and aesthetic appeal. Include keywords like: exactly 10 seconds, smooth 60fps motion, cinematic product showcase, highly detailed. Return ONLY the final prompt text.`;

        // 1. Generate Image Prompt
        const imgRes = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: imgPromptText,
            imageUrl: prod.image_url,
            modelImageUrl: prod.model_photo_url || localStorage.getItem('global_model_photo'),
            model: 'gemini-3.8-flash'
          })
        });
        const imgData = await imgRes.json();
        imgPrompt = imgData.text || imgPrompt;

        await new Promise(r => setTimeout(r, 8000));

        // 2. Generate Video Prompt
        const vidRes = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: vidPromptText,
            imageUrl: prod.image_url,
            modelImageUrl: null,
            model: 'gemini-3.8-flash'
          })
        });
        const vidData = await vidRes.json();
        vidPrompt = vidData.text || vidPrompt;
        
        // Save to DB
        await fetch('/api/db/products/update-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            id: prod.id, 
            image_prompt: imgPrompt, 
            video_prompt: vidPrompt,
            used_model: imgData.usedModel || 'gemini-3.8-flash'
          })
        });
      }

      // Convert Product Photo URL to Base64
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
        } catch(e) { }
      }

      // CLEAR any old result from the bridge first
      try { await fetch('http://localhost:3001/api/result'); } catch(e) {}

      // Send IMAGE job to extension
      try {
        await fetch('http://localhost:3001/api/job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagePrompt: imgPrompt, videoPrompt: '', imageBase64: productImgBase64 })
        });
      } catch(e) {
        break; // Bridge offline
      }

      // Poll for Image Job result
      let finalImageBase64 = null;
      while (true) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const res = await fetch('http://localhost:3001/api/result');
          if (res.ok) {
            const data = await res.json();
            if (data.hasResult) {
              finalImageBase64 = data.result.mediaBase64;
              break;
            }
          }
        } catch(e) { }
      }

      // Send VIDEO job to extension
      let videoBase64Array = [];
      if (finalImageBase64) videoBase64Array.push(finalImageBase64);
      if (productImgBase64) videoBase64Array.push(productImgBase64);

      try { await fetch('http://localhost:3001/api/result'); } catch(e) {}

      try {
        await fetch('http://localhost:3001/api/job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagePrompt: '', videoPrompt: vidPrompt, imageBase64: videoBase64Array })
        });
      } catch(e) {
        break;
      }

      // Poll for Video Job result
      let finalVideoUrl = null;
      while (true) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const res = await fetch('http://localhost:3001/api/result');
          if (res.ok) {
            const data = await res.json();
            if (data.hasResult) {
              finalVideoUrl = data.result.mediaBase64; // actually Vercel Blob URL from extension
              break;
            }
          }
        } catch(e) { }
      }

      // Save Video URL and Mark Completed
      if (finalVideoUrl) {
        await fetch('/api/db/products/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: prod.id, video_url: finalVideoUrl, video_created: true })
        });
      }

      // Delay before next product
      await new Promise(r => setTimeout(r, 15000));
    }
  };

  return null; // This component is invisible!
}
