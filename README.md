# AI Video & Influencer Automation Pipeline

An automated AI generation & multi-platform social media distribution system that creates daily 50-second AI Influencer reels (and affiliate showcase videos), stitches clips seamlessly, and autonomously posts to YouTube Shorts, Instagram Reels, and Facebook Reels.

## 🌟 Key Features

- **Autonomous AI Influencer (1 Reel Daily • 50 Seconds)**:
  - Generates cohesive 5-scene narrative scripts with Google Gemini (Hook 0–10s, Progression 10–20s, Showcase 20–30s, Atmosphere 30–40s, Outro & CTA 40–50s).
  - Preserves exact video generation automation through browser automation extension.
  - Automatically downloads 1080p high quality clips.
  - Seamlessly concatenates all 5 clips into a single vertical (1080×1920 9:16) 50-second MP4 with normalized audio using FFmpeg.
  - Uploads to Vercel Cloud Storage (Blob).
  - Automatically schedules daily posting at set times (e.g., 19:00 / 7:00 PM).
- **Vercel Cloud Auto-Poster**:
  - Scheduled delivery via Upstash QStash.
  - Posts automatically to Instagram Reels, YouTube Shorts, and Facebook Reels — **laptop can be OFF at post time**.
- **Interactive Next.js Dashboard**:
  - Live AI Influencer Studio with in-browser 50s video preview, status tracking, and 1-click manual run.

## 📂 Project Structure

```
├── nextjs-poster/              # Cloud Web Dashboard & Serverless Auto-Poster (Vercel)
│   ├── app/
│   │   ├── influencer/         # AI Influencer Studio UI
│   │   ├── api/
│   │   │   ├── influencer/     # Influencer reel status & trigger API
│   │   │   ├── post/           # QStash webhook → posts to YT/FB/IG
│   │   │   ├── schedule/       # QStash scheduling endpoint
│   │   │   ├── config/         # Scheduler configuration
│   │   │   └── upload/         # Vercel Blob upload handler
│   │   └── page.tsx            # Main dashboard UI
│   └── ...
│
├── video gen/                  # Local video generation & scheduler (Laptop)
│   ├── influencer_pipeline.js  # 5-clip generation loop, FFmpeg concat & cloud upload
│   ├── influencer_scheduler.js # 24/7 daily autonomous scheduler
│   ├── influencer_prompts.js   # Gemini 50s reel script & prompt generator
│   ├── influencer_cli.js       # CLI tool for immediate generation & status
│   ├── influencer_config.json  # Influencer character, niche, post time settings
│   ├── server.js               # Port 3001 bridge server & multi-clip concat API
│   ├── start-influencer-automation.bat # 1-Click Windows batch starter
│   └── digen-extension/        # Browser extension for high-quality video gen
│
└── prod ext/                   # Product extraction & scraper utilities
```

## 🚀 Quick Start

### 1. Launch AI Influencer Automation
Run the batch file on Windows:
```cmd
.\video gen\start-influencer-automation.bat
```
Or start manually via CLI:
```bash
cd "video gen"
npm run influencer
```

### 2. Manual Immediate Generation
```bash
cd "video gen"
node influencer_cli.js run "Neon Shibuya evening rain walk"
```

### 3. Open Next.js Dashboard
```bash
cd nextjs-poster
npm run dev
```
Open `http://localhost:3000/influencer` to view the AI Influencer Studio.
