import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { canOpenPath, isFrontline, normalizePathname } from '@/lib/access';
import { getMissingProtectedEnvVars, requireStaff } from '@/lib/auth';
import { getEnvErrorPath } from '@/lib/env';
import { Shell } from '@/components/Shell';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const missingEnv = getMissingProtectedEnvVars();
  if (missingEnv.length) {
    redirect(getEnvErrorPath(missingEnv));
  }

  const staff = await requireStaff();
  const pathname = normalizePathname((await headers()).get('x-pathname') || '');
  // Do not redirect() here. A layout redirect to /today was coming back as a blank page
  // for front desk, cashier, and restaurant staff, including on reload.
  if (isFrontline(staff.profile.role) && pathname && !canOpenPath(staff.profile.role, pathname)) {
    return (
      <Shell profile={staff.profile}>
        <section className="card mx-auto max-w-lg space-y-3 p-6">
          <h1 className="text-2xl font-black">This screen is for a manager</h1>
          <p className="text-sm text-slate-600">Front desk, cashier, and restaurant staff work from Today and daily sales.</p>
          <Link href="/today" className="btn-primary">Go to Today</Link>
        </section>
      </Shell>
    );
  }
  return <Shell profile={staff.profile}>{children}</Shell>;
}
