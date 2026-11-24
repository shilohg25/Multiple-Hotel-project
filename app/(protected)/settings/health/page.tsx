import Link from 'next/link';
import { requireOwner } from '@/lib/auth';
import { getSystemHealth, HEALTH_CHECKS } from '@/lib/system-health';

export default async function SystemHealthPage() {
  await requireOwner();
  const health = getSystemHealth();
  const ok = health.status === 'ok';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">System Health</h1>
          <p className="mt-1 text-slate-500">Checks whether required deployment environment variables are present. Values themselves are never shown.</p>
        </div>
        <Link href="/settings" className="btn-secondary">Back to settings</Link>
      </div>

      <section className="card p-5">
        <p className="text-xs uppercase tracking-wide text-slate-500">Overall status</p>
        <p className={`mt-1 text-2xl font-black ${ok ? 'text-emerald-700' : 'text-amber-800'}`}>
          {ok ? 'OK' : 'Setup incomplete'}
        </p>
        <p className="mt-2 text-sm text-slate-500">Checked at {new Date(health.timestamp).toLocaleString()}.</p>
      </section>

      <section className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Check</th>
              <th className="px-5 py-3">Present</th>
              <th className="px-5 py-3">What this means</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {HEALTH_CHECKS.map((check) => {
              const present = health.environment[check.key];
              return (
                <tr key={check.key}>
                  <td className="px-5 py-3 font-medium">{check.label}</td>
                  <td className={`px-5 py-3 font-semibold ${present ? 'text-emerald-700' : 'text-amber-800'}`}>
                    {present ? 'Yes' : 'No'}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{check.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
