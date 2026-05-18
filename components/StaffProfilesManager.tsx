'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Hotel, Profile, Role } from '@/types/app';

const roles: Role[] = ['owner', 'manager', 'front_desk'];

type Draft = {
  full_name: string;
  role: Role;
  hotel_id: string;
};

function draftFromProfile(profile: Profile): Draft {
  return {
    full_name: profile.full_name || '',
    role: profile.role,
    hotel_id: profile.hotel_id || ''
  };
}

export function StaffProfilesManager({ profiles, hotels }: { profiles: Profile[]; hotels: Hotel[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(profiles.map((profile) => [profile.id, draftFromProfile(profile)]))
  );
  const [message, setMessage] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState<Role>('front_desk');

  function updateDraft(profile: Profile, key: keyof Draft, value: string) {
    setDrafts((current) => ({
      ...current,
      [profile.id]: {
        ...(current[profile.id] || draftFromProfile(profile)),
        [key]: value
      }
    }));
  }

  async function createProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage('');
    setCreating(true);

    try {
      const response = await fetch('/api/settings/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.get('id'),
          full_name: form.get('full_name'),
          role: newRole,
          hotel_id: form.get('hotel_id') || null
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to create staff profile.');
        return;
      }
      formElement.reset();
      setNewRole('front_desk');
      setMessage('Staff profile saved.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create staff profile.');
    } finally {
      setCreating(false);
    }
  }

  async function saveProfile(profile: Profile) {
    const draft = drafts[profile.id] || draftFromProfile(profile);
    setMessage('');
    setSavingId(profile.id);

    try {
      const response = await fetch(`/api/settings/staff/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: draft.full_name,
          role: draft.role,
          hotel_id: draft.hotel_id || null
        })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(json.error || 'Failed to update staff profile.');
        return;
      }
      setMessage('Staff profile updated.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update staff profile.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold">Staff Profiles</h2>
          <p className="mt-1 text-sm text-slate-500">Profiles connect Supabase Auth users to hotel app roles.</p>
        </div>
        {message ? <div className="mx-5 mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">User ID</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Hotel</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profiles.map((profile) => {
                const draft = drafts[profile.id] || draftFromProfile(profile);
                return (
                  <tr key={profile.id}>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{profile.id}</td>
                    <td className="px-5 py-3">
                      <input value={draft.full_name} onChange={(event) => updateDraft(profile, 'full_name', event.target.value)} className="w-44" />
                    </td>
                    <td className="px-5 py-3">
                      <select value={draft.role} onChange={(event) => updateDraft(profile, 'role', event.target.value)} className="w-36">
                        {roles.map((role) => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <select value={draft.hotel_id} onChange={(event) => updateDraft(profile, 'hotel_id', event.target.value)} className="w-48">
                        <option value="">No hotel / all hotels</option>
                        {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <button className="btn-primary" type="button" disabled={savingId === profile.id} onClick={() => void saveProfile(profile)}>
                        {savingId === profile.id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!profiles.length ? <tr><td className="px-5 py-6 text-slate-500" colSpan={5}>No staff profiles yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-6">
        <div className="card p-5">
          <h2 className="text-lg font-bold">Add profile</h2>
          <p className="mt-1 text-sm text-slate-500">Create the user in Supabase Authentication first, then paste that Auth user UUID here.</p>
          <form onSubmit={createProfile} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label>Auth user UUID</label>
              <input name="id" required className="w-full font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <label>Full name</label>
              <input name="full_name" className="w-full" />
            </div>
            <div className="space-y-2">
              <label>Role</label>
              <select value={newRole} onChange={(event) => setNewRole(event.target.value as Role)} className="w-full">
                {roles.map((role) => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label>Hotel assignment</label>
              <select name="hotel_id" className="w-full">
                <option value="">No hotel / owner all hotels</option>
                {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
              </select>
            </div>
            <button className="btn-primary w-full" type="submit" disabled={creating}>{creating ? 'Saving...' : 'Save profile'}</button>
          </form>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-bold">SQL helper</h2>
          <p className="mt-1 text-sm text-slate-500">Owner can have `hotel_id = null`. Manager and front desk should normally be assigned to a hotel.</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
            <code>{`insert into public.profiles (id, full_name, role, hotel_id)
values ('AUTH_USER_UUID', 'Staff Name', 'front_desk'::public.app_role, 'HOTEL_UUID')
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    hotel_id = excluded.hotel_id;`}</code>
          </pre>
        </div>
      </section>
    </div>
  );
}
