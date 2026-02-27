import { describe, expect, it, vi } from 'vitest';
import { sendDigestBatch } from '@/lib/digest-sender';

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock('@/lib/email', () => ({
  sendEmail: sendEmailMock,
}));

describe('sendDigestBatch', () => {
  it('tracks sent/failed counts across recipients', async () => {
    sendEmailMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'bounce' });

    const result = await sendDigestBatch({
      recipients: [
        { id: '1', name: 'A', email: 'a@example.com' },
        { id: '2', name: 'B', email: 'b@example.com' },
      ],
      subject: 'Test',
      logPrefix: 'Test Digest',
      buildHtml: async (recipient) => `<html>${recipient.name}</html>`,
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('b@example.com');
  });
});
