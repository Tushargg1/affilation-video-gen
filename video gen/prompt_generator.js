require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'prod ext', 'api_inspector', 'data', 'meesho_products.db');

async function generatePrompts() {
    if (!process.env.GEMINI_API_KEY) {
        console.error("Error: GEMINI_API_KEY is not set in .env file.");
        return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash", generationConfig: { responseMimeType: "application/json" }});

    console.log(`Connecting to database at ${dbPath}`);
    const db = new sqlite3.Database(dbPath);

    return new Promise((resolve, reject) => {
        db.all("SELECT id, title, price, review_star, total_bought, category, product_url FROM auto_products WHERE status = 'scraped' OR image_prompt IS NULL", async (err, rows) => {
            if (err) {
                console.error("Database error:", err);
                db.close();
                return reject(err);
            }

            if (rows.length === 0) {
                console.log("No products need prompts.");
                db.close();
                return resolve();
            }

            console.log(`Found ${rows.length} products to generate prompts for.`);

            for (const row of rows) {
                const { id, title, price, review_star, total_bought, category, product_url } = row;

                console.log(`\n[ID: ${id}] Generating AI prompt for: ${title.slice(0, 30)}...`);
                
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
1. "image_prompt": A highly detailed description for an AI image generator (like Midjourney/Stable Diffusion/Digen) to generate a realistic photo of a model wearing/using this product.
2. "video_prompt": A script and visual prompt for a short 5-10 second AI video showcasing this product's best features for affiliate marketing. Include text overlays if needed.
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
                    await new Promise((resUpdate) => {
                        db.run(
                            "UPDATE auto_products SET image_prompt = ?, video_prompt = ?, status = 'prompted' WHERE id = ?",
                            [imagePrompt, videoPrompt, id],
                            function(err) {
                                if (err) console.error(`Error updating product ${id}:`, err);
                                resUpdate();
                            }
                        );
                    });
                } catch (e) {
                    console.error(`Failed to generate prompt for ${id}:`, e.message);
                }
                
                // Rate limiting delay
                await new Promise(r => setTimeout(r, 2000));
            }

            db.close();
            console.log('\nPrompt generation complete.');
            resolve();
        });
    });
}

generatePrompts().catch(console.error);
