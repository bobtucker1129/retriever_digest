import { NextRequest, NextResponse } from 'next/server';
import { generateWeeklyDigestWithMockFallback } from '@/lib/weekly-digest';
import { getRecentInspirationContents } from '@/lib/daily-digest';
import { requireAdminSession } from '@/lib/session-auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Force dynamic rendering - don't cache at build time
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminSession(request);
  if (unauthorized) return unauthorized;

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`preview-weekly:${ip}`, {
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many preview requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  try {
    const previewRecipientId = 'preview-user';
    const recentInspirations = await getRecentInspirationContents(14);
    const { html, isMockData } = await generateWeeklyDigestWithMockFallback(
      'Preview User',
      undefined,
      undefined,
      recentInspirations,
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
    console.error('[Preview Weekly] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 }
    );
  }
}
