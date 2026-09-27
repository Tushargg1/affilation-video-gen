const { chromium } = require('playwright');

async function connectToEdge() {
    console.log('🔗 Attempting to connect to your Edge browser...\n');

    try {
        // Connect to Edge via CDP (Chrome DevTools Protocol)
        // Default debugging port is 9222
        const browser = await chromium.connectOverCDP('http://localhost:9222');

        console.log('✓ Connected to Edge browser!');

        const contexts = browser.contexts();
        console.log(`Found ${contexts.length} browser context(s)`);

        // Use the first context (default profile)
        const context = contexts[0];
        const pages = context.pages();

        console.log(`Found ${pages.length} open tab(s)`);

        // Either find existing Digen AI tab or create new one
        let page = pages.find(p => p.url().includes('digen.ai'));

        if (page) {
            console.log('✓ Found existing Digen AI tab');
            await page.bringToFront();
        } else {
            console.log('Opening new tab for Digen AI...');
            page = await context.newPage();
            await page.goto('https://digen.ai/en/explore', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
        }

        console.log('✓ On Digen AI page');
        await page.waitForTimeout(3000);

        // Take screenshot
        console.log('\n📸 Taking screenshot...');
        await page.screenshot({ path: 'digen-connected.png', fullPage: false });
        console.log('✓ Screenshot saved as digen-connected.png');

        // Look for prompt input
        console.log('\n🔍 Looking for prompt input field...');

        const inputSelectors = [
            'textarea',
            'input[type="text"]',
            '[contenteditable="true"]',
            '[placeholder*="prompt" i]',
            '[placeholder*="describe" i]'
        ];

        let inputElement = null;
        for (const selector of inputSelectors) {
            try {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    const isVisible = await element.isVisible();
                    if (isVisible) {
                        inputElement = element;
                        console.log(`✓ Found input field with selector: ${selector}`);
                        break;
                    }
                }
                if (inputElement) break;
            } catch (e) {
                continue;
            }
        }

        if (inputElement) {
            const prompt = 'A colorful toy car racing on a miniature track, smooth camera movement following the car, cinematic lighting, high quality 4K, detailed close-up shots';

            console.log(`\n✍️  Entering prompt: "${prompt}"`);
            await inputElement.click();
            await page.waitForTimeout(500);
            await inputElement.fill(prompt);
            await page.waitForTimeout(1000);
            console.log('✓ Prompt entered successfully');

            // Look for generate button
            console.log('\n🔍 Looking for generate button...');

            const buttonSelectors = [
                'button:has-text("Generate")',
                'button:has-text("Create")',
                'button:has-text("Submit")',
                'button[type="submit"]'
            ];

            let buttonElement = null;
            for (const selector of buttonSelectors) {
                try {
                    const button = await page.$(selector);
                    if (button && await button.isVisible() && await button.isEnabled()) {
                        buttonElement = button;
                        console.log(`✓ Found button with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (buttonElement) {
                console.log('\n🎬 Clicking generate button...');
                await buttonElement.click();
                console.log('✓ Generate button clicked!');
                console.log('\n⏳ Video generation started!');
                console.log('👀 Watch your Edge browser for progress...');
                console.log('⏱️  Script will monitor for 3 minutes...\n');

                await page.waitForTimeout(180000);
                console.log('\n✅ Done! Check your Edge browser for the result.');
            } else {
                console.log('❌ Could not find generate button');
                console.log('📝 Prompt is entered. Please click generate manually.');
                await page.waitForTimeout(60000);
            }
        } else {
            console.log('❌ Could not find input field');
            console.log('📋 Check digen-connected.png');
            await page.waitForTimeout(60000);
        }

    } catch (error) {
        if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
            console.error('\n❌ Could not connect to Edge browser');
            console.error('\nTo enable remote debugging in Edge:');
            console.error('1. Close ALL Edge windows completely');
            console.error('2. Open Command Prompt or PowerShell');
            console.error('3. Run this command:\n');
            console.error('   "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --remote-debugging-port=9222\n');
            console.error('4. Edge will open with remote debugging enabled');
            console.error('5. Log into Digen AI in that Edge window');
            console.error('6. Run this script again');
        } else {
            console.error('\n❌ Error:', error.message);
        }
    }

    console.log('\n👋 Script completed.');
}

connectToEdge().catch(console.error);
