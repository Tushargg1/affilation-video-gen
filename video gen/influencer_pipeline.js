require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const { getConfig, generateInfluencerPrompts } = require('./influencer_prompts');

const LOCAL_SERVER_URL = 'http://localhost:3001';

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Helper to get local PG client (Supabase)
 */
function getDbClient() {
    return new Client({
        connectionString: process.env.DATABASE_URL || 'postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
        ssl: { rejectUnauthorized: false }
    });
}

/**
 * Save history to local JSON as fallback/persistence
 */
function saveLocalReelHistory(reelRecord) {
    try {
        const historyPath = path.join(__dirname, 'data', 'influencer_history.json');
        const dir = path.dirname(historyPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        let history = [];
        if (fs.existsSync(historyPath)) {
            try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) {}
        }
        const existingIdx = history.findIndex(h => h.id === reelRecord.id || h.target_date === reelRecord.target_date);
        if (existingIdx >= 0) {
            history[existingIdx] = { ...history[existingIdx], ...reelRecord, updated_at: new Date().toISOString() };
        } else {
            history.unshift({ ...reelRecord, created_at: new Date().toISOString() });
        }
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    } catch (err) {
        console.error('[Pipeline] Could not save local history:', err.message);
    }
}

/**
 * Runs a single 10-second clip generation through the existing video gen automation
 * @param {string} prompt 10-sec clip prompt
 * @param {number} sceneIndex 1-based index (1 to 5)
 * @param {string} targetClipPath Destination file path
 * @param {string|null} referenceImageBase64 Optional model/influencer photo base64
 * @returns {Promise<string>} Saved clip file path
 */
async function generateSingle10sClip(prompt, sceneIndex, targetClipPath, referenceImageBase64 = null) {
    console.log(`\n======================================================`);
    console.log(`🎬 [Clip ${sceneIndex}/5] Starting 10-second video generation...`);
    console.log(`📝 Prompt: "${prompt.slice(0, 80)}..."`);
    console.log(`======================================================`);

    // Check if target clip already exists
    if (fs.existsSync(targetClipPath)) {
        const stat = fs.statSync(targetClipPath);
        if (stat.size > 50000) {
            console.log(`✅ [Clip ${sceneIndex}/5] Already generated and exists at: ${targetClipPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
            return targetClipPath;
        }
    }

    // Ensure bridge server is running
    try {
        const healthRes = await fetch(`${LOCAL_SERVER_URL}/api/job`);
        if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
    } catch (e) {
        throw new Error(`Automation bridge server offline! Please make sure 'node server.js' is running on port 3001.`);
    }

    // 1. Clear any stuck previous jobs or results
    await fetch(`${LOCAL_SERVER_URL}/api/job`, { method: 'DELETE' }).catch(() => {});
    await fetch(`${LOCAL_SERVER_URL}/api/result`, { method: 'DELETE' }).catch(() => {});

    const jobStartTime = Date.now();

    // 2. Queue job for extension (UNCHANGED VIDEO GEN AUTOMATION)
    console.log(`> Queuing prompt to local server /api/job for browser extension...`);
    const jobPayload = {
        imagePrompt: '',
        videoPrompt: prompt,
        imageBase64: referenceImageBase64 ? [referenceImageBase64] : []
    };

    const submitRes = await fetch(`${LOCAL_SERVER_URL}/api/job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobPayload)
    });

    if (!submitRes.ok) {
        throw new Error(`Failed to queue job: HTTP ${submitRes.status}`);
    }
    console.log(`> Job queued successfully! Extension will pick it up, submit to Google Flow, and download 1080p high quality video.`);

    // 3. Poll for result and download
    let downloadedFilePath = null;
    const maxWaitMinutes = 15;
    const maxWaitLoops = maxWaitMinutes * 12; // checks every 5 seconds

    console.log(`⏳ Waiting for Clip ${sceneIndex} generation and 1080p download (up to ${maxWaitMinutes} mins)...`);

    for (let loop = 0; loop < maxWaitLoops; loop++) {
        await sleep(5000);

        // Check if extension completed
        try {
            const resRes = await fetch(`${LOCAL_SERVER_URL}/api/result`);
            if (resRes.ok) {
                const resData = await resRes.json();
                if (resData.hasResult) {
                    if (resData.result.success === false) {
                        throw new Error(`Extension reported error: ${resData.result.error || 'Unknown error'}`);
                    }
                    console.log(`> Extension notified generation finished! Checking Downloads folder for .mp4...`);
                }
            }
        } catch (e) {
            if (e.message.includes('Extension reported error')) throw e;
        }

        // Poll server for latest downloaded video in Windows Downloads folder
        try {
            const mediaRes = await fetch(`${LOCAL_SERVER_URL}/api/latest-media?type=video&job_start_time=${jobStartTime}`);
            if (mediaRes.ok) {
                const mediaData = await mediaRes.json();
                if (mediaData.success && mediaData.filepath) {
                    downloadedFilePath = mediaData.filepath;
                    console.log(`✅ [Clip ${sceneIndex}/5] Found high quality downloaded video: ${mediaData.filename}`);
                    break;
                }
            }
        } catch (e) {}

        if (loop % 6 === 0 && loop > 0) {
            console.log(`  ...still waiting for Clip ${sceneIndex} (${Math.round((loop * 5) / 60)}m elapsed)`);
        }
    }

    if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
        throw new Error(`Timed out waiting for Clip ${sceneIndex} download after ${maxWaitMinutes} minutes.`);
    }

    // 4. Move/Copy downloaded clip into organized project storage
    const targetDir = path.dirname(targetClipPath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    fs.copyFileSync(downloadedFilePath, targetClipPath);
    console.log(`📁 [Clip ${sceneIndex}/5] Saved to reel storage: ${targetClipPath}`);

    // Wait a brief 5s buffer before the next clip
    await sleep(5000);

    return targetClipPath;
}

