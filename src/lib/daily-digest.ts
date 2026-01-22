'use server';

import prisma from '@/lib/db';
import { GoalType } from '@/generated/prisma/client';
import { generateAIContent, generateMotivationalSummary, type AIContent, type MotivationalSummary, type DigestMetricsForAI } from '@/lib/ai-content';
import { sendEmail } from '@/lib/email';

// BooneGraphics Brand Colors
const BRAND_RED = '#B91C1C';
const BRAND_RED_DARK = '#991B1B';
const BRAND_RED_LIGHT = '#FEE2E2';
const BRAND_GRAY = '#5f6360';

// Retriever Logo URL
const LOGO_URL = 'https://www.booneproofs.net/email/Retriever_Logo.svg';

export interface SendDigestResult {
  sent: number;
  failed: number;
  errors: string[];
}

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

export interface AIInsight {
  type: string;
  title: string;
  message: string;
  items: Array<{
    name: string;
    detail: string;
    value?: string;
  }>;
}

export interface DigestDataPayload {
  date: string;
  metrics: DigestMetrics;
  highlights: DigestHighlight[];
  bdPerformance: PerformanceData[];
  pmPerformance: PerformanceData[];
  aiInsights?: AIInsight[];
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

function renderAIInsights(insights: AIInsight[]): string {
  if (!insights || insights.length === 0) return '';
  
  // Pick 1-2 random insights to feature
  const shuffled = [...insights].sort(() => Math.random() - 0.5);
  const featured = shuffled.slice(0, 2);
  
  return featured.map(insight => `
    <div style="background-color: ${BRAND_RED_LIGHT}; border-left: 3px solid ${BRAND_RED}; padding: 12px; margin-bottom: 12px; border-radius: 0 2px 2px 0;">
      <p style="margin: 0 0 6px 0; font-weight: 600; font-size: 13px; color: ${BRAND_RED_DARK};">${insight.title}</p>
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px;">${insight.message}</p>
      ${insight.items.length > 0 ? `
        <ul style="margin: 0; padding: 0 0 0 16px; color: #374151; font-size: 12px;">
          ${insight.items.slice(0, 3).map(item => `
            <li style="margin-bottom: 3px;">
              <strong>${item.name}</strong>: ${item.detail}${item.value ? ` - ${item.value}` : ''}
            </li>
          `).join('')}
        </ul>
      ` : ''}
    </div>
  `).join('');
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

  const metricsForAI: DigestMetricsForAI = {
    revenue: metrics.dailyRevenue,
    ordersCompleted: metrics.dailySalesCount,
    estimatesCreated: metrics.dailyEstimatesCreated,
    newCustomers: metrics.dailyNewCustomers,
    isWeekly: false,
  };
  const motivational = await generateMotivationalSummary(metricsForAI);

  const highlights = digestData?.highlights || [];
  const bdPerformance = digestData?.bdPerformance || [];
  const pmPerformance = digestData?.pmPerformance || [];
  const aiInsights = digestData?.aiInsights || [];
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
    <div style="background-color: ${BRAND_RED}; padding: 20px; text-align: center;">
      <img src="${LOGO_URL}" alt="Retriever" style="width: 160px; height: 160px; margin-bottom: 8px; filter: brightness(0) invert(1);" />
      <h1 style="margin: 0; color: white; font-size: 20px; font-weight: 600;">Daily Digest</h1>
      <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 12px;">${formatDate(dateStr)}</p>
    </div>

    <!-- Motivational Section -->
    ${renderMotivationalSection(motivational)}

    <!-- Daily Summary -->
    <div style="padding: 16px 20px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Yesterday's Numbers</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT}; border-radius: 2px 0 0 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatCurrency(metrics.dailyRevenue)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Revenue</p>
          </td>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT}; border-radius: 0 2px 0 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatNumber(metrics.dailySalesCount)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Orders Completed</p>
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: #f9fafb; border-radius: 0 0 0 2px;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_GRAY};">${formatNumber(metrics.dailyEstimatesCreated)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Estimates Created</p>
          </td>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: #f9fafb; border-radius: 0 0 2px 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_GRAY};">${formatNumber(metrics.dailyNewCustomers)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">New Customers</p>
          </td>
        </tr>
      </table>
    </div>

