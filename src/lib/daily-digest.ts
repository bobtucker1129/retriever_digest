'use server';

import prisma from '@/lib/db';
import { GoalType } from '@/generated/prisma/client';
import { 
  generateAIContent, 
  generateMotivationalSummary,
  generateRichMotivationalSummary, 
  generateNewCustomerShoutout,
  type AIContent, 
  type MotivationalSummary, 
  type DigestMetricsForAI,
  type RichAIContext,
  type DayComparison,
  type GoalProgress,
  type NotableOrder,
  type TopPerformer,
  type AIInsight as AIInsightFromContent,
  type RecentDigestSummary,
} from '@/lib/ai-content';
import { sendEmail } from '@/lib/email';
import { getRecentTestimonials, formatTestimonialLocation, recordTestimonialDisplay, type Testimonial } from '@/lib/loyaltyloop';

// Shoutout type for team messages
export interface ShoutoutWithRecipient {
  id: string;
  message: string;
  recipientName: string;
  createdAt: Date;
}

// BooneGraphics Brand Colors
const BRAND_RED = '#B91C1C';
const BRAND_RED_DARK = '#991B1B';
const BRAND_RED_LIGHT = '#FEE2E2';
const BRAND_GRAY = '#5f6360';

// Retriever Logo URL (PNG for email client compatibility)
const LOGO_URL = 'https://www.booneproofs.net/email/Retriever_Logo_White_smaller.png';

export interface SendDigestResult {
  sent: number;
  failed: number;
  errors: string[];
}

