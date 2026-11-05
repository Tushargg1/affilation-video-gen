// Using native Node 18 fetch

async function testAutomation() {
  const url = 'http://localhost:3000/api/post';
  const payload = {
    videoUrl: 'https://cn6ixptukxp8ircd.public.blob.vercel-storage.com/generated-1790982548107.mp4',
    blobName: 'video_5.mp4',
    productId: 5,
    description: 'Amazing women trackpant!',
    platforms: ['facebook', 'youtube', 'instagram']
  };

  console.log(`Sending webhook simulation to ${url}...`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const text = await res.text();
    console.log(`Response Status: ${res.status}`);
    console.log(`Response Body: ${text}`);
  } catch (e) {
    console.error(e);
  }
}

testAutomation();
