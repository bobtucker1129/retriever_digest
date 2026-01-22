import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  const result = {
    keyExists: !!apiKey,
    keyPrefix: apiKey ? apiKey.substring(0, 12) + '...' : 'none',
    keyLength: apiKey?.length || 0,
    testResult: 'not attempted',
    error: null as string | null,
  };

  if (!apiKey) {
    result.testResult = 'skipped - no key';
    return NextResponse.json(result);
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Say "API working" in 3 words or less.' }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : 'no text';
    result.testResult = `success: ${text}`;
  } catch (error) {
    result.testResult = 'failed';
    result.error = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(result);
}
