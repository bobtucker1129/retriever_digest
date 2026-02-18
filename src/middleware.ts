import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'retriever_session';

const PUBLIC_PATHS = ['/login', '/shoutout', '/unsubscribe', '/api/auth/login', '/api/export', '/api/digest', '/api/debug', '/api/preview', '/api/shoutout', '/api/unsubscribe'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + '/')
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie || !sessionCookie.value) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
