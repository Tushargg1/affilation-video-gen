const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

async function createDummyVideo(outputPath, color, fps) {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(`color=c=${color}:s=1080x1920:r=${fps}`)
            .inputFormat('lavfi')
            .outputOptions(['-t', '2'])
            .save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

async function testMerge() {
    try {
        console.log("Creating dummy videos with different fps...");
        const intro = path.join(__dirname, 'intro_fps.mp4');
        const base = path.join(__dirname, 'base_fps.mp4');
        
        await createDummyVideo(intro, 'blue', 24);
        await createDummyVideo(base, 'green', 30);

        const outputPath = path.join(__dirname, 'merged_fps.mp4');
        
        const ff = ffmpeg();
        let inputCount = 0;
        let complexFilter = [];

        ff.input(intro);
        complexFilter.push(`[${inputCount}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[v${inputCount}]`);
        inputCount++;

        ff.input(base);
        complexFilter.push(`[${inputCount}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[v${inputCount}]`);
        inputCount++;

        let concatFilter = '';
        for (let i = 0; i < inputCount; i++) {
            concatFilter += `[v${i}]`;
        }
        concatFilter += `concat=n=${inputCount}:v=1:a=0[outv]`;
        complexFilter.push(concatFilter);

        console.log("Starting merge...");
        ff.complexFilter(complexFilter)
            .outputOptions([
                '-map [outv]',
                '-c:v libx264',
                '-preset ultrafast'
            ])
            .save(outputPath)
            .on('end', () => {
                console.log("✅ Merge complete!");
            })
            .on('error', (err) => {
                console.error("❌ Merge failed:", err.message);
            });
    } catch(e) {
        console.error(e);
    }
}

testMerge();
