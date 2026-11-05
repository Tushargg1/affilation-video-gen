const util = require('util');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

console.log("Starting screenshot extraction...");
ffmpeg('https://cn6ixptukxp8ircd.public.blob.vercel-storage.com/generated-1791492323367.mp4')
  .screenshots({
    count: 4,
    folder: 'C:\\Users\\tusha\\Downloads',
    size: '320x240',
    filename: 'thumbnail-at-%i.png'
  })
  .on('end', () => console.log('Screenshots saved!'))
  .on('error', err => console.error(err));
