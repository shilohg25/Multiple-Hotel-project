import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { canOpenPath, isFrontline } from '@/lib/access';
import { getMissingProtectedEnvVars, requireStaff } from '@/lib/auth';
import { getEnvErrorPath } from '@/lib/env';
import { Shell } from '@/components/Shell';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const missingEnv = getMissingProtectedEnvVars();
  if (missingEnv.length) {
    redirect(getEnvErrorPath(missingEnv));
  }

  const staff = await requireStaff();
  const pathname = (await headers()).get('x-pathname') || '';
  if (isFrontline(staff.profile.role) && pathname && !canOpenPath(staff.profile.role, pathname)) {
    redirect('/today');
  }
  return <Shell profile={staff.profile}>{children}</Shell>;
}
