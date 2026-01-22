'use server';

import prisma from '@/lib/db';
import { GoalType } from '@/generated/prisma/client';
import { generateAIContent, generateMotivationalSummary, type AIContent, type MotivationalSummary, type DigestMetricsForAI } from '@/lib/ai-content';
import { sendEmail } from '@/lib/email';
import type { DigestDataPayload, PerformanceData } from '@/lib/daily-digest';

// BooneGraphics Brand Colors
const BRAND_RED = '#B91C1C';
const BRAND_RED_DARK = '#991B1B';
const BRAND_RED_LIGHT = '#FEE2E2';
const BRAND_GRAY = '#5f6360';

// Retriever Logo URL
const LOGO_URL = 'https://www.booneproofs.net/email/Retriever_Logo.svg';

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
    <div style="margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <span style="font-weight: 500; font-size: 13px; color: #374151;">${label}</span>
        <span style="font-size: 13px; color: #6b7280;">${formatNumber(current)} / ${formatNumber(goal)} (${percentage}%)</span>
      </div>
      <div style="background-color: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background-color: ${color}; height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
      </div>
    </div>
  `;
}

function renderMotivationalSection(motivational: MotivationalSummary): string {
  return `
    <div style="padding: 16px 20px; background-color: ${BRAND_RED_LIGHT}; border-left: 3px solid ${BRAND_RED};">
      <p style="margin: 0 0 6px 0; font-size: 15px; font-weight: 600; color: ${BRAND_RED_DARK};">${motivational.headline}</p>
      <p style="margin: 0; font-size: 13px; color: #374151; line-height: 1.5;">${motivational.message}</p>
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
      <div style="background-color: #fef3c7; border-left: 3px solid #f59e0b; padding: 12px; margin-top: 12px; border-radius: 0 2px 2px 0;">
        <p style="margin: 0; font-style: italic; font-size: 13px; color: #92400e;">"${aiContent.content}"</p>
        ${aiContent.attribution ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: #b45309;">— ${aiContent.attribution}</p>` : ''}
      </div>
    `;
  } else {
    return `
      <div style="background-color: #ecfdf5; border-left: 3px solid #10b981; padding: 12px; margin-top: 12px; border-radius: 0 2px 2px 0;">
        <p style="margin: 0; font-size: 13px; color: #065f46;">${aiContent.content}</p>
      </div>
    `;
  }
}

function generateWeeklyDigestHTML(
  recipientName: string,
  data: WeeklyDigestData,
  monthlyGoal: { salesRevenue: number; salesCount: number; estimatesCreated: number; newCustomers: number },
  annualGoal: { salesRevenue: number; salesCount: number; estimatesCreated: number; newCustomers: number },
  aiContent: AIContent,
  motivational: MotivationalSummary
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
    <div style="background-color: ${BRAND_RED}; padding: 20px; text-align: center;">
      <img src="${LOGO_URL}" alt="Retriever" style="width: 160px; height: 160px; margin-bottom: 8px; filter: brightness(0) invert(1);" />
      <h1 style="margin: 0; color: white; font-size: 20px; font-weight: 600;">Weekly Digest</h1>
      <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 12px;">Week of ${weekRangeStr}</p>
    </div>

    <!-- Motivational Section -->
    ${renderMotivationalSection(motivational)}

    <!-- This Week's Wins -->
    <div style="padding: 16px 20px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">This Week's Results</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT}; border-radius: 2px 0 0 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatCurrency(data.thisWeek.revenue)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Total Revenue</p>
          </td>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT}; border-radius: 0 2px 0 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatNumber(data.thisWeek.salesCount)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Orders Completed</p>
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: #f9fafb; border-radius: 0 0 0 2px;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_GRAY};">${formatNumber(data.thisWeek.estimatesCreated)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Estimates Created</p>
          </td>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: #f9fafb; border-radius: 0 0 2px 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_GRAY};">${formatNumber(data.thisWeek.newCustomers)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">New Customers</p>
          </td>
        </tr>
      </table>
      ${data.topHighlights.length > 0 ? `
        <div style="margin-top: 12px; background-color: #fef3c7; padding: 12px; border-radius: 2px;">
          <p style="margin: 0 0 6px 0; font-weight: 600; font-size: 13px; color: #92400e;">Top Highlights</p>
          <ul style="margin: 0; padding: 0 0 0 16px; color: #b45309; font-size: 12px;">
            ${data.topHighlights.slice(0, 5).map(h => `<li style="margin-bottom: 3px;">${h}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>

    <!-- Week over Week -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Week over Week</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Metric</th>
            <th style="text-align: right; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Last Week</th>
            <th style="text-align: right; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">This Week</th>
            <th style="text-align: right; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Change</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px; font-size: 13px; color: #374151;">Revenue</td>
            <td style="padding: 6px; text-align: right; font-size: 13px; color: #6b7280;">${formatCurrency(data.lastWeek.revenue)}</td>
            <td style="padding: 6px; text-align: right; font-size: 13px; color: #374151; font-weight: 600;">${formatCurrency(data.thisWeek.revenue)}</td>
            <td style="padding: 6px; text-align: right; font-size: 13px;">${renderChangeIndicator(data.weekOverWeekChange.revenueChange)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px; font-size: 13px; color: #374151;">Orders</td>
            <td style="padding: 6px; text-align: right; font-size: 13px; color: #6b7280;">${formatNumber(data.lastWeek.salesCount)}</td>
            <td style="padding: 6px; text-align: right; font-size: 13px; color: #374151; font-weight: 600;">${formatNumber(data.thisWeek.salesCount)}</td>
            <td style="padding: 6px; text-align: right; font-size: 13px;">${renderChangeIndicator(data.weekOverWeekChange.salesCountChange)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 6px; font-size: 13px; color: #374151;">Estimates</td>
            <td style="padding: 6px; text-align: right; font-size: 13px; color: #6b7280;">${formatNumber(data.lastWeek.estimatesCreated)}</td>
            <td style="padding: 6px; text-align: right; font-size: 13px; color: #374151; font-weight: 600;">${formatNumber(data.thisWeek.estimatesCreated)}</td>
            <td style="padding: 6px; text-align: right; font-size: 13px;">${renderChangeIndicator(data.weekOverWeekChange.estimatesCreatedChange)}</td>
          </tr>
          <tr>
            <td style="padding: 6px; font-size: 13px; color: #374151;">New Customers</td>
            <td style="padding: 6px; text-align: right; font-size: 13px; color: #6b7280;">${formatNumber(data.lastWeek.newCustomers)}</td>
            <td style="padding: 6px; text-align: right; font-size: 13px; color: #374151; font-weight: 600;">${formatNumber(data.thisWeek.newCustomers)}</td>
            <td style="padding: 6px; text-align: right; font-size: 13px;">${renderChangeIndicator(data.weekOverWeekChange.newCustomersChange)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${data.pmWeeklyPerformance.length > 0 ? `
    <!-- PM Weekly Stats -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">PM Weekly Stats</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">PM</th>
            <th style="text-align: center; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Orders</th>
            <th style="text-align: right; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${data.pmWeeklyPerformance.map(pm => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 6px; font-size: 13px; color: #374151;">${pm.name}</td>
              <td style="padding: 6px; text-align: center; font-size: 13px; color: #374151;">${formatNumber(pm.ordersCompleted)}</td>
              <td style="padding: 6px; text-align: right; font-size: 13px; color: #374151;">${formatCurrency(pm.revenue)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${data.bdWeeklyPerformance.length > 0 ? `
    <!-- BD Weekly Stats -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">BD Weekly Stats</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">BD</th>
            <th style="text-align: center; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Orders</th>
            <th style="text-align: right; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${data.bdWeeklyPerformance.map(bd => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 6px; font-size: 13px; color: #374151;">${bd.name}</td>
              <td style="padding: 6px; text-align: center; font-size: 13px; color: #374151;">${formatNumber(bd.ordersCompleted)}</td>
              <td style="padding: 6px; text-align: right; font-size: 13px; color: #374151;">${formatCurrency(bd.revenue)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Monthly Progress -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Monthly Progress</h2>
      ${renderProgressBar(data.monthToDate.revenue, monthlyGoal.salesRevenue, 'Revenue')}
      ${renderProgressBar(data.monthToDate.salesCount, monthlyGoal.salesCount, 'Sales Count')}
      ${renderProgressBar(data.monthToDate.estimatesCreated, monthlyGoal.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(data.monthToDate.newCustomers, monthlyGoal.newCustomers, 'New Customers')}
    </div>

    <!-- Annual Progress -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Annual Progress</h2>
      ${renderProgressBar(data.yearToDate.revenue, annualGoal.salesRevenue, 'Revenue')}
      ${renderProgressBar(data.yearToDate.salesCount, annualGoal.salesCount, 'Sales Count')}
      ${renderProgressBar(data.yearToDate.estimatesCreated, annualGoal.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(data.yearToDate.newCustomers, annualGoal.newCustomers, 'New Customers')}
    </div>

    <!-- AI Quote/Joke -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Weekly Inspiration</h2>
      ${renderAIContent(aiContent)}
    </div>

    <!-- Footer -->
    <div style="background-color: ${BRAND_RED_DARK}; padding: 16px; text-align: center;">
      <img src="${LOGO_URL}" alt="Retriever" style="width: 80px; height: 80px; margin-bottom: 6px; filter: brightness(0) invert(1); opacity: 0.9;" />
      <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 12px;">Retriever Weekly Digest</p>
      <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.7); font-size: 11px;">BooneGraphics Internal Sales Tool</p>
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
    const metricsForAI: DigestMetricsForAI = {
      revenue: 0,
      ordersCompleted: 0,
      estimatesCreated: 0,
      newCustomers: 0,
      isWeekly: true,
      weekOverWeekRevenueChange: 0,
      weekOverWeekOrdersChange: 0,
    };
    const motivational = await generateMotivationalSummary(metricsForAI);
    return generateWeeklyDigestHTML(recipientName, emptyData, monthly, annual, aiContent, motivational);
  }

  const metricsForAI: DigestMetricsForAI = {
    revenue: weeklyData.thisWeek.revenue,
    ordersCompleted: weeklyData.thisWeek.salesCount,
    estimatesCreated: weeklyData.thisWeek.estimatesCreated,
    newCustomers: weeklyData.thisWeek.newCustomers,
    isWeekly: true,
    weekOverWeekRevenueChange: weeklyData.weekOverWeekChange.revenueChange,
    weekOverWeekOrdersChange: weeklyData.weekOverWeekChange.salesCountChange,
  };
  const motivational = await generateMotivationalSummary(metricsForAI);

  return generateWeeklyDigestHTML(recipientName, weeklyData, monthly, annual, aiContent, motivational);
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
  const subject = `Retriever Weekly Digest - Week of ${weekStartStr}`;

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

const MOCK_WEEKLY_DATA: WeeklyDigestData = {
  weekStartDate: new Date(),
  weekEndDate: new Date(),
  thisWeek: { revenue: 125000, salesCount: 45, estimatesCreated: 28, newCustomers: 7 },
  lastWeek: { revenue: 112000, salesCount: 42, estimatesCreated: 25, newCustomers: 5 },
  weekOverWeekChange: { revenueChange: 12, salesCountChange: 7, estimatesCreatedChange: 12, newCustomersChange: 40 },
  pmWeeklyPerformance: [
    { name: 'Jim', ordersCompleted: 18, revenue: 45000 },
    { name: 'Steve', ordersCompleted: 15, revenue: 38000 },
    { name: 'Shelley', ordersCompleted: 12, revenue: 28000 },
  ],
  bdWeeklyPerformance: [
    { name: 'Paige Chamberlain', ordersCompleted: 12, revenue: 35000 },
    { name: 'Sean Swaim', ordersCompleted: 10, revenue: 30000 },
    { name: 'House', ordersCompleted: 8, revenue: 22000 },
  ],
  monthToDate: { revenue: 325000, salesCount: 120, estimatesCreated: 75, newCustomers: 18 },
  yearToDate: { revenue: 1450000, salesCount: 520, estimatesCreated: 310, newCustomers: 85 },
  topHighlights: [
    'Biggest order this week: $12,500 from ABC Corp',
    'New enterprise customer: XYZ Industries',
    'Steve closed 5 orders on Monday alone!',
  ],
};

export async function generateWeeklyDigestWithMockFallback(
  recipientName: string
): Promise<{ html: string; isMockData: boolean }> {
  const weeklyData = await getWeeklyDigestData();
  const hasNoData = !weeklyData || (weeklyData.thisWeek.revenue === 0 && weeklyData.lastWeek.revenue === 0);
  const isMockData = hasNoData;
  const dataToUse = isMockData ? MOCK_WEEKLY_DATA : weeklyData;

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

  const metricsForAI: DigestMetricsForAI = {
    revenue: dataToUse.thisWeek.revenue,
    ordersCompleted: dataToUse.thisWeek.salesCount,
    estimatesCreated: dataToUse.thisWeek.estimatesCreated,
    newCustomers: dataToUse.thisWeek.newCustomers,
    isWeekly: true,
    weekOverWeekRevenueChange: dataToUse.weekOverWeekChange.revenueChange,
    weekOverWeekOrdersChange: dataToUse.weekOverWeekChange.salesCountChange,
  };
  const motivational = await generateMotivationalSummary(metricsForAI);

  const html = generateWeeklyDigestHTML(recipientName, dataToUse, monthly, annual, aiContent, motivational);

  return { html, isMockData };
}
