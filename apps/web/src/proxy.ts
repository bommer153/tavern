import { type NextRequest, NextResponse } from 'next/server';

// Optimistic redirect only: the API authorizes every request regardless.
export function proxy(req: NextRequest) {
  const signedIn = req.cookies.has('tv_session');
  // The marketing page is for visitors; members land on their feed.
  if (req.nextUrl.pathname === '/') return signedIn ? NextResponse.redirect(new URL('/home', req.url)) : NextResponse.next();
  if (!signedIn) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/orders/:path*',
    '/messages/:path*',
    '/wallet/:path*',
    '/favorites',
    '/profile',
    '/notifications',
    '/settings',
    '/companion/:path*',
    '/admin/:path*',
    '/become-companion',
  ],
};
