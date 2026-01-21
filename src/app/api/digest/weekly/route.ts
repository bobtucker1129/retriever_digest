import { NextRequest, NextResponse } from 'next/server';
import { sendWeeklyDigest, getWeeklyDigestData } from '@/lib/weekly-digest';

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('X-Cron-Secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    console.error('[Weekly Digest API] CRON_SECRET environment variable not set');
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

  const weeklyData = await getWeeklyDigestData();
  if (!weeklyData) {
    return NextResponse.json(
      { error: 'No weekly digest data available' },
      { status: 400 }
    );
  }

  try {
    const result = await sendWeeklyDigest();
    return NextResponse.json({
      success: result.failed === 0,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Weekly Digest API] Error:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