    ${highlights.length > 0 ? `
    <!-- Highlights -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Highlights</h2>
      <ul style="margin: 0; padding: 0 0 0 16px; color: #374151; font-size: 13px;">
        ${highlights.map(h => `<li style="margin-bottom: 4px;">${h.description}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${aiInsights.length > 0 ? `
    <!-- AI Insights -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Sales Insights</h2>
      ${renderAIInsights(aiInsights)}
    </div>
    ` : ''}

    ${pmPerformance.length > 0 ? `
    <!-- PM Performance -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">PM Performance</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">PM</th>
            <th style="text-align: center; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Orders</th>
            <th style="text-align: right; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${pmPerformance.map(pm => `
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

    ${bdPerformance.length > 0 ? `
    <!-- BD Performance -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">BD Performance</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">BD</th>
            <th style="text-align: center; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Orders</th>
            <th style="text-align: right; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${bdPerformance.map(bd => `
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
      ${renderProgressBar(metrics.monthToDateRevenue, Number(monthly.salesRevenue), 'Revenue')}
      ${renderProgressBar(metrics.monthToDateSalesCount, monthly.salesCount, 'Sales Count')}
      ${renderProgressBar(metrics.monthToDateEstimatesCreated, monthly.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(metrics.monthToDateNewCustomers, monthly.newCustomers, 'New Customers')}
    </div>

    <!-- Annual Progress -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Annual Progress</h2>
      ${renderProgressBar(metrics.yearToDateRevenue, Number(annual.salesRevenue), 'Revenue')}
      ${renderProgressBar(metrics.yearToDateSalesCount, annual.salesCount, 'Sales Count')}
      ${renderProgressBar(metrics.yearToDateEstimatesCreated, annual.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(metrics.yearToDateNewCustomers, annual.newCustomers, 'New Customers')}
    </div>

    <!-- AI Quote/Joke -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Daily Inspiration</h2>
      ${renderAIContent(aiContent)}
    </div>

    <!-- Footer -->
    <div style="background-color: ${BRAND_RED_DARK}; padding: 16px; text-align: center;">
      <img src="${LOGO_URL}" alt="Retriever" style="width: 80px; height: 80px; margin-bottom: 6px; filter: brightness(0) invert(1); opacity: 0.9;" />
      <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 12px;">Retriever Daily Digest</p>
      <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.7); font-size: 11px;">BooneGraphics Internal Sales Tool</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return html;
}

const MOCK_DIGEST_DATA: DigestDataPayload = {
  date: new Date().toISOString().split('T')[0],
  metrics: {
    dailyRevenue: 4250.75,
    dailySalesCount: 8,
    dailyEstimatesCreated: 12,
    dailyNewCustomers: 2,
    monthToDateRevenue: 42500.0,
    monthToDateSalesCount: 65,
    monthToDateEstimatesCreated: 110,
    monthToDateNewCustomers: 8,
    yearToDateRevenue: 125000.0,
    yearToDateSalesCount: 180,
    yearToDateEstimatesCreated: 320,
    yearToDateNewCustomers: 22,
  },
  highlights: [
    { type: 'big_order', description: 'Large banner order from ABC Corp - $1,250' },
    { type: 'new_customer', description: 'Welcome new customer: XYZ Industries' },
  ],
  bdPerformance: [
    { name: 'Alice Brown', ordersCompleted: 3, revenue: 2100.5 },
    { name: 'Bob Davis', ordersCompleted: 2, revenue: 1500.25 },
  ],
  pmPerformance: [
    { name: 'Carol Evans', ordersCompleted: 4, revenue: 2800.0 },
    { name: 'Dan Foster', ordersCompleted: 4, revenue: 1450.75 },
  ],
  aiInsights: [
    {
      type: 'anniversary_reorders',
      title: 'Anniversary Reorder Opportunities',
      message: 'These customers had large orders 10-11 months ago - time to follow up!',
      items: [
        { name: 'Acme Corporation', detail: 'Annual report printing', value: '$3,500' },
        { name: 'Tech Startup Inc', detail: 'Trade show banners', value: '$2,800' },
      ],
    },
    {
      type: 'lapsed_accounts',
      title: 'Lapsed High-Value Accounts',
      message: 'These accounts haven\'t ordered in 6+ months but have strong history.',
      items: [
        { name: 'Downtown Realty', detail: 'Last order: Jul 2025', value: '$12,000 lifetime' },
        { name: 'City Hospital', detail: 'Last order: Jun 2025', value: '$8,500 lifetime' },
      ],
    },
  ],
};

export async function generateDailyDigestWithMockFallback(
  recipientName: string
): Promise<{ html: string; isMockData: boolean }> {
  const digestData = await getLatestDigestData();
  const isMockData = digestData === null;
  const dataToUse = digestData || MOCK_DIGEST_DATA;

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

  const metrics = dataToUse.metrics;
  const highlights = dataToUse.highlights || [];
  const bdPerformance = dataToUse.bdPerformance || [];
  const pmPerformance = dataToUse.pmPerformance || [];
  const aiInsights = dataToUse.aiInsights || [];
  const dateStr = dataToUse.date;

  const metricsForAI: DigestMetricsForAI = {
    revenue: metrics.dailyRevenue,
    ordersCompleted: metrics.dailySalesCount,
    estimatesCreated: metrics.dailyEstimatesCreated,
    newCustomers: metrics.dailyNewCustomers,
    isWeekly: false,
  };
  const motivational = await generateMotivationalSummary(metricsForAI);

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
    <div style="background-color: ${BRAND_RED}; padding: 20px; text-align: center;">
      <img src="${LOGO_URL}" alt="Retriever" style="width: 160px; height: 160px; margin-bottom: 8px; filter: brightness(0) invert(1);" />
      <h1 style="margin: 0; color: white; font-size: 20px; font-weight: 600;">Daily Digest</h1>
      <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 12px;">${formatDate(dateStr)}</p>
    </div>

    <!-- Motivational Section -->
    ${renderMotivationalSection(motivational)}

    <!-- Daily Summary -->
    <div style="padding: 16px 20px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Yesterday's Numbers</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT}; border-radius: 2px 0 0 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatCurrency(metrics.dailyRevenue)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Revenue</p>
          </td>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT}; border-radius: 0 2px 0 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatNumber(metrics.dailySalesCount)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Orders Completed</p>
          </td>
        </tr>
        <tr>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: #f9fafb; border-radius: 0 0 0 2px;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_GRAY};">${formatNumber(metrics.dailyEstimatesCreated)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Estimates Created</p>
          </td>
          <td style="width: 50%; padding: 6px; text-align: center; background-color: #f9fafb; border-radius: 0 0 2px 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_GRAY};">${formatNumber(metrics.dailyNewCustomers)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">New Customers</p>
          </td>
        </tr>
      </table>
    </div>

    ${highlights.length > 0 ? `
    <!-- Highlights -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Highlights</h2>
      <ul style="margin: 0; padding: 0 0 0 16px; color: #374151; font-size: 13px;">
        ${highlights.map(h => `<li style="margin-bottom: 4px;">${h.description}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${aiInsights.length > 0 ? `
    <!-- AI Insights -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Sales Insights</h2>
      ${renderAIInsights(aiInsights)}
    </div>
    ` : ''}

    ${pmPerformance.length > 0 ? `
    <!-- PM Performance -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">PM Performance</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">PM</th>
            <th style="text-align: center; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Orders</th>
            <th style="text-align: right; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${pmPerformance.map(pm => `
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

    ${bdPerformance.length > 0 ? `
    <!-- BD Performance -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">BD Performance</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="text-align: left; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">BD</th>
            <th style="text-align: center; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Orders</th>
            <th style="text-align: right; padding: 6px; font-size: 12px; font-weight: 500; color: #6b7280;">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${bdPerformance.map(bd => `
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
      ${renderProgressBar(metrics.monthToDateRevenue, Number(monthly.salesRevenue), 'Revenue')}
      ${renderProgressBar(metrics.monthToDateSalesCount, monthly.salesCount, 'Sales Count')}
      ${renderProgressBar(metrics.monthToDateEstimatesCreated, monthly.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(metrics.monthToDateNewCustomers, monthly.newCustomers, 'New Customers')}
    </div>

    <!-- Annual Progress -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Annual Progress</h2>
      ${renderProgressBar(metrics.yearToDateRevenue, Number(annual.salesRevenue), 'Revenue')}
      ${renderProgressBar(metrics.yearToDateSalesCount, annual.salesCount, 'Sales Count')}
      ${renderProgressBar(metrics.yearToDateEstimatesCreated, annual.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(metrics.yearToDateNewCustomers, annual.newCustomers, 'New Customers')}
    </div>

    <!-- AI Quote/Joke -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Daily Inspiration</h2>
      ${renderAIContent(aiContent)}
    </div>

    <!-- Footer -->
    <div style="background-color: ${BRAND_RED_DARK}; padding: 16px; text-align: center;">
      <img src="${LOGO_URL}" alt="Retriever" style="width: 80px; height: 80px; margin-bottom: 6px; filter: brightness(0) invert(1); opacity: 0.9;" />
      <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 12px;">Retriever Daily Digest</p>
      <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.7); font-size: 11px;">BooneGraphics Internal Sales Tool</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { html, isMockData };
}

export async function sendDailyDigest(): Promise<SendDigestResult> {
  const recipients = await prisma.recipient.findMany({
    where: { active: true },
  });

  const result: SendDigestResult = {
    sent: 0,
    failed: 0,
    errors: [],
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const subject = `Retriever Daily Digest - ${dateStr}`;

  for (const recipient of recipients) {
    try {
      const html = await generateDailyDigest(recipient.name);
      const emailResult = await sendEmail({
        to: recipient.email,
        subject,
        html,
      });

      if (emailResult.success) {
        console.log(`[Daily Digest] Sent to ${recipient.name} <${recipient.email}>`);
        result.sent++;
      } else {
        console.error(`[Daily Digest] Failed to send to ${recipient.email}: ${emailResult.error}`);
        result.failed++;
        result.errors.push(`${recipient.email}: ${emailResult.error}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[Daily Digest] Error sending to ${recipient.email}: ${errorMessage}`);
      result.failed++;
      result.errors.push(`${recipient.email}: ${errorMessage}`);
    }
  }

  console.log(`[Daily Digest] Complete - Sent: ${result.sent}, Failed: ${result.failed}`);
  return result;
}
