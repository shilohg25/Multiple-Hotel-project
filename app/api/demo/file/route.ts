import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demo/guard.mjs';
import { demoUserFromCookie, readDemoFile } from '@/lib/demo/client';

// Serves uploaded or seeded payment proofs from demo memory to signed-in demo staff.
export async function GET(request: Request) {
  if (!isDemoMode()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await demoUserFromCookie(await cookies());
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const file = readDemoFile(url.searchParams.get('bucket') || '', url.searchParams.get('path') || '');
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(Buffer.from(file.body), { headers: { 'content-type': file.contentType, 'cache-control': 'private, no-store' } });
}
