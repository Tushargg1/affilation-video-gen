require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Client } = require('pg');
const path = require('path');

async function generatePrompts() {
    if (!process.env.GEMINI_API_KEY) {
        console.error("Error: GEMINI_API_KEY is not set in .env file.");
        return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Actually using gemini-1.5-flash as 3.5-flash is invalid in SDK
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" }});

    console.log(`Connecting to Supabase...`);
    const db = new Client({
        connectionString: "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
    });
    await db.connect();

    try {
        const res = await db.query("SELECT id, title, price, review_star, total_bought, category, product_url FROM auto_products WHERE status = 'scraped' OR image_prompt IS NULL");
        const rows = res.rows;

        let config = null;
        try {
            const res = await fetch('https://nextjs-poster-eta.vercel.app/api/config');
            if (res.ok) config = await res.json();
        } catch (e) {
            console.error("Could not load cloud config, using defaults.");
        }

        const baseImagePrompt = config?.base_image_prompt || 'A highly detailed description for an AI image generator (like Midjourney/Stable Diffusion/Digen) to generate a realistic photo of a model wearing/using this product.';
        const baseVideoPrompt = config?.base_video_prompt || 'A script and visual prompt for a short 5-10 second AI video showcasing this product\'s best features for affiliate marketing. Include text overlays if needed.';

        if (config && config.prompt_generation_enabled === false) {
            console.log("Prompt Generation is disabled in Cloud config. Exiting...");
            await db.end();
            return;
        }

        if (rows.length === 0) {
            console.log("No products need prompts.");
            await db.end();
            return;
        }

        console.log(`Found ${rows.length} products to generate prompts for.`);

        for (const row of rows) {
            const { id, title, price, review_star, total_bought, category, product_url } = row;

            console.log(`\n[ID: ${id}] Generating AI prompt for: ${(title || '').slice(0, 30)}...`);
            
            const promptTemplate = `
You are an expert affiliate marketer and prompt engineer.
Create a structured prompt for generating an image and a video for the following product to post on social media (Facebook, Instagram, YouTube Shorts).

Product Details:
- Title: ${title}
- Category: ${category || 'General'}
- Price: ₹${price}
- Rating: ${review_star} stars (${total_bought})
- URL: ${product_url}

Output a JSON object with exactly two keys:
1. "image_prompt": ${baseImagePrompt}
2. "video_prompt": ${baseVideoPrompt}
`;

            try {
                const result = await model.generateContent(promptTemplate);
                const responseText = result.response.text();
                
                const aiData = JSON.parse(responseText);
                const imagePrompt = aiData.image_prompt || '';
                const videoPrompt = aiData.video_prompt || '';

                console.log(`=> Image Prompt: ${imagePrompt.slice(0, 50)}...`);
                console.log(`=> Video Prompt: ${videoPrompt.slice(0, 50)}...`);

                // Update DB
                await db.query(
                    "UPDATE auto_products SET image_prompt = $1, video_prompt = $2, status = 'prompted' WHERE id = $3",
                    [imagePrompt, videoPrompt, id]
                );
            } catch (e) {
                console.error(`Failed to generate prompt for ${id}:`, e.message);
            }
            
            // Rate limiting delay
            await new Promise(r => setTimeout(r, 2000));
        }

        await db.end();
        console.log('\nPrompt generation complete.');
    } catch (err) {
        console.error("Database error:", err);
        await db.end();
    }
}

generatePrompts().catch(console.error);
