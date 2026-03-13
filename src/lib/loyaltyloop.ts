/**
 * LoyaltyLoop API Client
 * Fetches customer testimonials for inclusion in digest emails
 */

import prisma from '@/lib/db';

export interface Testimonial {
  id: string;
  survey_id: string;
  date: string;
  text: string;
  name: string;
  display_date: string;
  company?: string;
  city?: string;
  state?: string;
  score: number;
}

interface LoyaltyLoopResponse {
  id: string;
  survey_id: string;
  date: string;
  text: string;
  name: string;
  display_date: string;
  company?: string;
  city?: string;
  state?: string;
  score: string | number;
  media?: unknown[];
}

const LOYALTYLOOP_API_URL = 'https://app.loyaltyloop.com/api/v3/testimonials';
const NEW_TESTIMONIAL_DAYS = 30; // Consider testimonials "new" if within this many days

type TestimonialWithStats = Testimonial & {
  numberOfTimesDisplayed: number;
  lastShownAt?: Date | null;
};

function parseLoyaltyLoopResponse(data: LoyaltyLoopResponse[]): Testimonial[] {
  return data.map(item => ({
    id: item.id,
    survey_id: item.survey_id,
    date: item.date,
    text: item.text,
    name: item.name,
    display_date: item.display_date,
    company: item.company,
    city: item.city,
    state: item.state,
    score: typeof item.score === 'string' ? parseInt(item.score, 10) : item.score,
  }));
}

async function fetchTestimonialsFromApi(): Promise<Testimonial[]> {
  const apiKey = process.env.LOYALTYLOOP_API_KEY;
  
  if (!apiKey) {
    console.log('[LoyaltyLoop] API key not configured, skipping testimonials');
    return [];
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // Fetch the API maximum (100) to give rotation logic the largest possible pool
    const url = `${LOYALTYLOOP_API_URL}?limit=100&rating=4,5`;
    
    console.log('[LoyaltyLoop] Fetching testimonials from API (page 1)...');
    
    const response = await fetch(url, { method: 'GET', headers, cache: 'no-store' });

    if (!response.ok) {
      console.error(`[LoyaltyLoop] API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data: LoyaltyLoopResponse[] = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log('[LoyaltyLoop] No testimonials returned from API');
      return [];
    }

    let testimonials = parseLoyaltyLoopResponse(data);

    // If the first page was full, fetch a second page for a deeper rotation pool
    if (data.length === 100) {
      try {
        const lastId = data[data.length - 1].id;
        const page2Url = `${LOYALTYLOOP_API_URL}?limit=100&rating=4,5&page_id=${lastId}&page_dir=BACKWARD`;
        console.log('[LoyaltyLoop] First page full, fetching page 2...');
        const page2Response = await fetch(page2Url, { method: 'GET', headers, cache: 'no-store' });
        if (page2Response.ok) {
          const page2Data: LoyaltyLoopResponse[] = await page2Response.json();
          if (Array.isArray(page2Data) && page2Data.length > 0) {
            testimonials = testimonials.concat(parseLoyaltyLoopResponse(page2Data));
          }
        }
      } catch (page2Error) {
        console.warn('[LoyaltyLoop] Page 2 fetch failed, continuing with page 1 results', page2Error);
      }
    }

    console.log(`[LoyaltyLoop] Total testimonial pool: ${testimonials.length}`);
    return testimonials;

  } catch (error) {
    console.error('[LoyaltyLoop] Error fetching testimonials:', error);
    return [];
  }
}

function isNewTestimonial(testimonial: Testimonial, cutoffDate: Date): boolean {
  return new Date(testimonial.date) >= cutoffDate;
}

function sortByLeastShown(a: TestimonialWithStats, b: TestimonialWithStats): number {
  if (a.numberOfTimesDisplayed !== b.numberOfTimesDisplayed) {
    return a.numberOfTimesDisplayed - b.numberOfTimesDisplayed;
  }
  const aTime = a.lastShownAt ? a.lastShownAt.getTime() : 0;
  const bTime = b.lastShownAt ? b.lastShownAt.getTime() : 0;
  return aTime - bTime;
}

export async function getRecentTestimonials(limit = 2): Promise<Testimonial[]> {
  const testimonials = await fetchTestimonialsFromApi();
  if (testimonials.length === 0) {
    return [];
  }
  
  const ids = testimonials.map(t => t.id);
  let statsById = new Map<string, { testimonialId: string; numberOfTimesDisplayed: number; lastShownAt?: Date | null }>();
  try {
    const existing = await prisma.testimonialDisplay.findMany({
      where: { testimonialId: { in: ids } },
    });
    statsById = new Map(existing.map(item => [item.testimonialId, item]));
  } catch (error) {
    console.warn('[LoyaltyLoop] Skipping testimonial de-dup stats (table missing?)', error);
    return testimonials.slice(0, limit);
  }
  
  const merged: TestimonialWithStats[] = testimonials.map(t => {
    const stats = statsById.get(t.id);
    return {
      ...t,
      numberOfTimesDisplayed: stats?.numberOfTimesDisplayed ?? 0,
      lastShownAt: stats?.lastShownAt ?? null,
    };
  });
  
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - (NEW_TESTIMONIAL_DAYS * 24 * 60 * 60 * 1000));
  
  const newUnshown = merged.filter(t => isNewTestimonial(t, cutoffDate) && t.numberOfTimesDisplayed === 0);
  const olderUnshown = merged.filter(t => !isNewTestimonial(t, cutoffDate) && t.numberOfTimesDisplayed === 0);
  const allByLeastShown = [...merged].sort(sortByLeastShown);
  
  const result: TestimonialWithStats[] = [];
  for (const t of newUnshown) {
    if (result.length >= limit) break;
    result.push(t);
  }
  if (result.length < limit) {
    for (const t of olderUnshown) {
      if (result.length >= limit) break;
      if (!result.find(r => r.id === t.id)) {
        result.push(t);
      }
    }
  }
  if (result.length < limit) {
    for (const t of allByLeastShown) {
      if (result.length >= limit) break;
      if (!result.find(r => r.id === t.id)) {
        result.push(t);
      }
    }
  }
  
  console.log(`[LoyaltyLoop] Returning ${result.length} testimonials for digest`);
  return result;
}

export async function recordTestimonialDisplay(testimonials: Testimonial[]): Promise<void> {
  if (!testimonials || testimonials.length === 0) return;
  
  const now = new Date();
  
  for (const t of testimonials) {
    try {
      await prisma.testimonialDisplay.upsert({
        where: { testimonialId: t.id },
        update: {
          text: t.text,
          name: t.name,
          company: t.company,
          score: t.score,
          date: new Date(t.date),
          numberOfTimesDisplayed: { increment: 1 },
          lastShownAt: now,
        },
        create: {
          testimonialId: t.id,
          text: t.text,
          name: t.name,
          company: t.company,
          score: t.score,
          date: new Date(t.date),
          numberOfTimesDisplayed: 1,
          lastShownAt: now,
        },
      });
    } catch (error) {
      console.warn('[LoyaltyLoop] Skipping testimonial display tracking (table missing?)', error);
      return;
    }
  }
}

/**
 * Format a testimonial's location string
 * @param testimonial - The testimonial to format location for
 * @returns Formatted location string (e.g., "San Luis Obispo, CA")
 */
export function formatTestimonialLocation(testimonial: Testimonial): string {
  const parts: string[] = [];
  
  if (testimonial.city) {
    parts.push(testimonial.city);
  }
  
  if (testimonial.state) {
    parts.push(testimonial.state);
  }
  
  return parts.join(', ');
}
