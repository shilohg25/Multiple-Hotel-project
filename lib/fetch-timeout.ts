export const DEFAULT_FETCH_TIMEOUT_MS = 12_000;

export class RequestTimeoutError extends Error {
  readonly timedOut = true as const;
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms.`);
    this.name = 'RequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export function isAbortOrTimeoutError(error: unknown): boolean {
  if (error instanceof RequestTimeoutError) return true;
  if (error && typeof error === 'object' && 'name' in error) {
    return (error as { name: string }).name === 'AbortError';
  }
  return false;
}

export function isNetworkError(error: unknown): boolean {
  if (isAbortOrTimeoutError(error)) return true;
  if (error instanceof TypeError) return true;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message).toLowerCase();
    return message.includes('failed to fetch') || message.includes('network') || message.includes('abort');
  }
  return false;
}

async function withAbortTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  callerSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }

  try {
    return await work(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new RequestTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  return withAbortTimeout(
    (signal) => fetchImpl(input, { ...init, signal }),
    timeoutMs,
    init.signal ?? undefined
  );
}

export async function fetchJsonWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<{ response: Response; json: unknown }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  return withAbortTimeout(async (signal) => {
    const response = await fetchImpl(input, { ...init, signal });
    const json = await Promise.race([
      response.json().catch((error) => {
        if (signal.aborted || isAbortOrTimeoutError(error) || isNetworkError(error)) throw error;
        return {};
      }),
      new Promise<never>((_resolve, reject) => {
        const fail = () => reject(new RequestTimeoutError(timeoutMs));
        if (signal.aborted) fail();
        else signal.addEventListener('abort', fail, { once: true });
      })
    ]);
    return { response, json };
  }, timeoutMs, init.signal ?? undefined);
}
