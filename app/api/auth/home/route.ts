import { NextResponse } from 'next/server';
import { isFrontline } from '@/lib/access';
import { getStaffContext } from '@/lib/auth';

export async function GET() {
  const staff = await getStaffContext();
  if (!staff) return NextResponse.json({ href: '/login' }, { status: 401 });
  return NextResponse.json({ href: isFrontline(staff.profile.role) ? '/today' : '/dashboard' });
}
