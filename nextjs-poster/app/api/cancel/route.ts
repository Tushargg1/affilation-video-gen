import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export async function POST(request: Request) {
  try {
    const { messageId } = await request.json();

    if (!messageId) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }

    if (!process.env.QSTASH_TOKEN || !process.env.UPSTASH_REDIS_REST_URL) {
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 });
    }

    // 1. Cancel the message in QStash
    const qstashRes = await fetch(`https://qstash.upstash.io/v2/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
      },
    });

    if (!qstashRes.ok && qstashRes.status !== 404) {
      // 404 means it might have already been delivered or deleted, which is fine to ignore for our DB update
      const errorText = await qstashRes.text();
      console.error('QStash delete error:', errorText);
      return NextResponse.json({ error: 'Failed to cancel scheduled message in QStash' }, { status: 500 });
    }

    // 2. Update status in Redis
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    const existing = await redis.hget('app:posts', messageId);
    if (existing) {
      await redis.hset('app:posts', {
        [messageId]: {
          ...(existing as any),
          status: 'CANCELLED',
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Cancel error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
