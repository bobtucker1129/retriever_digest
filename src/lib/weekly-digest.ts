'use server';

import prisma from '@/lib/db';
import { GoalType } from '@/generated/prisma/client';
import { generateAIContent, type AIContent } from '@/lib/ai-content';
import type { DigestDataPayload, PerformanceData } from '@/lib/daily-digest';

export interface WeeklyMetrics {
  revenue: number;
  salesCount: number;
  estimatesCreated: number;
  newCustomers: number;
}

export interface WeekOverWeekChange {
  revenueChange: number;
  salesCountChange: number;
  estimatesCreatedChange: number;
  newCustomersChange: number;
}

export interface WeeklyDigestData {
  weekStartDate: Date;
  weekEndDate: Date;
  thisWeek: WeeklyMetrics;
  lastWeek: WeeklyMetrics;
  weekOverWeekChange: WeekOverWeekChange;
  pmWeeklyPerformance: PerformanceData[];
  bdWeeklyPerformance: PerformanceData[];
  monthToDate: WeeklyMetrics;
  yearToDate: WeeklyMetrics;
  topHighlights: string[];
}

function getWeekBoundaries(referenceDate: Date): { start: Date; end: Date } {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  
  const dayOfWeek = date.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  const monday = new Date(date);
  monday.setDate(date.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);
  
  return { start: monday, end: friday };
}

function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function aggregateMetricsFromDigestData(digestDataRecords: { data: unknown }[]): WeeklyMetrics {
  const metrics: WeeklyMetrics = {
    revenue: 0,
    salesCount: 0,
    estimatesCreated: 0,
    newCustomers: 0,
  };

  for (const record of digestDataRecords) {
    const data = record.data as DigestDataPayload;
    if (data?.metrics) {
      metrics.revenue += data.metrics.dailyRevenue || 0;
      metrics.salesCount += data.metrics.dailySalesCount || 0;
      metrics.estimatesCreated += data.metrics.dailyEstimatesCreated || 0;
      metrics.newCustomers += data.metrics.dailyNewCustomers || 0;
    }
  }

  return metrics;
}

function aggregatePerformanceData(
  digestDataRecords: { data: unknown }[],
  key: 'pmPerformance' | 'bdPerformance'
): PerformanceData[] {
  const performanceMap = new Map<string, PerformanceData>();

  for (const record of digestDataRecords) {
    const data = record.data as DigestDataPayload;
    const performanceData = data?.[key];
    if (performanceData && Array.isArray(performanceData)) {
      for (const item of performanceData) {
        const existing = performanceMap.get(item.name);
        if (existing) {
          existing.ordersCompleted += item.ordersCompleted || 0;
          existing.revenue += item.revenue || 0;
        } else {
          performanceMap.set(item.name, {
            name: item.name,
            ordersCompleted: item.ordersCompleted || 0,
            revenue: item.revenue || 0,
          });
        }
      }
    }
  }

  return Array.from(performanceMap.values()).sort((a, b) => b.revenue - a.revenue);
}

function aggregateHighlights(digestDataRecords: { data: unknown }[]): string[] {
  const allHighlights: string[] = [];

  for (const record of digestDataRecords) {
    const data = record.data as DigestDataPayload;
    if (data?.highlights && Array.isArray(data.highlights)) {
      for (const highlight of data.highlights) {
        if (highlight.description) {
          allHighlights.push(highlight.description);
        }
      }
    }
  }

  return allHighlights.slice(0, 10);
}

export async function getWeeklyDigestData(): Promise<WeeklyDigestData | null> {
  const today = new Date();
  
  const thisWeekBounds = getWeekBoundaries(today);
  
  const lastWeekReference = new Date(today);
  lastWeekReference.setDate(today.getDate() - 7);
  const lastWeekBounds = getWeekBoundaries(lastWeekReference);

  const [thisWeekRecords, lastWeekRecords] = await Promise.all([
    prisma.digestData.findMany({
      where: {
        exportDate: {
          gte: thisWeekBounds.start,
          lte: thisWeekBounds.end,
        },
      },
      orderBy: { exportDate: 'asc' },
    }),
    prisma.digestData.findMany({
      where: {
        exportDate: {
          gte: lastWeekBounds.start,
          lte: lastWeekBounds.end,
        },
      },
      orderBy: { exportDate: 'asc' },
    }),
  ]);

  const thisWeekMetrics = aggregateMetricsFromDigestData(thisWeekRecords);
  const lastWeekMetrics = aggregateMetricsFromDigestData(lastWeekRecords);

  const weekOverWeekChange: WeekOverWeekChange = {
    revenueChange: calculatePercentageChange(thisWeekMetrics.revenue, lastWeekMetrics.revenue),
    salesCountChange: calculatePercentageChange(thisWeekMetrics.salesCount, lastWeekMetrics.salesCount),
    estimatesCreatedChange: calculatePercentageChange(thisWeekMetrics.estimatesCreated, lastWeekMetrics.estimatesCreated),
    newCustomersChange: calculatePercentageChange(thisWeekMetrics.newCustomers, lastWeekMetrics.newCustomers),
  };

  const pmWeeklyPerformance = aggregatePerformanceData(thisWeekRecords, 'pmPerformance');
  const bdWeeklyPerformance = aggregatePerformanceData(thisWeekRecords, 'bdPerformance');
  const topHighlights = aggregateHighlights(thisWeekRecords);

  const latestRecord = thisWeekRecords.length > 0 
    ? thisWeekRecords[thisWeekRecords.length - 1] 
    : lastWeekRecords.length > 0 
      ? lastWeekRecords[lastWeekRecords.length - 1]
      : null;

  let monthToDate: WeeklyMetrics = { revenue: 0, salesCount: 0, estimatesCreated: 0, newCustomers: 0 };
  let yearToDate: WeeklyMetrics = { revenue: 0, salesCount: 0, estimatesCreated: 0, newCustomers: 0 };

  if (latestRecord) {
    const latestData = latestRecord.data as unknown as DigestDataPayload;
    if (latestData?.metrics) {
      monthToDate = {
        revenue: latestData.metrics.monthToDateRevenue || 0,
        salesCount: latestData.metrics.monthToDateSalesCount || 0,
        estimatesCreated: latestData.metrics.monthToDateEstimatesCreated || 0,
        newCustomers: latestData.metrics.monthToDateNewCustomers || 0,
      };
      yearToDate = {
        revenue: latestData.metrics.yearToDateRevenue || 0,
        salesCount: latestData.metrics.yearToDateSalesCount || 0,
        estimatesCreated: latestData.metrics.yearToDateEstimatesCreated || 0,
        newCustomers: latestData.metrics.yearToDateNewCustomers || 0,
      };
    }
  }

  return {
    weekStartDate: thisWeekBounds.start,
    weekEndDate: thisWeekBounds.end,
    thisWeek: thisWeekMetrics,
    lastWeek: lastWeekMetrics,
    weekOverWeekChange,
    pmWeeklyPerformance,
    bdWeeklyPerformance,
    monthToDate,
    yearToDate,
    topHighlights,
  };
}
