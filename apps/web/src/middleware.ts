import { NextResponse, type NextRequest } from 'next/server';

const dashboardRoutes = ['/overview', '/agents', '/transactions', '/alerts', '/settings'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has('chainward-session');

  // Authenticated user on landing page → redirect to dashboard
  if (pathname === '/' && hasSession) {
    return NextResponse.redirect(new URL('/overview', request.url));
  }

  // Unauthenticated user on dashboard routes → redirect to login
  if (dashboardRoutes.some((r) => pathname.startsWith(r)) && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Authenticated user on auth pages → redirect to dashboard
  if ((pathname === '/login' || pathname === '/register') && hasSession) {
    return NextResponse.redirect(new URL('/overview', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/overview/:path*', '/agents/:path*', '/transactions/:path*', '/alerts/:path*', '/settings/:path*', '/login', '/register'],
};
