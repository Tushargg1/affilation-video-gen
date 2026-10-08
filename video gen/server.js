require('dotenv').config();
const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for images

// Serve the UI page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui.html'));
});

let ffmpegPath;
let ffmpeg;
try {
    ffmpegPath = require('ffmpeg-static');
    ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegPath);
} catch (e) {
    console.warn("fluent-ffmpeg not installed, merge API will not work");
}

let currentJob = null;

app.post('/api/job', (req, res) => {
    const { imagePrompt, videoPrompt, imageBase64, target } = req.body;
    if (!imagePrompt && !videoPrompt) return res.status(400).json({ success: false, error: 'Missing prompts' });
    currentJob = { imagePrompt, videoPrompt, imageBase64, timestamp: Date.now() };
    console.log(`\n📥 Received new ${target === 'image' ? 'Image' : 'Video'} Gen Job from Dashboard!`);
    res.json({ success: true, message: 'Job queued for extension!' });
});

app.get('/api/job', (req, res) => {
    // The extension will poll this every few seconds
    if (currentJob) {
        res.json({ hasJob: true, job: currentJob });
    } else {
        res.json({ hasJob: false });
    }
});

app.delete('/api/job', (req, res) => {
    currentJob = null;
    console.log(`\n✅ Job picked up and cleared by the extension!`);
    res.json({ success: true });
});

let jobResult = null;

app.post('/api/result', (req, res) => {
    jobResult = req.body;
    console.log(`\n🎉 Received result from extension! (success: ${jobResult.success})`);
    res.json({ success: true });
});

app.delete('/api/result', (req, res) => {
    jobResult = null;
    res.json({ success: true });
});

app.get('/api/result', (req, res) => {
    if (jobResult) {
        const result = jobResult;
        jobResult = null; // Clear it so we don't return it twice
        res.json({ hasResult: true, result });
    } else {
        res.json({ hasResult: false });
    }
});

