import { SignOutButton } from '@/components/SignOutButton';

const roles = ['owner', 'manager', 'front_desk'];

const ownerSql = `insert into public.profiles (id, full_name, role, hotel_id)
select
  u.id,
  'Owner',
  'owner'::public.app_role,
  null
from auth.users u
where lower(u.email) = lower('YOUR_EMAIL_HERE')
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = 'owner'::public.app_role,
  hotel_id = null;`;

export default function AccountPendingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-12">
      <section className="card w-full space-y-6 p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-600">Staff profile missing</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Account setup required</h1>
          <p className="mt-3 text-slate-600">
            Your login exists in Supabase Auth, but this hotel app does not have a staff profile for your account yet.
          </p>
        </div>

        <div className="space-y-3 text-sm text-slate-700">
          <p>Ask the owner/admin to create a row in public.profiles with your user ID and one of these roles:</p>
          <ul className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <li key={role} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs">
                {role}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Owner profile SQL example</h2>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
            <code>{ownerSql}</code>
          </pre>
        </div>

        <SignOutButton />
      </section>
    </main>
  );
}
