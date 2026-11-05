require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

function getConfig() {
    const configPath = path.join(__dirname, 'influencer_config.json');
    if (fs.existsSync(configPath)) {
        try {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {}
    }
    return {
        influencer_name: 'Aria Vance',
        niche: 'Luxury Streetwear, Aesthetic Lifestyle & City Life',
        character_prompt: 'A stunning 23-year-old AI fashion & lifestyle influencer, radiant natural skin, captivating hazel-green eyes, sleek brunette hair with subtle caramel highlights, wearing chic contemporary streetwear, minimalist jewelry, elegant confident aura, 8k photorealistic, cinematic volumetric lighting, 35mm film aesthetic',
        clips_per_reel: 5,
        clip_duration_seconds: 10,
        total_reel_duration_seconds: 50
    };
}

/**
 * Generates a structured 5-part scene prompt sequence (5 x 10s = 50s total reel)
 * @param {string} customTopic - Optional custom theme/topic for today's reel
 * @returns {Promise<object>} Generated reel plan
 */
async function generateInfluencerPrompts(customTopic = null) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set in .env');
    }

    const config = getConfig();
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Use current Gemini models (gemini-3.8-flash, 3.7, 3.6, etc.)
    const modelsToTry = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
    let lastError = null;

    const topicDirective = customTopic
        ? `Today's Reel Theme: "${customTopic}"`
        : `Generate a fresh, trending, highly aesthetic lifestyle/fashion reel concept suitable for today's viral social media trends.`;

    const systemPrompt = `
You are a world-class creative director and AI video prompt engineer for top virtual creators and AI influencers.

Influencer Profile:
- Name: ${config.influencer_name}
- Niche: ${config.niche}
- Character Base Appearance: ${config.character_prompt}

TASK:
Create a cohesive 50-SECOND REEL consisting of exactly 5 SEQUENTIAL 10-SECOND SCENES.
${topicDirective}

Each scene will be generated individually by an AI video model as an exact 10-second clip, and then all 5 clips will be concatenated seamlessly into a continuous 50-second narrative reel.

REQUIREMENTS FOR EACH SCENE PROMPT:
1. Must seamlessly feature the same influencer (${config.influencer_name}) maintaining visual character consistency.
2. Must specify smooth camera motion (tracking shot, slow cinematic pan, orbital dolly, gentle zoom-in).
3. Must clearly state: "exactly 10 seconds, smooth 30fps/60fps motion, cinematic 9:16 vertical video, 8k photorealistic".
4. Scene Breakdown:
   - Scene 1 (0-10s): The Hook - High-energy or striking visual entrance, dynamic angle that stops social media scrolling.
   - Scene 2 (10-20s): Narrative Progression - Influencer moving through setting (e.g., walking, cinematic street perspective).
   - Scene 3 (20-30s): Main Showcase - Medium close-up, styling highlight, expressive confident interaction with environment.
   - Scene 4 (30-40s): Aesthetic Climax - Atmospheric lighting (golden hour / neon reflections), dramatic slow-motion camera orbit.
   - Scene 5 (40-50s): Outro & Call to Action - Influencer looks directly into camera lens, subtle genuine smile, memorable final pose.

Output JSON with EXACTLY this structure:
{
  "reel_title": "Short catchy title (under 60 chars)",
  "topic": "Brief description of the reel storyline",
  "captions": {
    "instagram": "First-person engaging caption with question + call-to-action + 10-15 trending hashtags",
    "youtube_shorts": "Engaging shorts title and description with #shorts and hashtags",
    "facebook": "Relatable lifestyle caption with questions to boost comments"
  },
  "scenes": [
    {
      "scene_index": 1,
      "time_range": "0-10s",
      "scene_title": "The Hook",
      "video_prompt": "Complete, detailed 10-second video generation prompt for Scene 1..."
    },
    {
      "scene_index": 2,
      "time_range": "10-20s",
      "scene_title": "Progression & Movement",
      "video_prompt": "Complete, detailed 10-second video generation prompt for Scene 2..."
    },
    {
      "scene_index": 3,
      "time_range": "20-30s",
      "scene_title": "Detail Showcase",
      "video_prompt": "Complete, detailed 10-second video generation prompt for Scene 3..."
    },
    {
      "scene_index": 4,
      "time_range": "30-40s",
      "scene_title": "Atmosphere & Transition",
      "video_prompt": "Complete, detailed 10-second video generation prompt for Scene 4..."
    },
    {
      "scene_index": 5,
      "time_range": "40-50s",
      "scene_title": "Outro & Final Pose",
      "video_prompt": "Complete, detailed 10-second video generation prompt for Scene 5..."
    }
  ]
}
`;

    for (const modelName of modelsToTry) {
        try {
            console.log(`[Influencer Prompts] Generating 50s reel script using ${modelName}...`);
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent(systemPrompt);
            const responseText = result.response.text();
            const data = JSON.parse(responseText);

            if (!data.scenes || data.scenes.length !== 5) {
                throw new Error(`Expected 5 scenes, received ${data.scenes ? data.scenes.length : 0}`);
            }

            console.log(`✅ Reel Plan Created: "${data.reel_title}" (${data.scenes.length} scenes x 10s = 50s)`);
            return data;
        } catch (err) {
            console.warn(`[Influencer Prompts] Model ${modelName} notice: ${err.message?.split('\n')[0] || err.message}`);
            lastError = err;
        }
    }

    console.warn(`\n⚠️ Gemini API rate-limited or unavailable. Activating Built-in High-Converting Reel Storyboard Engine...`);
    return getFallbackInfluencerPlan(config, customTopic);
}

/**
 * Robust built-in fallback prompt generator if Gemini API key quota is reached
 */
