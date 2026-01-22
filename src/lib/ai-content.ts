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
  
  if (!apiKey) {
    console.log('[AI Content] No ANTHROPIC_API_KEY found, using fallback content');
    return getRandomFallback();
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    
    const contentType = Math.random() > 0.5 ? 'quote' : 'joke';
    
    const prompt = contentType === 'quote'
      ? `Generate a short motivational quote (1-2 sentences) about sales, business success, or the printing industry. Keep it professional and appropriate for a workplace email. Return ONLY the quote text and attribution in this exact format: "QUOTE_TEXT" - ATTRIBUTION`
      : `Generate a short, clean joke (1-2 sentences) about sales, printing, or business. Keep it professional and appropriate for a workplace email. Return ONLY the joke text, no setup labels.`;

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
    
    if (!text) {
      return getRandomFallback();
    }

    if (contentType === 'quote') {
      const match = text.match(/^"?([^"]+)"?\s*[-–—]\s*(.+)$/);
      if (match) {
        return {
          type: 'quote',
          content: match[1].replace(/^"|"$/g, '').trim(),
          attribution: match[2].trim(),
        };
      }
      return {
        type: 'quote',
        content: text.replace(/^"|"$/g, ''),
        attribution: 'Unknown',
      };
    } else {
      return {
        type: 'joke',
        content: text,
      };
    }
  } catch (error) {
    console.error('[AI Content] Failed to generate AI content:', error);
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