app.get('/api/latest-media', (req, res) => {
    try {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const dlPath = path.join(os.homedir(), 'Downloads');
        
        const type = req.query.type || 'video';
        // job_start_time: only accept files strictly NEWER than this timestamp.
        // Defaults to 15 minutes ago as a fallback safety window.
        const jobStartTime = req.query.job_start_time 
            ? parseInt(req.query.job_start_time)
            : Date.now() - 15 * 60 * 1000;
        
        const files = fs.readdirSync(dlPath)
            .filter(f => {
                if (type === 'video') {
                    // STRICTLY only .mp4 or .webm — never a PNG/JPG
                    return f.endsWith('.mp4') || f.endsWith('.webm');
                }
                return f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.webp');
            })
            .map(f => ({
                name: f,
                time: fs.statSync(path.join(dlPath, f)).mtime.getTime()
            }))
            // Only include files that are NEWER than the job start time
            .filter(f => f.time > jobStartTime)
            .sort((a, b) => b.time - a.time);
            
        if (files.length > 0) {
            const newestFile = files[0];
            const filePath = path.join(dlPath, newestFile.name);
            
            // For video: wait until the file size is stable (not still downloading)
            if (type === 'video') {
                const size1 = fs.statSync(filePath).size;
                // We can't block the event loop, but we can do a quick non-blocking check
                // If size is 0 or very small, it's still downloading
                if (size1 < 50000) { // Less than 50KB means still downloading
                    return res.json({ success: false, error: 'Video file found but still downloading (too small)' });
                }
            }
            
            const fileData = fs.readFileSync(filePath);
            let mimeType = 'video/mp4';
            if (newestFile.name.endsWith('.webm')) mimeType = 'video/webm';
            if (newestFile.name.endsWith('.jpg') || newestFile.name.endsWith('.jpeg')) mimeType = 'image/jpeg';
            if (newestFile.name.endsWith('.png')) mimeType = 'image/png';
            if (newestFile.name.endsWith('.webp')) mimeType = 'image/webp';
            
            const base64 = `data:${mimeType};base64,` + fileData.toString('base64');
            console.log(`\n📁 Serving latest ${type}: ${newestFile.name} (${(fileData.length / 1024 / 1024).toFixed(1)} MB)`);
            return res.json({ success: true, base64: base64, filename: newestFile.name, filepath: filePath });
        }
        res.json({ success: false, error: `No recent ${type} found in Downloads newer than job start time` });
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/merge-video', async (req, res) => {
    let localBase = null;
    let localOutro = null;
    try {
        const { baseVideoUrl, outroVideoUrl } = req.body;
        if (!baseVideoUrl || !outroVideoUrl) {
            return res.status(400).json({ error: 'Missing video URLs' });
        }
        
        console.log(`\n🎬 Merging videos locally...`);
        const os = require('os');
        const path = require('path');
        const fs = require('fs');
        
        // Helper to download remote files
        const downloadFile = async (url, prefix) => {
            if (!url.startsWith('http')) return url; // Already local
            console.log(`Downloading ${prefix} video from ${url}...`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch ${url}`);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const tempPath = path.join(os.tmpdir(), `${prefix}-${Date.now()}.mp4`);
            fs.writeFileSync(tempPath, buffer);
            return tempPath;
        };

        localBase = await downloadFile(baseVideoUrl, 'base');
        localOutro = await downloadFile(outroVideoUrl, 'outro');

        const outputPath = path.join(os.homedir(), 'Downloads', `merged-${Date.now()}.mp4`);
        
        // Use fluent-ffmpeg to merge
        if (!ffmpeg) {
            return res.status(500).json({ error: 'fluent-ffmpeg not available' });
        }
        
        ffmpeg()
            .input(localBase)
            .input(localOutro)
            .complexFilter([
                '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[v0]',
                '[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[v1]',
                '[v0][v1]concat=n=2:v=1:a=0[outv]'
            ])
            .outputOptions([
                '-map [outv]',
                '-c:v libx264',
                '-preset ultrafast'
            ])
            .save(outputPath)
            .on('end', () => {
                console.log(`✅ Merge complete! Saved to ${outputPath}`);
                // Cleanup temp files
                if (localBase && localBase !== baseVideoUrl) fs.unlinkSync(localBase);
                if (localOutro && localOutro !== outroVideoUrl) fs.unlinkSync(localOutro);
                res.json({ success: true, filepath: outputPath });
            })
            .on('error', (err) => {
                console.error(`❌ Merge failed: ${err.message}`);
                if (localBase && localBase !== baseVideoUrl) fs.unlinkSync(localBase);
                if (localOutro && localOutro !== outroVideoUrl) fs.unlinkSync(localOutro);
                res.status(500).json({ error: err.message });
            });
            
    } catch (e) {
        console.error('Merge API error:', e);
        if (localBase && localBase !== req.body.baseVideoUrl && require('fs').existsSync(localBase)) require('fs').unlinkSync(localBase);
        if (localOutro && localOutro !== req.body.outroVideoUrl && require('fs').existsSync(localOutro)) require('fs').unlinkSync(localOutro);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/upload-local', async (req, res) => {
    try {
        const { filepath } = req.body;
        if (!filepath || !fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'File not found locally' });
        }
        
        console.log(`\n☁️ Uploading to Vercel Blob directly from server: ${filepath}`);
        const data = fs.readFileSync(filepath);
        const { put } = require('@vercel/blob');
        
        let ext = 'png';
        let contentType = 'image/png';
        if (filepath.endsWith('.mp4')) { ext = 'mp4'; contentType = 'video/mp4'; }
        else if (filepath.endsWith('.webm')) { ext = 'webm'; contentType = 'video/webm'; }
        else if (filepath.endsWith('.jpg') || filepath.endsWith('.jpeg')) { ext = 'jpg'; contentType = 'image/jpeg'; }
        else if (filepath.endsWith('.webp')) { ext = 'webp'; contentType = 'image/webp'; }
        
        const blob = await put(`generated-${Date.now()}.${ext}`, data, {
            access: 'public',
            contentType: contentType,
            token: process.env.BLOB_READ_WRITE_TOKEN
        });
        
        console.log(`✅ Upload complete: ${blob.url}`);
        res.json({ url: blob.url });
    } catch(e) {
        console.error('Upload error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/media/:filename', (req, res) => {
    try {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(os.homedir(), 'Downloads', req.params.filename);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('Not found');
        }
    } catch(e) {
        res.status(500).send(e.message);
    }
});

app.post('/generate', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });

    console.log(`\n🚀 Received generate request for: "${prompt.slice(0, 50)}..."`);
    
    // Use a dedicated automation profile so we NEVER conflict with your main Edge browser (Fixes Error 32 Lock file)
    const USER_DATA = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'DigenAutomationProfile');
    let browser;
    let context;
    let isCDP = false;
    
    try {
        console.log('Attempting to connect to running Edge (port 9222)...');
        try {
            browser = await chromium.connectOverCDP('http://localhost:9222');
            context = browser.contexts()[0];
            isCDP = true;
            console.log('✅ Connected to existing Edge instance via CDP!');
        } catch (cdpErr) {
            console.log('No CDP instance found. Trying to launch persistent context...');
            context = await chromium.launchPersistentContext(USER_DATA, {
                headless: false,
                channel: 'msedge',
                args: ['--no-first-run', '--no-default-browser-check'],
                slowMo: 300,
                viewport: null
            });
        }

        let page;
        if (isCDP) {
            // Find existing Digen AI tab or create a new one
            const pages = context.pages();
            page = pages.find(p => p.url().includes('digen.ai'));
            if (page) {
                await page.bringToFront();
            } else {
                page = await context.newPage();
            }
        } else {
            page = await context.newPage();
        }

        console.log('Navigating to digen.ai/create...');
        if (!page.url().includes('digen.ai/create')) {
            await page.goto('https://digen.ai/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
        await page.waitForTimeout(5000);

        // Find buttons
        const buttons = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('button, [role="button"]'));
            return els.map((el, i) => {
                const rect = el.getBoundingClientRect();
                return {
                    text: el.textContent.trim().slice(0, 100),
                    disabled: el.disabled || el.getAttribute('disabled') !== null,
                    visible: rect.width > 0 && rect.height > 0,
                    x: Math.round(rect.x + rect.width / 2),
                    y: Math.round(rect.y + rect.height / 2)
                };
            });
        });

        const generateBtn = buttons.find(b => b.visible && !b.disabled && b.text.toLowerCase().includes('generate'));
        
        if (generateBtn) {
            console.log('✅ Found generate button');

            // Fill the textarea
            const textarea = await page.$('textarea');
            if (textarea) {
                console.log('⌨️  Filling prompt using mouse and keyboard...');
                // Click to focus and select all (clickCount: 3 selects the paragraph, but in textarea often selects all)
                await textarea.click({ clickCount: 3 });
                await page.keyboard.press('Backspace'); // clear existing
                await textarea.fill(prompt);
                await page.waitForTimeout(1000);
            } else {
                throw new Error("Could not find textarea to enter prompt");
            }

            // Click generate button using native mouse move and click
            console.log('🎯 Moving mouse to Generate button and clicking...');
            await page.mouse.move(generateBtn.x, generateBtn.y, { steps: 10 });
            await page.waitForTimeout(500);
            await page.mouse.click(generateBtn.x, generateBtn.y);
            
            console.log('✅ Clicked generate!');
            
            // Wait to let generation start
            await page.waitForTimeout(5000);
            
            if (!isCDP) await context.close();
            else if (browser) await browser.disconnect();
            
            return res.json({ success: true, message: 'Automation complete' });
        } else {
            if (!isCDP) await context.close();
            else if (browser) await browser.disconnect();
            return res.status(400).json({ success: false, error: 'Could not find the Generate button on the page' });
        }

    } catch (e) {
        console.error('Error during automation:', e);
        if (!isCDP && context) await context.close();
        else if (isCDP && browser) await browser.disconnect();
        return res.status(500).json({ success: false, error: e.message });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`🌟 Local Automation UI is running!`);
    console.log(`👉 Open http://localhost:${PORT} in your browser`);
    console.log(`==============================================\n`);
});
