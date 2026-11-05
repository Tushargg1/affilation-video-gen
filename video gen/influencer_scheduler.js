require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const { getConfig } = require('./influencer_prompts');
const { runDailyInfluencerPipeline } = require('./influencer_pipeline');

const POLL_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes

function getDbClient() {
    return new Client({
        connectionString: process.env.DATABASE_URL || 'postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
        ssl: { rejectUnauthorized: false }
    });
}

/**
 * Check if today's reel has already been created/scheduled
 */
async function hasReelForToday(todayStr) {
    // 1. Check local file system
    const historyPath = path.join(__dirname, 'data', 'influencer_history.json');
    if (fs.existsSync(historyPath)) {
        try {
            const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
            const todayItem = history.find(h => h.target_date === todayStr && (h.status === 'scheduled' || h.status === 'posted'));
            if (todayItem && todayItem.video_url) return true;
        } catch (e) {}
    }

    // 2. Check Supabase
    try {
        const db = getDbClient();
        await db.connect();
        const res = await db.query(
            "SELECT id, status, video_url FROM influencer_reels WHERE target_date = $1 AND status IN ('scheduled', 'posted') LIMIT 1",
            [todayStr]
        );
        await db.end();
        if (res.rows.length > 0 && res.rows[0].video_url) return true;
    } catch (e) {
        // Fallback to local check
    }

    return false;
}

let isRunningGeneration = false;

async function checkAndRunDailyScheduler() {
    if (isRunningGeneration) {
        console.log(`[Scheduler] Generation pipeline is currently running. Skipping tick.`);
        return;
    }

    const config = getConfig();
    const todayStr = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString();

    console.log(`\n======================================================`);
    console.log(`⏰ [${nowTime}] AI Influencer Daily Scheduler Heartbeat`);
    console.log(`📅 Date: ${todayStr} | Post Target: 1 Reel Daily at ${config.daily_post_time || '19:00'}`);
    console.log(`======================================================`);

    if (!config.scheduler_enabled) {
        console.log(`⏸️ Scheduler is currently disabled in config. Waiting...`);
        return;
    }

    const alreadyDone = await hasReelForToday(todayStr);
    if (alreadyDone) {
        console.log(`✅ Today's 50-second reel has already been generated and scheduled!`);
        console.log(`💤 Sleeping until next check...`);
        return;
    }

    console.log(`🎯 Today's reel has not been created yet. Launching 50s Reel Generation Pipeline...`);

    isRunningGeneration = true;
    try {
        await runDailyInfluencerPipeline();
        console.log(`\n🎉 Today's Reel pipeline successfully finished!`);
    } catch (err) {
        console.error(`\n❌ Error during daily pipeline execution:`, err.message);
    } finally {
        isRunningGeneration = false;
    }
}

// Start scheduler immediately on boot, then run every 15 minutes
console.log(`\n==========================================================`);
console.log(`🤖 AI INFLUENCER 50-SECOND REEL AUTONOMOUS SCHEDULER STARTED`);
console.log(`==========================================================`);
console.log(`• Generates 1 reel daily of 50 seconds (5 x 10s clips)`);
console.log(`• Exact video gen automation workflow preserved`);
console.log(`• Concatenates all 5 clips seamlessly with FFmpeg`);
console.log(`• Uploads high quality MP4 to Vercel Cloud Storage`);
console.log(`• Auto-schedules to Instagram, YouTube, and Facebook at set time`);
console.log(`==========================================================\n`);

checkAndRunDailyScheduler();
setInterval(checkAndRunDailyScheduler, POLL_INTERVAL_MS);
