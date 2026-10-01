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
      const response = await fetch(imageUrl);
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
      const response = await fetch(modelImageUrl);
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

    const fallbackModels = [model, 'gemini-3.7-flash', 'gemini-3.6-flash'];
    // Deduplicate the models just in case the requested model is already 3.7 or 3.6
    const modelsToTry = Array.from(new Set(fallbackModels));

    let lastError: any = null;

    for (const currentModel of modelsToTry) {
      try {
        const generativeModel = genAI.getGenerativeModel({ model: currentModel });
        const result = await generativeModel.generateContent(parts);
        const responseText = result.response.text();
        return NextResponse.json({ success: true, text: responseText, usedModel: currentModel });
      } catch (err: any) {
        console.warn(`Model ${currentModel} failed: ${err.message}. Trying next fallback...`);
        lastError = err;
        // If it's a 503, continue to the next model. If it's another error, maybe also continue.
      }
    }

    throw lastError || new Error('All fallback models failed.');

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
