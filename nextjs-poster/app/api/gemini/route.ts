import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, imageUrl, model = 'gemini-3.8-flash' } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    
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
