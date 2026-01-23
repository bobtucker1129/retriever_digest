import Anthropic from '@anthropic-ai/sdk';

export interface AIContent {
  type: string;
  content: string;
  attribution?: string;
}

export interface MotivationalSummary {
  headline: string;
  message: string;
}

export interface DigestMetricsForAI {
  revenue: number;
  ordersCompleted: number;
  estimatesCreated: number;
  newCustomers: number;
  isWeekly?: boolean;
  weekOverWeekRevenueChange?: number;
  weekOverWeekOrdersChange?: number;
}

// ============================================================================
// RICH AI CONTEXT - Everything the AI needs for insightful content
// ============================================================================

export interface DayComparison {
  revenueChange: number;        // e.g., 1500 means +$1,500
  revenueChangePercent: number; // e.g., 12 means +12%
  ordersChange: number;         // e.g., -2 means 2 fewer orders
  previousRevenue: number;
  previousOrders: number;
}

export interface GoalProgress {
  monthlyGoal: number;
  monthToDateRevenue: number;
  progressPercent: number;      // e.g., 75 means 75% to goal
  daysInMonth: number;
  dayOfMonth: number;
  daysRemaining: number;
  requiredDailyPace: number;    // $/day needed to hit goal
  actualDailyPace: number;      // $/day so far this month
  paceStatus: 'ahead' | 'on_track' | 'behind';
  amountToGoal: number;         // $ remaining to hit goal
}

export interface NotableOrder {
  accountName: string;
  amount: number;
  description?: string;
  salesRep?: string;
}

export interface AIInsightItem {
  name: string;
  detail: string;
  value?: string;
}

export interface AIInsight {
  type: string;
  title: string;
  message: string;
  items: AIInsightItem[];
}

export interface TopPerformer {
  name: string;
  role: 'PM' | 'BD';
  ordersCompleted: number;
  revenue: number;
}

export interface RecentDigestSummary {
  date: string;
  headline?: string;
  accountNames: string[];
}

export interface RichAIContext {
  // Core metrics
  dailyRevenue: number;
  dailyOrders: number;
  dailyEstimates: number;
  dailyNewCustomers: number;
  
  // Comparison to previous day
  comparison?: DayComparison;
  
  // Goal tracking
  goalProgress?: GoalProgress;
  
  // Notable items from today
  biggestOrder?: NotableOrder;
  topOrders: NotableOrder[];      // Top 3 orders of the day
  
  // Top performers
  topPerformers: TopPerformer[];  // Top PM and BD
  
  // AI Insights from PrintSmith queries
  insights: AIInsight[];
  
  // Time context
  isWeekly: boolean;
  dateStr: string;                // e.g., "Tuesday, January 21"
  
  // Week-over-week (for weekly digests)
  weekOverWeekRevenueChange?: number;
  weekOverWeekOrdersChange?: number;
  
  // Recent digest context for avoiding repetition
  recentDigests?: RecentDigestSummary[];
}

const FALLBACK_MOTIVATIONAL: MotivationalSummary[] = [
  {
    headline: 'Strong Performance',
    message: 'The team delivered solid results. Every order completed and every customer served reflects the dedication and expertise that sets BooneGraphics apart in medical printing.',
  },
  {
    headline: 'Moving Forward Together',
    message: 'Another productive period in the books. The collective effort across sales, production, and customer service continues to drive results for our medical industry partners.',
  },
  {
    headline: 'Building Momentum',
    message: 'The numbers reflect consistent execution across the board. Quality work and reliable service remain the foundation of our success in medical printing.',
  },
];

const FALLBACK_CONTENT: AIContent[] = [
  {
    type: 'quote',
    content: 'Every sale begins with a conversation.',
    attribution: 'Unknown',
  },
  {
    type: 'quote',
    content: 'Success in sales is about helping, not selling.',
    attribution: 'Unknown',
  },
  {
    type: 'joke',
    content: 'Why did the printer go to therapy? It had too many paper jams.',
  },
  {
    type: 'quote',
    content: 'Quality is never an accident; it is always the result of intelligent effort.',
    attribution: 'John Ruskin',
  },
  {
    type: 'joke',
    content: 'What do you call a printer that sings? A jam session.',
  },
  {
    type: 'quote',
    content: 'The best time to plant a tree was 20 years ago. The second best time is now.',
    attribution: 'Chinese Proverb',
  },
  {
    type: 'joke',
    content: "Why don't sales reps ever get lost? They always follow up.",
  },
  {
    type: 'quote',
    content: 'You miss 100% of the shots you don\'t take.',
    attribution: 'Wayne Gretzky',
  },
];

