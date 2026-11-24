import { NextResponse } from 'next/server';
import { getSystemHealth } from '@/lib/system-health';

export function GET() {
  try {
    return NextResponse.json(getSystemHealth());
  } catch {
    return NextResponse.json(getSystemHealth({}));
  }
}
