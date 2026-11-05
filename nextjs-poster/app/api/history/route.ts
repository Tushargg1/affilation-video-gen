import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Force dynamic so it doesn't cache the history API
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return NextResponse.json({ error: 'Redis credentials missing' }, { status: 500 });
    }

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const posts = await redis.hgetall('app:posts');
    
    if (!posts) {
      return NextResponse.json({ posts: [] });
    }

    // Convert hash map to array and sort by scheduleTime descending
    const postsArray = Object.values(posts).map((p: any) => (typeof p === 'string' ? JSON.parse(p) : p));
    postsArray.sort((a, b) => new Date(b.scheduleTime).getTime() - new Date(a.scheduleTime).getTime());

    return NextResponse.json({ posts: postsArray });
  } catch (error: any) {
    console.error('History fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
