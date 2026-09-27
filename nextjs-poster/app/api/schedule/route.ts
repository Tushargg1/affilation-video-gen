import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

// Initialize QStash client
// The QSTASH_TOKEN environment variable must be set in Vercel
const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN || '',
});

export async function POST(request: Request) {
  try {
    if (!process.env.QSTASH_TOKEN) {
      return NextResponse.json({ error: 'QSTASH_TOKEN is not configured.' }, { status: 500 });
    }

    const body = await request.json();
    const { videoUrl, blobName, description, platforms, scheduleTime } = body;

    if (!videoUrl || !scheduleTime) {
      return NextResponse.json({ error: 'Missing video URL or schedule time.' }, { status: 400 });
    }

    // Convert the local datetime string from the frontend to a Unix timestamp
    // The frontend sends "YYYY-MM-DDTHH:mm". We parse it to a timestamp in seconds.
    const dateObj = new Date(scheduleTime);
    const notBefore = Math.floor(dateObj.getTime() / 1000);

    // Get the absolute URL of the deployment to tell QStash where to send the webhook
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const host = request.headers.get('host') || process.env.VERCEL_PROJECT_PRODUCTION_URL || '';
    
    if (!host) {
       return NextResponse.json({ error: 'Could not determine host URL for webhook.' }, { status: 500 });
    }

    const destinationUrl = `${protocol}://${host}/api/post`;

    // Initialize Redis if configured
    let redis: any = null;
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = require('@upstash/redis');
      redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    }

    const res = await qstashClient.publishJSON({
      url: destinationUrl,
      body: {
        videoUrl,
        blobName,
        description,
        platforms,
      },
      notBefore: notBefore,
      retries: 3,
    });

    if (redis) {
      await redis.hset('app:posts', {
        [res.messageId]: {
          id: res.messageId,
          blobName,
          platforms,
          scheduleTime,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        }
      });
    }

    return NextResponse.json({ success: true, messageId: res.messageId });
  } catch (error: any) {
    console.error('Failed to schedule:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