export async function generateAIContent(): Promise<AIContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  console.log('[AI Content] generateAIContent called, API key exists:', !!apiKey);
  
  if (!apiKey) {
    console.log('[AI Content] No ANTHROPIC_API_KEY found, using fallback content');
    return getRandomFallback();
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    
    const contentType = Math.random() > 0.5 ? 'quote' : 'joke';
    console.log('[AI Content] Generating content type:', contentType);
    
    const prompt = contentType === 'quote'
      ? `Generate a short motivational quote (1-2 sentences) about sales, business success, or the printing industry. Keep it professional and appropriate for a workplace email. Return ONLY the quote text and attribution in this exact format: "QUOTE_TEXT" - ATTRIBUTION`
      : `Generate a short, clean joke (1-2 sentences) about sales, printing, or business. Keep it professional and appropriate for a workplace email. Return ONLY the joke text, no setup labels.`;

    console.log('[AI Content] Calling Anthropic API...');
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      temperature: 1,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      system: 'You generate short, workplace-appropriate motivational content for a sales team email digest. Keep responses brief and professional.',
    });

    const textBlock = response.content.find(block => block.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : null;
    
    console.log('[AI Content] API response received, text length:', text?.length || 0);
    
    if (!text) {
      console.log('[AI Content] Empty response from API, using fallback');
      return getRandomFallback();
    }

    if (contentType === 'quote') {
      const match = text.match(/^"?([^"]+)"?\s*[-–—]\s*(.+)$/);
      if (match) {
        console.log('[AI Content] Successfully parsed quote with attribution');
        return {
          type: 'quote',
          content: match[1].replace(/^"|"$/g, '').trim(),
          attribution: match[2].trim(),
        };
      }
      console.log('[AI Content] Quote parsed without attribution pattern, using Unknown');
      return {
        type: 'quote',
        content: text.replace(/^"|"$/g, ''),
        attribution: 'Unknown',
      };
    } else {
      console.log('[AI Content] Successfully generated joke');
      return {
        type: 'joke',
        content: text,
      };
    }
  } catch (error) {
    console.error('[AI Content] Failed to generate AI content:', error);
    console.error('[AI Content] Error details:', error instanceof Error ? error.message : String(error));
    return getRandomFallback();
  }
}

function getRandomFallback(): AIContent {
  const index = Math.floor(Math.random() * FALLBACK_CONTENT.length);
  return FALLBACK_CONTENT[index];
}

function getRandomMotivationalFallback(): MotivationalSummary {
  const index = Math.floor(Math.random() * FALLBACK_MOTIVATIONAL.length);
  return FALLBACK_MOTIVATIONAL[index];
}

