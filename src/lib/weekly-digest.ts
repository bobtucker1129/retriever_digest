'use server';

import prisma from '@/lib/db';
import { GoalType } from '@/generated/prisma/client';
import { generateAIContent, type AIContent } from '@/lib/ai-content';
import { sendEmail } from '@/lib/email';
import type { DigestDataPayload, PerformanceData } from '@/lib/daily-digest';

export type { PerformanceData };

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

function formatWeekRange(start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', options);
  const endStr = end.toLocaleDateString('en-US', options);
  const year = end.getFullYear();
  return `${startStr} - ${endStr}, ${year}`;
}

function calculateProgress(current: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(Math.round((current / goal) * 100), 100);
}

function getProgressBarColor(percentage: number): string {
  if (percentage >= 100) return '#22c55e';
  if (percentage >= 75) return '#84cc16';
  if (percentage >= 50) return '#eab308';
  if (percentage >= 25) return '#f97316';
  return '#ef4444';
}

function renderProgressBar(current: number, goal: number, label: string): string {
  const percentage = calculateProgress(current, goal);
  const color = getProgressBarColor(percentage);
  
  return `
    <div style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-weight: 500; color: #374151;">${label}</span>
        <span style="color: #6b7280;">${formatNumber(current)} / ${formatNumber(goal)} (${percentage}%)</span>
      </div>
      <div style="background-color: #e5e7eb; border-radius: 9999px; height: 12px; overflow: hidden;">
        <div style="background-color: ${color}; height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
      </div>
    </div>
  `;
}

function renderChangeIndicator(change: number): string {
  const isPositive = change >= 0;
  const arrow = isPositive ? '↑' : '↓';
  const color = isPositive ? '#22c55e' : '#ef4444';
  return `<span style="color: ${color}; font-weight: 600;">${arrow} ${Math.abs(change)}%</span>`;
}

