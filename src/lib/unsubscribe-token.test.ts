import { describe, expect, it } from 'vitest';
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from '@/lib/unsubscribe-token';

describe('unsubscribe token helpers', () => {
  it('creates and verifies a valid token', () => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-unsubscribe-secret';
    const token = createUnsubscribeToken('recipient-123', 'digest', 300);
    const payload = verifyUnsubscribeToken(token);

    expect(payload).not.toBeNull();
    expect(payload?.recipientId).toBe('recipient-123');
    expect(payload?.type).toBe('digest');
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects tampered tokens', () => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-unsubscribe-secret';
    const token = createUnsubscribeToken('recipient-123', 'birthday', 300);
    const tampered = `${token}tampered`;

    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });
});
