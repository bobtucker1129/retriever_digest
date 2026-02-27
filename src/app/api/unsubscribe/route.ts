import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { verifyUnsubscribeToken, type UnsubscribeType } from '@/lib/unsubscribe-token';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const legacyId = searchParams.get('id');
  const legacyType = searchParams.get('type');
  const token = searchParams.get('token');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://retriever-digest.onrender.com';

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`unsubscribe:${ip}`, {
    limit: 60,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.redirect(`${baseUrl}/unsubscribe?error=ratelimited`);
  }

  let id: string | null = null;
  let type: UnsubscribeType | null = null;

  if (token) {
    const parsed = verifyUnsubscribeToken(token);
    if (!parsed) {
      return NextResponse.redirect(`${baseUrl}/unsubscribe?error=invalid`);
    }

    id = parsed.recipientId;
    type = parsed.type;
  } else if (
    legacyId &&
    (legacyType === 'digest' || legacyType === 'birthday')
  ) {
    // Backward compatibility for links sent before token rollout.
    id = legacyId;
    type = legacyType;
  }

  if (!id || !type) {
    return NextResponse.redirect(`${baseUrl}/unsubscribe?error=invalid`);
  }

  try {
    const recipient = await prisma.recipient.findUnique({ where: { id } });

    if (!recipient) {
      return NextResponse.redirect(`${baseUrl}/unsubscribe?error=notfound`);
    }

    if (type === 'digest') {
      await prisma.recipient.update({
        where: { id },
        data: { optOutDigest: true },
      });
    } else {
      await prisma.recipient.update({
        where: { id },
        data: { optOutBirthday: true },
      });
    }

    console.log(`[Unsubscribe] Recipient opted out of: ${type}`);

    return NextResponse.redirect(`${baseUrl}/unsubscribe?type=${type}&success=true`);
  } catch (err) {
    console.error('[Unsubscribe] Error processing unsubscribe:', err);
    return NextResponse.redirect(`${baseUrl}/unsubscribe?error=server`);
  }
}
