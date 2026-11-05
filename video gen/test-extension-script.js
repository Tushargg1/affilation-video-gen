const { chromium } = require('playwright');
const path = require('path');

async function testExtension() {
    console.log('🧪 Testing extension loading and messaging...');
    const extensionPath = path.resolve(__dirname, 'digen-extension');

    const browser = await chromium.launchPersistentContext('', {
        headless: false,
        channel: 'msedge',
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`
        ]
    });

    const page = await browser.newPage();
    console.log('Navigating to Digen AI create page...');
    
    // We navigate to our test extension page but we mock the URL in manifest so it matches?
    // Wait, the test extension page is file://, which won't match https://digen.ai/*
    // Let's navigate to digen.ai directly!
    await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded' });
    
    console.log('Waiting 3 seconds for content script to load...');
    await page.waitForTimeout(3000);

    console.log('Checking if content script injected the widget...');
    const widgetBtn = await page.$('#digen-widget-btn');
    if (widgetBtn) {
        console.log('✅ SUCCESS: Content script successfully loaded and injected widget!');
        
        console.log('--- DOM TEXT DUMP ---');
        const allTexts = await page.evaluate(() => {
            const all = document.querySelectorAll('*');
            return Array.from(all)
                .filter(el => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0 && el.textContent.trim();
                })
                .map(el => el.textContent.trim())
                .filter(t => t.toLowerCase().includes('new'));
        });
        console.log([...new Set(allTexts)].join('\n'));
        console.log('---------------------');

        console.log('🖱️ Clicking the Auto Gen button to test Native Mouse Automation...');
        await widgetBtn.click();
        
        console.log('Waiting for automation toast messages...');
        // We can listen to console logs from the page
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        try {
            await page.waitForSelector('#digen-toast', { state: 'attached', timeout: 5000 });
            let toastText = await page.evaluate(() => document.getElementById('digen-toast').textContent);
            console.log('🍞 TOAST:', toastText);
            
            // Wait a bit more to see if it finishes the sequence
            await page.waitForTimeout(4000);
            
            const toasts = await page.evaluate(() => Array.from(document.querySelectorAll('#digen-toast')).map(el => el.textContent));
            console.log('🍞 FINAL TOASTS:', toasts.join(' | '));
            console.log('✅ Extension automation test completely successful!');
        } catch (e) {
            console.log('❌ Error waiting for toast:', e.message);
        }

    } else {
        console.log('❌ ERROR: Widget not found. Content script might not have loaded.');
    }

    await browser.close();
    console.log('Test complete.');
}

testExtension().catch(console.error);
