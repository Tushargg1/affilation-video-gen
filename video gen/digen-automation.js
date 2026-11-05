const { chromium } = require('playwright');

async function generateDigenVideo() {
    console.log('🚀 Starting Digen AI automation for toy car video...\n');

    let browser;

    try {
        // Launch Edge browser
        console.log('Opening Microsoft Edge...');
        browser = await chromium.launch({
            headless: false,
            channel: 'msedge',
            args: ['--start-maximized']
        });

        const context = await browser.newContext({
            viewport: null, // Use full window size
        });

        const page = await context.newPage();

        // Navigate to Digen AI explore page
        console.log('📍 Navigating to Digen AI...');
        await page.goto('https://digen.ai/en/explore', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        console.log('✓ Page loaded');

        // Wait for the page to fully render
        await page.waitForTimeout(4000);

        // Take a screenshot to help debug
        console.log('📸 Taking screenshot of the page...');
        await page.screenshot({ path: 'digen-page.png', fullPage: false });
        console.log('✓ Screenshot saved as digen-page.png');

        // Look for "Create" or "Generate" button to start creating
        console.log('\n🔍 Looking for create/generate button...');

        const createButtonSelectors = [
            'button:has-text("Create")',
            'button:has-text("Generate")',
            'button:has-text("create")',
            'button:has-text("generate")',
            'a:has-text("Create")',
            'a:has-text("Generate")',
            '[href*="create"]',
            '[href*="generate"]',
            '.create-button',
            '.generate-button'
        ];

        let createButton = null;
        for (const selector of createButtonSelectors) {
            try {
                const button = await page.$(selector);
                if (button) {
                    const isVisible = await button.isVisible();
                    if (isVisible) {
                        createButton = button;
                        console.log(`✓ Found create button with selector: ${selector}`);
                        break;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        if (createButton) {
            console.log('🖱️  Clicking create button...');
            await createButton.click();
            await page.waitForTimeout(3000);
            console.log('✓ Create page loaded');
        } else {
            console.log('ℹ️  No create button found, assuming we\'re on the creation page');
        }

        // Now look for the prompt input field
        console.log('\n🔍 Looking for prompt input field...');

        const inputSelectors = [
            'textarea',
            'input[type="text"]',
            '[contenteditable="true"]',
            '[placeholder*="prompt" i]',
            '[placeholder*="describe" i]',
            '[placeholder*="enter" i]',
            '[placeholder*="type" i]',
            'textarea[name="prompt"]',
            'textarea[id*="prompt"]',
            '.prompt-input',
            '#prompt',
            '[data-testid*="prompt"]',
            '[aria-label*="prompt" i]'
        ];

        let inputFound = false;
        let inputElement = null;

        for (const selector of inputSelectors) {
            try {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    const isVisible = await element.isVisible();
                    if (isVisible) {
                        inputElement = element;
                        inputFound = true;
                        console.log(`✓ Found input field with selector: ${selector}`);
                        break;
                    }
                }
                if (inputFound) break;
            } catch (e) {
                continue;
            }
        }

        if (inputElement) {
            // Prompt for toy car video
            const prompt = 'A colorful toy car racing on a miniature track, smooth camera movement following the car, cinematic lighting, high quality 4K, detailed close-up shots';

            console.log(`\n✍️  Entering prompt: "${prompt}"`);
            await inputElement.click();
            await page.waitForTimeout(500);
            await inputElement.fill(prompt);
            await page.waitForTimeout(1000);

            console.log('✓ Prompt entered successfully');

            // Look for the generate/create button
            console.log('\n🔍 Looking for generate button...');

            const generateButtonSelectors = [
                'button:has-text("Generate")',
                'button:has-text("Create")',
                'button:has-text("Submit")',
                'button:has-text("generate")',
                'button:has-text("create")',
                'button[type="submit"]',
                'button.generate',
                'button.create-button',
                '[role="button"]:has-text("Generate")',
                '[role="button"]:has-text("Create")',
                'button:has-text("Start")',
                'button:has-text("Make")'
            ];

            let buttonFound = false;
            let buttonElement = null;

            for (const selector of generateButtonSelectors) {
                try {
                    const button = await page.$(selector);
                    if (button) {
                        const isVisible = await button.isVisible();
                        const isEnabled = await button.isEnabled();
                        if (isVisible && isEnabled) {
                            buttonElement = button;
                            buttonFound = true;
                            console.log(`✓ Found button with selector: ${selector}`);
                            break;
                        }
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
                console.log('👀 Watch the browser window for progress...');
                console.log('⏱️  Keeping browser open for 3 minutes to monitor generation...\n');

                // Wait 3 minutes to see the result
                await page.waitForTimeout(180000);

                console.log('\n✅ Script completed. You can now close the browser or continue working in it.');

            } else {
                console.log('❌ Could not find generate button automatically');
                console.log('📝 The prompt has been entered. Please click the generate button manually.');
                console.log('⏱️  Browser will stay open for 2 minutes...\n');
                await page.waitForTimeout(120000);
            }

        } else {
            console.log('❌ Could not find prompt input field automatically');
            console.log('📋 Please check digen-page.png to see what the page looks like');
            console.log('✋ You may need to interact with the page manually');
            console.log('⏱️  Browser will stay open for 2 minutes...\n');
            await page.waitForTimeout(120000);
        }

    } catch (error) {
        console.error('\n❌ Error occurred:', error.message);
        console.log('🔧 Browser will stay open for manual interaction...');
        if (browser) {
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }

    console.log('\n👋 Done! Close the browser window when finished.');
}

// Run the automation
generateDigenVideo().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
