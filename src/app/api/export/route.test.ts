import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertMock = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    digestData: {
      upsert: upsertMock,
    },
  },
}));

describe('/api/export route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXPORT_API_SECRET = 'export-secret';
  });

  it('rejects invalid secret', async () => {
    const { POST } = await import('@/app/api/export/route');
    const request = new NextRequest('http://localhost/api/export', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('rejects malformed payload shape', async () => {
    const { POST } = await import('@/app/api/export/route');
    const request = new NextRequest('http://localhost/api/export', {
      method: 'POST',
      headers: {
        'x-export-secret': 'export-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ date: '2026-02-18' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('stores valid export payload', async () => {
    const { POST } = await import('@/app/api/export/route');
    const payload = {
      date: '2026-02-18',
      metrics: {
        dailyRevenue: 1000,
        dailySalesCount: 3,
        dailyEstimatesCreated: 2,
        dailyNewCustomers: 1,
        monthToDateRevenue: 5000,
        monthToDateSalesCount: 12,
        monthToDateEstimatesCreated: 8,
        monthToDateNewCustomers: 3,
        yearToDateRevenue: 25000,
        yearToDateSalesCount: 60,
        yearToDateEstimatesCreated: 30,
        yearToDateNewCustomers: 10,
      },
      highlights: [],
      bdPerformance: [],
      pmPerformance: [],
    };

    const request = new NextRequest('http://localhost/api/export', {
      method: 'POST',
      headers: {
        'x-export-secret': 'export-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});
