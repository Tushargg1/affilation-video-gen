const puppeteer = require('puppeteer-core');
const path = require('path');

async function generateDigenVideo() {
    console.log('🚀 Starting Digen AI automation with your Edge profile...\n');

    // Your Edge user data directory (where your login is saved)
    const edgeUserDataDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data');

    // Path to Edge executable
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

    console.log('📂 Using Edge profile from:', edgeUserDataDir);
    console.log('🌐 Launching Edge with your profile...\n');

    let browser;

    try {
        // Launch Edge with your existing profile
        browser = await puppeteer.launch({
            executablePath: edgePath,
            headless: false,
            userDataDir: edgeUserDataDir,
            args: [
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-blink-features=AutomationControlled'
            ],
            defaultViewport: null
        });

        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();

        console.log('✓ Edge launched with your profile');

        // Navigate to Digen AI
        console.log('📍 Navigating to Digen AI...');
        await page.goto('https://digen.ai/en/explore', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        console.log('✓ Page loaded (you should be logged in)');
        await page.waitForTimeout(3000);

        // Take screenshot
        console.log('\n📸 Taking screenshot...');
        await page.screenshot({ path: 'digen-logged-in.png', fullPage: false });
        console.log('✓ Screenshot saved as digen-logged-in.png');

        // Look for prompt input
        console.log('\n🔍 Looking for prompt input field...');

        // Wait for page to be fully interactive
        await page.waitForTimeout(2000);

        // Try to find the prompt input
        const inputSelectors = [
            'textarea',
            'input[type="text"]',
            '[contenteditable="true"]',
            '[placeholder*="prompt"]',
            '[placeholder*="Prompt"]',
            '[placeholder*="describe"]',
            '[placeholder*="Describe"]'
        ];

        let inputElement = null;
        let usedSelector = null;

        for (const selector of inputSelectors) {
            try {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    const isVisible = await element.boundingBox();
                    if (isVisible) {
                        inputElement = element;
                        usedSelector = selector;
                        break;
                    }
                }
                if (inputElement) break;
            } catch (e) {
                continue;
            }
        }

        if (inputElement) {
            console.log(`✓ Found input field with selector: ${usedSelector}`);

            // Enter the toy car prompt
            const prompt = 'A colorful toy car racing on a miniature track, smooth camera movement following the car, cinematic lighting, high quality 4K, detailed close-up shots';

            console.log(`\n✍️  Entering prompt: "${prompt}"`);
            await inputElement.click({ delay: 100 });
            await page.waitForTimeout(500);
            await inputElement.type(prompt, { delay: 50 });
            await page.waitForTimeout(1000);

            console.log('✓ Prompt entered successfully');

            // Look for generate button
            console.log('\n🔍 Looking for generate button...');

            const buttonSelectors = [
                'button::-p-text(Generate)',
                'button::-p-text(Create)',
                'button::-p-text(Submit)',
                'button[type="submit"]'
            ];

            let buttonElement = null;
            let buttonSelector = null;

            for (const selector of buttonSelectors) {
                try {
                    const button = await page.$(selector);
                    if (button) {
                        const isVisible = await button.boundingBox();
                        if (isVisible) {
                            buttonElement = button;
                            buttonSelector = selector;
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            if (buttonElement) {
                console.log(`✓ Found button with selector: ${buttonSelector}`);
                console.log('\n🎬 Clicking generate button...');

                await buttonElement.click({ delay: 100 });
                console.log('✓ Generate button clicked!');

                console.log('\n⏳ Video generation started!');
                console.log('👀 Watch your Edge browser for progress...');
                console.log('⏱️  Browser will stay open for 3 minutes to monitor...\n');

                // Wait 3 minutes to see the result
                await page.waitForTimeout(180000);

                console.log('\n✅ Done! Check your Edge browser for the generated video.');
                console.log('💡 You can close the browser window when finished.');

            } else {
                console.log('❌ Could not find generate button automatically');
                console.log('📝 The prompt has been entered.');
                console.log('👆 Please click the generate button manually in the browser.');
                console.log('⏱️  Browser will stay open for 2 minutes...\n');
                await page.waitForTimeout(120000);
            }

        } else {
            console.log('❌ Could not find prompt input field');
            console.log('📋 Check digen-logged-in.png to see the page');
            console.log('✋ Please interact with the page manually');
            console.log('⏱️  Browser will stay open for 2 minutes...\n');
            await page.waitForTimeout(120000);
        }

    } catch (error) {
        console.error('\n❌ Error occurred:', error.message);

        if (error.message.includes('Failed to launch')) {
            console.error('\n💡 Edge might already be running with your profile.');
            console.error('Try closing all Edge windows and run this script again.');
        }

        if (browser) {
            console.log('🔧 Browser will stay open for manual interaction...');
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }

    console.log('\n👋 Script completed. Close browser when done.');
}

generateDigenVideo().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
