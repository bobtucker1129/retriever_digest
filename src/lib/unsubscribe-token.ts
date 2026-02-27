import crypto from 'crypto';

export type UnsubscribeType = 'digest' | 'birthday';

interface UnsubscribeTokenPayload {
  recipientId: string;
  type: UnsubscribeType;
  exp: number;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function resolveTokenSecret(): string {
  const secret =
    process.env.UNSUBSCRIBE_TOKEN_SECRET ||
    process.env.EXPORT_API_SECRET ||
    process.env.CRON_SECRET;

  if (!secret) {
    throw new Error('Missing unsubscribe token secret');
  }

  return secret;
}

function signPayload(payloadEncoded: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadEncoded).digest('base64url');
}

export function createUnsubscribeToken(
  recipientId: string,
  type: UnsubscribeType,
  expiresInSeconds: number = 60 * 60 * 24 * 365
): string {
  const payload: UnsubscribeTokenPayload = {
    recipientId,
    type,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, resolveTokenSecret());
  return `${encodedPayload}.${signature}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const secret = resolveTokenSecret();
  const expectedSignature = signPayload(encodedPayload, secret);

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload: UnsubscribeTokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as UnsubscribeTokenPayload;
  } catch {
    return null;
  }

  if (!payload?.recipientId || !payload?.type || typeof payload.exp !== 'number') {
    return null;
  }

  if (payload.type !== 'digest' && payload.type !== 'birthday') {
    return null;
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
