const { chromium } = require('playwright');
const path = require('path');

const USER_DATA = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data');

(async () => {
    console.log('Connecting to your logged-in Edge profile...');
    console.log('Profile path:', USER_DATA);

    const context = await chromium.launchPersistentContext(USER_DATA, {
        headless: false,
        channel: 'msedge',
        args: ['--no-first-run', '--no-default-browser-check'],
        slowMo: 500,
        viewport: null
    });

    const page = await context.newPage();

    console.log('Navigating to digen.ai/create ...');
    await page.goto('https://digen.ai/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'digen-loggedin.png' });
    console.log('Screenshot saved: digen-loggedin.png');

    // Inspect all buttons
    const buttons = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, [role="button"]'));
        return els.map((el, i) => {
            const rect = el.getBoundingClientRect();
            return {
                index: i,
                text: el.textContent.trim().slice(0, 100),
                disabled: el.disabled || el.getAttribute('disabled') !== null,
                visible: rect.width > 0 && rect.height > 0,
                x: Math.round(rect.x + rect.width / 2),
                y: Math.round(rect.y + rect.height / 2),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            };
        });
    });

    console.log('\n=== ALL VISIBLE BUTTONS ===');
    buttons.filter(b => b.visible).forEach(b => {
        console.log(`[${b.index}] "${b.text}" | disabled=${b.disabled} | center=(${b.x},${b.y}) size=${b.width}x${b.height}`);
    });

    // Check for textareas
    const textareas = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('textarea')).map((el, i) => {
            const rect = el.getBoundingClientRect();
            return {
                index: i,
                placeholder: el.placeholder,
                value: el.value.slice(0, 80),
                visible: rect.width > 0 && rect.height > 0,
                x: Math.round(rect.x + rect.width / 2),
                y: Math.round(rect.y + rect.height / 2)
            };
        });
    });

    console.log('\n=== TEXTAREAS ===');
    console.log(JSON.stringify(textareas, null, 2));

    // Find generate button
    const generateBtn = buttons.find(b => b.visible && !b.disabled && b.text.toLowerCase().includes('generate'));
    if (generateBtn) {
        console.log('\n✅ Found generate button:', generateBtn);

        // Fill the textarea first
        const textarea = await page.$('textarea');
        if (textarea) {
            await textarea.click({ clickCount: 3 });
            await textarea.fill('A colorful toy car racing on a miniature track, smooth camera movement, cinematic lighting, 4K quality');
            await page.waitForTimeout(1000);
            console.log('✅ Filled textarea');
        }

        // Click generate button using Playwright's native click (trusted)
        console.log('\n🎯 Clicking Generate video button...');
        await page.mouse.click(generateBtn.x, generateBtn.y);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: 'digen-after-click.png' });
        console.log('Screenshot saved: digen-after-click.png');

        // Check if generation started
        const status = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('*'));
            for (const el of els) {
                const t = el.textContent.trim().toLowerCase();
                if (t.includes('generating') || t.includes('processing') || t.includes('queued') || t.includes('pending')) {
                    return el.textContent.trim().slice(0, 100);
                }
            }
            return null;
        });

        if (status) {
            console.log('\n🎉 GENERATION STARTED! Status:', status);
        } else {
            console.log('\n⚠️ Generation status unclear. Check digen-after-click.png');
        }
    } else {
        console.log('\n❌ Generate button not found. Check digen-loggedin.png');
        console.log('You may not be logged in or the page loaded differently.');
    }

    await page.waitForTimeout(5000);
    await context.close();
    console.log('\nDone.');
})().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