function formatCurrencyForAI(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export async function generateMotivationalSummary(metrics: DigestMetricsForAI): Promise<MotivationalSummary> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  console.log('[AI Content] generateMotivationalSummary called, API key exists:', !!apiKey);
  
  if (!apiKey) {
    console.log('[AI Content] No ANTHROPIC_API_KEY found, using fallback motivational content');
    return getRandomMotivationalFallback();
  }

  try {
    console.log('[AI Content] Calling Anthropic API for motivational summary...');
    const anthropic = new Anthropic({ apiKey });
    
    const periodType = metrics.isWeekly ? 'week' : 'day';
    const periodLabel = metrics.isWeekly ? 'This Week' : 'Yesterday';
    
    let contextInfo = `${periodLabel}'s results: ${formatCurrencyForAI(metrics.revenue)} in revenue, ${metrics.ordersCompleted} orders completed, ${metrics.estimatesCreated} estimates created, ${metrics.newCustomers} new customers.`;
    
    if (metrics.isWeekly && metrics.weekOverWeekRevenueChange !== undefined) {
      const revenueDirection = metrics.weekOverWeekRevenueChange >= 0 ? 'up' : 'down';
      const ordersDirection = (metrics.weekOverWeekOrdersChange ?? 0) >= 0 ? 'up' : 'down';
      contextInfo += ` Week-over-week: revenue ${revenueDirection} ${Math.abs(metrics.weekOverWeekRevenueChange)}%, orders ${ordersDirection} ${Math.abs(metrics.weekOverWeekOrdersChange ?? 0)}%.`;
    }

    const prompt = `You are writing a brief motivational summary for BooneGraphics, a professional printing company serving the medical industry. This will appear at the top of a ${periodType}ly digest email to the team.

${contextInfo}

Write a 2-3 sentence motivational team summary that:
1. Acknowledges the team's collective effort (never call out individuals)
2. Highlights something positive from the numbers
3. Maintains a professional, encouraging tone appropriate for a B2B medical printing company
4. Focuses on team success and shared wins

IMPORTANT: Create a unique, creative headline. Do NOT start with "Strong" - use varied words like "Excellent", "Outstanding", "Crushing It", "On Fire", "Momentum Building", "Goals in Sight", "Another Win", "Delivering Excellence", "Making It Happen", etc.

Return your response in this exact JSON format:
{"headline": "2-4 word headline (NOT starting with Strong)", "message": "Your 2-3 sentence motivational message here."}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      temperature: 1,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      system: 'You generate professional, team-focused motivational content for a medical printing company. Always respond with valid JSON only. NEVER use the word "Strong" in headlines - be creative with different words.',
    });

    const textBlock = response.content.find(block => block.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : null;
    
    console.log('[AI Content] API response received, text length:', text?.length || 0);
    
    if (!text) {
      console.log('[AI Content] Empty response, using fallback');
      return getRandomMotivationalFallback();
    }

    try {
      // Extract JSON from response - handle markdown code fences and extra text
      let jsonText = text;
      
      // Remove markdown code fences if present
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
        console.log('[AI Content] Extracted JSON from code fence');
      }
      
      // Try to find JSON object in the text
      const objectMatch = jsonText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonText = objectMatch[0];
      }
      
      const parsed = JSON.parse(jsonText);
      if (parsed.headline && parsed.message) {
        console.log('[AI Content] Successfully generated:', parsed.headline);
        return {
          headline: parsed.headline,
          message: parsed.message,
        };
      }
    } catch (parseError) {
      console.error('[AI Content] Failed to parse motivational JSON response. Raw text:', text.substring(0, 200));
    }

    console.log('[AI Content] Parse failed, using fallback');
    return getRandomMotivationalFallback();
  } catch (error) {
    console.error('[AI Content] Failed to generate motivational summary:', error);
    return getRandomMotivationalFallback();
  }
}

// ============================================================================
// RICH MOTIVATIONAL SUMMARY - Uses full context for insightful content
// ============================================================================

function buildContextSection(ctx: RichAIContext): string {
  const lines: string[] = [];
  
  // Daily metrics with comparison
  lines.push('## TODAY\'S NUMBERS');
  lines.push(`- Revenue: ${formatCurrencyForAI(ctx.dailyRevenue)}`);
  
  if (ctx.comparison) {
    const direction = ctx.comparison.revenueChange >= 0 ? 'UP' : 'DOWN';
    const changeAbs = Math.abs(ctx.comparison.revenueChange);
    const percentAbs = Math.abs(ctx.comparison.revenueChangePercent);
    lines.push(`  → ${direction} ${formatCurrencyForAI(changeAbs)} (${percentAbs}%) from previous day's ${formatCurrencyForAI(ctx.comparison.previousRevenue)}`);
  }
  
  lines.push(`- Orders Completed: ${ctx.dailyOrders}`);
  if (ctx.comparison) {
    const orderDirection = ctx.comparison.ordersChange >= 0 ? 'up' : 'down';
    lines.push(`  → ${orderDirection} ${Math.abs(ctx.comparison.ordersChange)} from previous day`);
  }
  
  lines.push(`- Estimates Created: ${ctx.dailyEstimates}`);
  lines.push(`- New Customers: ${ctx.dailyNewCustomers}`);
  
  return lines.join('\n');
}

