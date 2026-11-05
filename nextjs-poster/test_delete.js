const fetch = require('node-fetch');
async function run() {
  const res = await fetch('https://nextjs-poster-eta.vercel.app/api/db/products/update-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 18, image_prompt: "" })
  });
  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Body:", text);
}
run();