function renderAIContent(aiContent: AIContent): string {
  if (aiContent.type === 'quote') {
    return `
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-top: 24px; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; font-style: italic; color: #92400e;">"${aiContent.content}"</p>
        ${aiContent.attribution ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #b45309;">— ${aiContent.attribution}</p>` : ''}
      </div>
    `;
  } else {
    return `
      <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin-top: 24px; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #065f46;">😄 ${aiContent.content}</p>
      </div>
    `;
  }
}

export function generateWeeklyDigestHTML(
  recipientName: string,
  data: WeeklyDigestData,
  monthlyGoal: { salesRevenue: number; salesCount: number; estimatesCreated: number; newCustomers: number },
  annualGoal: { salesRevenue: number; salesCount: number; estimatesCreated: number; newCustomers: number },
  aiContent: AIContent
): string {
  const weekRangeStr = formatWeekRange(data.weekStartDate, data.weekEndDate);
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retriever Weekly Digest</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 24px; text-align: center;">
      <div style="display: inline-block; background-color: white; padding: 12px; border-radius: 12px; margin-bottom: 16px;">
        <svg width="48" height="48" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="50" cy="70" rx="30" ry="20" fill="#8B4513"/>
          <circle cx="50" cy="40" r="25" fill="#8B4513"/>
          <ellipse cx="35" cy="25" rx="10" ry="15" fill="#8B4513"/>
          <ellipse cx="65" cy="25" rx="10" ry="15" fill="#8B4513"/>
          <ellipse cx="42" cy="38" rx="5" ry="6" fill="white"/>
          <ellipse cx="58" cy="38" rx="5" ry="6" fill="white"/>
          <circle cx="42" cy="38" r="3" fill="#333"/>
          <circle cx="58" cy="38" r="3" fill="#333"/>
          <ellipse cx="50" cy="48" rx="6" ry="4" fill="#333"/>
          <path d="M35 55 Q50 62 65 55" stroke="#333" stroke-width="2" fill="none"/>
          <ellipse cx="50" cy="58" rx="3" ry="2" fill="#FF69B4"/>
        </svg>
      </div>
      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">🐕 Retriever Weekly Digest</h1>
      <p style="margin: 8px 0 0 0; color: #e9d5ff; font-size: 16px;">Week of ${weekRangeStr}</p>
    </div>

    <!-- Celebratory Greeting -->
    <div style="padding: 24px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);">
      <p style="margin: 0; font-size: 22px; color: #92400e; font-weight: 600;">🎉 What a week, ${recipientName}!</p>
      <p style="margin: 8px 0 0 0; color: #b45309;">Here's your weekly recap from BooneGraphics. Crushing it!</p>
    </div>

    <!-- This Week's Wins -->
    <div style="padding: 24px;">
      <h2 style="margin: 0 0 16px 0; color: #7c3aed; font-size: 20px; border-bottom: 2px solid #a855f7; padding-bottom: 8px;">🏆 This Week's Wins</h2>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
        <div style="background-color: #f5f3ff; padding: 16px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #7c3aed;">${formatCurrency(data.thisWeek.revenue)}</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Total Revenue</p>
        </div>
        <div style="background-color: #f5f3ff; padding: 16px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #7c3aed;">${formatNumber(data.thisWeek.salesCount)}</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Orders Completed</p>
        </div>
        <div style="background-color: #f5f3ff; padding: 16px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #7c3aed;">${formatNumber(data.thisWeek.estimatesCreated)}</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Estimates Created</p>
        </div>
        <div style="background-color: #f5f3ff; padding: 16px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #7c3aed;">${formatNumber(data.thisWeek.newCustomers)}</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">New Customers</p>
        </div>
      </div>
      ${data.topHighlights.length > 0 ? `
        <div style="margin-top: 16px; background-color: #fef3c7; padding: 16px; border-radius: 8px;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #92400e;">⭐ Top Highlights</p>
          <ul style="margin: 0; padding: 0 0 0 20px; color: #b45309;">
            ${data.topHighlights.slice(0, 5).map(h => `<li style="margin-bottom: 4px;">${h}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>

    <!-- Week over Week -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #7c3aed; font-size: 20px; border-bottom: 2px solid #a855f7; padding-bottom: 8px;">📈 Week over Week</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f5f3ff;">
            <th style="text-align: left; padding: 12px; font-size: 14px; color: #6b7280;">Metric</th>
            <th style="text-align: right; padding: 12px; font-size: 14px; color: #6b7280;">Last Week</th>
            <th style="text-align: right; padding: 12px; font-size: 14px; color: #6b7280;">This Week</th>
            <th style="text-align: right; padding: 12px; font-size: 14px; color: #6b7280;">Change</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; color: #374151;">Revenue</td>
            <td style="padding: 12px; text-align: right; color: #6b7280;">${formatCurrency(data.lastWeek.revenue)}</td>
            <td style="padding: 12px; text-align: right; color: #374151; font-weight: 600;">${formatCurrency(data.thisWeek.revenue)}</td>
            <td style="padding: 12px; text-align: right;">${renderChangeIndicator(data.weekOverWeekChange.revenueChange)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; color: #374151;">Orders</td>
            <td style="padding: 12px; text-align: right; color: #6b7280;">${formatNumber(data.lastWeek.salesCount)}</td>
            <td style="padding: 12px; text-align: right; color: #374151; font-weight: 600;">${formatNumber(data.thisWeek.salesCount)}</td>
            <td style="padding: 12px; text-align: right;">${renderChangeIndicator(data.weekOverWeekChange.salesCountChange)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; color: #374151;">Estimates</td>
            <td style="padding: 12px; text-align: right; color: #6b7280;">${formatNumber(data.lastWeek.estimatesCreated)}</td>
            <td style="padding: 12px; text-align: right; color: #374151; font-weight: 600;">${formatNumber(data.thisWeek.estimatesCreated)}</td>
            <td style="padding: 12px; text-align: right;">${renderChangeIndicator(data.weekOverWeekChange.estimatesCreatedChange)}</td>
          </tr>
          <tr>
            <td style="padding: 12px; color: #374151;">New Customers</td>
            <td style="padding: 12px; text-align: right; color: #6b7280;">${formatNumber(data.lastWeek.newCustomers)}</td>
            <td style="padding: 12px; text-align: right; color: #374151; font-weight: 600;">${formatNumber(data.thisWeek.newCustomers)}</td>
            <td style="padding: 12px; text-align: right;">${renderChangeIndicator(data.weekOverWeekChange.newCustomersChange)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${data.pmWeeklyPerformance.length > 0 ? `
    <!-- PM Weekly Stats -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #7c3aed; font-size: 20px; border-bottom: 2px solid #a855f7; padding-bottom: 8px;">👷 PM Weekly Stats</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f5f3ff;">
            <th style="text-align: left; padding: 8px; font-size: 14px; color: #6b7280;">PM</th>
            <th style="text-align: center; padding: 8px; font-size: 14px; color: #6b7280;">Orders</th>
            <th style="text-align: right; padding: 8px; font-size: 14px; color: #6b7280;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${data.pmWeeklyPerformance.map(pm => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px; color: #374151;">${pm.name}</td>
              <td style="padding: 8px; text-align: center; color: #374151;">${formatNumber(pm.ordersCompleted)}</td>
              <td style="padding: 8px; text-align: right; color: #374151;">${formatCurrency(pm.revenue)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${data.bdWeeklyPerformance.length > 0 ? `
    <!-- BD Weekly Stats -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #7c3aed; font-size: 20px; border-bottom: 2px solid #a855f7; padding-bottom: 8px;">💼 BD Weekly Stats</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f5f3ff;">
            <th style="text-align: left; padding: 8px; font-size: 14px; color: #6b7280;">BD</th>
            <th style="text-align: center; padding: 8px; font-size: 14px; color: #6b7280;">Orders</th>
            <th style="text-align: right; padding: 8px; font-size: 14px; color: #6b7280;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${data.bdWeeklyPerformance.map(bd => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 8px; color: #374151;">${bd.name}</td>
              <td style="padding: 8px; text-align: center; color: #374151;">${formatNumber(bd.ordersCompleted)}</td>
              <td style="padding: 8px; text-align: right; color: #374151;">${formatCurrency(bd.revenue)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Monthly Progress -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #7c3aed; font-size: 20px; border-bottom: 2px solid #a855f7; padding-bottom: 8px;">📅 Monthly Progress</h2>
      ${renderProgressBar(data.monthToDate.revenue, monthlyGoal.salesRevenue, 'Revenue')}
      ${renderProgressBar(data.monthToDate.salesCount, monthlyGoal.salesCount, 'Sales Count')}
      ${renderProgressBar(data.monthToDate.estimatesCreated, monthlyGoal.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(data.monthToDate.newCustomers, monthlyGoal.newCustomers, 'New Customers')}
    </div>

    <!-- Annual Progress -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #7c3aed; font-size: 20px; border-bottom: 2px solid #a855f7; padding-bottom: 8px;">📆 Annual Progress</h2>
      ${renderProgressBar(data.yearToDate.revenue, annualGoal.salesRevenue, 'Revenue')}
      ${renderProgressBar(data.yearToDate.salesCount, annualGoal.salesCount, 'Sales Count')}
      ${renderProgressBar(data.yearToDate.estimatesCreated, annualGoal.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(data.yearToDate.newCustomers, annualGoal.newCustomers, 'New Customers')}
    </div>

    <!-- AI Quote/Joke -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #7c3aed; font-size: 20px; border-bottom: 2px solid #a855f7; padding-bottom: 8px;">💡 Weekly Inspiration</h2>
      ${renderAIContent(aiContent)}
    </div>

    <!-- Footer -->
    <div style="background-color: #7c3aed; padding: 24px; text-align: center;">
      <p style="margin: 0; color: #e9d5ff; font-size: 14px;">🐕 Retriever Weekly Digest</p>
      <p style="margin: 8px 0 0 0; color: #c4b5fd; font-size: 12px;">BooneGraphics Internal Sales Tool</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

export async function generateWeeklyDigest(recipientName: string): Promise<string> {
  const weeklyData = await getWeeklyDigestData();
  const goals = await prisma.goal.findMany();
  const aiContent = await generateAIContent();

  const monthlyGoal = goals.find(g => g.type === GoalType.MONTHLY);
  const annualGoal = goals.find(g => g.type === GoalType.ANNUAL);

  const defaultGoal = {
    salesRevenue: 0,
    salesCount: 0,
    estimatesCreated: 0,
    newCustomers: 0,
  };

  const monthly = monthlyGoal
    ? {
        salesRevenue: Number(monthlyGoal.salesRevenue),
        salesCount: monthlyGoal.salesCount,
        estimatesCreated: monthlyGoal.estimatesCreated,
        newCustomers: monthlyGoal.newCustomers,
      }
    : defaultGoal;

  const annual = annualGoal
    ? {
        salesRevenue: Number(annualGoal.salesRevenue),
        salesCount: annualGoal.salesCount,
        estimatesCreated: annualGoal.estimatesCreated,
        newCustomers: annualGoal.newCustomers,
      }
    : defaultGoal;

  if (!weeklyData) {
    const today = new Date();
    const emptyData: WeeklyDigestData = {
      weekStartDate: today,
      weekEndDate: today,
      thisWeek: { revenue: 0, salesCount: 0, estimatesCreated: 0, newCustomers: 0 },
      lastWeek: { revenue: 0, salesCount: 0, estimatesCreated: 0, newCustomers: 0 },
      weekOverWeekChange: { revenueChange: 0, salesCountChange: 0, estimatesCreatedChange: 0, newCustomersChange: 0 },
      pmWeeklyPerformance: [],
      bdWeeklyPerformance: [],
      monthToDate: { revenue: 0, salesCount: 0, estimatesCreated: 0, newCustomers: 0 },
      yearToDate: { revenue: 0, salesCount: 0, estimatesCreated: 0, newCustomers: 0 },
      topHighlights: [],
    };
    return generateWeeklyDigestHTML(recipientName, emptyData, monthly, annual, aiContent);
  }

  return generateWeeklyDigestHTML(recipientName, weeklyData, monthly, annual, aiContent);
}

export interface SendWeeklyDigestResult {
  sent: number;
  failed: number;
  errors: string[];
}

export async function sendWeeklyDigest(): Promise<SendWeeklyDigestResult> {
  const recipients = await prisma.recipient.findMany({
    where: { active: true },
  });

  const result: SendWeeklyDigestResult = {
    sent: 0,
    failed: 0,
    errors: [],
  };

  const today = new Date();
  const weekBounds = getWeekBoundaries(today);
  const weekStartStr = weekBounds.start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const subject = `🐕 Retriever Weekly Digest - Week of ${weekStartStr}`;

  for (const recipient of recipients) {
    try {
      const html = await generateWeeklyDigest(recipient.name);
      const emailResult = await sendEmail({
        to: recipient.email,
        subject,
        html,
      });

      if (emailResult.success) {
        console.log(`[Weekly Digest] Sent to ${recipient.name} <${recipient.email}>`);
        result.sent++;
      } else {
        console.error(`[Weekly Digest] Failed to send to ${recipient.email}: ${emailResult.error}`);
        result.failed++;
        result.errors.push(`${recipient.email}: ${emailResult.error}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Weekly Digest] Error sending to ${recipient.email}: ${errorMessage}`);
      result.failed++;
      result.errors.push(`${recipient.email}: ${errorMessage}`);
    }
  }

  console.log(`[Weekly Digest] Complete - Sent: ${result.sent}, Failed: ${result.failed}`);
  return result;
}
