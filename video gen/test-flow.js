const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runTest() {
    console.log('🧪 Starting fully automated test of the Chrome Extension...');

    // Try to find the newest image in the artifacts
    let imagePath = null;
    try {
        const artifactsDir = 'C:/Users/tusha/.gemini/antigravity-ide/brain/9af2db14-b018-4409-9f53-1810051ba4a5/.user_uploaded/';
        const files = fs.readdirSync(artifactsDir);
        const sorted = files
            .map(f => ({ name: f, time: fs.statSync(path.join(artifactsDir, f)).mtime.getTime() }))
            .sort((a, b) => b.time - a.time);
        if (sorted.length > 0) {
            imagePath = path.join(artifactsDir, sorted[0].name);
            console.log('📸 Found image to test with:', imagePath);
        }
    } catch (e) {
        console.error('Could not find artifact image:', e);
    }

    if (!imagePath) {
        console.error('❌ No image found. Please make sure the image exists.');
        return;
    }

    const imgPrompt = 'A high-quality, photorealistic portrait of an Indian woman standing against a neutral studio background. She has long dark wavy hair half-tied with a small clip. She is wearing a form-fitting, light lavender ribbed long-sleeve top with a square neckline, classic blue skinny jeans, and clean white sneakers. She wears delicate jewelry including small gold hoop earrings and a minimal silver necklace. Soft studio lighting, 8k resolution, cinematic.';
    const vidPrompt = 'A smooth, cinematic motion video of the woman. The camera slowly pans around her as she turns her head slightly towards the camera and flashes a warm, subtle smile. Her long hair gently flows with her movement. High quality, smooth 60fps, photorealistic lighting.';

    let browser;
    try {
        console.log('🔗 Launching Edge with Extension loaded...');
        const extensionPath = path.resolve(__dirname, 'digen-extension');
        const userDataDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data');
        
        browser = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            channel: 'msedge',
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`,
                '--start-maximized'
            ]
        });
        const context = browser;
        const page = await context.newPage();
        
        console.log('🔍 Looking for the extension ID...');
        
        // Find extension ID from service workers or background pages
        let extensionId = null;
        
        // Check background pages / service workers
        const workers = context.serviceWorkers();
        for (const worker of workers) {
            const url = worker.url();
            if (url.includes('extension://')) {
                const match = url.match(/extension:\/\/([a-z]{32})/);
                if (match) extensionId = match[1];
            }
        }
        
        // If not found in service workers, check all pages
        if (!extensionId) {
            const pages = context.pages();
            for (const p of pages) {
                const url = p.url();
                if (url.includes('extension://')) {
                    const match = url.match(/extension:\/\/([a-z]{32})/);
                    if (match) extensionId = match[1];
                }
            }
        }

        if (!extensionId) {
            // As a fallback, we can try to navigate to edge://extensions and extract it, or just use chrome-extension://
            console.log('⚠️ Could not automatically detect extension ID from workers. We will try to find it via edge://extensions');
            const page = await context.newPage();
            await page.goto('edge://extensions/');
            await page.waitForTimeout(2000);
            
            // Extract from shadow DOM (Edge extension page is complex, let's try a simpler approach)
            // Just search for the Universal AI Video Auto-Gen name
            extensionId = await page.evaluate(() => {
                const manager = document.querySelector('extensions-manager');
                if (!manager) return null;
                const itemList = manager.shadowRoot.querySelector('extensions-item-list');
                if (!itemList) return null;
                const items = itemList.shadowRoot.querySelectorAll('extensions-item');
                for (const item of items) {
                    const name = item.shadowRoot.querySelector('#name').textContent;
                    if (name.includes('Universal AI Video Auto-Gen') || name.includes('Digen') || name.includes('Auto-Gen')) {
                        return item.id;
                    }
                }
                // Fallback: return the first active extension id
                return items.length > 0 ? items[0].id : null;
            });
            await page.close();
        }

        if (!extensionId) {
            throw new Error("Could not find the Extension ID. Make sure it is installed and enabled.");
        }

        console.log(`✅ Found Extension ID: ${extensionId}`);
        
        console.log('🚪 Opening Extension Popup...');
        let popupPage = await context.newPage();
        
        // Try chrome-extension:// first, then extension://
        try {
            await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
        } catch (e) {
            await popupPage.goto(`extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
        }
        
        console.log('✍️  Filling Prompts...');
        await popupPage.fill('#imagePrompt', imgPrompt);
        await popupPage.fill('#videoPrompt', vidPrompt);
        
        console.log('🖼️  Uploading Image...');
        const fileInput = await popupPage.$('#startImage');
        await fileInput.setInputFiles(imagePath);
        
        console.log('🚀 Clicking Run/Schedule...');
        await popupPage.click('#generateBtn');
        
        console.log('✅ Extension triggered successfully! The background script is now running the automation.');
        console.log('⏳ Waiting 3 minutes to allow the automation to finish downloading...');
        
        // Wait 3 minutes
        await page.waitForTimeout(180000);
        
        console.log('🎉 Automation wait complete! The files should be downloaded.');
        
        await browser.disconnect();
    } catch (e) {
        console.error('❌ Error during testing:', e);
    }
}

runTest().catch(console.error);
