const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
const util = require('util');
const ffprobe = util.promisify(ffmpeg.ffprobe);
const fs = require('fs');

async function test() {
    try {
        const testVideo = 'test_fps_video.mp4'; // Create a dummy video without audio
        
        // Let's first make a video without audio if we don't have one
        const makeNoAudio = util.promisify(require('child_process').exec);
        await makeNoAudio(`"${ffmpegPath}" -y -f lavfi -i testsrc=duration=2:size=1280x720:rate=30 -c:v libx264 test_no_audio.mp4`);
        await makeNoAudio(`"${ffmpegPath}" -y -f lavfi -i testsrc=duration=2:size=1280x720:rate=30 -f lavfi -i sine=f=440:duration=2 -c:v libx264 -c:a aac test_with_audio.mp4`);

        let inputs = [
            { path: 'test_no_audio.mp4', hasAudio: false },
            { path: 'test_with_audio.mp4', hasAudio: true }
        ];

        let complexFilter = [];
        let concatFilter = '';

        for (let i = 0; i < inputs.length; i++) {
            complexFilter.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);
            
            let audioStream;
            if (inputs[i].hasAudio) {
                audioStream = `[${i}:a]`;
            } else {
                complexFilter.push(`anullsrc=channel_layout=stereo:sample_rate=44100:d=10[silence${i}]`); // d=10 ensures it generates long enough silence
                audioStream = `[silence${i}]`;
            }
            concatFilter += `[v${i}]${audioStream}`;
        }
        
        concatFilter += `concat=n=${inputs.length}:v=1:a=1[outv][outa]`;
        complexFilter.push(concatFilter);

        console.log('Complex Filter:', complexFilter);

        const ff = ffmpeg();
        for (let i = 0; i < inputs.length; i++) {
            ff.input(inputs[i].path);
        }

        ff.complexFilter(complexFilter)
            .outputOptions([
                '-map [outv]',
                '-map [outa]',
                '-c:v libx264',
                '-preset ultrafast',
                '-c:a aac'
            ])
            .save('test_merge_output.mp4')
            .on('end', () => console.log('Success!'))
            .on('error', (e) => console.log('Error:', e.message));
            
    } catch(e) {
        console.error(e);
    }
}
test();
