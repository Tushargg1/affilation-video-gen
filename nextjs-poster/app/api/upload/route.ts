import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

// Increase body size limit for video uploads (videos can be 50+ MB as base64)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

// Also needed for Next.js App Router (route handlers)
export const maxDuration = 60; // 60 second timeout for large uploads

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json();

  // Handle direct backend base64 uploads (used by the Global Automation script)
  if (body.base64) {
    try {
      const base64Data = body.base64.replace(/^data:(image|video)\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      
      const isVideo = body.base64.startsWith('data:video');
      const ext = isVideo ? 'mp4' : 'png';
      const contentType = isVideo ? 'video/mp4' : 'image/png';
      
      const blob = await put(`generated-${Date.now()}.${ext}`, buffer, {
        access: 'public',
        contentType
      });
      return NextResponse.json({ url: blob.url });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  try {
    const uploadBody = body as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body: uploadBody,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // You could add a password check here reading from headers if you want to secure the upload
        return {
          allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/x-m4v', 'image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB
          addRandomSuffix: false,
          allowOverwrite: true,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('Upload completed:', blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
