const os = require('os');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

async function createDummyVideo(outputPath, color) {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(`color=c=${color}:s=1080x1920:r=30`)
            .inputFormat('lavfi')
            .outputOptions(['-t', '2'])
            .save(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

async function testMerge() {
    try {
        console.log("Creating dummy videos...");
        const intro = path.join(__dirname, 'intro.mp4');
        const base = path.join(__dirname, 'base.mp4');
        const outro = path.join(__dirname, 'outro.mp4');
        
        await createDummyVideo(intro, 'blue');
        await createDummyVideo(base, 'green');
        await createDummyVideo(outro, 'red');

        const localIntro = intro;
        const localBase = base;
        const localOutro = outro;
        
        const outputPath = path.join(__dirname, `merged.mp4`);
        
        const ff = ffmpeg();
        let inputCount = 0;
        let complexFilter = [];

        if (localIntro) {
            ff.input(localIntro);
            complexFilter.push(`[${inputCount}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v${inputCount}]`);
            inputCount++;
        }

        ff.input(localBase);
        complexFilter.push(`[${inputCount}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v${inputCount}]`);
        inputCount++;

        if (localOutro) {
            ff.input(localOutro);
            complexFilter.push(`[${inputCount}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v${inputCount}]`);
            inputCount++;
        }

        let concatFilter = '';
        for (let i = 0; i < inputCount; i++) {
            concatFilter += `[v${i}]`;
        }
        // This is exactly the logic from server.js
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
                console.log(`✅ Merge complete! Saved to ${outputPath}`);
            })
            .on('error', (err) => {
                console.error(`❌ Merge failed: ${err.message}`);
            });
    } catch(e) {
        console.error("Setup failed", e);
    }
}

testMerge();
