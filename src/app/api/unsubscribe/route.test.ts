import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUnsubscribeToken } from '@/lib/unsubscribe-token';

const findUniqueMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    recipient: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

describe('/api/unsubscribe route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-unsubscribe-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  it('rejects invalid token', async () => {
    const { GET } = await import('@/app/api/unsubscribe/route');
    const request = new NextRequest(
      'http://localhost/api/unsubscribe?token=not-a-real-token'
    );

    const response = await GET(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/unsubscribe?error=invalid');
  });

  it('updates opt-out flag for valid digest token', async () => {
    findUniqueMock.mockResolvedValue({ id: 'r1', name: 'Test User' });
    updateMock.mockResolvedValue({ id: 'r1' });

    const token = createUnsubscribeToken('r1', 'digest', 600);
    const { GET } = await import('@/app/api/unsubscribe/route');
    const request = new NextRequest(
      `http://localhost/api/unsubscribe?token=${encodeURIComponent(token)}`
    );

    const response = await GET(request);
    expect(response.status).toBe(307);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { optOutDigest: true },
    });
    expect(response.headers.get('location')).toContain('/unsubscribe?type=digest&success=true');
  });
});
