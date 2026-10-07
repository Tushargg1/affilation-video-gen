import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, imageUrl, modelImageUrl, model = 'gemini-3.8-flash' } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    
    const parts: any[] = [{ text: prompt }];

    // 1. Fetch and attach Product Image
    if (imageUrl) {
      const response = await fetch(imageUrl, { 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        parts.push({
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: response.headers.get('content-type') || 'image/jpeg',
          },
        });
      }
    }

    // 2. Fetch and attach Model Photo (if provided)
    if (modelImageUrl) {
      const response = await fetch(modelImageUrl, { 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        parts.push({
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: response.headers.get('content-type') || 'image/jpeg',
          },
        });
      }
    }

    try {
      const generativeModel = genAI.getGenerativeModel(
        { model: model }, 
        { apiVersion: 'v1' }
      );
      const result = await generativeModel.generateContent(parts);
      const responseText = result.response.text();
      return NextResponse.json({ success: true, text: responseText, usedModel: model });
    } catch (err: any) {
      console.warn(`Model ${model} failed: ${err.message}. Sending error to frontend.`);
      return NextResponse.json({ error: err.message || 'Model execution failed.' }, { status: 503 });
    }

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
