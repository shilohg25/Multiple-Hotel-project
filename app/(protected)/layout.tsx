import { requireStaff } from '@/lib/auth';
import { Shell } from '@/components/Shell';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return <Shell profile={staff.profile}>{children}</Shell>;
}
