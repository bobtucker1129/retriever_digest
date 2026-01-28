import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SESSION_COOKIE_NAME = 'retriever_session';
const SESSION_DURATION_DAYS = 7;

function createSessionToken(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  const adminPassword = process.env.ADMIN_PASSWORD;

  // Debug logging (check Render logs to diagnose login issues)
  console.log('[Login] Attempt received');
  console.log('[Login] ADMIN_PASSWORD env var set:', !!adminPassword);
  console.log('[Login] ADMIN_PASSWORD length:', adminPassword?.length || 0);
  console.log('[Login] Submitted password length:', password?.length || 0);
  console.log('[Login] First char match:', adminPassword && password ? adminPassword[0] === password[0] : 'N/A');
  console.log('[Login] Last char match:', adminPassword && password ? adminPassword[adminPassword.length - 1] === password[password.length - 1] : 'N/A');

  if (!adminPassword) {
    console.error('[Login] ADMIN_PASSWORD environment variable not set');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (password !== adminPassword) {
    console.log('[Login] Password mismatch - lengths:', password?.length, 'vs', adminPassword.length);
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }
  
  console.log('[Login] Password accepted');

  const sessionToken = createSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  return NextResponse.json({ success: true });
}
