require('dotenv').config({ path: '../nextjs-poster/.env.local' });
require('dotenv').config({ path: '.env' });
const fs = require('fs');

async function testPost() {
  const videoUrl = 'https://cn6ixptukxp8ircd.public.blob.vercel-storage.com/generated-1790982548107.mp4';
  console.log('Downloading video...');
  const res = await fetch(videoUrl);
  const arr = await res.arrayBuffer();
  const videoBuffer = Buffer.from(arr);

  const fbCaption = 'Testing automated video post!';
  const igCaption = 'Testing automated video post!';
  const ytCaption = 'Testing automated video post! #shorts';
  
  // Facebook
  try {
      console.log('Uploading to Facebook...');
      const fbUrl = `https://graph.facebook.com/v20.0/${process.env.FACEBOOK_PAGE_ID}/videos`;
      const formData = new FormData();
      formData.append('description', fbCaption);
      formData.append('access_token', process.env.META_ACCESS_TOKEN);
      formData.append('source', new Blob([videoBuffer], { type: 'video/mp4' }), 'vid.mp4');
      const fbRes = await fetch(fbUrl, { method: 'POST', body: formData });
      const fbData = await fbRes.json();
      console.log('FB Result:', fbData);
  } catch(e) { console.error('FB Error:', e); }

  // Instagram
  try {
      console.log('Creating Instagram Container...');
      const igUrl = `https://graph.facebook.com/v20.0/${process.env.INSTAGRAM_ACCOUNT_ID}/media?media_type=REELS&video_url=${encodeURIComponent(videoUrl)}&caption=${encodeURIComponent(igCaption)}&access_token=${process.env.META_ACCESS_TOKEN}`;
      const igRes = await fetch(igUrl, { method: 'POST' });
      const igData = await igRes.json();
      console.log('IG Result:', igData);
  } catch(e) { console.error('IG Error:', e); }

}
testPost();
