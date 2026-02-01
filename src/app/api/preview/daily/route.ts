import { NextResponse } from 'next/server';
import { generateDailyDigestWithMockFallback, getRecentInspirationContents } from '@/lib/daily-digest';

// Force dynamic rendering - don't cache at build time
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const recentInspirations = await getRecentInspirationContents(14);
    const { html, isMockData } = await generateDailyDigestWithMockFallback(
      'Preview User',
      undefined,
      undefined,
      recentInspirations
    );

    const response = new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
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
