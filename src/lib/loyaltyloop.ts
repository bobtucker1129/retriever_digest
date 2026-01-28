'use server';

/**
 * LoyaltyLoop API Client
 * Fetches customer testimonials for inclusion in digest emails
 */

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

/**
 * Fetch recent testimonials from LoyaltyLoop API
 * Prioritizes new testimonials (within last 30 days), falls back to older ones if needed
 * 
 * @param limit - Maximum number of testimonials to return (default: 2)
 * @returns Array of testimonials, empty array on error
 */
export async function getRecentTestimonials(limit = 2): Promise<Testimonial[]> {
  const apiKey = process.env.LOYALTYLOOP_API_KEY;
  
  if (!apiKey) {
    console.log('[LoyaltyLoop] API key not configured, skipping testimonials');
    return [];
  }

  try {
    // Fetch more than we need to allow for prioritization
    const fetchLimit = Math.max(limit * 3, 10);
    const url = `${LOYALTYLOOP_API_URL}?limit=${fetchLimit}&rating=4,5`;
    
    console.log(`[LoyaltyLoop] Fetching testimonials from API...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // Don't cache - we want fresh testimonials each time
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`[LoyaltyLoop] API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data: LoyaltyLoopResponse[] = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log('[LoyaltyLoop] No testimonials returned from API');
      return [];
    }

    console.log(`[LoyaltyLoop] Received ${data.length} testimonials from API`);

    // Convert to our Testimonial interface
    const testimonials: Testimonial[] = data.map(item => ({
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

    // Prioritize new testimonials (within last 30 days)
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (NEW_TESTIMONIAL_DAYS * 24 * 60 * 60 * 1000));
    
    const newTestimonials = testimonials.filter(t => new Date(t.date) >= cutoffDate);
    const olderTestimonials = testimonials.filter(t => new Date(t.date) < cutoffDate);

    console.log(`[LoyaltyLoop] Found ${newTestimonials.length} new testimonials (last ${NEW_TESTIMONIAL_DAYS} days), ${olderTestimonials.length} older`);

    // Build result: prioritize new, backfill with older if needed
    const result: Testimonial[] = [];
    
    // Add new testimonials first
    for (const t of newTestimonials) {
      if (result.length >= limit) break;
      result.push(t);
    }
    
    // Backfill with older testimonials if we don't have enough
    if (result.length < limit) {
      for (const t of olderTestimonials) {
        if (result.length >= limit) break;
        result.push(t);
      }
    }

    console.log(`[LoyaltyLoop] Returning ${result.length} testimonials for digest`);
    return result;

  } catch (error) {
    console.error('[LoyaltyLoop] Error fetching testimonials:', error);
    return [];
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
