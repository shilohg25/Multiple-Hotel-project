import 'server-only';

import { supabaseAdmin } from './supabase-admin';
import type { LedgerIdempotencyStore, LedgerReclaimResult, OfflineSyncRow } from './ledger-idempotency';

function isConflict(error: { code?: string; message?: string; status?: number } | null) {
  if (!error) return false;
  if (error.code === '23505') return true;
  if (error.status === 409) return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes('duplicate') || message.includes('unique');
}

function asRow(data: unknown): OfflineSyncRow | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.client_request_id !== 'string') return null;
  return {
    client_request_id: row.client_request_id,
    request_type: String(row.request_type || ''),
    server_table: typeof row.server_table === 'string' ? row.server_table : null,
    server_id: typeof row.server_id === 'string' ? row.server_id : null,
    status: String(row.status || ''),
    created_by: typeof row.created_by === 'string' ? row.created_by : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : null
  };
}

export function createSupabaseLedgerIdempotencyStore(): LedgerIdempotencyStore {
  return {
    async tryReserve(input) {
      const { data, error } = await supabaseAdmin
        .from('offline_sync_requests')
        .insert({
          client_request_id: input.clientRequestId,
          request_type: input.requestType,
          status: 'reserved',
          created_by: input.createdBy
        })
        .select('*')
        .maybeSingle();

      if (error) {
        if (isConflict(error)) return 'exists';
        throw error;
      }
      return data ? 'reserved' : 'exists';
    },
    async get(clientRequestId) {
      const { data, error } = await supabaseAdmin
        .from('offline_sync_requests')
        .select('*')
        .eq('client_request_id', clientRequestId)
        .maybeSingle();
      if (error) return null;
      return asRow(data);
    },
    async assignServerId(input) {
      const { error } = await supabaseAdmin
        .from('offline_sync_requests')
        .update({
          server_table: input.serverTable || 'ledger_entries',
          server_id: input.serverId
        })
        .eq('client_request_id', input.clientRequestId)
        .eq('created_by', input.createdBy)
        .in('status', ['reserved', 'reclaiming'])
        .is('server_id', null);
      if (error) throw error;
    },
    async complete(input) {
      const { error } = await supabaseAdmin
        .from('offline_sync_requests')
        .update({
          server_table: input.serverTable || 'ledger_entries',
          server_id: input.serverId,
          status: 'processed'
        })
        .eq('client_request_id', input.clientRequestId)
        .eq('created_by', input.createdBy);
      if (error) throw error;
    },
    async release(input) {
      await supabaseAdmin
        .from('offline_sync_requests')
        .delete()
        .eq('client_request_id', input.clientRequestId)
        .eq('created_by', input.createdBy)
        .in('status', ['reserved', 'reclaiming']);
    },
    async tryReclaim(input): Promise<LedgerReclaimResult> {
      const now = input.now || new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('offline_sync_requests')
        .update({
          status: 'reclaiming',
          created_at: now
        })
        .eq('client_request_id', input.clientRequestId)
        .eq('created_by', input.createdBy)
        .in('status', ['reserved', 'reclaiming'])
        .lt('created_at', input.olderThan)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      const row = asRow(data);
      return row ? { status: 'reclaimed', serverId: row.server_id } : { status: 'busy' };
    }
  };
}
