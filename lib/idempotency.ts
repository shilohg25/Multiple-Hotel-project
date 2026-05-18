import 'server-only';

import { supabaseAdmin } from './supabase-admin';

export async function getProcessedOfflineRequest(clientRequestId: string | null, requestType: string) {
  if (!clientRequestId) return null;
  const { data, error } = await supabaseAdmin
    .from('offline_sync_requests')
    .select('*')
    .eq('client_request_id', clientRequestId)
    .eq('request_type', requestType)
    .maybeSingle();
  if (error) return null;
  return data as { server_id: string | null; server_table: string | null } | null;
}

export async function recordProcessedOfflineRequest(input: {
  clientRequestId: string | null;
  requestType: string;
  serverTable: string;
  serverId: string;
  createdBy: string;
}) {
  if (!input.clientRequestId) return;
  await supabaseAdmin.from('offline_sync_requests').upsert({
    client_request_id: input.clientRequestId,
    request_type: input.requestType,
    server_table: input.serverTable,
    server_id: input.serverId,
    status: 'processed',
    created_by: input.createdBy
  }, { onConflict: 'client_request_id' });
}
