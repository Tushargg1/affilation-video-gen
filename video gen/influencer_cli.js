require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { getConfig, generateInfluencerPrompts } = require('./influencer_prompts');
const { runDailyInfluencerPipeline, concat5Clips } = require('./influencer_pipeline');

const args = process.argv.slice(2);
const command = (args[0] || 'help').toLowerCase();

async function main() {
    switch (command) {
        case 'generate':
        case 'run': {
            const topic = args.slice(1).join(' ') || null;
            console.log(`Starting immediate reel generation${topic ? ` with topic: "${topic}"` : ''}...`);
            await runDailyInfluencerPipeline({ customTopic: topic });
            break;
        }

        case 'prompt':
        case 'plan': {
            const topic = args.slice(1).join(' ') || null;
            console.log(`Generating 5-scene prompt plan${topic ? ` for topic: "${topic}"` : ''}...`);
            const plan = await generateInfluencerPrompts(topic);
            console.log('\n--- GENERATED PLAN ---');
            console.log(JSON.stringify(plan, null, 2));

            const todayStr = new Date().toISOString().split('T')[0];
            const dir = path.join(__dirname, 'data', 'influencer_reels', `reel_${todayStr}`);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 2));
            console.log(`\n💾 Saved to: ${path.join(dir, 'plan.json')}`);
            break;
        }

        case 'status': {
            const todayStr = new Date().toISOString().split('T')[0];
            const historyPath = path.join(__dirname, 'data', 'influencer_history.json');
            console.log(`\n📊 Status for: ${todayStr}`);
            if (fs.existsSync(historyPath)) {
                const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
                const today = history.find(h => h.target_date === todayStr);
                if (today) {
                    console.log(`Title: ${today.title}`);
                    console.log(`Status: ${today.status}`);
                    console.log(`Scheduled For: ${today.scheduled_time}`);
                    console.log(`Video URL: ${today.video_url}`);
                    console.log(`Clips: ${today.clip_paths?.length || 0}/5 generated`);
                } else {
                    console.log(`No reel generated yet today.`);
                }
            } else {
                console.log(`No history found.`);
            }
            break;
        }

        case 'concat': {
            const folderArg = args[1];
            if (!folderArg) {
                console.log('Usage: node influencer_cli.js concat <path_to_folder_with_5_clips>');
                return;
            }
            const folderPath = path.resolve(folderArg);
            const files = fs.readdirSync(folderPath)
                .filter(f => f.endsWith('.mp4') && !f.startsWith('final_'))
                .sort()
                .map(f => path.join(folderPath, f));

            if (files.length === 0) {
                console.error('No .mp4 clips found in folder:', folderPath);
                return;
            }
            console.log(`Found ${files.length} clips to merge:`, files);
            const out = path.join(folderPath, `final_merged_50s_${Date.now()}.mp4`);
            await concat5Clips(files, out);
            console.log(`✅ Merged video saved to: ${out}`);
            break;
        }

        case 'set-time': {
            const timeStr = args[1];
            if (!timeStr || !timeStr.includes(':')) {
                console.log('Usage: node influencer_cli.js set-time HH:MM (e.g. 19:00)');
                return;
            }
            const configPath = path.join(__dirname, 'influencer_config.json');
            const config = getConfig();
            config.daily_post_time = timeStr;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log(`✅ Daily post time updated to: ${timeStr}`);
            break;
        }

        default: {
            console.log(`
AI INFLUENCER REEL CLI
Commands:
  node influencer_cli.js run [optional topic]   - Generate today's 50s reel (5 x 10s clips, merged, uploaded, scheduled)
  node influencer_cli.js prompt [topic]         - Generate and view today's 5-scene prompt plan with Gemini
  node influencer_cli.js status                 - Check status of today's reel
  node influencer_cli.js concat <folder>        - Merge 5 clips in a folder into a single 50s reel
  node influencer_cli.js set-time HH:MM         - Change daily post time (e.g. 19:00)
            `);
        }
    }
}

main().catch(err => {
    console.error('CLI Error:', err.message);
    process.exit(1);
});
