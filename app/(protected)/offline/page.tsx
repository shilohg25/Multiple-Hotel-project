import { OfflineQueueManager } from '@/components/offline/OfflineQueueManager';

export default function OfflineQueuePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Offline MVP</p>
        <h1 className="text-3xl font-black tracking-tight">Offline Queue</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Staff can keep local drafts and saved print snapshots during an outage. The server remains the source of truth when syncing returns.
        </p>
      </div>
      <OfflineQueueManager />
    </div>
  );
}
