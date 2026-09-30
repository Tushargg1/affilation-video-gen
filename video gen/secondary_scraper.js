const { chromium } = require('playwright');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

async function scrapeProductData() {
    console.log(`Connecting to Supabase...`);
    const db = new Client({
        connectionString: "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
    });
    await db.connect();

    try {
        const res = await db.query("SELECT id, product_url FROM auto_products WHERE status = 'extracted' OR image_url IS NULL");
        const rows = res.rows;

        if (rows.length === 0) {
            console.log("No products to scrape.");
            await db.end();
            return;
        }

        console.log(`Found ${rows.length} products to scrape.`);
        
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        for (const row of rows) {
            const { id, product_url } = row;
            if (!product_url || !product_url.startsWith('http')) continue;

            console.log(`\n[ID: ${id}] Scraping: ${product_url}`);
            const page = await context.newPage();
            
            try {
                await page.goto(product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                // Wait a bit for JS to populate data
                await page.waitForTimeout(3000);

                // Try to grab the Next.js data blob if available
                const nextData = await page.evaluate(() => {
                    const script = document.getElementById('__NEXT_DATA__');
                    return script ? JSON.parse(script.textContent) : null;
                });

                let imageUrl = '';
                let reviewStar = '';
                let totalBought = '';

                if (nextData && nextData.props && nextData.props.pageProps && nextData.props.pageProps.initialState) {
                    const state = nextData.props.pageProps.initialState;
                    const product = state.product?.detail?.data;
                    
                    if (product) {
                        imageUrl = product.images?.[0] || product.image || '';
                        reviewStar = product.rating?.rating?.toString() || '';
                        totalBought = product.rating?.ratingCount?.toString() || product.reviews?.toString() || '';
                        console.log('Extracted via __NEXT_DATA__');
                    }
                } 
                
                if (!imageUrl) {
                    // Fallback DOM extraction
                    console.log('Falling back to DOM extraction...');
                    
                    // Main image
                    imageUrl = await page.evaluate(() => {
                        const img = document.querySelector('img[src*="images.meesho.com/images/products/"]');
                        return img ? img.src : '';
                    });

                    // Review Star
                    reviewStar = await page.evaluate(() => {
                        const badge = Array.from(document.querySelectorAll('span')).find(el => el.textContent.match(/^[0-9]\.[0-9]$/));
                        return badge ? badge.textContent.trim() : '';
                    });

                    // Total Bought / Ratings
                    totalBought = await page.evaluate(() => {
                        const texts = Array.from(document.querySelectorAll('span, p')).map(el => el.textContent);
                        const ratingText = texts.find(t => t.includes('Ratings') || t.includes('Reviews'));
                        return ratingText ? ratingText.trim() : '';
                    });
                }

                console.log(`=> Image: ${imageUrl}`);
                console.log(`=> Review Star: ${reviewStar}`);
                console.log(`=> Total Bought: ${totalBought}`);

                // Update DB
                await db.query(
                    "UPDATE auto_products SET review_star = $1, total_bought = $2, image_url = $3, status = 'scraped' WHERE id = $4",
                    [reviewStar, totalBought, imageUrl, id]
                );
                
            } catch (e) {
                console.error(`Failed to scrape ${product_url}:`, e.message);
            } finally {
                await page.close();
            }
            
            // Add a small delay between requests
            await new Promise(r => setTimeout(r, 2000));
        }

        await browser.close();
        await db.end();
        console.log('\nSecondary scraping complete.');
    } catch (err) {
        console.error("Database error:", err);
        await db.end();
    }
}

scrapeProductData().catch(console.error);
