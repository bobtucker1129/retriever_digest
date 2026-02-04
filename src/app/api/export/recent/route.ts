import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

interface ShownInsights {
  date: string;
  accountIds: number[];
  accountNames: string[];
  insightTypes: string[];
}

interface DigestDataPayload {
  shownInsights?: ShownInsights;
  // ... other fields exist but we only need shownInsights
}

/**
 * GET /api/export/recent
 * 
 * Returns account IDs that have been shown in recent digests.
 * Used by the Python export script to exclude recently featured accounts.
 * 
 * Query params:
 *   - days: Number of days to look back (default: 14)
 * 
 * Returns:
 *   {
 *     accountIds: number[],
 *     accountNames: string[],
 *     recentDigests: Array<{ date: string, headline?: string, accountNames: string[], receivedAt: string, exportSource?: string }>
 *   }
 */
export async function GET(request: NextRequest) {
  const exportSecret = request.headers.get('X-Export-Secret');
  const expectedSecret = process.env.EXPORT_API_SECRET;

  if (!expectedSecret) {
    console.error('[Export Recent API] EXPORT_API_SECRET environment variable not set');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (!exportSecret || exportSecret !== expectedSecret) {
    console.warn('[Export Recent API] Unauthorized request - invalid or missing secret');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Get days parameter (default 14)
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '14', 10);
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    // Fetch recent digest data
    const recentDigests = await prisma.digestData.findMany({
      where: {
        exportDate: {
          gte: cutoffDate,
        },
      },
      orderBy: {
        exportDate: 'desc',
      },
    });

    // Aggregate shown account IDs and names
    const allAccountIds = new Set<number>();
    const allAccountNames = new Set<string>();
    const digestSummaries: Array<{
      date: string;
      headline?: string;
      accountNames: string[];
      receivedAt: string;
      exportSource?: string;
    }> = [];

    for (const digest of recentDigests) {
      const data = digest.data as unknown as DigestDataPayload;
      const shownInsights = data?.shownInsights;
      
      if (shownInsights) {
        // Collect account IDs
        if (shownInsights.accountIds) {
          shownInsights.accountIds.forEach(id => allAccountIds.add(id));
        }
        
        // Collect account names
        if (shownInsights.accountNames) {
          shownInsights.accountNames.forEach(name => allAccountNames.add(name));
        }
      }

      // Also extract headline from motivational summary if stored
      // This helps AI avoid repetitive headlines
      const rawData = data as Record<string, unknown>;
      const headline = (rawData?.motivationalHeadline as string) || undefined;
      const exportSource = (rawData?.export_source as string) || undefined;
      
      digestSummaries.push({
        date: digest.exportDate.toISOString().split('T')[0],
        headline,
        accountNames: shownInsights?.accountNames || [],
        receivedAt: digest.createdAt.toISOString(),
        exportSource,
      });
    }

    console.log(`[Export Recent API] Found ${allAccountIds.size} unique account IDs from ${recentDigests.length} digests (last ${days} days)`);

    return NextResponse.json({
      accountIds: Array.from(allAccountIds),
      accountNames: Array.from(allAccountNames),
      recentDigests: digestSummaries,
      daysSearched: days,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Export Recent API] Error:', errorMessage);
    return NextResponse.json(
      { error: 'Failed to fetch recent data' },
      { status: 500 }
    );
  }
}
