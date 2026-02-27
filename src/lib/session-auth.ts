import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'retriever_session';

export function hasAdminSession(request: NextRequest): boolean {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  return Boolean(sessionCookie?.value);
}

export function requireAdminSession(request: NextRequest): NextResponse | null {
  if (hasAdminSession(request)) {
    return null;
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
