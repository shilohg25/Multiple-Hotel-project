import { NextResponse } from 'next/server';

export function GET() {
  try {
    const environment = {
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasAppBaseUrl: Boolean(process.env.APP_BASE_URL)
    };
    const setupComplete = Object.values(environment).every(Boolean);

    return NextResponse.json({
      status: setupComplete ? 'ok' : 'setup_incomplete',
      environment,
      timestamp: new Date().toISOString()
    });
  } catch {
    return NextResponse.json({
      status: 'setup_incomplete',
      environment: {
        hasSupabaseUrl: false,
        hasSupabaseAnonKey: false,
        hasServiceRoleKey: false,
        hasAppBaseUrl: false
      },
      timestamp: new Date().toISOString()
    });
  }
}
