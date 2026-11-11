import Link from 'next/link';
import { requireStaff } from '@/lib/auth';

export default async function TodayPlaceholder() {
  await requireStaff();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black tracking-tight">Today</h1>
      <p className="text-slate-600">This is the daily entry home. Arrivals, the room grid, and close-the-day are on the next update. Daily sales is ready now.</p>
      <Link href="/sales" className="btn-primary">Open daily sales</Link>
    </div>
  );
}