/**
 * Concat 5 clips together into 1 single 50-second reel
 * @param {string[]} clipPaths Array of 5 clip paths
 * @param {string} outputPath Target merged MP4 path
 * @returns {Promise<{ filepath: string, duration: number }>}
 */
async function concat5Clips(clipPaths, outputPath) {
    console.log(`\n🎬 Concatenating all ${clipPaths.length} clips into a single 50-second reel...`);

    const concatRes = await fetch(`${LOCAL_SERVER_URL}/api/concat-clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clipPaths: clipPaths,
            outputPath: outputPath
        })
    });

    const concatData = await concatRes.json();
    if (!concatRes.ok || !concatData.success) {
        throw new Error(`Video concatenation failed: ${concatData.error || JSON.stringify(concatData)}`);
    }

    console.log(`✅ Successfully merged 5 clips into: ${concatData.filepath}`);
    console.log(`⏱️ Verified final duration: ${concatData.duration ? concatData.duration.toFixed(1) + 's' : '50s'}`);

    return concatData;
}

/**
 * Upload local file to Vercel Blob
 * @param {string} filepath Local video path
 * @returns {Promise<string>} Public Blob URL
 */
async function uploadToBlob(filepath) {
    console.log(`\n☁️ Uploading 50-second reel to Vercel Cloud Storage...`);
    const uploadRes = await fetch(`${LOCAL_SERVER_URL}/api/upload-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath })
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.url) {
        throw new Error(`Blob upload failed: ${uploadData.error || 'No URL returned'}`);
    }

    console.log(`✅ Upload complete! Public URL: ${uploadData.url}`);
    return uploadData.url;
}

/**
 * Calculate the next scheduled ISO time for today's post (or tomorrow if passed)
 * @param {string} targetTimeStr e.g. "19:00"
 * @returns {string} ISO Date string
 */
function calculateScheduleTime(targetTimeStr = '19:00') {
    const target = new Date();
    const [hours, minutes] = targetTimeStr.split(':').map(Number);
    target.setHours(hours, minutes || 0, 0, 0);

    // If already past the set time, schedule for tomorrow
    if (target.getTime() <= Date.now() + 5 * 60 * 1000) {
        target.setDate(target.getDate() + 1);
    }
    return target.toISOString();
}

/**
 * Schedule the final 50s reel via Next.js QStash
 */
