import { OfflineQueueManager } from '@/components/offline/OfflineQueueManager';

export default function OfflineQueuePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Offline queue</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          If the internet goes out, you can keep drafts and saved print copies on this device. When the
          connection is back, sync them here. The records on the server are the ones that count.
        </p>
      </div>
      <OfflineQueueManager />
    </div>
  );
}
