require('dotenv').config();
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');
const { put } = require('@vercel/blob');

// Ensure you have BLOB_READ_WRITE_TOKEN in your .env

async function getConfig() {
    const defaultConfig = {
        scheduler_enabled: true,
        daily_target: 4,
        schedule_times: ['02:00', '06:00', '09:00', '19:00']
    };
    try {
        const res = await fetch('https://nextjs-poster-eta.vercel.app/api/config');
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.error("Error reading config from cloud, using defaults:", e.message);
    }
    return defaultConfig;
}

function getNextScheduleTime(generatedToday, config) {
    const target = new Date();
    const times = config.schedule_times || ['02:00', '06:00', '09:00', '19:00'];
    
    // Safety check if daily target changed
    if (generatedToday >= times.length) return null;
    
    const timeStr = times[generatedToday];
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    target.setHours(hours, minutes || 0, 0, 0);
    
    // If the scheduled time is earlier than NOW (e.g. it's 3 PM and time is 2 AM), 
    // it implies it should be scheduled for tomorrow.
    // Except if we are eagerly scheduling. Let's just push to tomorrow if past.
    if (target < new Date()) {
        target.setDate(target.getDate() + 1);
    }
    
    return target.toISOString();
}

async function checkAndGenerate() {
    console.log(`\n[${new Date().toLocaleTimeString()}] Checking generation schedule...`);
    
    const config = await getConfig();
    if (!config.scheduler_enabled) {
        console.log(`Scheduler is currently PAUSED via UI configuration. Waiting...`);
        return;
    }

    const DAILY_TARGET = config.daily_target || 4;

    console.log(`Connecting to Supabase...`);
    const db = new Client({
        connectionString: "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
    });
    await db.connect();

    try {
        const countRes = await db.query(`SELECT COUNT(*) as count FROM auto_products WHERE date(created_at) = CURRENT_DATE AND status = 'scheduled'`);
        const generatedToday = parseInt(countRes.rows[0].count) || 0;
        console.log(`Videos scheduled today: ${generatedToday} / ${DAILY_TARGET}`);

        if (generatedToday >= DAILY_TARGET) {
            console.log("✅ Daily target reached! Sleeping until tomorrow.");
            await db.end();
            return;
        }

        const productRes = await db.query(`SELECT id, title, video_prompt, image_prompt FROM auto_products WHERE status = 'prompted' LIMIT 1`);
        
        if (productRes.rows.length === 0) {
            console.log("No pending products found with 'prompted' status.");
            await db.end();
            return;
        }

        const product = productRes.rows[0];
        console.log(`🎯 Triggering Generation & Upload for Product [ID: ${product.id}] - ${(product.title || '').slice(0, 30)}...`);
        
        try {
            // ==========================================
            // RUN EXISTING DIGEN AUTOMATION HERE
            // ==========================================
            console.log(`> Executing Digen automation for prompt...`);
            
            // Call your local server.js
            const genRes = await fetch('http://localhost:3001/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: product.video_prompt })
            });
            
            const genData = await genRes.json();
            if (!genData.success) {
                throw new Error(`Video generator failed: ${genData.error}`);
            }
            
            console.log(`> Automation started successfully. Waiting 3.5 minutes for Digen to finish and download...`);
            
            // Wait for generation to finish and file to download (approx 3.5 minutes)
            await new Promise(r => setTimeout(r, 210000));
            
            // Find the most recently downloaded .mp4 file in the Windows Downloads folder
            const downloadsFolder = path.join(process.env.USERPROFILE, 'Downloads');
            const files = fs.readdirSync(downloadsFolder);
            
            let latestMp4 = null;
            let latestTime = 0;
            
            files.forEach(file => {
                if (file.endsWith('.mp4')) {
                    const fullPath = path.join(downloadsFolder, file);
                    const stat = fs.statSync(fullPath);
                    if (stat.mtimeMs > latestTime) {
                        latestTime = stat.mtimeMs;
                        latestMp4 = fullPath;
                    }
                }
            });
            
            if (!latestMp4) {
                throw new Error("Could not find a newly downloaded .mp4 file in Downloads.");
            }
            
            console.log(`> Found generated video: ${latestMp4}`);

            // ==========================================
            // UPLOAD TO VERCEL BLOB
            // ==========================================
            console.log(`> Uploading to Vercel Blob...`);
            if (!process.env.BLOB_READ_WRITE_TOKEN) {
                throw new Error("BLOB_READ_WRITE_TOKEN is missing in .env");
            }
            
            const fileBuffer = fs.readFileSync(latestMp4);
            const blobName = `video_${product.id}_${Date.now()}.mp4`;
            const { url: videoUrl } = await put(blobName, fileBuffer, {
                access: 'public',
                token: process.env.BLOB_READ_WRITE_TOKEN
            });
            console.log(`> Uploaded successfully: ${videoUrl}`);
            
            // Cleanup local file (optional: remove if you want to keep copies locally)
            // fs.unlinkSync(latestMp4);

            // ==========================================
            // SEND TO NEXT.JS QSTASH SCHEDULER
            // ==========================================
            const scheduleTime = getNextScheduleTime(generatedToday, config);
            console.log(`> Scheduling post for: ${new Date(scheduleTime).toLocaleString()}`);
            
            const scheduleRes = await fetch('https://nextjs-poster-eta.vercel.app/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoUrl: videoUrl,
                    blobName: blobName,
                    description: '', // Leaving this blank makes your Next.js server write an engaging caption via Gemini!
                    platforms: ['youtube', 'facebook', 'instagram'],
                    scheduleTime: scheduleTime
                })
            });
            
            const scheduleData = await scheduleRes.json();
            if (!scheduleRes.ok) {
                throw new Error(`Scheduling failed: ${scheduleData.error || JSON.stringify(scheduleData)}`);
            }
            
            console.log(`> Scheduled successfully! QStash Message ID: ${scheduleData.messageId}`);

            // ==========================================
            // UPDATE LOCAL DATABASE
            // ==========================================
            await db.query(
                `UPDATE auto_products SET status = 'scheduled', video_created = 1, downloaded_video_path = $1 WHERE id = $2`,
                [latestMp4, product.id]
            );
            console.log(`✅ Product [ID: ${product.id}] fully scheduled and complete!`);
            
        } catch (err) {
            console.error(`❌ Process failed for product ${product.id}:`, err.message);
        }

        await db.end();
    } catch (err) {
        console.error("Database error:", err);
        await db.end();
    }
}

// Start sequence
checkAndGenerate();
setInterval(checkAndGenerate, 30 * 60 * 1000);
console.log("⏳ Advanced Scheduler Started. Monitoring for generations and cloud uploads...");