async function scheduleReelPost(videoUrl, reelPlan, scheduleTimeIso, cloudApiUrl) {
    console.log(`\n📅 Scheduling reel to auto-post at: ${new Date(scheduleTimeIso).toLocaleString()}...`);
    const endpoint = `${cloudApiUrl || 'https://nextjs-poster-eta.vercel.app'}/api/schedule`;

    const blobName = `influencer_reel_${Date.now()}.mp4`;

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            videoUrl: videoUrl,
            blobName: blobName,
            title: reelPlan.reel_title,
            description: reelPlan.captions.instagram,
            isInfluencer: true,
            platforms: ['instagram', 'youtube', 'facebook'],
            scheduleTime: scheduleTimeIso
        })
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Scheduling API returned error: ${data.error || JSON.stringify(data)}`);
    }

    console.log(`✅ Scheduled successfully! QStash Message ID: ${data.messageId}`);
    return { success: true, messageId: data.messageId, blobName };
}

/**
 * MASTER FUNCTION: Executes the complete end-to-end AI Influencer 50-Second Reel Pipeline
 * 1. Generates 5 x 10s prompts
 * 2. Generates Clip 1 -> 5 sequentially using exact unchanged video gen automation
 * 3. Concatenates all 5 clips into single 50s video
 * 4. Uploads to Vercel Blob
 * 5. Schedules auto-post for the set time
 */
async function runDailyInfluencerPipeline(options = {}) {
    console.log(`\n======================================================`);
    console.log(`🌟 STARTING DAILY AI INFLUENCER REEL PIPELINE`);
    console.log(`🎯 TARGET: 1 Reel Daily of 50 Seconds (5 x 10s clips)`);
    console.log(`======================================================\n`);

    const config = getConfig();
    const todayStr = new Date().toISOString().split('T')[0];
    const reelStorageDir = path.join(__dirname, 'data', 'influencer_reels', `reel_${todayStr}`);
    if (!fs.existsSync(reelStorageDir)) fs.mkdirSync(reelStorageDir, { recursive: true });

    // Step 1: Generate or load prompts
    let plan = options.plan;
    const planFile = path.join(reelStorageDir, 'plan.json');

    if (!plan) {
        if (fs.existsSync(planFile)) {
            console.log(`📖 Loading existing plan for today from: ${planFile}`);
            try { plan = JSON.parse(fs.readFileSync(planFile, 'utf8')); } catch (e) {}
        }
    }

    if (!plan) {
        console.log(`Generating new 50s reel script and 5 scene prompts with Gemini...`);
        plan = await generateInfluencerPrompts(options.customTopic || null);
        fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
    }

    // Step 2: Generate all 5 clips sequentially (10s each)
    const clipPaths = [];
    const scenes = plan.scenes || [];

    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const clipNum = scene.scene_index || (i + 1);
        const targetClipPath = path.join(reelStorageDir, `clip_${clipNum}.mp4`);

        const savedPath = await generateSingle10sClip(
            scene.video_prompt,
            clipNum,
            targetClipPath,
            options.referenceImageBase64 || null
        );
        clipPaths.push(savedPath);
    }

    console.log(`\n🎉 All ${clipPaths.length} clips (10s each) successfully generated!`);

    // Step 3: Concatenate all 5 clips into 1 cohesive 50-second reel
    const mergedOutputPath = path.join(reelStorageDir, `final_reel_50s_${todayStr}.mp4`);
    const mergeResult = await concat5Clips(clipPaths, mergedOutputPath);

    // Step 4: Upload 50-second reel to Vercel Cloud Blob
    const videoUrl = await uploadToBlob(mergeResult.filepath);

    // Step 5: Schedule auto-post at the set daily time
    const targetPostTime = config.daily_post_time || '19:00';
    const scheduleTimeIso = calculateScheduleTime(targetPostTime);
    const scheduleResult = await scheduleReelPost(videoUrl, plan, scheduleTimeIso, config.cloud_api_url);

    // Step 6: Persist record in Supabase & local JSON
    const reelRecord = {
        title: plan.reel_title,
        topic: plan.topic,
        caption: plan.captions.instagram,
        status: 'scheduled',
        target_date: todayStr,
        scheduled_time: scheduleTimeIso,
        clip_prompts: plan.scenes,
        clip_paths: clipPaths,
        merged_video_path: mergeResult.filepath,
        video_url: videoUrl,
        platforms: config.platforms || ['instagram', 'youtube', 'facebook'],
        is_posted: false
    };

    saveLocalReelHistory(reelRecord);

    try {
        const db = getDbClient();
        await db.connect();
        await db.query(`
            INSERT INTO influencer_reels (
                title, topic, caption, status, target_date, scheduled_time,
                clip_prompts, clip_paths, merged_video_path, video_url, platforms, is_posted
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
            reelRecord.title,
            reelRecord.topic,
            reelRecord.caption,
            reelRecord.status,
            reelRecord.target_date,
            reelRecord.scheduled_time,
            JSON.stringify(reelRecord.clip_prompts),
            JSON.stringify(reelRecord.clip_paths),
            reelRecord.merged_video_path,
            reelRecord.video_url,
            JSON.stringify(reelRecord.platforms),
            reelRecord.is_posted
        ]);
        await db.end();
        console.log(`💾 Saved reel record to Supabase database!`);
    } catch (dbErr) {
        console.warn(`[Pipeline] Supabase save warning: ${dbErr.message} (local history saved)`);
    }

    console.log(`\n======================================================`);
    console.log(`🚀 [COMPLETED] Today's 50-Second AI Influencer Reel is Ready & Scheduled!`);
    console.log(`📺 Reel: "${plan.reel_title}"`);
    console.log(`🔗 Video: ${videoUrl}`);
    console.log(`⏰ Scheduled Post Time: ${new Date(scheduleTimeIso).toLocaleString()}`);
    console.log(`======================================================\n`);

    return {
        success: true,
        plan,
        clipPaths,
        mergedVideoPath: mergeResult.filepath,
        videoUrl,
        scheduleTime: scheduleTimeIso,
        scheduleResult
    };
}

module.exports = {
    generateSingle10sClip,
    concat5Clips,
    uploadToBlob,
    scheduleReelPost,
    runDailyInfluencerPipeline
};
