import { redirect } from 'next/navigation';
import { getMissingProtectedEnvVars, requireStaff } from '@/lib/auth';
import { getEnvErrorPath } from '@/lib/env';
import { Shell } from '@/components/Shell';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const missingEnv = getMissingProtectedEnvVars();
  if (missingEnv.length) {
    redirect(getEnvErrorPath(missingEnv));
  }

  const staff = await requireStaff();
  return <Shell profile={staff.profile}>{children}</Shell>;
}
