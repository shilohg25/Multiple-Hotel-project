/**
 * One id per browser tab, unique even after Chrome's "Duplicate tab".
 *
 * The id lives in sessionStorage so it survives reloads and back/forward in the same tab. But
 * Duplicate tab copies sessionStorage (and window.name), so a copied id alone cannot tell "this tab
 * reloaded" from "this is a copy of a tab that is still open". On load we ask over a
 * BroadcastChannel: "is anyone alive with id X?". Only a live page can answer, and a reload's old
 * page is gone, so an answer means we are a duplicate: mint a new id. Nothing else copied by Duplicate
 * (window.name, sessionStorage) is trusted for identity.
 *
 * If sessionStorage throws, the id is random for this page load (kept in memory), never a shared
 * constant. Without BroadcastChannel the stored id is kept (no way to ask).
 */
export const SHEET_TAB_ID_KEY = 'hotel_ops_tab_id';
export const SHEET_TAB_CHANNEL = 'hotel_ops_tab_presence';
export const SHEET_TAB_PROBE_MS = 200;

type SessionLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export type SheetTabChannel = {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
};

type ProbeMessage = { type: 'probe'; id: string; from: string } | { type: 'alive'; id: string; to: string };

export function randomSheetTabId() {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export type SheetTabIdentity = {
  /** Current id. Before `ready` it may still be the (possibly copied) stored id. */
  readonly id: string;
  /** Resolves with the final id once the duplicate check is done. */
  readonly ready: Promise<string>;
  /** True once `ready` has resolved (the id will not change any more). */
  readonly settled: boolean;
  /** True if this page found it was a duplicate and minted a new id. */
  readonly duplicate: boolean;
  close(): void;
};

export function createSheetTabIdentity(options: {
  session: SessionLike | null;
  openChannel?: (() => SheetTabChannel | null) | null;
  createId?: () => string;
  probeMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
}): SheetTabIdentity {
  const createId = options.createId ?? randomSheetTabId;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const loadNonce = createId();
  let duplicate = false;
  let stored: string | null = null;
  let storageWorks = Boolean(options.session);
  try {
    stored = options.session ? options.session.getItem(SHEET_TAB_ID_KEY) : null;
  } catch {
    storageWorks = false;
  }
  function save(value: string) {
    if (!storageWorks || !options.session) return;
    try { options.session.setItem(SHEET_TAB_ID_KEY, value); } catch { storageWorks = false; }
  }

  // No working sessionStorage: a random id for this page load only.
  let id = storageWorks && stored ? stored : createId();
  if (storageWorks && !stored) save(id);

  let channel: SheetTabChannel | null = null;
  try {
    channel = options.openChannel ? options.openChannel() : null;
  } catch {
    channel = null;
  }

  let settled = false;
  let answered = false;
  let probing = false;
  if (channel) {
    channel.addEventListener('message', (event) => {
      const message = event.data as ProbeMessage | null;
      if (!message || typeof message !== 'object') return;
      if (message.type === 'probe' && message.id === id && message.from !== loadNonce) {
        // Someone else claims our id: tell them we are alive. Two copies probing at the same time both
        // answer each other and both mint new ids, which is fine (unique either way).
        channel?.postMessage({ type: 'alive', id: message.id, to: message.from } satisfies ProbeMessage);
      } else if (message.type === 'alive' && message.to === loadNonce && probing) {
        answered = true;
      }
    });
  }

  const ready = new Promise<string>((resolve) => {
    // Only a copied (pre-existing) id needs checking; a fresh or in-memory id is already unique.
    if (!channel || !stored || !storageWorks) {
      settled = true;
      resolve(id);
      return;
    }
    probing = true;
    const asked = id;
    channel.postMessage({ type: 'probe', id: asked, from: loadNonce } satisfies ProbeMessage);
    setTimer(() => {
      probing = false;
      if (answered) {
        duplicate = true;
        id = createId();
        save(id);
      }
      settled = true;
      resolve(id);
    }, options.probeMs ?? SHEET_TAB_PROBE_MS);
  });

  return {
    get id() { return id; },
    ready,
    get settled() { return settled; },
    get duplicate() { return duplicate; },
    close() {
      try { channel?.close(); } catch { /* ignore */ }
      channel = null;
    }
  };
}

let pageIdentity: SheetTabIdentity | null = null;

/** The one identity for this page load (browser only). */
export function sheetTabIdentity(): SheetTabIdentity {
  if (pageIdentity) return pageIdentity;
  let session: SessionLike | null = null;
  try {
    session = window.sessionStorage;
  } catch {
    session = null;
  }
  pageIdentity = createSheetTabIdentity({
    session,
    openChannel: typeof BroadcastChannel === 'function' ? () => new BroadcastChannel(SHEET_TAB_CHANNEL) as unknown as SheetTabChannel : null
  });
  return pageIdentity;
}
