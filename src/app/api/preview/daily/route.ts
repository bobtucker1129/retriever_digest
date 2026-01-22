import { NextResponse } from 'next/server';
import { generateDailyDigestWithMockFallback } from '@/lib/daily-digest';

// Force dynamic rendering - don't cache at build time
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { html, isMockData } = await generateDailyDigestWithMockFallback('Preview User');

    const response = new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    });

    if (isMockData) {
      response.headers.set('X-Mock-Data', 'true');
    }

    return response;
  } catch (error) {
    console.error('[Preview Daily] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 }
    );
  }
}
