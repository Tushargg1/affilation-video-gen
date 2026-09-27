const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// Serve the UI page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui.html'));
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
