const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
const util = require('util');
const ffprobe = util.promisify(ffmpeg.ffprobe);

async function check() {
  const intro = await ffprobe('https://cn6ixptukxp8ircd.public.blob.vercel-storage.com/global-intro-video.mp4');
  console.log('Intro:', intro.format.duration);
  const base = await ffprobe('https://cn6ixptukxp8ircd.public.blob.vercel-storage.com/test-base-1791492281456.mp4');
  console.log('Base:', base.format.duration);
  const outro = await ffprobe('https://cn6ixptukxp8ircd.public.blob.vercel-storage.com/global-outro-video.mp4');
  console.log('Outro:', outro.format.duration);
  const merged = await ffprobe('https://cn6ixptukxp8ircd.public.blob.vercel-storage.com/generated-1791492323367.mp4');
  console.log('Merged:', merged.format.duration);
}

check().catch(console.error);