function buildGoalSection(ctx: RichAIContext): string {
  if (!ctx.goalProgress) return '';
  
  const gp = ctx.goalProgress;
  const lines: string[] = ['\n## MONTHLY GOAL PROGRESS'];
  
  lines.push(`- Goal: ${formatCurrencyForAI(gp.monthlyGoal)}`);
  lines.push(`- Month-to-Date: ${formatCurrencyForAI(gp.monthToDateRevenue)} (${gp.progressPercent}% achieved)`);
  lines.push(`- Days: ${gp.dayOfMonth} of ${gp.daysInMonth} (${gp.daysRemaining} days remaining)`);
  lines.push(`- Amount to Goal: ${formatCurrencyForAI(gp.amountToGoal)}`);
  
  // Pace analysis
  const paceEmoji = gp.paceStatus === 'ahead' ? 'AHEAD' : gp.paceStatus === 'on_track' ? 'ON TRACK' : 'BEHIND';
  lines.push(`- Pace Status: ${paceEmoji}`);
  lines.push(`  → Need ${formatCurrencyForAI(gp.requiredDailyPace)}/day to hit goal`);
  lines.push(`  → Averaging ${formatCurrencyForAI(gp.actualDailyPace)}/day so far`);
  
  return lines.join('\n');
}

function buildNotableSection(ctx: RichAIContext): string {
  const lines: string[] = [];
  
  if (ctx.biggestOrder || ctx.topOrders.length > 0) {
    lines.push('\n## NOTABLE ORDERS');
    if (ctx.biggestOrder) {
      lines.push(`- Biggest Order: ${ctx.biggestOrder.accountName} - ${formatCurrencyForAI(ctx.biggestOrder.amount)}`);
      if (ctx.biggestOrder.description) {
        lines.push(`  → Job: ${ctx.biggestOrder.description}`);
      }
    }
    
    // Add other top orders if different from biggest
    ctx.topOrders.slice(1, 3).forEach((order, i) => {
      lines.push(`- #${i + 2}: ${order.accountName} - ${formatCurrencyForAI(order.amount)}`);
    });
  }
  
  if (ctx.topPerformers.length > 0) {
    lines.push('\n## TOP PERFORMERS');
    ctx.topPerformers.forEach(perf => {
      lines.push(`- Top ${perf.role}: ${perf.name} - ${perf.ordersCompleted} orders, ${formatCurrencyForAI(perf.revenue)}`);
    });
  }
  
  return lines.join('\n');
}

function buildInsightsSection(ctx: RichAIContext): string {
  if (!ctx.insights || ctx.insights.length === 0) return '';
  
  const lines: string[] = ['\n## SALES INSIGHTS (mention 1-2 of these)'];
  
  ctx.insights.forEach(insight => {
    lines.push(`\n### ${insight.title}`);
    lines.push(`${insight.message}`);
    insight.items.slice(0, 3).forEach(item => {
      lines.push(`- ${item.name}: ${item.detail}${item.value ? ` (${item.value})` : ''}`);
    });
  });
  
  return lines.join('\n');
}

function buildRecentDigestsSection(ctx: RichAIContext): string {
  if (!ctx.recentDigests || ctx.recentDigests.length === 0) return '';
  
  const lines: string[] = ['\n## AVOID REPETITION - Recent Digest Context'];
  lines.push('Do NOT repeat these headlines or over-mention these accounts:');
  
  // Collect recent headlines
  const recentHeadlines = ctx.recentDigests
    .filter(d => d.headline)
    .slice(0, 5)
    .map(d => d.headline as string);
  
  if (recentHeadlines.length > 0) {
    lines.push(`\nRecent headlines (use different phrasing):`);
    recentHeadlines.forEach(h => lines.push(`- "${h}"`));
  }
  
  // Collect recently mentioned accounts
  const recentAccounts = new Set<string>();
  ctx.recentDigests.slice(0, 7).forEach(d => {
    d.accountNames.forEach(name => recentAccounts.add(name));
  });
  
  if (recentAccounts.size > 0) {
    const accountList = Array.from(recentAccounts).slice(0, 15);
    lines.push(`\nRecently mentioned accounts (prefer different ones if possible):`);
    lines.push(accountList.join(', '));
  }
  
  return lines.join('\n');
}

/**
 * Generate a rich, insightful motivational summary using full context.
 * This produces specific, data-driven commentary instead of generic praise.
 */
