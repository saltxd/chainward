import { NextResponse, type NextRequest } from 'next/server';
import { postLoginPath } from '@/lib/nextPath';

const dashboardRoutes = ['/overview', '/agents', '/transactions', '/alerts', '/settings'];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has('chainward-session');

  // Unauthenticated user on dashboard routes → redirect to login, remembering where they were headed
  if (dashboardRoutes.some((r) => pathname.startsWith(r)) && !hasSession) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // Authenticated user on auth pages → redirect to next, or the dashboard
  if ((pathname === '/login' || pathname === '/register') && hasSession) {
    const next = postLoginPath(request.nextUrl.searchParams.get('next'));
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/overview/:path*', '/agents/:path*', '/transactions/:path*', '/alerts/:path*', '/settings/:path*', '/login', '/register'],
};
