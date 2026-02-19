import { NextResponse } from 'next/server';
import { generateDailyDigestWithMockFallback, getRecentInspirationContents } from '@/lib/daily-digest';

// Force dynamic rendering - don't cache at build time
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayMMDD = `${month}-${day}`;
    const previewRecipientId = 'preview-user';

    const recentInspirations = await getRecentInspirationContents(14);
    const { html, isMockData } = await generateDailyDigestWithMockFallback(
      'Preview User',
      undefined,
      undefined,
      recentInspirations,
      undefined,
      [{ name: 'Preview User', monthDay: todayMMDD }],
      previewRecipientId
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