export async function generateRichMotivationalSummary(ctx: RichAIContext): Promise<MotivationalSummary> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  console.log('[AI Content] generateRichMotivationalSummary called with context:', {
    dailyRevenue: ctx.dailyRevenue,
    hasComparison: !!ctx.comparison,
    hasGoalProgress: !!ctx.goalProgress,
    insightsCount: ctx.insights.length,
    topOrdersCount: ctx.topOrders.length,
    recentDigestsCount: ctx.recentDigests?.length || 0,
  });
  
  if (!apiKey) {
    console.log('[AI Content] No ANTHROPIC_API_KEY found, using fallback');
    return getRandomMotivationalFallback();
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    
    // Build the comprehensive context prompt
    const contextSection = buildContextSection(ctx);
    const goalSection = buildGoalSection(ctx);
    const notableSection = buildNotableSection(ctx);
    const insightsSection = buildInsightsSection(ctx);
    const recentDigestsSection = buildRecentDigestsSection(ctx);
    
    const periodType = ctx.isWeekly ? 'weekly' : 'daily';
    
    const prompt = `You are writing a brief motivational summary for BooneGraphics, a professional printing company serving the medical industry. This appears at the TOP of a ${periodType} sales digest email.

${contextSection}
${goalSection}
${notableSection}
${insightsSection}
${recentDigestsSection}

## YOUR TASK

Write a 2-3 sentence motivational message that is SPECIFIC and INSIGHTFUL, not generic.

REQUIREMENTS:
1. Lead with the MOST INTERESTING thing from the data above - a specific trend, a notable order, a milestone, or an insight worth acting on
2. Reference SPECIFIC numbers, account names, or insights - make it clear this message is about TODAY, not a template
3. If pace status is "AHEAD", celebrate the momentum with specifics
4. If pace status is "BEHIND", acknowledge the gap but focus on the path forward (e.g., "Need $X/day for the next Y days")
5. If there's a notable insight (anniversary reorder, lapsed account, hot streak), mention ONE as an actionable opportunity
6. Keep tone professional but energizing - this is for a B2B medical printing company
7. NEVER use generic phrases like "great job team" or "keep up the good work" without specific context
8. AVOID repeating recent headlines or over-mentioning accounts listed in the "AVOID REPETITION" section

GOOD EXAMPLE:
"Memorial Hospital just placed their biggest order in 6 months - $3,500 for surgical kit labels. With 10 days left and $85K to go, yesterday's $16K keeps us right on pace. Quick opportunity: Smith Medical's annual report order is coming up - they placed a $4K order same time last year."

BAD EXAMPLE:
"Excellent work yesterday! The team delivered solid results with strong revenue. Keep pushing forward and we'll hit our goals!"

Return your response in this exact JSON format:
{"headline": "2-4 word headline that references something SPECIFIC (not generic)", "message": "Your 2-3 sentence message with specific numbers, names, or insights."}`;

    console.log('[AI Content] Sending rich context prompt to Anthropic...');
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      temperature: 0.9,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      system: 'You generate specific, data-driven motivational content for a sales team. You MUST reference specific numbers, accounts, or insights from the provided data. Generic praise is not acceptable. Always respond with valid JSON only.',
    });

    const textBlock = response.content.find(block => block.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : null;
    
    console.log('[AI Content] Rich summary response received, length:', text?.length || 0);
    
    if (!text) {
      console.log('[AI Content] Empty response, using fallback');
      return getRandomMotivationalFallback();
    }

    try {
      let jsonText = text;
      
      // Remove markdown code fences if present
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
      
      // Try to find JSON object in the text
      const objectMatch = jsonText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonText = objectMatch[0];
      }
      
      const parsed = JSON.parse(jsonText);
      if (parsed.headline && parsed.message) {
        console.log('[AI Content] Rich summary generated:', parsed.headline);
        return {
          headline: parsed.headline,
          message: parsed.message,
        };
      }
    } catch (parseError) {
      console.error('[AI Content] Failed to parse rich summary JSON. Raw text:', text.substring(0, 300));
    }

    return getRandomMotivationalFallback();
  } catch (error) {
    console.error('[AI Content] Failed to generate rich motivational summary:', error);
    return getRandomMotivationalFallback();
  }
}
