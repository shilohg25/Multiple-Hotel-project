import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase-server';
import { supabaseAdmin } from './supabase-admin';
import type { Profile } from '@/types/app';

export type StaffContext = {
  userId: string;
  profile: Profile;
};

export async function getStaffContext(): Promise<StaffContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role, hotel_id')
    .eq('id', user.id)
    .single();

  if (error || !profile) return null;

  return {
    userId: user.id,
    profile: profile as Profile
  };
}

export async function requireStaff(): Promise<StaffContext> {
  const staff = await getStaffContext();
  if (!staff) redirect('/login');
  return staff;
}

export async function requireOwner(): Promise<StaffContext> {
  const staff = await requireStaff();
  if (staff.profile.role !== 'owner') {
    redirect('/dashboard');
  }
  return staff;
}

export function canAccessHotel(profile: Profile, hotelId: string): boolean {
  return profile.role === 'owner' || profile.hotel_id === hotelId;
}

export function canManagePayments(profile: Profile): boolean {
  return profile.role === 'owner' || profile.role === 'manager';
}

export function canManagePricingSetup(profile: Profile): boolean {
  return profile.role === 'owner' || profile.role === 'manager';
}
