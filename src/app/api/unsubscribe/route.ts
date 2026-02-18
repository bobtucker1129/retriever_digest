import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get('id');
  const type = searchParams.get('type');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://retriever-digest.onrender.com';

  if (!id || !type) {
    return NextResponse.redirect(`${baseUrl}/unsubscribe?error=invalid`);
  }

  if (type !== 'digest' && type !== 'birthday') {
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

    console.log(`[Unsubscribe] ${recipient.name} opted out of: ${type}`);

    return NextResponse.redirect(`${baseUrl}/unsubscribe?type=${type}&success=true`);
  } catch (err) {
    console.error('[Unsubscribe] Error processing unsubscribe:', err);
    return NextResponse.redirect(`${baseUrl}/unsubscribe?error=server`);
  }
}
