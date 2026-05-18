import { requireOwner } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { StaffProfilesManager } from '@/components/StaffProfilesManager';
import type { Hotel, Profile } from '@/types/app';

export default async function StaffSettingsPage() {
  await requireOwner();
  const [{ data: profilesRaw }, { data: hotelsRaw }] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, full_name, role, hotel_id').order('full_name'),
    supabaseAdmin.from('hotels').select('*').eq('active', true).order('name')
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Staff Profiles</h1>
        <p className="mt-1 text-slate-500">Owner-only role and hotel assignments for existing Supabase Auth users.</p>
      </div>
      <StaffProfilesManager profiles={(profilesRaw || []) as Profile[]} hotels={(hotelsRaw || []) as Hotel[]} />
    </div>
  );
}
