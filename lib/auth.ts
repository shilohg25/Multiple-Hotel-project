import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './supabase-server';
import { supabaseAdmin } from './supabase-admin';
import { getEnvErrorPath, getMissingEnvVars, PROTECTED_SERVER_ENV_VARS } from './env';
import type { Profile } from '@/types/app';

export type StaffContext = {
  userId: string;
  profile: Profile;
};

type StaffLookup =
  | { status: 'anonymous' }
  | { status: 'missing_profile'; userId: string }
  | { status: 'staff'; staff: StaffContext };

export function getMissingProtectedEnvVars(): string[] {
  return getMissingEnvVars(PROTECTED_SERVER_ENV_VARS);
}

export async function getStaffLookup(): Promise<StaffLookup> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { status: 'anonymous' };

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, role, hotel_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Staff profile lookup failed: ${error.message}`);
  }

  if (!profile) {
    return { status: 'missing_profile', userId: user.id };
  }

  return {
    status: 'staff',
    staff: {
      userId: user.id,
      profile: profile as Profile
    }
  };
}

export async function getStaffContext(): Promise<StaffContext | null> {
  const lookup = await getStaffLookup();
  return lookup.status === 'staff' ? lookup.staff : null;
}

export async function requireStaff(): Promise<StaffContext> {
  const missingEnv = getMissingProtectedEnvVars();
  if (missingEnv.length) {
    redirect(getEnvErrorPath(missingEnv));
  }

  let lookup: StaffLookup;
  try {
    lookup = await getStaffLookup();
  } catch {
    redirect(getEnvErrorPath(PROTECTED_SERVER_ENV_VARS, 'invalid'));
  }

  if (lookup.status === 'anonymous') redirect('/login');
  if (lookup.status === 'missing_profile') redirect('/profile-missing');
  return lookup.staff;
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

export function canManagePricing(profile: Profile): boolean {
  return profile.role === 'owner';
}

export function canManageServiceCatalog(profile: Profile): boolean {
  return profile.role === 'owner';
}

export function canAddReservationCharges(profile: Profile): boolean {
  return profile.role === 'owner' || profile.role === 'manager' || profile.role === 'front_desk';
}

export function canManageReservationCharges(profile: Profile): boolean {
  return profile.role === 'owner' || profile.role === 'manager';
}

export function canDeleteReservationCharges(profile: Profile): boolean {
  return profile.role === 'owner';
}

export function canManageRemittances(profile: Profile): boolean {
  return profile.role === 'owner' || profile.role === 'manager';
}

export function canManageDayTourPackages(profile: Profile): boolean {
  return profile.role === 'owner' || profile.role === 'manager';
}

export function canManageStaff(profile: Profile): boolean {
  return profile.role === 'owner';
}
