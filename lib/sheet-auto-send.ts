/**
 * When to auto-send entries queued on this device.
 *
 * #33 sent the queue only on page load and on the window 'online' event. 'online' only fires when
 * navigator.onLine goes false -> true. Many real failures never flip it: Wi-Fi with no internet,
 * a captive portal, a server timeout or 5xx, and Chrome DevTools' Network "Offline" (it blocks
 * requests but leaves navigator.onLine true). Then nothing ever tried again until a reload.
 *
 * Now a send is attempted:
 * - on load,
 * - at once on 'online', and when the tab becomes visible again,
 * - and, while anything is still waiting, on a short timer (3 s, 6 s, 12 s, 24 s, then every 30 s).
 * Only one send runs at a time; a trigger during a send runs one more pass after it.
 */
export const SHEET_AUTO_SEND_DELAYS_MS = [3_000, 6_000, 12_000, 24_000, 30_000];

export type SheetAutoSendReason = 'load' | 'online' | 'visible' | 'timer';

type Listenable = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

export function startSheetAutoSend(options: {
  win: Listenable;
  doc?: Listenable & { visibilityState?: string };
  /** One pass over the queue. Returns how many entries are still waiting to be auto-sent. */
  run: (reason: SheetAutoSendReason) => Promise<{ remaining: number }>;
  isOnline?: () => boolean;
  delaysMs?: number[];
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}) {
  const delays = options.delaysMs?.length ? options.delaysMs : SHEET_AUTO_SEND_DELAYS_MS;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let stopped = false;
  let running = false;
  let again: SheetAutoSendReason | null = null;
  let timer: unknown = null;
  let attempt = 0;

  function disarm() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function arm() {
    disarm();
    if (stopped) return;
    const wait = delays[Math.min(attempt, delays.length - 1)];
    attempt += 1;
    timer = setTimer(() => {
      timer = null;
      void kick('timer');
    }, wait);
  }

  async function kick(reason: SheetAutoSendReason): Promise<void> {
    if (stopped) return;
    if (running) {
      again = reason;
      return;
    }
    if (reason === 'timer' && options.isOnline && !options.isOnline()) {
      arm();
      return;
    }
    running = true;
    disarm();
    let remaining = 0;
    try {
      remaining = (await options.run(reason)).remaining;
    } catch {
      remaining = 1;
    } finally {
      running = false;
    }
    if (stopped) return;
    if (again) {
      const next = again;
      again = null;
      return kick(next);
    }
    if (remaining > 0) arm();
    else {
      attempt = 0;
      disarm();
    }
  }

  const onOnline = () => {
    attempt = 0;
    void kick('online');
  };
  const onVisibility = () => {
    if (options.doc?.visibilityState && options.doc.visibilityState !== 'visible') return;
    attempt = 0;
    void kick('visible');
  };

  options.win.addEventListener('online', onOnline);
  options.doc?.addEventListener('visibilitychange', onVisibility);
  void kick('load');

  return {
    /** Run a pass now (for example right after a manual save). */
    kick,
    /** Something was just queued: try again soon, without sending right now. */
    soon() {
      if (stopped || running || timer !== null) return;
      attempt = 0;
      arm();
    },
    stop() {
      stopped = true;
      disarm();
      options.win.removeEventListener('online', onOnline);
      options.doc?.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
