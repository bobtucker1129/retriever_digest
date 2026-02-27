import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/daily-digest', () => ({
  getRecentInspirationContents: vi.fn().mockResolvedValue([]),
  generateDailyDigestWithMockFallback: vi
    .fn()
    .mockResolvedValue({ html: '<html>daily</html>' }),
}));

vi.mock('@/lib/weekly-digest', () => ({
  generateWeeklyDigestWithMockFallback: vi
    .fn()
    .mockResolvedValue({ html: '<html>weekly</html>' }),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

describe('/api/test-email route', () => {
  it('blocks requests without admin session', async () => {
    const { POST } = await import('@/app/api/test-email/route');
    const request = new NextRequest('http://localhost/api/test-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', type: 'daily' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('allows valid request with admin session cookie', async () => {
    const { POST } = await import('@/app/api/test-email/route');
    const request = new NextRequest('http://localhost/api/test-email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'retriever_session=abc123',
      },
      body: JSON.stringify({ email: 'test@example.com', type: 'daily' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });
});
