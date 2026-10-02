'use client';

import { useEffect, useRef } from 'react';

// Shared helper to write logs to localStorage so the UI can display them
const writeLog = (msg: string) => {
  const currentLogs = JSON.parse(localStorage.getItem('digen_logs') || '[]');
  currentLogs.push(msg);
  // Keep only last 100 logs to avoid localStorage overflow
  if (currentLogs.length > 100) currentLogs.shift();
  localStorage.setItem('digen_logs', JSON.stringify(currentLogs));
};

export default function GlobalAutoPilot() {
  const isAutomatingRef = useRef(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const checkHeartbeat = async () => {
      // Re-check local storage every tick
      if (localStorage.getItem('digen_autopilot') !== 'true' && localStorage.getItem('digen_force_run') !== 'true') {
        localStorage.setItem('digen_is_running', 'false');
        return;
      }
      
      if (isAutomatingRef.current) return;

      isAutomatingRef.current = true;
      localStorage.setItem('digen_is_running', 'true');
      
      try {
        await runHeadlessAutomation();
      } catch (e: any) {
        writeLog(`❌ Automation Error: ${e.message}`);
      } finally {
        isAutomatingRef.current = false;
        localStorage.setItem('digen_is_running', 'false');
        localStorage.setItem('digen_force_run', 'false');
      }
    };

    // Small delay to let the app hydrate
    const timeout = setTimeout(() => {
      checkHeartbeat();
    }, 2000);

    // Heartbeat every 5 seconds so it picks up manual triggers instantly
    interval = setInterval(checkHeartbeat, 5000);

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

    if (remainingQuota <= 0) {
      writeLog(`✅ Daily limit reached! (${todayGeneratedCount}/${dailyLimit} generated today).`);
      return;
    }

    // Find pending products
    const savedCat = localStorage.getItem('ai_studio_category') || 'Uncategorized';
    let pendingProducts = products.filter((p: any) => (p.category || 'Uncategorized') === savedCat && (!p.image_prompt || !p.video_prompt));
    
    pendingProducts = pendingProducts.slice(0, remainingQuota);
    if (pendingProducts.length === 0) {
      writeLog(`No pending products to process today!`);
      return;
    }

    writeLog(`Found ${pendingProducts.length} pending products. Daily Quota remaining: ${remainingQuota}. Starting generation...`);

    for (const prod of pendingProducts) {
      writeLog(`\n--- Starting Product: ${prod.title} ---`);
      let imgPrompt = prod.image_prompt;
      let vidPrompt = prod.video_prompt;
      
      if (!imgPrompt || !vidPrompt) {
        const imgPromptText = config.base_image_prompt || `Write a highly detailed, professional text-to-image prompt... Return ONLY the final prompt text.`;
        const vidPromptText = config.base_video_prompt || `Write a highly detailed text-to-video prompt... Return ONLY the final prompt text.`;

        // 1. Generate Image Prompt
        writeLog(`[Image Prompt] Generating via 3.8-flash...`);
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
        
        if (!imgRes.ok) {
           writeLog(`[Image Prompt] Model 3.8-flash failed: ${imgData.error}. Skipping...`);
           continue;
        }
        imgPrompt = imgData.text || imgPrompt;

        writeLog('Waiting 8 seconds before generating Video Prompt...');
        await new Promise(r => setTimeout(r, 8000));

        // 2. Generate Video Prompt
        writeLog(`[Video Prompt] Generating via 3.8-flash...`);
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
        if (!vidRes.ok) {
           writeLog(`[Video Prompt] Model 3.8-flash failed: ${vidData.error}. Skipping...`);
           continue;
        }
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
      writeLog('Converting product image to Base64...');
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
      writeLog('Sending Image Job to extension...');
      try {
        await fetch('http://localhost:3001/api/job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imagePrompt: imgPrompt, videoPrompt: '', imageBase64: productImgBase64 })
        });
      } catch(e) {
        writeLog('❌ Bridge server offline! Make sure node server.js is running on port 3001.');
        break; // Bridge offline
      }

      // Poll for Image Job result
      writeLog('Waiting for Image Generation... (Takes a few minutes)');
      let finalImageBase64 = null;
      while (true) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const res = await fetch('http://localhost:3001/api/result');
          if (res.ok) {
            const data = await res.json();
            if (data.hasResult) {
              writeLog('✅ Image generation complete!');
              finalImageBase64 = data.result.mediaBase64;
              break;
            }
          }
        } catch(e) { }
      }

      if (!finalImageBase64) continue;

      // Send VIDEO job to extension
      writeLog('Sending Video Job to extension...');
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
        writeLog('❌ Bridge server offline!');
        break;
      }

      // Poll for Video Job result
      writeLog('Waiting for Video Generation... (Takes a few minutes)');
      let finalVideoUrl = null;
      while (true) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const res = await fetch('http://localhost:3001/api/result');
          if (res.ok) {
            const data = await res.json();
            if (data.hasResult) {
              writeLog('✅ Video generation complete!');
              finalVideoUrl = data.result.mediaBase64; // actually Vercel Blob URL from extension
              break;
            }
          }
        } catch(e) { }
      }

      // Save Video URL and Mark Completed
      if (finalVideoUrl) {
        writeLog('Saving Video URL to Database...');
        await fetch('/api/db/products/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: prod.id, video_url: finalVideoUrl, video_created: true })
        });
        writeLog(`🎉 Finished Product: ${prod.title}!`);
      }

      // Delay before next product
      writeLog('Waiting 15 seconds before processing the next product...');
      await new Promise(r => setTimeout(r, 15000));
    }
    writeLog('\n✅ Daily Automation Complete! All products processed.');
  };

  return null; // This component is invisible!
}
