import { NextResponse } from 'next/server';
import sharp from 'sharp';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    // Fetch the original image from Vercel Blob
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process image with Sharp
    // Enforce exactly 1080x1920 (9:16 aspect ratio)
    // and compress as JPEG to ensure it stays well under 2MB
    const processedBuffer = await sharp(buffer)
      .resize(1080, 1920, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    return new NextResponse(processedBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable'
      },
    });
  } catch (error: any) {
    console.error('Thumbnail API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
