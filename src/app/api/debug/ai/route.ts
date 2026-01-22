import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  const result = {
    keyExists: !!apiKey,
    keyPrefix: apiKey ? apiKey.substring(0, 12) + '...' : 'none',
    testResult: 'not attempted',
    rawResponse: null as string | null,
    parsedResult: null as object | null,
    parseError: null as string | null,
    error: null as string | null,
  };

  if (!apiKey) {
    result.testResult = 'skipped - no key';
    return NextResponse.json(result);
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    
    // Use the EXACT same prompt as generateMotivationalSummary
    const prompt = `You are writing a brief motivational summary for BooneGraphics, a professional printing company serving the medical industry. This will appear at the top of a daily digest email to the team.

Yesterday's results: $13,630 in revenue, 17 orders completed, 13 estimates created, 0 new customers.

Write a 2-3 sentence motivational team summary that:
1. Acknowledges the team's collective effort (never call out individuals)
2. Highlights something positive from the numbers
3. Maintains a professional, encouraging tone appropriate for a B2B medical printing company
4. Focuses on team success and shared wins

Return your response in this exact JSON format:
{"headline": "Short 2-4 word headline", "message": "Your 2-3 sentence motivational message here."}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
      system: 'You generate professional, team-focused motivational content for a medical printing company. Always respond with valid JSON only.',
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : null;
    result.rawResponse = text;

    if (text) {
      try {
        // Same parsing logic as ai-content.ts
        let jsonText = text;
        
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonText = jsonMatch[1].trim();
        }
        
        const objectMatch = jsonText.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonText = objectMatch[0];
        }
        
        const parsed = JSON.parse(jsonText);
        result.parsedResult = parsed;
        result.testResult = 'success';
      } catch (parseErr) {
        result.parseError = parseErr instanceof Error ? parseErr.message : String(parseErr);
        result.testResult = 'parse_failed';
      }
    } else {
      result.testResult = 'empty_response';
    }
  } catch (error) {
    result.testResult = 'api_failed';
    result.error = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json(result, { 
    headers: { 'Content-Type': 'application/json' },
  });
}
