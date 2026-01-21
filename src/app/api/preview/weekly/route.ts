import { NextResponse } from 'next/server';
import { generateWeeklyDigestWithMockFallback } from '@/lib/weekly-digest';

export async function GET() {
  try {
    const { html, isMockData } = await generateWeeklyDigestWithMockFallback('Preview User');

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
    console.error('[Preview Weekly] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 }
    );
  }
}
