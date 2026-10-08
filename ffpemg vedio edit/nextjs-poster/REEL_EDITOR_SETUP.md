# Reel Editor Setup Guide

Follow these steps to integrate the Reel Editor into your project:

1. **Install Dependencies:**
   Run the following command in your `nextjs-poster` directory:
   ```bash
   npm install @ffmpeg/ffmpeg @ffmpeg/util @vercel/blob
   ```

2. **Vercel Blob Setup:**
   - Go to your Vercel Dashboard.
   - Select your project.
   - Go to the "Storage" tab and create a new Blob store.
   - Copy the `BLOB_READ_WRITE_TOKEN`.
   - Add it to your Vercel environment variables (and your local `.env` or `.env.local` file).

3. **Headers Configuration:**
   The `next.config.ts` has been updated to include `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers. These are required for FFmpeg WASM (SharedArrayBuffer) to work correctly in the browser.

4. **Access the Editor:**
   Start your development server (`npm run dev`) and navigate to `http://localhost:3000/reel-editor`.

**Note on Next.js 15 & FFmpeg WASM:**
Next.js dev server might sometimes have issues with caching the WASM files. If you encounter issues during development, clearing the `.next` folder can help.
