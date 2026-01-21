'use server';

import prisma from '@/lib/db';
import { GoalType } from '@/generated/prisma/client';
import { generateAIContent, type AIContent } from '@/lib/ai-content';

export interface DigestMetrics {
  dailyRevenue: number;
  dailySalesCount: number;
  dailyEstimatesCreated: number;
  dailyNewCustomers: number;
  monthToDateRevenue: number;
  monthToDateSalesCount: number;
  monthToDateEstimatesCreated: number;
  monthToDateNewCustomers: number;
  yearToDateRevenue: number;
  yearToDateSalesCount: number;
  yearToDateEstimatesCreated: number;
  yearToDateNewCustomers: number;
}

export interface DigestHighlight {
  type: string;
  description: string;
}

export interface PerformanceData {
  name: string;
  ordersCompleted: number;
  revenue: number;
}

export interface DigestDataPayload {
  date: string;
  metrics: DigestMetrics;
  highlights: DigestHighlight[];
  bdPerformance: PerformanceData[];
  pmPerformance: PerformanceData[];
  aiInsights?: {
    summary: string;
    recommendations: string[];
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function calculateProgress(current: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(Math.round((current / goal) * 100), 100);
}

function getProgressBarColor(percentage: number): string {
  if (percentage >= 100) return '#22c55e'; // green
  if (percentage >= 75) return '#84cc16'; // lime
  if (percentage >= 50) return '#eab308'; // yellow
  if (percentage >= 25) return '#f97316'; // orange
  return '#ef4444'; // red
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

export async function getLatestDigestData(): Promise<DigestDataPayload | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const digestData = await prisma.digestData.findFirst({
    orderBy: { exportDate: 'desc' },
  });

  if (!digestData) {
    return null;
  }

  return digestData.data as unknown as DigestDataPayload;
}

export async function generateDailyDigest(recipientName: string): Promise<string> {
  const digestData = await getLatestDigestData();
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

  const monthly = monthlyGoal || defaultGoal;
  const annual = annualGoal || defaultGoal;

  const metrics: DigestMetrics = digestData?.metrics || {
    dailyRevenue: 0,
    dailySalesCount: 0,
    dailyEstimatesCreated: 0,
    dailyNewCustomers: 0,
    monthToDateRevenue: 0,
    monthToDateSalesCount: 0,
    monthToDateEstimatesCreated: 0,
    monthToDateNewCustomers: 0,
    yearToDateRevenue: 0,
    yearToDateSalesCount: 0,
    yearToDateEstimatesCreated: 0,
    yearToDateNewCustomers: 0,
  };

  const highlights = digestData?.highlights || [];
  const bdPerformance = digestData?.bdPerformance || [];
  const pmPerformance = digestData?.pmPerformance || [];
  const dateStr = digestData?.date || new Date().toISOString().split('T')[0];

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Retriever Daily Digest</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 24px; text-align: center;">
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
      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">🐕 Retriever Daily Digest</h1>
      <p style="margin: 8px 0 0 0; color: #bfdbfe; font-size: 16px;">${formatDate(dateStr)}</p>
    </div>

    <!-- Greeting -->
    <div style="padding: 24px;">
      <p style="margin: 0; font-size: 18px; color: #374151;">Good morning, <strong>${recipientName}</strong>! 👋</p>
      <p style="margin: 8px 0 0 0; color: #6b7280;">Here's what happened yesterday at BooneGraphics.</p>
    </div>

    <!-- Daily Summary -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #1e3a8a; font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">📊 Yesterday's Numbers</h2>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
        <div style="background-color: #eff6ff; padding: 16px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #1e3a8a;">${formatCurrency(metrics.dailyRevenue)}</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Revenue</p>
        </div>
        <div style="background-color: #eff6ff; padding: 16px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #1e3a8a;">${formatNumber(metrics.dailySalesCount)}</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Orders Completed</p>
        </div>
        <div style="background-color: #eff6ff; padding: 16px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #1e3a8a;">${formatNumber(metrics.dailyEstimatesCreated)}</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">Estimates Created</p>
        </div>
        <div style="background-color: #eff6ff; padding: 16px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #1e3a8a;">${formatNumber(metrics.dailyNewCustomers)}</p>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">New Customers</p>
        </div>
      </div>
    </div>

    ${highlights.length > 0 ? `
    <!-- Highlights -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #1e3a8a; font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">⭐ Highlights</h2>
      <ul style="margin: 0; padding: 0 0 0 20px; color: #374151;">
        ${highlights.map(h => `<li style="margin-bottom: 8px;">${h.description}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${pmPerformance.length > 0 ? `
    <!-- PM Performance -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #1e3a8a; font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">👷 PM Performance</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 8px; font-size: 14px; color: #6b7280;">PM</th>
            <th style="text-align: center; padding: 8px; font-size: 14px; color: #6b7280;">Orders</th>
            <th style="text-align: right; padding: 8px; font-size: 14px; color: #6b7280;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${pmPerformance.map(pm => `
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

    ${bdPerformance.length > 0 ? `
    <!-- BD Performance -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #1e3a8a; font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">💼 BD Performance</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 8px; font-size: 14px; color: #6b7280;">BD</th>
            <th style="text-align: center; padding: 8px; font-size: 14px; color: #6b7280;">Orders</th>
            <th style="text-align: right; padding: 8px; font-size: 14px; color: #6b7280;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${bdPerformance.map(bd => `
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
      <h2 style="margin: 0 0 16px 0; color: #1e3a8a; font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">📅 Monthly Progress</h2>
      ${renderProgressBar(metrics.monthToDateRevenue, Number(monthly.salesRevenue), 'Revenue')}
      ${renderProgressBar(metrics.monthToDateSalesCount, monthly.salesCount, 'Sales Count')}
      ${renderProgressBar(metrics.monthToDateEstimatesCreated, monthly.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(metrics.monthToDateNewCustomers, monthly.newCustomers, 'New Customers')}
    </div>

    <!-- Annual Progress -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #1e3a8a; font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">📆 Annual Progress</h2>
      ${renderProgressBar(metrics.yearToDateRevenue, Number(annual.salesRevenue), 'Revenue')}
      ${renderProgressBar(metrics.yearToDateSalesCount, annual.salesCount, 'Sales Count')}
      ${renderProgressBar(metrics.yearToDateEstimatesCreated, annual.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(metrics.yearToDateNewCustomers, annual.newCustomers, 'New Customers')}
    </div>

    <!-- AI Quote/Joke -->
    <div style="padding: 0 24px 24px;">
      <h2 style="margin: 0 0 16px 0; color: #1e3a8a; font-size: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">💡 Daily Inspiration</h2>
      ${renderAIContent(aiContent)}
    </div>

    <!-- Footer -->
    <div style="background-color: #1e3a8a; padding: 24px; text-align: center;">
      <p style="margin: 0; color: #bfdbfe; font-size: 14px;">🐕 Retriever Daily Digest</p>
      <p style="margin: 8px 0 0 0; color: #93c5fd; font-size: 12px;">BooneGraphics Internal Sales Tool</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return html;
}
