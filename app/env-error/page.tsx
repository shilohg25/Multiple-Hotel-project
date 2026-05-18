const requiredVariables = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'APP_BASE_URL'
];

type SearchParams = {
  missing?: string;
  invalid?: string;
};

function splitList(value?: string) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default async function EnvErrorPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const missing = splitList(params.missing);
  const invalid = splitList(params.invalid);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
      <section className="card w-full space-y-6 p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-red-600">Setup required</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Environment variables are missing.</h1>
          <p className="mt-3 text-slate-600">
            Add them in Vercel Project Settings → Environment Variables, then redeploy.
          </p>
        </div>

        {missing.length || invalid.length ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {missing.length ? <p>Missing: {missing.join(', ')}</p> : null}
            {invalid.length ? <p>Invalid: {invalid.join(', ')}</p> : null}
          </div>
        ) : null}

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Required variables</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {requiredVariables.map((name) => (
              <li key={name} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs">
                {name}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 text-sm text-slate-600">
          <p>
            <span className="font-semibold text-slate-900">NEXT_PUBLIC_SUPABASE_URL</span> and{' '}
            <span className="font-semibold text-slate-900">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> are needed by
            middleware and login.
          </p>
          <p>
            <span className="font-semibold text-slate-900">SUPABASE_SERVICE_ROLE_KEY</span> is needed by
            server-side protected staff and admin reads. Keep it server-only.
          </p>
          <p>
            <span className="font-semibold text-slate-900">APP_BASE_URL</span> should be{' '}
            <span className="font-mono text-xs">https://multiple-hotel-project.vercel.app</span> in production.
          </p>
          <p>After adding variables, redeploy because old Vercel deployments do not receive new env values.</p>
        </div>
      </section>
    </main>
  );
}