export interface DigestMetrics {
  dailyRevenue: number;
  dailySalesCount: number;
  dailyInvoicesCreatedAmount: number;
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

export interface NewCustomerEstimate {
  accountId: number;
  accountName: string;
  salesRep?: string;
  estimateValue: number;
  jobDescription?: string;
  orderedDate?: string | null;
}

export interface DigestDataPayload {
  date: string;
  metrics: DigestMetrics;
  highlights: DigestHighlight[];
  bdPerformance: PerformanceData[];
  pmPerformance: PerformanceData[];
  aiInsights?: AIInsight[];
  newCustomerEstimates?: NewCustomerEstimate[];
  aiInspiration?: {
    type: string;
    content: string;
    attribution?: string;
    savedAt?: string;
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

function getRecipientFirstName(name: string): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  return trimmed.split(/\s+/)[0];
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

async function renderNewCustomerAlerts(estimates: NewCustomerEstimate[]): Promise<string> {
  if (!estimates || estimates.length === 0) return '';
  
  const limited = estimates.slice(0, 3);
  
  const alertCards = await Promise.all(limited.map(async (estimate, index) => {
    const accountName = estimate.accountName || (estimate as unknown as { customer_name?: string }).customer_name || 'Unknown';
    const salesRep = estimate.salesRep || (estimate as unknown as { salesrep?: string }).salesrep || 'the team';
    const estimateValue = formatCurrency(estimate.estimateValue || (estimate as unknown as { subtotal?: number }).subtotal || 0);
    const jobDescription = estimate.jobDescription || (estimate as unknown as { job_description?: string }).job_description || '';
    
    const message = await generateNewCustomerShoutout({
      accountName,
      salesRep,
      estimateValue,
      jobDescription,
    });
    
    return `
      <div style="background-color: #fff7ed; border-left: 3px solid #f97316; padding: 12px; margin-bottom: ${index === limited.length - 1 ? '0' : '12px'}; border-radius: 0 2px 2px 0;">
        <p style="margin: 0; font-size: 12px; color: #9a3412; font-weight: 700; letter-spacing: 0.4px;">NEW CUSTOMER ALERT</p>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #7c2d12; line-height: 1.4;">${message}</p>
      </div>
    `;
  }));
  
  return `
    <div style="padding: 12px 20px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">New Customer Shoutouts</h2>
      ${alertCards.join('')}
    </div>
  `;
}

function renderTestimonialsSection(testimonials: Testimonial[]): string {
  if (!testimonials || testimonials.length === 0) return '';
  
  const testimonialCards = testimonials.map(t => {
    const location = formatTestimonialLocation(t);
    const locationLine = location ? `${location} · ${t.display_date}` : t.display_date;
    
    return `
      <div style="background-color: #f0fdf4; border-left: 3px solid #22c55e; padding: 12px; margin-bottom: 12px; border-radius: 0 2px 2px 0;">
        <p style="margin: 0 0 8px 0; font-style: italic; font-size: 13px; color: #166534; line-height: 1.4;">"${t.text}"</p>
        <p style="margin: 0; font-size: 12px; color: #15803d; font-weight: 600;">— ${t.name}</p>
        ${locationLine ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">${locationLine}</p>` : ''}
      </div>
    `;
  }).join('');

  return `
    <!-- Customer Feedback -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Customer Feedback</h2>
      ${testimonialCards}
    </div>
  `;
}

/**
 * Get all pending shoutouts from the database.
 * Returns shoutouts with recipient name for display.
 */
export async function getPendingShoutouts(): Promise<ShoutoutWithRecipient[]> {
  const shoutouts = await prisma.shoutout.findMany({
    include: {
      recipient: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return shoutouts.map(s => ({
    id: s.id,
    message: s.message,
    recipientName: s.recipient.name,
    createdAt: s.createdAt,
  }));
}

/**
 * Delete shoutouts by their IDs (called after digest is sent).
 */
export async function deleteShoutouts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  
  await prisma.shoutout.deleteMany({
    where: {
      id: { in: ids },
    },
  });
  
  console.log(`[Shoutouts] Deleted ${ids.length} shoutouts after digest send`);
}

function renderShoutoutsSection(shoutouts: ShoutoutWithRecipient[]): string {
  if (!shoutouts || shoutouts.length === 0) return '';
  
  const shoutoutCards = shoutouts.map((s, index) => `
    <div style="background-color: #eff6ff; border-left: 3px solid #3b82f6; padding: 12px; margin-bottom: ${index === shoutouts.length - 1 ? '0' : '12px'}; border-radius: 0 2px 2px 0;">
      <p style="margin: 0 0 4px 0; font-size: 12px; color: #1d4ed8; font-weight: 600;">Message from ${s.recipientName}</p>
      <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.4;">"${s.message}"</p>
    </div>
  `).join('');

  return `
    <!-- Team Shoutouts -->
    <div style="padding: 12px 20px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Team Shoutouts</h2>
      ${shoutoutCards}
    </div>
  `;
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

/**
 * Get the previous day's digest data for comparison calculations.
 * Returns the second most recent DigestData record.
 */
export async function getPreviousDayDigestData(): Promise<DigestDataPayload | null> {
  const digestRecords = await prisma.digestData.findMany({
    orderBy: { exportDate: 'desc' },
    take: 2,
  });

  // Return the second record (previous day) if it exists
  if (digestRecords.length < 2) {
    return null;
  }

  return digestRecords[1].data as unknown as DigestDataPayload;
}

interface ShownInsightsData {
  date: string;
  accountIds: number[];
  accountNames: string[];
  insightTypes: string[];
}

interface DigestDataWithShownInsights {
  shownInsights?: ShownInsightsData;
  motivationalHeadline?: string;
}

/**
 * Get recent digest summaries for AI context.
 * Returns the last N days of digest headlines and mentioned accounts.
 */
export async function getRecentDigestSummaries(days: number = 7): Promise<RecentDigestSummary[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  cutoffDate.setHours(0, 0, 0, 0);

  const recentDigests = await prisma.digestData.findMany({
    where: {
      exportDate: {
        gte: cutoffDate,
      },
    },
    orderBy: { exportDate: 'desc' },
  });

  return recentDigests.map(digest => {
    const data = digest.data as unknown as DigestDataWithShownInsights;
    return {
      date: digest.exportDate.toISOString().split('T')[0],
      headline: data?.motivationalHeadline,
      accountNames: data?.shownInsights?.accountNames || [],
    };
  });
}

export async function getRecentInspirationContents(days: number = 14): Promise<string[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  cutoffDate.setHours(0, 0, 0, 0);
  
  const recentDigests = await prisma.digestData.findMany({
    where: {
      exportDate: {
        gte: cutoffDate,
      },
    },
    orderBy: { exportDate: 'desc' },
  });
  
  const contents: string[] = [];
  for (const digest of recentDigests) {
    const data = digest.data as unknown as DigestDataPayload;
    const inspiration = data?.aiInspiration;
    if (inspiration?.content) {
      contents.push(inspiration.content);
    }
  }
  
  return Array.from(new Set(contents));
}

export async function storeInspirationForDate(date: Date, inspiration: AIContent): Promise<void> {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  
  const record = await prisma.digestData.findFirst({
    where: { exportDate: day },
  });
  
  if (!record) {
    console.warn('[AI Content] No digest data found to store inspiration');
    return;
  }
  
  const existing = record.data as Record<string, unknown>;
  const aiInspiration = {
    type: inspiration.type,
    content: inspiration.content,
    attribution: inspiration.attribution,
    savedAt: new Date().toISOString(),
  };
  
  await prisma.digestData.update({
    where: { exportDate: day },
    data: {
      data: {
        ...existing,
        aiInspiration,
      },
    },
  });
}

/**
 * Build the rich context object for AI with all available data.
 * This gives the AI everything it needs to generate insightful, specific content.
 */
export async function buildRichAIContext(
  currentData: DigestDataPayload | null,
  previousData: DigestDataPayload | null,
  // Accept any type that can be converted to number (Prisma Decimal, bigint, number)
  monthlyGoal: { salesRevenue: unknown; salesCount: number } | null,
  isWeekly: boolean = false,
  recipientFirstName?: string
): Promise<RichAIContext> {
  const metrics = currentData?.metrics;
  const today = new Date();
  
  // Calculate day comparison
  let comparison: DayComparison | undefined;
  if (previousData?.metrics && metrics) {
    const prevRevenue = previousData.metrics.dailyRevenue || 0;
    const prevOrders = previousData.metrics.dailySalesCount || 0;
    const revenueChange = metrics.dailyRevenue - prevRevenue;
    const revenueChangePercent = prevRevenue > 0 
      ? Math.round((revenueChange / prevRevenue) * 100) 
      : 0;
    
    comparison = {
      revenueChange,
      revenueChangePercent,
      ordersChange: metrics.dailySalesCount - prevOrders,
      previousRevenue: prevRevenue,
      previousOrders: prevOrders,
    };
  }
  
  // Calculate goal progress
  let goalProgress: GoalProgress | undefined;
  if (monthlyGoal && metrics) {
    const monthlyGoalAmount = Number(monthlyGoal.salesRevenue);
    const mtdRevenue = metrics.monthToDateRevenue || 0;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dayOfMonth = today.getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    const progressPercent = monthlyGoalAmount > 0 
      ? Math.round((mtdRevenue / monthlyGoalAmount) * 100) 
      : 0;
    const amountToGoal = Math.max(0, monthlyGoalAmount - mtdRevenue);
    const requiredDailyPace = daysRemaining > 0 ? amountToGoal / daysRemaining : 0;
    const actualDailyPace = dayOfMonth > 0 ? mtdRevenue / dayOfMonth : 0;
    
    // Determine pace status
    let paceStatus: 'ahead' | 'on_track' | 'behind';
    const expectedProgress = (dayOfMonth / daysInMonth) * monthlyGoalAmount;
    if (mtdRevenue >= expectedProgress * 1.05) {
      paceStatus = 'ahead';
    } else if (mtdRevenue >= expectedProgress * 0.95) {
      paceStatus = 'on_track';
    } else {
      paceStatus = 'behind';
    }
    
    goalProgress = {
      monthlyGoal: monthlyGoalAmount,
      monthToDateRevenue: mtdRevenue,
      progressPercent,
      daysInMonth,
      dayOfMonth,
      daysRemaining,
      requiredDailyPace: Math.round(requiredDailyPace),
      actualDailyPace: Math.round(actualDailyPace),
      paceStatus,
      amountToGoal: Math.round(amountToGoal),
    };
  }
  
  // Extract notable orders from highlights or yesterday_invoices
  const topOrders: NotableOrder[] = [];
  let biggestOrder: NotableOrder | undefined;
  
  // Extended type for raw data with explicit fields from Python export
  const rawData = currentData as DigestDataPayload & { 
    yesterday_invoices?: { 
      invoices?: Array<{
        account_name: string;
        subtotal: number;
        job_description?: string;
        salesrep?: string;
      }>;
    };
    biggestOrder?: {
      accountName: string;
      amount: number;
      description?: string;
      salesRep?: string;
    };
    topPM?: {
      name: string;
      ordersCompleted: number;
      revenue: number;
    };
    topBD?: {
      name: string;
      ordersCompleted: number;
      revenue: number;
    };
  };
  
  // Use explicit biggestOrder from Python if available
  if (rawData?.biggestOrder) {
    biggestOrder = {
      accountName: rawData.biggestOrder.accountName,
      amount: rawData.biggestOrder.amount,
      description: rawData.biggestOrder.description,
      salesRep: rawData.biggestOrder.salesRep,
    };
  }
  
  // Get top orders from yesterday_invoices
  if (rawData?.yesterday_invoices?.invoices) {
    const invoices = rawData.yesterday_invoices.invoices;
    // Sort by amount descending and take top 3
    const sortedInvoices = [...invoices].sort((a, b) => (b.subtotal || 0) - (a.subtotal || 0));
    
    for (let i = 0; i < Math.min(3, sortedInvoices.length); i++) {
      const inv = sortedInvoices[i];
      const order: NotableOrder = {
        accountName: inv.account_name || 'Unknown',
        amount: inv.subtotal || 0,
        description: inv.job_description,
        salesRep: inv.salesrep,
      };
      topOrders.push(order);
      // Fallback: use first invoice as biggest if not explicitly set
      if (i === 0 && !biggestOrder) {
        biggestOrder = order;
      }
    }
  }
  
  // Extract top performers - prefer explicit fields from Python
  const topPerformers: TopPerformer[] = [];
  
  // Use explicit topPM from Python if available
  if (rawData?.topPM) {
    topPerformers.push({
      name: rawData.topPM.name,
      role: 'PM',
      ordersCompleted: rawData.topPM.ordersCompleted,
      revenue: rawData.topPM.revenue,
    });
  } else if (currentData?.pmPerformance?.length) {
    // Fallback: extract from pmPerformance array
    const sortedPMs = [...currentData.pmPerformance].sort((a, b) => b.revenue - a.revenue);
    if (sortedPMs[0]) {
      topPerformers.push({
        name: sortedPMs[0].name,
        role: 'PM',
        ordersCompleted: sortedPMs[0].ordersCompleted,
        revenue: sortedPMs[0].revenue,
      });
    }
  }
  
  // Use explicit topBD from Python if available
  if (rawData?.topBD) {
    topPerformers.push({
      name: rawData.topBD.name,
      role: 'BD',
      ordersCompleted: rawData.topBD.ordersCompleted,
      revenue: rawData.topBD.revenue,
    });
  } else if (currentData?.bdPerformance?.length) {
    // Fallback: extract from bdPerformance array
    const sortedBDs = [...currentData.bdPerformance].sort((a, b) => b.revenue - a.revenue);
    if (sortedBDs[0]) {
      topPerformers.push({
        name: sortedBDs[0].name,
        role: 'BD',
        ordersCompleted: sortedBDs[0].ordersCompleted,
        revenue: sortedBDs[0].revenue,
      });
    }
  }
  
  // Format date string
  const dateStr = new Date(currentData?.date || today.toISOString().split('T')[0])
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  
  // Fetch recent digest summaries for AI context (to avoid repetition)
  const recentDigests = await getRecentDigestSummaries(7);
  
  return {
    dailyRevenue: metrics?.dailyRevenue || 0,
    dailyOrders: metrics?.dailySalesCount || 0,
    dailyEstimates: metrics?.dailyEstimatesCreated || 0,
    dailyNewCustomers: metrics?.dailyNewCustomers || 0,
    recipientFirstName,
    comparison,
    goalProgress,
    biggestOrder,
    topOrders,
    topPerformers,
    insights: (currentData?.aiInsights || []) as AIInsight[],
    isWeekly,
    dateStr,
    recentDigests,
  };
}

export async function generateDailyDigest(
  recipientName: string,
  shoutouts?: ShoutoutWithRecipient[],
  aiContentOverride?: AIContent,
  recentInspirationContents?: string[],
  testimonialsOverride?: Testimonial[]
): Promise<string> {
  // Fetch all data in parallel for efficiency
  const [digestData, previousData, goals, pendingShoutouts] = await Promise.all([
    getLatestDigestData(),
    getPreviousDayDigestData(),
    prisma.goal.findMany(),
    shoutouts !== undefined ? Promise.resolve(shoutouts) : getPendingShoutouts(),
  ]);
  const testimonials = testimonialsOverride ?? await getRecentTestimonials(2);
  const recentInspirations = recentInspirationContents ?? await getRecentInspirationContents(14);
  const aiContent = aiContentOverride ?? await generateAIContent(recentInspirations);

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
  const recipientFirstName = getRecipientFirstName(recipientName);

  const metrics: DigestMetrics = digestData?.metrics || {
    dailyRevenue: 0,
    dailySalesCount: 0,
    dailyInvoicesCreatedAmount: 0,
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

  // Build rich context for AI with all available data
  const richContext = await buildRichAIContext(
    digestData,
    previousData,
    monthlyGoal ? { salesRevenue: monthlyGoal.salesRevenue, salesCount: monthlyGoal.salesCount } : null,
    false, // isWeekly
    recipientFirstName
  );
  
  // Generate motivational summary with full context
  const motivational = await generateRichMotivationalSummary(richContext);

  const highlights = digestData?.highlights || [];
  const bdPerformance = digestData?.bdPerformance || [];
  const pmPerformance = digestData?.pmPerformance || [];
  const aiInsights = digestData?.aiInsights || [];
  const newCustomerEstimates = digestData?.newCustomerEstimates || [];
  const dateStr = digestData?.date || new Date().toISOString().split('T')[0];
  
  const newCustomerAlerts = await renderNewCustomerAlerts(newCustomerEstimates);

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
      <img src="${LOGO_URL}" alt="Retriever" style="width: 160px; height: 160px; margin-bottom: 8px;" />
      <h1 style="margin: 0; color: white; font-size: 20px; font-weight: 600;">Daily Digest</h1>
      <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 12px;">${formatDate(dateStr)}</p>
    </div>

    <!-- Motivational Section -->
    ${renderMotivationalSection(motivational)}

    ${newCustomerAlerts}

    ${renderShoutoutsSection(pendingShoutouts)}

    <!-- Daily Summary -->
    <div style="padding: 16px 20px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Yesterday's Numbers</h2>
      <table style="width: 100%; border-collapse: collapse; border-spacing: 0;">
        <tr>
          <td style="width: 33.33%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT}; border-radius: 2px 0 0 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatCurrency(metrics.dailyRevenue)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Revenue</p>
          </td>
          <td style="width: 33.33%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT};">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatNumber(metrics.dailySalesCount)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Invoices Created</p>
          </td>
          <td style="width: 33.33%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT}; border-radius: 0 2px 0 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatCurrency(metrics.dailyInvoicesCreatedAmount ?? 0)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Invoices Created ($)</p>
          </td>
        </tr>
      </table>
      <table style="width: 100%; border-collapse: collapse; border-spacing: 0;">
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
      ${renderProgressBar(metrics.monthToDateSalesCount, monthly.salesCount, 'Invoices Created')}
      ${renderProgressBar(metrics.monthToDateEstimatesCreated, monthly.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(metrics.monthToDateNewCustomers, monthly.newCustomers, 'New Customers')}
    </div>

    <!-- Annual Progress -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Annual Progress</h2>
      ${renderProgressBar(metrics.yearToDateRevenue, Number(annual.salesRevenue), 'Revenue')}
      ${renderProgressBar(metrics.yearToDateSalesCount, annual.salesCount, 'Invoices Created')}
      ${renderProgressBar(metrics.yearToDateEstimatesCreated, annual.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(metrics.yearToDateNewCustomers, annual.newCustomers, 'New Customers')}
    </div>

    ${renderTestimonialsSection(testimonials)}

    <!-- AI Quote/Joke -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Daily Inspiration</h2>
      ${renderAIContent(aiContent)}
    </div>

    <!-- Footer -->
    <div style="background-color: ${BRAND_RED_DARK}; padding: 16px; text-align: center;">
      <img src="${LOGO_URL}" alt="Retriever" style="width: 80px; height: 80px; margin-bottom: 6px; opacity: 0.9;" />
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
    dailyInvoicesCreatedAmount: 12350.5,
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
    { type: 'big_order', description: 'Completed order for <strong>ABC Corp</strong> - Large Banner Order - $1,250.00' },
    { type: 'new_customer', description: 'New estimate for <strong>XYZ Industries</strong> - Business Cards - $450.00' },
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
  newCustomerEstimates: [
    {
      accountId: 101,
      accountName: 'Big Blow Productions',
      salesRep: 'Mike Meyer',
      estimateValue: 15000,
      jobDescription: '2x monthly mailer',
      orderedDate: new Date().toISOString(),
    },
  ],
};

export async function generateDailyDigestWithMockFallback(
  recipientName: string,
  shoutouts?: ShoutoutWithRecipient[],
  aiContentOverride?: AIContent,
  recentInspirationContents?: string[],
  testimonialsOverride?: Testimonial[]
): Promise<{ html: string; isMockData: boolean; shoutoutIds: string[] }> {
  // Fetch all data in parallel
  const [digestData, previousData, goals, pendingShoutouts] = await Promise.all([
    getLatestDigestData(),
    getPreviousDayDigestData(),
    prisma.goal.findMany(),
    shoutouts !== undefined ? Promise.resolve(shoutouts) : getPendingShoutouts(),
  ]);
  const testimonials = testimonialsOverride ?? await getRecentTestimonials(2);
  
  const isMockData = digestData === null;
  const dataToUse = digestData || MOCK_DIGEST_DATA;
  const recentInspirations = recentInspirationContents ?? await getRecentInspirationContents(14);
  const aiContent = aiContentOverride ?? await generateAIContent(recentInspirations);

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
  const recipientFirstName = getRecipientFirstName(recipientName);

  const metrics = dataToUse.metrics;
  const highlights = dataToUse.highlights || [];
  const bdPerformance = dataToUse.bdPerformance || [];
  const pmPerformance = dataToUse.pmPerformance || [];
  const aiInsights = dataToUse.aiInsights || [];
  const newCustomerEstimates = dataToUse.newCustomerEstimates || [];
  const dateStr = dataToUse.date;

  // Build rich context for AI - use previous data only if we have real data (not mock)
  const richContext = await buildRichAIContext(
    dataToUse,
    isMockData ? null : previousData,
    monthlyGoal ? { salesRevenue: monthlyGoal.salesRevenue, salesCount: monthlyGoal.salesCount } : null,
    false, // isWeekly
    recipientFirstName
  );
  
  // Generate motivational summary with full context
  const motivational = await generateRichMotivationalSummary(richContext);

  // Collect shoutout IDs for deletion after send
  const shoutoutIds = pendingShoutouts.map(s => s.id);
  
  const newCustomerAlerts = await renderNewCustomerAlerts(newCustomerEstimates);

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
      <img src="${LOGO_URL}" alt="Retriever" style="width: 160px; height: 160px; margin-bottom: 8px;" />
      <h1 style="margin: 0; color: white; font-size: 20px; font-weight: 600;">Daily Digest</h1>
      <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 12px;">${formatDate(dateStr)}</p>
    </div>

    <!-- Motivational Section -->
    ${renderMotivationalSection(motivational)}

    ${newCustomerAlerts}

    ${renderShoutoutsSection(pendingShoutouts)}

    <!-- Daily Summary -->
    <div style="padding: 16px 20px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Yesterday's Numbers</h2>
      <table style="width: 100%; border-collapse: collapse; border-spacing: 0;">
        <tr>
          <td style="width: 33.33%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT}; border-radius: 2px 0 0 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatCurrency(metrics.dailyRevenue)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Revenue</p>
          </td>
          <td style="width: 33.33%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT};">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatNumber(metrics.dailySalesCount)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Invoices Created</p>
          </td>
          <td style="width: 33.33%; padding: 6px; text-align: center; background-color: ${BRAND_RED_LIGHT}; border-radius: 0 2px 0 0;">
            <p style="margin: 0; font-size: 20px; font-weight: 700; color: ${BRAND_RED_DARK};">${formatCurrency(metrics.dailyInvoicesCreatedAmount)}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #6b7280;">Invoices Created ($)</p>
          </td>
        </tr>
      </table>
      <table style="width: 100%; border-collapse: collapse; border-spacing: 0;">
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
      ${renderProgressBar(metrics.monthToDateSalesCount, monthly.salesCount, 'Invoices Created')}
      ${renderProgressBar(metrics.monthToDateEstimatesCreated, monthly.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(metrics.monthToDateNewCustomers, monthly.newCustomers, 'New Customers')}
    </div>

    <!-- Annual Progress -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Annual Progress</h2>
      ${renderProgressBar(metrics.yearToDateRevenue, Number(annual.salesRevenue), 'Revenue')}
      ${renderProgressBar(metrics.yearToDateSalesCount, annual.salesCount, 'Invoices Created')}
      ${renderProgressBar(metrics.yearToDateEstimatesCreated, annual.estimatesCreated, 'Estimates Created')}
      ${renderProgressBar(metrics.yearToDateNewCustomers, annual.newCustomers, 'New Customers')}
    </div>

    ${renderTestimonialsSection(testimonials)}

    <!-- AI Quote/Joke -->
    <div style="padding: 0 20px 16px;">
      <h2 style="margin: 0 0 12px 0; color: ${BRAND_RED_DARK}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${BRAND_RED}; padding-bottom: 6px;">Daily Inspiration</h2>
      ${renderAIContent(aiContent)}
    </div>

    <!-- Footer -->
    <div style="background-color: ${BRAND_RED_DARK}; padding: 16px; text-align: center;">
      <img src="${LOGO_URL}" alt="Retriever" style="width: 80px; height: 80px; margin-bottom: 6px; opacity: 0.9;" />
      <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 12px;">Retriever Daily Digest</p>
      <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.7); font-size: 11px;">BooneGraphics Internal Sales Tool</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { html, isMockData, shoutoutIds };
}

export async function sendDailyDigest(): Promise<SendDigestResult> {
  // Fetch recipients and shoutouts in parallel
  const [recipients, shoutouts] = await Promise.all([
    prisma.recipient.findMany({ where: { active: true } }),
    getPendingShoutouts(),
  ]);
  
  const recentInspirations = await getRecentInspirationContents(14);
  const aiContent = await generateAIContent(recentInspirations);
  await storeInspirationForDate(new Date(), aiContent);
  
  const testimonials = await getRecentTestimonials(2);

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
      // Pass shoutouts to avoid re-fetching for each recipient
      const html = await generateDailyDigest(recipient.name, shoutouts, aiContent, recentInspirations, testimonials);
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
  
  if (result.sent > 0) {
    await recordTestimonialDisplay(testimonials);
  }

  // Delete shoutouts after sending (they've been included in the digest)
  if (result.sent > 0 && shoutouts.length > 0) {
    await deleteShoutouts(shoutouts.map(s => s.id));
  }

  console.log(`[Daily Digest] Complete - Sent: ${result.sent}, Failed: ${result.failed}`);
  return result;
}
