import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/daily-digest', () => ({
  getRecentInspirationContents: vi.fn().mockResolvedValue([]),
  generateDailyDigestWithMockFallback: vi.fn().mockResolvedValue({
    html: '<html><body>preview</body></html>',
    isMockData: true,
  }),
}));

describe('/api/preview/daily route', () => {
  it('requires admin session cookie', async () => {
    const { GET } = await import('@/app/api/preview/daily/route');
    const request = new NextRequest('http://localhost/api/preview/daily');

    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns preview html when authenticated', async () => {
    const { GET } = await import('@/app/api/preview/daily/route');
    const request = new NextRequest('http://localhost/api/preview/daily', {
      headers: { cookie: 'retriever_session=abc123' },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});
