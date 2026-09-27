const { chromium } = require('playwright');

(async () => {
    console.log('Launching Edge...');
    const browser = await chromium.launch({ headless: false, channel: 'msedge' });
    const page = await browser.newPage();

    console.log('Going to digen.ai/create ...');
    await page.goto('https://digen.ai/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Screenshot to see what we're working with
    await page.screenshot({ path: 'digen-debug.png' });
    console.log('Screenshot saved: digen-debug.png');

    // Print ALL buttons
    const buttons = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, [role="button"]'));
        return els.map((el, i) => {
            const rect = el.getBoundingClientRect();
            return {
                index: i,
                tag: el.tagName,
                text: el.textContent.trim().slice(0, 100),
                className: el.className.slice(0, 100),
                disabled: el.disabled,
                visible: rect.width > 0 && rect.height > 0,
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            };
        });
    });

    console.log('\n=== ALL BUTTONS ===');
    buttons.forEach(b => {
        if (b.visible) {
            console.log(`[${b.index}] "${b.text}" | disabled=${b.disabled} | pos=(${b.x},${b.y}) size=${b.width}x${b.height}`);
        }
    });

    // Print textareas
    const textareas = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('textarea')).map((el, i) => {
            const rect = el.getBoundingClientRect();
            return {
                index: i,
                placeholder: el.placeholder,
                value: el.value.slice(0, 50),
                visible: rect.width > 0 && rect.height > 0,
                x: Math.round(rect.x),
                y: Math.round(rect.y)
            };
        });
    });

    console.log('\n=== TEXTAREAS ===');
    console.log(JSON.stringify(textareas, null, 2));

    await browser.close();
    console.log('\nDone.');
})().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
