import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const protectedRoutes = [
  '/dashboard',
  '/hotels',
  '/rooms',
  '/reservations',
  '/payments',
  '/sales',
  '/board',
  '/settings',
  '/pricing',
  '/remittances',
  '/day-tours'
];

function isProtectedPath(pathname: string) {
  return protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function redirectToLogin(request: NextRequest) {
  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missingEnv = [
    !supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
    !supabaseAnonKey ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' : null
  ].filter((name): name is string => Boolean(name));

  if (!supabaseUrl || !supabaseAnonKey) {
    const url = request.nextUrl.clone();
    url.pathname = '/env-error';
    url.searchParams.set('missing', missingEnv.join(','));
    return NextResponse.redirect(url);
  }

  const isProtected = isProtectedPath(request.nextUrl.pathname);
  let response = NextResponse.next({ request });
  let userId: string | null = null;
  let supabase;

  try {
    supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          }
        }
      }
    );
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = '/env-error';
    url.searchParams.set('invalid', 'NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return NextResponse.redirect(url);
  }

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    if (isProtected) {
      return redirectToLogin(request);
    }
    return response;
  }

  if (isProtected && !userId) {
    return redirectToLogin(request);
  }

  return response;
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/hotels/:path*',
    '/rooms/:path*',
    '/reservations/:path*',
    '/payments/:path*',
    '/sales/:path*',
    '/board/:path*',
    '/settings/:path*',
    '/pricing/:path*',
    '/remittances/:path*',
    '/day-tours/:path*'
  ]
};
