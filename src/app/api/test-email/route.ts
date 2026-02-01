import { NextRequest, NextResponse } from 'next/server';
import { generateDailyDigestWithMockFallback, getRecentInspirationContents } from '@/lib/daily-digest';
import { generateWeeklyDigestWithMockFallback } from '@/lib/weekly-digest';
import { sendEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, type = 'daily' } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email address is required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const today = new Date();
    let html: string;
    let subject: string;

    if (type === 'weekly') {
      const recentInspirations = await getRecentInspirationContents(14);
      const result = await generateWeeklyDigestWithMockFallback(
        'Test User',
        undefined,
        undefined,
        recentInspirations
      );
      html = result.html;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekStartStr = weekStart.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      subject = `🐕 Retriever Weekly Digest - Week of ${weekStartStr} (TEST)`;
    } else {
      const recentInspirations = await getRecentInspirationContents(14);
      const result = await generateDailyDigestWithMockFallback(
        'Test User',
        undefined,
        undefined,
        recentInspirations
      );
      html = result.html;
      const dateStr = today.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      subject = `🐕 Retriever Daily Digest - ${dateStr} (TEST)`;
    }

    const result = await sendEmail({
      to: email,
      subject,
      html,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Test Email] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send test email' },
      { status: 500 }
    );
  }
}
