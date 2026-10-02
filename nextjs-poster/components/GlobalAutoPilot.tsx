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

const shouldStop = () => localStorage.getItem('digen_stop_requested') === 'true';

const callGeminiWithInfiniteFallback = async (prompt: string, imageUrl: string, modelImageUrl: string | null, logPrefix: string) => {
  const models = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];
  let attempt = 0;
  
  while (true) {
    const currentModel = models[attempt % models.length];
    writeLog(`${logPrefix} Generating via ${currentModel}...`);
    
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imageUrl, modelImageUrl, model: currentModel })
      });
      
      const textResponse = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        throw new Error(`Non-JSON response from server (Status ${res.status}): ${textResponse.substring(0, 40)}...`);
      }

      if (res.ok && data.text) {
        return { text: data.text, usedModel: currentModel };
      } else {
        const errorMsg = data.error || 'Unknown Error';
        writeLog(`${logPrefix} Model ${currentModel} skipped due to error: ${errorMsg}. Trying ${models[(attempt + 1) % models.length]} next...`);
      }
    } catch (e: any) {
      writeLog(`${logPrefix} Model ${currentModel} threw error: ${e.message}. Trying ${models[(attempt + 1) % models.length]} next...`);
    }
    
    // Wait 4 seconds before trying the next model in the loop
    await new Promise(r => setTimeout(r, 4000));
    attempt++;
  }
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
      
      // Cross-tab / React Strict Mode concurrency lock
      const lastLock = parseInt(localStorage.getItem('digen_lock_timestamp') || '0');
      // If another tab/instance updated the lock within the last 15 seconds, don't run!
      if (Date.now() - lastLock < 15000 && localStorage.getItem('digen_is_running') === 'true') {
          return;
      }

      isAutomatingRef.current = true;
      localStorage.setItem('digen_is_running', 'true');
      localStorage.setItem('digen_stop_requested', 'false');
      
      try {
        await runHeadlessAutomation();
      } catch (e: any) {
        writeLog(`❌ Automation Error: ${e.message}`);
      } finally {
        isAutomatingRef.current = false;
        localStorage.setItem('digen_is_running', 'false');
        localStorage.setItem('digen_force_run', 'false');
        localStorage.setItem('digen_stop_requested', 'false');
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
      // Keep lock alive at start of each product
      localStorage.setItem('digen_lock_timestamp', Date.now().toString());

      if (shouldStop()) { writeLog('🛑 Automation stopped by user.'); break; }
      writeLog(`\n--- Starting Product: ${prod.title} ---`);
      // Ensure local server has no stuck jobs from previous runs
      try { await fetch('http://localhost:3001/api/job', { method: 'DELETE' }); } catch(e) {}
      try { await fetch('http://localhost:3001/api/result', { method: 'DELETE' }); } catch(e) {}
      
      let imgPrompt = prod.image_prompt;
      let vidPrompt = prod.video_prompt;
      const imgPromptText = config.base_image_prompt || `Write a highly detailed, professional text-to-image prompt to generate a stunning, cinematic, and photorealistic showcase of this product. Place the product in an aesthetic, premium environment. Include keywords like: 8k resolution, cinematic lighting, ultra-detailed, photorealistic. Return ONLY the final prompt text.`;
      const vidPromptText = config.base_video_prompt || `Write a highly detailed text-to-video prompt for a product showcase video. The video must be exactly 10 seconds long. Describe smooth, premium camera movements. Include keywords like: exactly 10 seconds, smooth 60fps motion, cinematic product showcase. Return ONLY the final prompt text.`;

      // ─── STEP 1: Generate Image Prompt text ──────────────────────────
      if (!imgPrompt) {
        const imgData = await callGeminiWithInfiniteFallback(
          imgPromptText,
          prod.image_url,
          prod.model_photo_url || localStorage.getItem('global_model_photo'),
          '[Image Prompt]'
        );
        imgPrompt = imgData.text;
        writeLog(`✅ Image Prompt saved!`);
        if (shouldStop()) { writeLog('🛑 Automation stopped by user.'); return; }
        await fetch('/api/db/products/update-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: prod.id, image_prompt: imgPrompt, used_model: imgData.usedModel })
        });
      } else {
        writeLog(`[Image Prompt] Already exists, skipping generation.`);
      }

      // ─── STEP 2: Convert photos to base64 for the extension ───
      writeLog('Preparing product & model images for extension...');
      let productImgBase64: any = null;
      let modelImgBase64: any = null;
      
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

      if (prod.image_url) {
        productImgBase64 = await fetchBase64(prod.image_url);
        if (!productImgBase64) writeLog('Warning: Could not load product image via proxy.');
      }
      
      const modelPhotoUrl = prod.model_photo_url || localStorage.getItem('global_model_photo');
      if (modelPhotoUrl) {
        modelImgBase64 = await fetchBase64(modelPhotoUrl);
        if (!modelImgBase64) writeLog('Warning: Could not load model image via proxy.');
      }

      // ─── STEP 3: Send IMAGE PROMPT to extension → generate actual image ───
      let generatedImageBase64: string | null = null;
      if (!prod.downloaded_image_path) {
        if (shouldStop()) { writeLog('🛑 Automation stopped by user.'); break; }
        try { await fetch('http://localhost:3001/api/result'); } catch(e) {}
        writeLog('Sending Image Prompt to extension to generate the image...');
        try {
          await fetch('http://localhost:3001/api/job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              imagePrompt: imgPrompt, 
              videoPrompt: '', 
              imageBase64: [productImgBase64, modelImgBase64].filter(Boolean) 
            })
          });
        } catch(e) {
          writeLog('❌ Bridge server offline! Make sure node server.js is running on port 3001.');
          break;
        }

        // Poll for generated image
        writeLog('Waiting for Image to be generated... (Takes a few minutes)');
        while (true) {
          // Keep the lock alive while waiting
          localStorage.setItem('digen_lock_timestamp', Date.now().toString());
          
          if (shouldStop()) { writeLog('🛑 Automation stopped by user.'); break; }
          await new Promise(r => setTimeout(r, 5000));
          try {
            const res = await fetch('http://localhost:3001/api/result');
            if (res.ok) {
              const data = await res.json();
              if (data.hasResult) {
                if (data.result.success === false) {
                  writeLog(`❌ Extension reported an error: ${data.result.error || 'Unknown error'}`);
                  break;
                }
                generatedImageBase64 = data.result.mediaBase64;
                if (data.result.isNativeDownload && !generatedImageBase64) {
                   writeLog(`Image generation finished! Waiting for local download to complete (up to 2 minutes)...`);
                   for (let j = 0; j < 24; j++) {
                      await new Promise(r => setTimeout(r, 5000));
                      try {
                         const mediaRes = await fetch('http://localhost:3001/api/latest-media');
                         const mediaData = await mediaRes.json();
                         if (mediaData.success && mediaData.base64) {
                             generatedImageBase64 = mediaData.base64;
                             break;
                         }
                      } catch(e) {}
                   }
                }
                
                if (generatedImageBase64) {
                  writeLog('✅ Image generated successfully!');
                }
                break;
              }
            }
          } catch(e) { }
        }
        if (shouldStop()) break;

        if (!generatedImageBase64) {
          writeLog('❌ Failed to get generated image. Skipping to next product.');
          continue;
        }

        writeLog('Uploading generated image to Vercel Cloud Storage...');
        try {
          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64: generatedImageBase64 })
          });
          const uploadData = await uploadRes.json();
          if (uploadData.url) {
            writeLog('✅ Image uploaded! Saving URL to database...');
            prod.downloaded_image_path = uploadData.url; // Update local state for next steps
            await fetch('/api/db/products/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: prod.id, social_link_1: uploadData.url })
            });
          }
        } catch (e) {
          writeLog('❌ Failed to upload image to Vercel. Continuing anyway...');
        }

        // Keep lock alive before video prompt
        localStorage.setItem('digen_lock_timestamp', Date.now().toString());
      } else {
        writeLog(`[Image Generation] Image already exists in database, skipping generation.`);
      }

      // ─── STEP 4: Use the GENERATED IMAGE to create Video Prompt text ──
      if (!vidPrompt) {
        if (shouldStop()) { writeLog('🛑 Automation stopped by user.'); break; }
        writeLog('Waiting 5 seconds before generating Video Prompt using the new image...');
        await new Promise(r => setTimeout(r, 5000));

        // Convert the generated image base64 to a data URL if needed for Gemini
        const vidData = await callGeminiWithInfiniteFallback(
          vidPromptText,
          prod.image_url, // still pass original for context
          null,
          '[Video Prompt]'
        );
        vidPrompt = vidData.text;
        writeLog(`✅ Video Prompt saved!`);
        await fetch('/api/db/products/update-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: prod.id, video_prompt: vidPrompt, used_model: vidData.usedModel })
        });
      } else {
        writeLog(`[Video Prompt] Already exists, skipping generation.`);
      }

      // ─── STEP 5: Send VIDEO PROMPT + generated image to extension → generate video ───
      if (!prod.downloaded_video_path) {
        if (shouldStop()) { writeLog('🛑 Automation stopped by user.'); break; }
        try { await fetch('http://localhost:3001/api/result'); } catch(e) {}
        writeLog('Sending Video Prompt + generated image to extension to create the video...');
        
        // If we skipped image generation because it was already generated, we need to fetch its base64 again to send as context!
        let videoReferenceBase64 = generatedImageBase64;
        if (!videoReferenceBase64 && prod.downloaded_image_path) {
          videoReferenceBase64 = await fetchBase64(prod.downloaded_image_path);
        }

        try {
          // Absolute safety: Clear any jobs and results that might have completed while we were generating the prompt
          await fetch('http://localhost:3001/api/job', { method: 'DELETE' }).catch(() => {});
          await fetch('http://localhost:3001/api/result', { method: 'DELETE' }).catch(() => {});

          const videoInputImages = [videoReferenceBase64, productImgBase64].filter(Boolean);
          await fetch('http://localhost:3001/api/job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imagePrompt: '', videoPrompt: vidPrompt, imageBase64: videoInputImages })
          });
        } catch(e) {
          writeLog('❌ Bridge server offline!');
          break;
        }

        // Poll for generated video
        writeLog('Waiting for Video to be generated... (Takes a few minutes)');
        let finalVideoUrl: string | null = null;
        while (true) {
          if (shouldStop()) { writeLog('🛑 Automation stopped by user.'); break; }
          await new Promise(r => setTimeout(r, 5000));
          try {
            const res = await fetch('http://localhost:3001/api/result');
            if (res.ok) {
              const data = await res.json();
              if (data.hasResult) {
                if (data.result.success === false) {
                  writeLog(`❌ Extension reported an error: ${data.result.error || 'Unknown error'}`);
                  break;
                }
                
                finalVideoUrl = data.result.mediaBase64;
                
                if (data.result.isNativeDownload && !finalVideoUrl) {
                   writeLog('Video generation finished! Waiting for local download to complete...');
                   for (let j = 0; j < 24; j++) {
                      await new Promise(r => setTimeout(r, 5000));
                      try {
                         const vidRes = await fetch('http://localhost:3001/api/latest-media');
                         const vidData = await vidRes.json();
                         if (vidData.success && vidData.base64) {
                             finalVideoUrl = vidData.base64;
                             break;
                         }
                      } catch(e) {}
                   }
                }
                
                if (finalVideoUrl) {
                  writeLog('✅ Video generated successfully!');
                } else {
                  writeLog('❌ Failed to retrieve generated video.');
                }
                break;
              }
            }
          } catch(e) { }
        }
        if (shouldStop()) break;

        // ─── STEP 6: Save Video URL to DB ────────────────────────────────
        if (finalVideoUrl) {
          writeLog('Uploading generated video to Vercel Cloud Storage...');
          try {
            const uploadRes = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ base64: finalVideoUrl, isVideo: true })
            });
            const uploadData = await uploadRes.json();
            if (uploadData.url) {
              writeLog('Saving Video URL to Database...');
              prod.downloaded_video_path = uploadData.url;
              await fetch('/api/db/products/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: prod.id, social_link_2: uploadData.url, video_created: true })
              });
              writeLog(`🎉 Finished Product: ${prod.title}!`);
            }
          } catch (e) {
              writeLog('❌ Failed to upload video to Vercel.');
          }
        }
      } else {
        writeLog(`[Video Generation] Video already exists in database, skipping generation.`);
      }

      writeLog('Waiting 15 seconds before processing the next product...');
      await new Promise(r => setTimeout(r, 15000));
    }
    writeLog('\n✅ Daily Automation Complete! All products processed.');
  };

  return null;
}
