import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, imageUrl, model = 'gemini-1.5-flash' } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const generativeModel = genAI.getGenerativeModel({ model });

    const parts: any[] = [{ text: prompt }];

    // If an image URL is provided, fetch it and convert to base64
    if (imageUrl) {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      
      parts.push({
        inlineData: {
          data: buffer.toString('base64'),
          mimeType,
        },
      });
    }

    const result = await generativeModel.generateContent(parts);
    const responseText = result.response.text();

    return NextResponse.json({ success: true, text: responseText });

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
