import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(request: NextRequest) {
  const exportSecret = request.headers.get('X-Export-Secret');
  const expectedSecret = process.env.EXPORT_API_SECRET;

  if (!expectedSecret) {
    console.error('[Export API] EXPORT_API_SECRET environment variable not set');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (!exportSecret || exportSecret !== expectedSecret) {
    console.warn('[Export API] Unauthorized request - invalid or missing secret');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const data = await request.json();

    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.digestData.upsert({
      where: { exportDate: today },
      update: { data },
      create: { exportDate: today, data },
    });

    const dateStr = today.toISOString().split('T')[0];
    console.log(`[Export API] Data received and stored for ${dateStr}`);

    return NextResponse.json({
      success: true,
      date: dateStr,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Export API] Error processing export:', errorMessage);
    return NextResponse.json(
      { error: 'Failed to process export data' },
      { status: 500 }
    );
  }
}
