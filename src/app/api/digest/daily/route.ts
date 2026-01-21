import { NextRequest, NextResponse } from 'next/server';
import { sendDailyDigest, getLatestDigestData } from '@/lib/daily-digest';

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('X-Cron-Secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    console.error('[Daily Digest API] CRON_SECRET environment variable not set');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (!cronSecret || cronSecret !== expectedSecret) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const digestData = await getLatestDigestData();
  if (!digestData) {
    return NextResponse.json(
      { error: 'No digest data available for today' },
      { status: 400 }
    );
  }

  try {
    const result = await sendDailyDigest();
    return NextResponse.json({
      success: result.failed === 0,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Daily Digest API] Error:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
