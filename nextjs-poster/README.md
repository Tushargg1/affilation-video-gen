# Next.js Serverless Auto-Poster

A modern, serverless application to auto-schedule and post social media videos using AI. 
Built with Next.js, Vercel Blob, and Upstash QStash.

## Deployment Guide

Follow these steps to get your app live on Vercel for free!

### Step 1: Push to GitHub
1. Open your terminal in this folder.
2. Run these commands:
   ```bash
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

### Step 2: Deploy to Vercel
1. Go to [Vercel.com](https://vercel.com) and log in.
2. Click **Add New Project** and import your GitHub repository.
3. Don't click Deploy just yet! We need to add the Environment Variables.

### Step 3: Get API Keys & Environment Variables

You need to add these exact variable names in your Vercel Project Settings -> Environment Variables.

#### Upstash QStash (For Scheduling)
1. Go to [Upstash Console](https://console.upstash.com/).
2. Create an account and go to **QStash**.
3. Copy the **QSTASH_TOKEN**, **QSTASH_CURRENT_SIGNING_KEY**, and **QSTASH_NEXT_SIGNING_KEY**. Add them to Vercel.

#### Vercel Blob (For Video Storage)
1. In your Vercel dashboard for this project, go to the **Storage** tab.
2. Create a new **Blob** database.
3. Follow the instructions to link it to your project. This will automatically inject `BLOB_READ_WRITE_TOKEN` into your environment variables.

#### YouTube Data API
Because this app is running in the cloud, you can't use the simple local popup to log in. You need a long-lived Refresh Token.
1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create OAuth Client ID (Type: Web Application). Set Authorized Redirect URI to `https://developers.google.com/oauthplayground`.
3. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/).
4. Click the gear icon (top right), check "Use your own OAuth credentials", and paste your **Client ID** and **Client Secret**.
5. In Step 1, select `https://www.googleapis.com/auth/youtube.upload` and click Authorize APIs.
6. Click "Exchange authorization code for tokens" to get your **Refresh Token**.
7. Add these 3 to Vercel:
   - `YOUTUBE_CLIENT_ID`
   - `YOUTUBE_CLIENT_SECRET`
   - `YOUTUBE_REFRESH_TOKEN`

#### Meta Graph API (Facebook)
1. Add your `FACEBOOK_PAGE_ID` and `META_ACCESS_TOKEN` just like in the local version.

#### Gemini AI (For Auto-Captions)
1. Add your `GEMINI_API_KEY` from Google AI Studio.

### Step 4: Deploy!
Once all environment variables are saved, click **Deploy** in Vercel. Your serverless AI auto-poster is now live!