function getFallbackInfluencerPlan(config, customTopic = null) {
    const topics = [
        {
            title: "Golden Hour Tokyo Dusk: Luxury Streetwear Glow",
            desc: "Aria Vance showcases luxury oversized streetwear as golden hour transitions into cinematic twilight neon glows.",
            theme: "Golden Hour City & Streetwear",
            hooks: [
                `Cinematic low-angle dynamic tracking shot. 23-year-old AI fashion influencer Aria Vance with ${config.character_prompt}. She steps confidently into frame against modern glass skyscrapers reflecting intense golden hour sunlight, turning swiftly toward the camera while adjusting her jacket collar with an intriguing confident glance. 35mm film aesthetic, rich film grain, cinematic volumetric lighting, exactly 10 seconds, smooth 60fps motion, cinematic 9:16 vertical video, 8k photorealistic.`,
                `Smooth forward tracking shot following Aria Vance from a three-quarters angle as she walks effortlessly down a sleek glass-and-steel elevated walkway. Her hair sways gracefully in motion. Mid-way through, she turns her head over her shoulder toward the lens with a subtle mysterious smirk. Exactly 10 seconds, smooth 60fps motion, cinematic 9:16 vertical video, 8k photorealistic.`,
                `Medium close-up shot with a slow push-in zoom focusing on Aria Vance. Soft golden sunlight illuminates her glowing skin texture and detailed hazel-green eyes. She gently runs her hand through her hair, highlighting her sleek silver rings and high-end metallic zipper details. Exactly 10 seconds, smooth 30fps motion, cinematic 9:16 vertical video, 8k photorealistic.`,
                `Dramatic slow-motion 360-degree orbital dolly camera shot around Aria Vance standing at a glass balcony overlook. The ambient sky transitions from deep orange sunset to violet twilight as city neon lights flicker on around her. Warm sunlight rim-lights her silhouette. Exactly 10 seconds, smooth 60fps motion, cinematic 9:16 vertical video, 8k photorealistic.`,
                `Gentle cinematic slow zoom-in to an eye-level close-up of Aria Vance. She slowly turns her gaze directly into the camera lens, breaking the 4th wall with an inviting, genuine warm smile and a subtle head tilt against soft neon city bokeh. Exactly 10 seconds, smooth 30fps motion, cinematic 9:16 vertical video, 8k photorealistic.`
            ]
        },
        {
            title: "Cyber-Chic Night Neon: Modern Cyberpunk Street Walk",
            desc: "Aria Vance explores rain-slicked modern city streets reflecting vibrant violet and electric cyan neon signs.",
            theme: "Cyber-Chic Night Walk",
            hooks: [
                `Dramatic entrance shot. Aria Vance with ${config.character_prompt} emerges from vibrant neon-lit glass doorway into the night city, rain softly glistening on the asphalt. She looks up with captivating confidence into the camera. Exactly 10 seconds, smooth 60fps motion, cinematic 9:16 vertical video, 8k photorealistic.`,
                `Cinematic tracking side-profile shot of Aria Vance walking smoothly past high-tech shopfronts, electric blue and magenta neon lights casting dramatic specular highlights across her cheekbones and chic dark outfit. Exactly 10 seconds, smooth 60fps motion, cinematic 9:16 vertical video, 8k photorealistic.`,
                `Slow-motion medium close-up of Aria Vance standing beneath neon rain canopy, adjusting her wireless earpiece and looking sideways with an alluring contemplative expression. Exactly 10 seconds, smooth 30fps motion, cinematic 9:16 vertical video, 8k photorealistic.`,
                `Cinematic high-angle drone/jib shot spiraling down towards Aria Vance standing in the center of a glass pedestrian plaza surrounded by holographic reflections and futuristic city ambiance. Exactly 10 seconds, smooth 60fps motion, cinematic 9:16 vertical video, 8k photorealistic.`,
                `Intimate eye-level closing shot of Aria Vance smiling warmly at the camera, giving a subtle playful wave as city lights blur into beautiful circular bokeh behind her. Exactly 10 seconds, smooth 30fps motion, cinematic 9:16 vertical video, 8k photorealistic.`
            ]
        }
    ];

    const chosen = (customTopic && customTopic.toLowerCase().includes('cyber')) ? topics[1] : topics[0];

    return {
        reel_title: chosen.title,
        topic: customTopic || chosen.desc,
        captions: {
            instagram: `Golden hour hits different when the city lights start to bleed in ✨ Which aesthetic was your favorite: Scene 1 or 4? Drop a 🤍 below! 🏙️🔥 #AriaVance #AIInfluencer #StreetwearStyle #LuxuryStreetwear #TokyoFashion #AestheticLifestyle #FitCheck #OOTD #ModelOffDuty #CyberChic #GoldenHourVibes #ReelsViral`,
            youtube_shorts: `${chosen.title} | Aria Vance #shorts #fashion #streetwear #fitcheck #aesthetic #reels`,
            facebook: `There is nothing quite like golden hour in the city! 🌇 Loved putting together this edgy luxury streetwear look. Do you prefer oversized jackets or tailored coats for evening walks? Let me know in the comments! 👇`
        },
        scenes: chosen.hooks.map((hookPrompt, idx) => ({
            scene_index: idx + 1,
            time_range: `${idx * 10}-${(idx + 1) * 10}s`,
            scene_title: `Scene ${idx + 1} (${idx * 10}-${(idx + 1) * 10}s)`,
            video_prompt: hookPrompt
        }))
    };
}

module.exports = {
    getConfig,
    generateInfluencerPrompts
};

if (require.main === module) {
    generateInfluencerPrompts().then(plan => {
        console.log('\n--- GENERATED 50s INFLUENCER REEL PLAN ---');
        console.log(JSON.stringify(plan, null, 2));
    }).catch(console.error);
}
