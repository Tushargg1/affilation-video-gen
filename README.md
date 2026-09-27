# Affiliation Video Generator

An automated system that scrapes affiliate products from Meesho, generates product showcase videos, and auto-posts them to YouTube, Facebook, and Instagram.

## Project Structure

```
├── nextjs-poster/          # Vercel web dashboard (deployed at nextjs-poster-eta.vercel.app)
│   ├── app/                # Next.js 14 App Router pages & API routes
│   │   ├── api/            # Backend API endpoints
│   │   │   ├── config/     # Scheduler configuration (stored in Redis)
│   │   │   ├── history/    # Post history (stored in Redis)
│   │   │   ├── post/       # QStash webhook → posts to YT/FB/IG
│   │   │   ├── publish-ig/ # Instagram 2-step publish handler
│   │   │   ├── schedule/   # QStash scheduling endpoint
│   │   │   └── upload/     # Vercel Blob upload handler
│   │   └── page.tsx        # Main dashboard UI
│   └── ...
│
├── prod ext/               # Local product extraction (runs on laptop)
│   └── api_inspector/
│       ├── meesho_full_auto.py   # BlueStacks/Meesho scraper bot
│       ├── meesho-dashboard/     # Local Next.js API server (Cloudflare tunnel)
│       └── data/                 # SQLite database (gitignored)
│
└── video gen/              # Local video generation (runs on laptop)
    ├── scheduler.js        # Polls DB, generates videos, uploads to cloud
    ├── digen-automation.js # Automates the video generation tool
    └── ...
```

## How It Works

1. **Product Extraction** (laptop): `meesho_full_auto.py` scrapes Meesho products via BlueStacks emulator and saves to local SQLite DB
2. **Video Generation** (laptop): `scheduler.js` reads products from DB, generates videos via local tool, uploads to Vercel Blob
3. **Scheduling** (cloud): Vercel receives the video URL and schedules posting via QStash at configured times
4. **Auto-Posting** (cloud ✅): At scheduled time, Vercel automatically posts the video to YouTube, Facebook, and Instagram — **laptop can be OFF**

## Cloud Services Used

- **Vercel** — Next.js hosting + serverless API
- **Upstash Redis** — Stores post history & scheduler config
- **Upstash QStash** — Schedules future video posts
- **Vercel Blob** — Temporary video storage

## Setup

See individual folder READMEs for setup instructions.
