import OpenAI from 'openai';

export interface AIContent {
  type: string;
  content: string;
  attribution?: string;
}

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
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return getRandomFallback();
  }

  try {
    const openai = new OpenAI({ apiKey });
    
    const contentType = Math.random() > 0.5 ? 'quote' : 'joke';
    
    const prompt = contentType === 'quote'
      ? `Generate a short motivational quote (1-2 sentences) about sales, business success, or the printing industry. Keep it professional and appropriate for a workplace email. Return ONLY the quote text and attribution in this exact format: "QUOTE_TEXT" - ATTRIBUTION`
      : `Generate a short, clean joke (1-2 sentences) about sales, printing, or business. Keep it professional and appropriate for a workplace email. Return ONLY the joke text, no setup labels.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You generate short, workplace-appropriate motivational content for a sales team email digest. Keep responses brief and professional.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 150,
      temperature: 0.8,
    });

    const text = response.choices[0]?.message?.content?.trim();
    
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
    console.error('Failed to generate AI content:', error);
    return getRandomFallback();
  }
}

function getRandomFallback(): AIContent {
  const index = Math.floor(Math.random() * FALLBACK_CONTENT.length);
  return FALLBACK_CONTENT[index];
}
